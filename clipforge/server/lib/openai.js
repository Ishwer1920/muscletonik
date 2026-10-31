"use strict";
/* OpenAI-powered audio features: speech-to-text (captions) and text-to-speech (voiceover).
 * Anthropic has no audio models, so these two features use OpenAI. */

const OpenAI = require("openai");
const { toFile } = require("openai");

const STT_MODEL = process.env.STT_MODEL || "whisper-1";
const TTS_MODEL = process.env.TTS_MODEL || "tts-1";
const TTS_VOICE = process.env.TTS_VOICE || "alloy";

let client = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

function hasKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

/* Transcribe an audio buffer -> { text, segments: [{start, end, text}] } */
async function transcribe(buffer, filename = "audio.mp3") {
  const c = getClient();
  if (!c) throw new Error("OPENAI_API_KEY is not set");
  const file = await toFile(buffer, filename);
  const res = await c.audio.transcriptions.create({
    file,
    model: STT_MODEL,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });
  const segments = Array.isArray(res.segments)
    ? res.segments.map((s) => ({
        start: Number(s.start) || 0,
        end: Number(s.end) || 0,
        text: String(s.text || "").trim(),
      }))
    : [];
  return { text: String(res.text || "").trim(), segments };
}

/* Text -> spoken audio. Returns an mp3 Buffer. */
async function synthesize(text, voice) {
  const c = getClient();
  if (!c) throw new Error("OPENAI_API_KEY is not set");
  const res = await c.audio.speech.create({
    model: TTS_MODEL,
    voice: voice || TTS_VOICE,
    input: text,
    response_format: "mp3",
  });
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

module.exports = { hasKey, transcribe, synthesize, STT_MODEL, TTS_MODEL, TTS_VOICE };
