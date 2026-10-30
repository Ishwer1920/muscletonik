import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

import {
  speakingSetupPrompt,
  speakingEvaluatePrompt,
  writingPromptTask,
  writingEvaluatePrompt,
  readingGeneratePrompt,
  listeningGeneratePrompt,
} from "./prompts.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY);

const client = HAS_KEY ? new Anthropic() : null;

const app = express();
app.use(express.json({ limit: "2mb" }));

// In-memory answer keys for Reading/Listening so the correct answers are never
// shipped to the browser before the test is scored. (Ephemeral; fine for a
// local practice app — swap for a store when moving off localStorage.)
const answerKeys = new Map(); // testId -> { questions: [...] }

// --- Claude call helper (the shared "examiner" gateway) ---------------------

async function callClaude({ system, user, maxTokens = 12000, effort = "medium" }) {
  if (!client) {
    const err = new Error("ANTHROPIC_API_KEY is not set on the server.");
    err.statusCode = 503;
    throw err;
  }
  // Stream so large generations don't hit HTTP timeouts.
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort },
    system,
    messages: [{ role: "user", content: user }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    const err = new Error("The model declined to answer this request.");
    err.statusCode = 422;
    throw err;
  }
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function parseJson(raw) {
  let text = (raw || "").trim();
  // Strip accidental ```json fences.
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  // Fall back to the first {...} block if the model added stray prose.
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      return JSON.parse(text.slice(first, last + 1));
    }
    throw new Error("Model did not return valid JSON.");
  }
}

async function generateJson(promptParts, opts = {}) {
  const raw = await callClaude({ ...promptParts, ...opts });
  return parseJson(raw);
}

// --- IELTS band conversion (official-style raw -> band tables) --------------

// Academic Reading raw(0-40) -> band
function readingBand(raw) {
  const t = [
    [39, 9.0], [37, 8.5], [35, 8.0], [33, 7.5], [30, 7.0],
    [27, 6.5], [23, 6.0], [19, 5.5], [15, 5.0], [13, 4.5],
    [10, 4.0], [8, 3.5], [6, 3.0], [4, 2.5],
  ];
  for (const [min, band] of t) if (raw >= min) return band;
  return raw >= 1 ? 2.0 : 0.0;
}

// Listening raw(0-40) -> band
function listeningBand(raw) {
  const t = [
    [39, 9.0], [37, 8.5], [35, 8.0], [32, 7.5], [30, 7.0],
    [26, 6.5], [23, 6.0], [18, 5.5], [16, 5.0], [13, 4.5],
    [10, 4.0], [8, 3.5], [6, 3.0], [4, 2.5],
  ];
  for (const [min, band] of t) if (raw >= min) return band;
  return raw >= 1 ? 2.0 : 0.0;
}

function normalise(s) {
  return String(s ?? "").trim().toLowerCase().replace(/[.,!?;:"']/g, "").replace(/\s+/g, " ");
}

function isCorrect(q, given) {
  const g = normalise(given);
  if (!g) return false;
  if (normalise(q.answer) === g) return true;
  if (Array.isArray(q.acceptable) && q.acceptable.some((a) => normalise(a) === g)) return true;
  return false;
}

function scoreAgainstKey(testId, answers, bandFn) {
  const key = answerKeys.get(testId);
  if (!key) {
    const err = new Error("Test session not found or expired. Please regenerate the test.");
    err.statusCode = 404;
    throw err;
  }
  const perQuestion = key.questions.map((q) => {
    const given = answers?.[q.id];
    const correct = isCorrect(q, given);
    return {
      id: q.id,
      given: given ?? "",
      correct,
      correctAnswer: q.answer,
      explanation: q.explanation || "",
    };
  });
  const raw = perQuestion.filter((p) => p.correct).length;
  return { raw, total: key.questions.length, band: bandFn(raw), perQuestion };
}

// Remove answers/explanations before sending questions to the browser.
function stripAnswers(questions) {
  return questions.map((q) => ({
    id: q.id,
    passage: q.passage,
    section: q.section,
    type: q.type,
    prompt: q.prompt,
    options: q.options,
  }));
}

// --- Routes -----------------------------------------------------------------

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error("[ielts]", e?.message || e);
    res.status(e?.statusCode || 500).json({ error: e?.message || "Server error" });
  });
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, keyConfigured: HAS_KEY });
});

// SPEAKING
app.post("/api/speaking/setup", wrap(async (_req, res) => {
  const data = await generateJson(speakingSetupPrompt(), { maxTokens: 4000 });
  res.json(data);
}));

app.post("/api/speaking/evaluate", wrap(async (req, res) => {
  const data = await generateJson(speakingEvaluatePrompt(req.body || {}), {
    maxTokens: 8000,
    effort: "high",
  });
  res.json(data);
}));

// WRITING
app.post("/api/writing/prompt", wrap(async (req, res) => {
  const { task = 2, variant = "academic" } = req.body || {};
  const data = await generateJson(writingPromptTask({ task: Number(task), variant }), {
    maxTokens: 3000,
  });
  res.json(data);
}));

app.post("/api/writing/evaluate", wrap(async (req, res) => {
  const data = await generateJson(writingEvaluatePrompt(req.body || {}), {
    maxTokens: 8000,
    effort: "high",
  });
  res.json(data);
}));

// READING
app.post("/api/reading/generate", wrap(async (_req, res) => {
  const data = await generateJson(readingGeneratePrompt(), { maxTokens: 20000, effort: "high" });
  const testId = crypto.randomUUID();
  answerKeys.set(testId, { questions: data.questions });
  res.json({ testId, passages: data.passages, questions: stripAnswers(data.questions) });
}));

app.post("/api/reading/score", wrap(async (req, res) => {
  const { testId, answers } = req.body || {};
  res.json(scoreAgainstKey(testId, answers, readingBand));
}));

// LISTENING
app.post("/api/listening/generate", wrap(async (_req, res) => {
  const data = await generateJson(listeningGeneratePrompt(), { maxTokens: 20000, effort: "high" });
  const testId = crypto.randomUUID();
  answerKeys.set(testId, { questions: data.questions });
  res.json({ testId, sections: data.sections, questions: stripAnswers(data.questions) });
}));

app.post("/api/listening/score", wrap(async (req, res) => {
  const { testId, answers } = req.body || {};
  res.json(scoreAgainstKey(testId, answers, listeningBand));
}));

// Serve the built frontend if it exists (production: `npm run build`).
const distDir = path.join(here, "..", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.listen(PORT, () => {
  console.log(`\n  IELTS backend listening on http://localhost:${PORT}`);
  console.log(`  Model: ${MODEL}`);
  if (!HAS_KEY) {
    console.log("  ⚠  ANTHROPIC_API_KEY not set — copy .env.example to .env and add your key.\n");
  } else {
    console.log("  ✓ ANTHROPIC_API_KEY detected.\n");
  }
});
