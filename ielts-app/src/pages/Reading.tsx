import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { store, makeRecord } from "../lib/storage";
import { Spinner } from "../components/Spinner";
import { Timer } from "../components/Timer";
import { QuestionRenderer } from "../components/QuestionRenderer";
import { OverallBand } from "../components/BandScoreCard";
import type { ReadingTest, ScoreResult } from "../types";

type Phase = "intro" | "loading" | "test" | "scoring" | "results" | "error";

export function Reading() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<ReadingTest | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [activePassage, setActivePassage] = useState(1);
  const [result, setResult] = useState<ScoreResult | null>(null);

  const start = async () => {
    setPhase("loading");
    setError(null);
    try {
      const t = await api.readingGenerate();
      setTest(t);
      setAnswers({});
      setActivePassage(t.passages[0]?.number ?? 1);
      setPhase("test");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  };

  const submit = async () => {
    if (!test) return;
    setPhase("scoring");
    try {
      const r = await api.readingScore(test.testId, answers);
      setResult(r);
      await store.add(
        makeRecord({
          module: "reading",
          band: r.band,
          breakdown: [{ label: "Raw score", value: r.raw }],
          meta: { raw: `${r.raw}/${r.total}` },
        })
      );
      setPhase("results");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  };

  if (phase === "loading")
    return <Spinner label="Writing 3 original passages & ~40 questions… (this can take a bit)" />;
  if (phase === "scoring") return <Spinner label="Scoring your answers…" />;

  if (phase === "error")
    return (
      <div className="card p-6">
        <p className="text-rose-600">Something went wrong: {error}</p>
        <button className="btn-primary mt-4" onClick={() => setPhase("intro")}>
          Back to start
        </button>
      </div>
    );

  if (phase === "intro")
    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-2xl font-extrabold text-slate-900">Reading test</h1>
          <p className="mt-1 text-slate-600">
            3 original passages, ~40 questions (True/False/Not Given, matching headings, multiple
            choice, gap completion), a 60-minute timer and automatic band scoring.
          </p>
        </header>
        <button className="btn-primary" onClick={start}>
          Generate & start reading test
        </button>
      </div>
    );

  if (phase === "results" && result && test)
    return <Results test={test} result={result} onAgain={() => setPhase("intro")} />;

  if (phase === "test" && test) {
    const passage = test.passages.find((p) => p.number === activePassage) ?? test.passages[0];
    const qs = test.questions.filter((q) => q.passage === passage.number);
    const answered = Object.values(answers).filter(Boolean).length;
    return (
      <div className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Reading test</h1>
            <p className="text-sm text-slate-500">
              {answered}/{test.questions.length} answered
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Timer seconds={60 * 60} warnAt={300} label="Time" onExpire={submit} />
            <button className="btn-primary" onClick={submit}>
              Submit test
            </button>
          </div>
        </header>

        <div className="flex gap-2">
          {test.passages.map((p) => (
            <button
              key={p.number}
              onClick={() => setActivePassage(p.number)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                activePassage === p.number
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Passage {p.number}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <article className="card max-h-[70vh] overflow-y-auto p-5">
            <h2 className="text-lg font-bold text-slate-900">{passage.title}</h2>
            {passage.headingsBank && passage.headingsBank.length > 0 && (
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-semibold">List of headings</p>
                <ul className="mt-1 space-y-0.5">
                  {passage.headingsBank.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="prose-sm mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {passage.text}
            </div>
          </article>

          <div className="space-y-3">
            {qs.map((q) => (
              <QuestionRenderer
                key={q.id}
                question={q}
                value={answers[q.id] ?? ""}
                onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function Results({
  test,
  result,
  onAgain,
}: {
  test: ReadingTest;
  result: ScoreResult;
  onAgain: () => void;
}) {
  const byId = useMemo(
    () => Object.fromEntries(result.perQuestion.map((p) => [p.id, p])),
    [result]
  );
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-slate-900">Reading results</h1>
      <div className="flex flex-wrap items-center gap-4">
        <OverallBand band={result.band} title="Reading band" />
        <div className="card px-4 py-3 text-sm">
          <p className="text-slate-500">Raw score</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900">
            {result.raw}/{result.total}
          </p>
        </div>
      </div>

      {test.passages.map((p) => (
        <section key={p.number} className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">Passage {p.number} — review</h2>
          {test.questions
            .filter((q) => q.passage === p.number)
            .map((q) => (
              <QuestionRenderer
                key={q.id}
                question={q}
                value={byId[q.id]?.given ?? ""}
                onChange={() => {}}
                review={byId[q.id]}
              />
            ))}
        </section>
      ))}

      <button className="btn-primary" onClick={onAgain}>
        New reading test
      </button>
    </div>
  );
}
