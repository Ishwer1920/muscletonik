/* ClipForge AI Studio — talks to the Node backend (/api/*).
 * Holds AI-produced state (script, voiceover, captions, highlights, music)
 * that js/main.js reads when building the video. */
(() => {
  "use strict";

  const AI = (window.CLIPFORGE_AI = {
    config: null,
    clipsProvider: () => [], // main.js registers this
    state: {
      script: { title: "", script: "" },
      voiceoverBlob: null,
      voiceoverUrl: null,
      voiceoverDuration: 0,
      captions: [],        // [{start,end,text}]
      highlights: null,    // { [clipId]: {start,end} }
      music: null,         // { url, name } from the server library
    },
  });

  const $ = (id) => document.getElementById(id);
  const api = (p) => p; // same-origin

  async function postJSON(path, body) {
    const r = await fetch(api(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
    return data;
  }

  function setStatus(el, msg, isErr) {
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("err", !!isErr);
  }
  function busy(btn, on) {
    if (!btn) return;
    btn.classList.toggle("loading", on);
    btn.disabled = on;
  }

  /* ---------- load capabilities & lock unavailable tools ---------- */
  async function loadConfig() {
    const banner = $("aiBanner");
    try {
      const r = await fetch(api("/api/config"));
      if (!r.ok) throw new Error("no backend");
      AI.config = await r.json();
    } catch {
      // No backend → AI features unavailable (static hosting / serve.py mode).
      banner.hidden = false;
      banner.classList.add("warn");
      banner.innerHTML =
        "⚡ AI features need the Node backend. Run <code>npm start</code> in <code>clipforge/server</code> " +
        "and open the URL it prints. (The core auto-editor still works here without it.)";
      document.querySelectorAll(".ai-tool").forEach((t) => t.classList.add("disabled"));
      return;
    }

    const f = AI.config.features || {};
    // voices
    const vsel = $("voiceSel");
    (AI.config.voices || ["alloy"]).forEach((v) => {
      const o = document.createElement("option");
      o.value = v; o.textContent = v;
      vsel.appendChild(o);
    });

    document.querySelectorAll(".ai-tool").forEach((tool) => {
      const feat = tool.dataset.feat;
      const ok = f[feat];
      if (!ok) {
        tool.classList.add("disabled");
        const lock = tool.querySelector(".ai-lock");
        if (lock) lock.hidden = false;
        tool.querySelectorAll("button, input, select, textarea").forEach((el) => (el.disabled = true));
      }
    });

    const anyText = f.script || f.highlights || f.music;
    const anyAudio = f.voiceover || f.captions;
    if (!anyText && !anyAudio) {
      banner.hidden = false;
      banner.classList.add("warn");
      banner.innerHTML =
        "🔑 No API keys set. Copy <code>server/.env.example</code> to <code>server/.env</code> and add your keys " +
        "to unlock AI features.";
    } else {
      banner.hidden = false;
      banner.innerHTML = `✓ AI ready — text model <b>${AI.config.models.text}</b>.`;
    }
  }

  /* ---------- 1. Script ---------- */
  async function genScript() {
    const btn = $("scriptBtn");
    const topic = $("scriptTopic").value.trim();
    if (!topic) return setStatusInline($("scriptOut"), "Enter a topic first.");
    busy(btn, true);
    try {
      const data = await postJSON("/api/script", {
        topic,
        tone: $("scriptTone").value,
        targetSeconds: Number($("scriptSecs").value) || 30,
      });
      AI.state.script = { title: data.title || "", script: data.script || "" };
      $("scriptOut").value = data.script || "";
      // auto-fill the on-screen title box if empty
      const titleBox = $("titleText");
      if (titleBox && !titleBox.value && data.title) titleBox.value = data.title;
    } catch (e) {
      $("scriptOut").value = "";
      $("scriptOut").placeholder = "Error: " + e.message;
    } finally {
      busy(btn, false);
    }
  }
  function setStatusInline(area, msg) {
    area.placeholder = msg;
  }

  /* ---------- 2. Voiceover ---------- */
  async function genVoiceover() {
    const btn = $("voiceBtn");
    const text = ($("scriptOut").value || AI.state.script.script || "").trim();
    if (!text) {
      $("scriptOut").placeholder = "Write or generate a script first.";
      return;
    }
    busy(btn, true);
    try {
      const r = await fetch(api("/api/voiceover"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: $("voiceSel").value }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Voiceover failed (${r.status})`);
      }
      const blob = await r.blob();
      if (AI.state.voiceoverUrl) URL.revokeObjectURL(AI.state.voiceoverUrl);
      AI.state.voiceoverBlob = blob;
      AI.state.voiceoverUrl = URL.createObjectURL(blob);
      const audio = $("voicePreview");
      audio.src = AI.state.voiceoverUrl;
      audio.hidden = false;
      AI.state.voiceoverDuration = await durationOf(AI.state.voiceoverUrl);
      // captions can now be generated
      const capBtn = $("capBtn");
      if (capBtn && !capBtn.closest(".ai-tool").classList.contains("disabled")) capBtn.disabled = false;
    } catch (e) {
      alert(e.message);
    } finally {
      busy(btn, false);
    }
  }

  function durationOf(url) {
    return new Promise((res) => {
      const a = document.createElement("audio");
      a.preload = "metadata";
      a.onloadedmetadata = () => res(a.duration || 0);
      a.onerror = () => res(0);
      a.src = url;
    });
  }

  /* ---------- 3. Captions (transcribe the voiceover) ---------- */
  async function genCaptions() {
    const btn = $("capBtn");
    const st = $("capStatus");
    if (!AI.state.voiceoverBlob) return setStatus(st, "Generate a voiceover first.", true);
    busy(btn, true);
    setStatus(st, "Transcribing voiceover…");
    try {
      const fd = new FormData();
      fd.append("audio", AI.state.voiceoverBlob, "voiceover.mp3");
      const r = await fetch(api("/api/transcribe"), { method: "POST", body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Transcription failed (${r.status})`);
      AI.state.captions = data.segments || [];
      setStatus(st, `✓ ${AI.state.captions.length} caption segments ready — they'll be burned onto the video.`);
    } catch (e) {
      AI.state.captions = [];
      setStatus(st, e.message, true);
    } finally {
      busy(btn, false);
    }
  }

  /* ---------- 4. Smart highlights ---------- */
  async function genHighlights() {
    const btn = $("hlBtn");
    const st = $("hlStatus");
    const clips = AI.clipsProvider();
    if (!clips.length) return setStatus(st, "Add clips first.", true);
    busy(btn, true);
    setStatus(st, "Analyzing clips…");
    try {
      const data = await postJSON("/api/highlights", {
        clips: clips.map((c, i) => ({ index: i, name: c.name, duration: c.duration })),
        segDur: window.CLIPFORGE_CURRENT_SEGDUR ? window.CLIPFORGE_CURRENT_SEGDUR() : 2.5,
        style: window.CLIPFORGE_CURRENT_STYLE ? window.CLIPFORGE_CURRENT_STYLE() : "highlights",
      });
      const map = {};
      (data.segments || []).forEach((s) => {
        const clip = clips[s.index];
        if (clip) map[clip.id] = { start: s.start, end: s.end, reason: s.reason };
      });
      AI.state.highlights = map;
      setStatus(st, `✓ AI picked moments for ${Object.keys(map).length} clip(s). Applied on next render.`);
    } catch (e) {
      AI.state.highlights = null;
      setStatus(st, e.message, true);
    } finally {
      busy(btn, false);
    }
  }

  /* ---------- 5. Auto music ---------- */
  async function genMusic() {
    const btn = $("musicBtn");
    const st = $("musicStatus");
    busy(btn, true);
    setStatus(st, "Matching mood…");
    try {
      const data = await postJSON("/api/music-mood", { description: $("musicVibe").value.trim() });
      const parts = [];
      if (data.mood) parts.push(`mood: ${data.mood}`);
      if (data.genre) parts.push(`genre: ${data.genre}`);
      if (data.bpm) parts.push(`tempo: ${data.bpm}`);
      let msg = parts.join(" · ");
      if (data.pick) {
        AI.state.music = { url: `/music/${encodeURIComponent(data.pick.file)}`, name: data.pick.name };
        msg += ` → picked “${data.pick.name}”`;
      } else {
        AI.state.music = null;
        msg += (msg ? " · " : "") + "no matching track in server/music — search: " + (data.searchTerms || []).join(", ");
      }
      setStatus(st, msg || "No recommendation.");
    } catch (e) {
      setStatus(st, e.message, true);
    } finally {
      busy(btn, false);
    }
  }

  /* ---------- wiring ---------- */
  function init() {
    $("scriptBtn")?.addEventListener("click", genScript);
    $("voiceBtn")?.addEventListener("click", genVoiceover);
    $("capBtn")?.addEventListener("click", genCaptions);
    $("hlBtn")?.addEventListener("click", genHighlights);
    $("musicBtn")?.addEventListener("click", genMusic);
    loadConfig();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
