/* ClipForge — client-side auto video editor built on ffmpeg.wasm */
(() => {
  "use strict";

  // ---------- state ----------
  const state = {
    clips: [],            // { id, file, name, duration, thumbUrl }
    styleId: "highlights",
    ratioId: "9:16",
    qualityId: "720",
    musicFile: null,
    ffmpeg: null,
    loaded: false,
    busy: false,
  };

  // ---------- element refs ----------
  const $ = (id) => document.getElementById(id);
  const els = {
    drop: $("drop"), fileInput: $("fileInput"), clipList: $("clipList"),
    styleGrid: $("styleGrid"), ratioGroup: $("ratioGroup"), qualityGroup: $("qualityGroup"),
    titleText: $("titleText"), musicInput: $("musicInput"), musicName: $("musicName"),
    renderBtn: $("renderBtn"), hint: $("hint"),
    stage: $("stage"), placeholder: $("placeholder"), result: $("result"),
    progressWrap: $("progressWrap"), progressBar: $("progressBar"), progressLabel: $("progressLabel"),
    downloadBtn: $("downloadBtn"), log: $("log"),
  };

  // ---------- helpers ----------
  const uid = () => Math.random().toString(36).slice(2, 9);
  const fmtTime = (s) => {
    if (!isFinite(s)) return "–";
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };
  const sanitize = (n) => n.replace(/[^\w.\-]+/g, "_");
  const logLine = (t) => { els.log.textContent += t + "\n"; els.log.scrollTop = els.log.scrollHeight; };

  // ---------- build the option UIs ----------
  function buildStyles() {
    els.styleGrid.innerHTML = "";
    CLIPFORGE_STYLES.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "style-card" + (s.id === state.styleId ? " active" : "");
      b.innerHTML = `<div class="style-emoji">${s.emoji}</div>
        <div class="style-name">${s.name}</div>
        <div class="style-desc">${s.desc}</div>`;
      b.onclick = () => {
        state.styleId = s.id;
        [...els.styleGrid.children].forEach((c) => c.classList.remove("active"));
        b.classList.add("active");
      };
      els.styleGrid.appendChild(b);
    });
  }

  function buildChips(container, items, selectedKey, onPick) {
    container.innerHTML = "";
    items.forEach((it) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (it.id === state[selectedKey] ? " active" : "");
      b.textContent = it.label;
      b.onclick = () => {
        state[selectedKey] = it.id;
        [...container.children].forEach((c) => c.classList.remove("active"));
        b.classList.add("active");
        onPick && onPick(it);
      };
      container.appendChild(b);
    });
  }

  // ---------- clip handling ----------
  async function probeClip(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.src = url;
      v.onloadedmetadata = () => {
        const duration = v.duration || 0;
        // grab a thumbnail from ~1s in
        v.currentTime = Math.min(1, duration / 2);
        v.onseeked = () => {
          const c = document.createElement("canvas");
          c.width = 108; c.height = 64;
          try {
            c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
          } catch (e) { /* cross-origin-safe local file, ignore */ }
          URL.revokeObjectURL(url);
          resolve({ duration, thumbUrl: c.toDataURL("image/jpeg", 0.6) });
        };
      };
      v.onerror = () => { URL.revokeObjectURL(url); resolve({ duration: 0, thumbUrl: "" }); };
    });
  }

  async function addFiles(fileList) {
    const vids = [...fileList].filter((f) => f.type.startsWith("video/"));
    for (const file of vids) {
      const { duration, thumbUrl } = await probeClip(file);
      state.clips.push({ id: uid(), file, name: file.name, duration, thumbUrl });
    }
    renderClips();
    refreshRenderBtn();
  }

  function renderClips() {
    els.clipList.innerHTML = "";
    state.clips.forEach((clip, i) => {
      const li = document.createElement("li");
      li.className = "clip-item";
      li.innerHTML = `
        <img class="clip-thumb" src="${clip.thumbUrl}" alt="" />
        <div class="clip-meta">
          <div class="clip-name" title="${clip.name}">${clip.name}</div>
          <div class="clip-dur">${fmtTime(clip.duration)}</div>
        </div>
        <div class="clip-actions">
          <button class="icon-btn up" title="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="icon-btn down" title="Move down" ${i === state.clips.length - 1 ? "disabled" : ""}>↓</button>
          <button class="icon-btn del" title="Remove">✕</button>
        </div>`;
      li.querySelector(".up").onclick = () => { move(i, i - 1); };
      li.querySelector(".down").onclick = () => { move(i, i + 1); };
      li.querySelector(".del").onclick = () => { state.clips.splice(i, 1); renderClips(); refreshRenderBtn(); };
      els.clipList.appendChild(li);
    });
  }

  function move(from, to) {
    if (to < 0 || to >= state.clips.length) return;
    const [c] = state.clips.splice(from, 1);
    state.clips.splice(to, 0, c);
    renderClips();
  }

  function refreshRenderBtn() {
    const ok = state.clips.length > 0 && !state.busy;
    els.renderBtn.disabled = !ok;
    els.hint.textContent = state.clips.length === 0
      ? "Add at least one clip to start."
      : `${state.clips.length} clip${state.clips.length > 1 ? "s" : ""} ready · tip: 2–8 short clips renders fastest.`;
  }

  // ---------- title card (rendered on a canvas, overlaid via ffmpeg) ----------
  async function makeTitlePng(text, w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    const pad = Math.round(w * 0.08);
    const fontSize = Math.round(w * 0.075);
    ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // word-wrap
    const words = text.trim().split(/\s+/);
    const maxW = w - pad * 2;
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);

    const lineH = fontSize * 1.25;
    const blockH = lines.length * lineH;
    const barH = blockH + pad;
    const barY = (h - barH) / 2;

    // translucent bar behind text for readability
    ctx.fillStyle = "rgba(10,12,18,0.55)";
    ctx.fillRect(0, barY, w, barH);

    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = Math.round(fontSize * 0.2);
    const startY = h / 2 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, w / 2, startY + i * lineH));

    const blob = await new Promise((res) => c.toBlob(res, "image/png"));
    return new Uint8Array(await blob.arrayBuffer());
  }

  // ---------- ffmpeg ----------
  async function ensureFfmpeg() {
    if (state.loaded) return;
    if (typeof FFmpegWASM === "undefined" || typeof FFmpegUtil === "undefined") {
      throw new Error("Editing engine failed to load. Check your internet connection and reload the page.");
    }
    const { FFmpeg } = FFmpegWASM;
    const ff = new FFmpeg();
    ff.on("log", ({ message }) => logLine(message));
    ff.on("progress", ({ progress }) => {
      const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
      els.progressBar.style.width = pct + "%";
      els.progressLabel.textContent = `Rendering… ${pct}%`;
    });
    els.progressLabel.textContent = "Loading the editing engine (first run downloads ~30 MB)…";
    const core = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";
    await ff.load({ coreURL: `${core}/ffmpeg-core.js`, wasmURL: `${core}/ffmpeg-core.wasm` });
    state.ffmpeg = ff;
    state.loaded = true;
  }

  // compute the segment [start,end] to pull from a clip of length dur
  function segmentFor(dur, style) {
    const seg = Math.min(style.segDur, Math.max(0.3, dur || style.segDur));
    let start = 0;
    if (dur > seg) {
      if (style.from === "middle") start = (dur - seg) / 2;
      else if (style.from === "smart") start = Math.min(0.5, dur - seg);
      else start = 0; // 'start'
    }
    return { start: +start.toFixed(3), end: +(start + seg).toFixed(3), seg };
  }

  async function render() {
    if (state.busy || state.clips.length === 0) return;
    state.busy = true;
    refreshRenderBtn();
    els.renderBtn.textContent = "Working…";
    els.log.textContent = "";
    els.result.hidden = true;
    els.placeholder.hidden = true;
    els.downloadBtn.hidden = true;
    els.progressWrap.hidden = false;
    els.progressBar.style.width = "0%";

    const style = CLIPFORGE_STYLES.find((s) => s.id === state.styleId);
    const ratio = CLIPFORGE_RATIOS.find((r) => r.id === state.ratioId);
    const W = ratio.w[state.qualityId];
    const H = Math.round(W * ratio.hMul / 2) * 2; // keep even
    const fps = style.fps;

    try {
      await ensureFfmpeg();
      const ff = state.ffmpeg;
      const { fetchFile } = FFmpegUtil;

      // write input clips
      const inNames = [];
      let total = 0;
      for (let i = 0; i < state.clips.length; i++) {
        const clip = state.clips[i];
        const name = `in${i}_${sanitize(clip.name)}`.slice(0, 40) + guessExt(clip.name);
        await ff.writeFile(name, await fetchFile(clip.file));
        inNames.push(name);
        total += segmentFor(clip.duration, style).seg;
      }
      total = +total.toFixed(3);

      // optional music
      let musicName = null;
      if (state.musicFile) {
        musicName = "music" + guessExt(state.musicFile.name, ".mp3");
        await ff.writeFile(musicName, await fetchFile(state.musicFile));
      }

      // optional title overlay
      let titleName = null;
      const titleText = els.titleText.value.trim();
      const titleDur = Math.min(2.5, total);
      if (titleText) {
        titleName = "title.png";
        await ff.writeFile(titleName, await makeTitlePng(titleText, W, H));
      }

      // ---- build filter_complex ----
      const args = [];
      inNames.forEach((n) => args.push("-i", n));
      if (musicName) args.push("-i", musicName);
      if (titleName) args.push("-loop", "1", "-i", titleName);

      const filters = [];
      const vlabels = [];
      state.clips.forEach((clip, i) => {
        const { start, end } = segmentFor(clip.duration, style);
        filters.push(
          `[${i}:v]trim=${start}:${end},setpts=PTS-STARTPTS,` +
          `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
          `fps=${fps},format=yuv420p,setsar=1[v${i}]`
        );
        vlabels.push(`[v${i}]`);
      });
      filters.push(`${vlabels.join("")}concat=n=${state.clips.length}:v=1:a=0[cv]`);

      let vOut = "[cv]";
      if (titleName) {
        const titleIdx = state.clips.length + (musicName ? 1 : 0);
        filters.push(
          `[cv][${titleIdx}:v]overlay=0:0:enable='between(t,0,${titleDur.toFixed(2)})'[vt]`
        );
        vOut = "[vt]";
      }

      let aOut = null;
      if (musicName) {
        const mIdx = state.clips.length;
        filters.push(`[${mIdx}:a]atrim=0:${total},asetpts=PTS-STARTPTS[aud]`);
        aOut = "[aud]";
      }

      args.push("-filter_complex", filters.join(";"));
      args.push("-map", vOut);
      if (aOut) args.push("-map", aOut);
      args.push("-t", String(total));
      args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "-pix_fmt", "yuv420p");
      if (aOut) args.push("-c:a", "aac", "-b:a", "128k");
      args.push("-movflags", "+faststart", "-y", "output.mp4");

      logLine("$ ffmpeg " + args.join(" "));
      els.progressLabel.textContent = "Rendering… 0%";
      await ff.exec(args);

      const data = await ff.readFile("output.mp4");
      const blob = new Blob([data.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      els.result.src = url;
      els.result.hidden = false;
      els.downloadBtn.href = url;
      els.downloadBtn.hidden = false;
      els.progressBar.style.width = "100%";
      els.progressLabel.textContent = `Done — ${fmtTime(total)}, ${W}×${H}. Press play ▶`;

      // cleanup FS
      try {
        for (const n of inNames) await ff.deleteFile(n);
        if (musicName) await ff.deleteFile(musicName);
        if (titleName) await ff.deleteFile(titleName);
      } catch (_) {}
    } catch (err) {
      console.error(err);
      logLine("ERROR: " + (err && err.message ? err.message : String(err)));
      els.progressLabel.textContent = "Something went wrong — check the engine log below.";
      els.placeholder.hidden = false;
    } finally {
      state.busy = false;
      els.renderBtn.textContent = "✨ Auto-Edit my video";
      refreshRenderBtn();
    }
  }

  function guessExt(name, fallback = ".mp4") {
    const m = /\.([a-z0-9]{2,5})$/i.exec(name || "");
    return m ? "." + m[1].toLowerCase() : fallback;
  }

  // ---------- wiring ----------
  function init() {
    buildStyles();
    buildChips(els.ratioGroup, CLIPFORGE_RATIOS, "ratioId");
    buildChips(els.qualityGroup, CLIPFORGE_QUALITIES, "qualityId");

    els.fileInput.onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
    ["dragenter", "dragover"].forEach((ev) =>
      els.drop.addEventListener(ev, (e) => { e.preventDefault(); els.drop.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) =>
      els.drop.addEventListener(ev, (e) => { e.preventDefault(); els.drop.classList.remove("drag"); }));
    els.drop.addEventListener("drop", (e) => { if (e.dataTransfer?.files) addFiles(e.dataTransfer.files); });

    els.musicInput.onchange = (e) => {
      state.musicFile = e.target.files[0] || null;
      els.musicName.textContent = state.musicFile ? state.musicFile.name : "Choose an audio file";
    };

    els.renderBtn.onclick = render;
    refreshRenderBtn();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
