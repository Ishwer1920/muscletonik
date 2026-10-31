"use strict";
/* ClipForge AI backend.
 * Serves the static frontend AND exposes /api/* endpoints that call Claude + OpenAI.
 * Your API keys live here (in .env), never in the browser. */

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const multer = require("multer");

const claude = require("./lib/anthropic");
const voice = require("./lib/openai");

const PORT = process.env.PORT || 8787;
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Cross-origin isolation headers so ffmpeg.wasm is happy either way.
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

// Serve royalty-free tracks the AI can pick from.
app.use("/music", express.static(path.join(__dirname, "music")));

// Never expose the backend folder (.env, server code, node_modules) via static.
app.use((req, res, next) => {
  if (req.path === "/server" || req.path.startsWith("/server/")) return res.status(404).end();
  next();
});

// Serve the frontend (the folder above /server).
const ROOT = path.join(__dirname, "..");
app.use(express.static(ROOT));

/* ---- helpers ---- */
function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(`[${req.path}]`, err?.message || err);
      const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
      res.status(status).json({ error: err?.message || "Server error" });
    }
  };
}

function listMusic() {
  const dir = path.join(__dirname, "music");
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /\.(mp3|wav|m4a|aac|ogg)$/i.test(f))
      .map((f) => ({ file: f, name: f.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") }));
  } catch {
    return [];
  }
}

/* ---- capability report: tells the frontend which AI buttons to enable ---- */
app.get(
  "/api/config",
  wrap(async (_req, res) => {
    res.json({
      features: {
        script: claude.hasKey(),
        highlights: claude.hasKey(),
        music: claude.hasKey(),
        voiceover: voice.hasKey(),
        captions: voice.hasKey(),
      },
      models: { text: claude.MODEL, stt: voice.STT_MODEL, tts: voice.TTS_MODEL },
      voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
      musicTracks: listMusic(),
    });
  })
);

/* ---- 1. AI script ---- */
app.post(
  "/api/script",
  wrap(async (req, res) => {
    const { topic, targetSeconds, tone } = req.body || {};
    if (!topic || !String(topic).trim()) throw badRequest("A topic is required.");
    res.json(await claude.writeScript({ topic: String(topic), targetSeconds, tone }));
  })
);

/* ---- 2. Smart highlights ---- */
app.post(
  "/api/highlights",
  wrap(async (req, res) => {
    const { clips, segDur, style } = req.body || {};
    if (!Array.isArray(clips) || clips.length === 0) throw badRequest("clips[] is required.");
    res.json({ segments: await claude.pickHighlights({ clips, segDur, style }) });
  })
);

/* ---- 3. Music mood ---- */
app.post(
  "/api/music-mood",
  wrap(async (req, res) => {
    const { description } = req.body || {};
    res.json(await claude.matchMusic({ description, tracks: listMusic() }));
  })
);

/* ---- 4. Voiceover (text -> mp3) ---- */
app.post(
  "/api/voiceover",
  wrap(async (req, res) => {
    const { text, voice: v } = req.body || {};
    if (!text || !String(text).trim()) throw badRequest("text is required.");
    const mp3 = await voice.synthesize(String(text), v);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", 'inline; filename="voiceover.mp3"');
    res.send(mp3);
  })
);

/* ---- 5. Captions (audio -> timed segments) ---- */
app.post(
  "/api/transcribe",
  upload.single("audio"),
  wrap(async (req, res) => {
    if (!req.file) throw badRequest("Upload an audio file as field 'audio'.");
    res.json(await voice.transcribe(req.file.buffer, req.file.originalname || "audio.mp3"));
  })
);

function badRequest(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

app.listen(PORT, () => {
  const feats = [];
  if (claude.hasKey()) feats.push("script", "highlights", "music");
  if (voice.hasKey()) feats.push("voiceover", "captions");
  console.log(`\n  ClipForge  →  http://localhost:${PORT}`);
  console.log(`  AI features enabled: ${feats.length ? feats.join(", ") : "none (add keys to .env)"}`);
  console.log(`  Text model: ${claude.MODEL}\n`);
});
