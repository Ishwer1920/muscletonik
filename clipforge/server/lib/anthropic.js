"use strict";
/* Claude-powered text features: script writing, highlight picking, music mood. */

const Anthropic = require("@anthropic-ai/sdk");

const MODEL = process.env.TEXT_MODEL || "claude-opus-5-5";

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function hasKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Pull the first text block out of a Messages response.
function textOf(response) {
  for (const block of response.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

// Extract a JSON object/array from a model reply that may wrap it in prose or fences.
function parseJson(raw) {
  if (!raw) throw new Error("Empty model response");
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // find the first { or [ and the matching last } or ]
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  let start = -1, openCh = "{", closeCh = "}";
  if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
    start = firstArr; openCh = "["; closeCh = "]";
  } else if (firstObj !== -1) {
    start = firstObj;
  }
  if (start === -1) throw new Error("No JSON found in model response");
  const end = s.lastIndexOf(closeCh);
  if (end === -1 || end < start) throw new Error("Malformed JSON in model response");
  return JSON.parse(s.slice(start, end + 1));
}

async function ask(system, user, maxTokens = 4000) {
  const c = getClient();
  if (!c) throw new Error("ANTHROPIC_API_KEY is not set");
  const response = await c.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return textOf(response);
}

/* ---------- 1. Script writer ---------- */
// targetSeconds controls length (~2.3 spoken words/sec).
async function writeScript({ topic, targetSeconds = 30, tone = "energetic" }) {
  const words = Math.max(20, Math.round((targetSeconds || 30) * 2.3));
  const system =
    "You are a short-form video scriptwriter. You write tight, punchy voiceover narration " +
    "for social videos (Reels/TikTok/Shorts). No stage directions, no camera notes, no speaker " +
    "labels — only the words that will be spoken. Return ONLY valid JSON.";
  const user =
    `Write a voiceover script about: "${topic}".\n` +
    `Tone: ${tone}. Target length: about ${words} words (~${targetSeconds}s spoken).\n` +
    `Also give a punchy on-screen title (max 7 words).\n\n` +
    `Return JSON exactly like:\n` +
    `{"title": "...", "script": "the full narration as one spoken paragraph"}`;
  const data = parseJson(await ask(system, user, 2000));
  return {
    title: String(data.title || "").slice(0, 80),
    script: String(data.script || "").trim(),
  };
}

/* ---------- 2. Smart highlight picker ---------- */
// clips: [{ index, name, duration, transcript? }]
// Returns [{ index, start, end, reason }] — one chosen segment per clip worth keeping.
async function pickHighlights({ clips, segDur = 2.5, style = "highlights" }) {
  const system =
    "You are a video editor choosing the best moment from each raw clip for an auto-edited montage. " +
    "For each clip, pick the single most interesting continuous segment of about the requested length, " +
    "staying within the clip's duration. Prefer action, faces, motion, or meaningful speech; avoid dead " +
    "air at the very start and end. Return ONLY valid JSON.";
  const clipLines = clips
    .map(
      (c) =>
        `#${c.index} "${c.name}" duration=${(c.duration || 0).toFixed(1)}s` +
        (c.transcript ? ` transcript="${String(c.transcript).slice(0, 300)}"` : "")
    )
    .join("\n");
  const user =
    `Editing style: ${style}. Target segment length: ~${segDur}s each.\n` +
    `Clips:\n${clipLines}\n\n` +
    `Return JSON: {"segments": [{"index": <clip #>, "start": <sec>, "end": <sec>, "reason": "<short why>"}]}\n` +
    `Include every clip once. start>=0, end<=duration, end-start close to ${segDur}.`;
  const data = parseJson(await ask(system, user, 3000));
  const segs = Array.isArray(data) ? data : data.segments || [];
  return segs.map((s) => ({
    index: Number(s.index),
    start: Math.max(0, Number(s.start) || 0),
    end: Math.max(0, Number(s.end) || 0),
    reason: String(s.reason || "").slice(0, 120),
  }));
}

/* ---------- 3. Music mood matcher ---------- */
// tracks: [{ file, name }] available on the server. description: what the video is about.
async function matchMusic({ description, tracks = [] }) {
  const system =
    "You are a music supervisor for short videos. Recommend the musical mood that best fits the " +
    "described footage, and if a track list is provided, pick the single best-matching track. " +
    "Return ONLY valid JSON.";
  const trackList = tracks.length
    ? tracks.map((t, i) => `${i}: ${t.name} (${t.file})`).join("\n")
    : "(no tracks available)";
  const user =
    `Footage / vibe: "${description || "general footage"}".\n` +
    `Available tracks:\n${trackList}\n\n` +
    `Return JSON: {"mood":"...","genre":"...","bpm":"slow|medium|fast",` +
    `"searchTerms":["...","..."],"pickIndex": <index into the list or -1 if none fit>}`;
  const data = parseJson(await ask(system, user, 1500));
  let pickIndex = Number.isInteger(data.pickIndex) ? data.pickIndex : -1;
  if (pickIndex < 0 || pickIndex >= tracks.length) pickIndex = -1;
  return {
    mood: String(data.mood || ""),
    genre: String(data.genre || ""),
    bpm: String(data.bpm || ""),
    searchTerms: Array.isArray(data.searchTerms) ? data.searchTerms.slice(0, 6).map(String) : [],
    pick: pickIndex === -1 ? null : tracks[pickIndex],
  };
}

module.exports = { hasKey, writeScript, pickHighlights, matchMusic, MODEL };
