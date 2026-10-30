// Thin client for the Express proxy. The browser only ever talks to `/api/*`;
// the Anthropic key lives on the server. This is the shared "examiner" service
// on the frontend side.

import type {
  SpeakingSetup,
  SpeakingReport,
  WritingTask,
  WritingReport,
  ReadingTest,
  ListeningTest,
  ScoreResult,
} from "../types";

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () =>
    fetch("/api/health").then((r) => r.json()) as Promise<{
      ok: boolean;
      model: string;
      keyConfigured: boolean;
    }>,

  // Speaking
  speakingSetup: () => post<SpeakingSetup>("/api/speaking/setup"),
  speakingEvaluate: (payload: unknown) => post<SpeakingReport>("/api/speaking/evaluate", payload),

  // Writing
  writingPrompt: (task: 1 | 2, variant: "academic" | "general") =>
    post<WritingTask>("/api/writing/prompt", { task, variant }),
  writingEvaluate: (payload: unknown) => post<WritingReport>("/api/writing/evaluate", payload),

  // Reading
  readingGenerate: () => post<ReadingTest>("/api/reading/generate"),
  readingScore: (testId: string, answers: Record<number, string>) =>
    post<ScoreResult>("/api/reading/score", { testId, answers }),

  // Listening
  listeningGenerate: () => post<ListeningTest>("/api/listening/generate"),
  listeningScore: (testId: string, answers: Record<number, string>) =>
    post<ScoreResult>("/api/listening/score", { testId, answers }),
};
