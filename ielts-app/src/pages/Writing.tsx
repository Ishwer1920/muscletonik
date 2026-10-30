import { useState } from "react";
import { api } from "../lib/api";
import { store, makeRecord } from "../lib/storage";
import { Spinner } from "../components/Spinner";
import { Timer } from "../components/Timer";
import { WordCounter, countWords } from "../components/WordCounter";
import { OverallBand, CriterionCard, Priorities } from "../components/BandScoreCard";
import type { WritingTask, WritingReport } from "../types";

type Phase = "setup" | "loading" | "writing" | "evaluating" | "report" | "error";
type Task = 1 | 2;
type Variant = "academic" | "general";

export function Writing() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState<Task>(2);
  const [variant, setVariant] = useState<Variant>("academic");
  const [spec, setSpec] = useState<WritingTask | null>(null);
  const [essay, setEssay] = useState("");
  const [report, setReport] = useState<WritingReport | null>(null);

  const generate = async () => {
    setPhase("loading");
    setError(null);
    try {
      const s = await api.writingPrompt(task, variant);
      setSpec(s);
      setEssay("");
      setPhase("writing");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  };

  const submit = async () => {
    if (!spec) return;
    setPhase("evaluating");
    try {
      const r = await api.writingEvaluate({
        task,
        variant,
        prompt: spec.prompt,
        essay,
      });
      setReport(r);
      await store.add(
        makeRecord({
          module: "writing",
          band: r.overall,
          breakdown: r.criteria.map((c) => ({ label: c.name, value: c.band })),
          meta: { task: `Task ${task}`, ...(task === 1 ? { variant } : {}) },
        })
      );
      setPhase("report");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  };

  const reset = () => {
    setPhase("setup");
    setReport(null);
    setSpec(null);
  };

  if (phase === "loading") return <Spinner label="Generating your writing task…" />;
  if (phase === "evaluating") return <Spinner label="Scoring your writing…" />;

  if (phase === "error")
    return (
      <div className="card p-6">
        <p className="text-rose-600">Something went wrong: {error}</p>
        <button className="btn-primary mt-4" onClick={reset}>
          Back to start
        </button>
      </div>
    );

  if (phase === "report" && report && spec)
    return <Report report={report} essay={essay} onAgain={reset} />;

  if (phase === "writing" && spec)
    return (
      <div className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">{spec.title}</h1>
            <p className="text-sm text-slate-500">Write at least {spec.minWords} words.</p>
          </div>
          <Timer
            seconds={spec.timeLimitMinutes * 60}
            warnAt={120}
            label="Time"
          />
        </header>
        <div className="card whitespace-pre-wrap p-5 text-sm leading-relaxed text-slate-800">
          {spec.prompt}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="label mb-0">Your response</label>
            <WordCounter text={essay} min={spec.minWords} />
          </div>
          <textarea
            className="input min-h-[320px] resize-y leading-relaxed"
            value={essay}
            onChange={(e) => setEssay(e.target.value)}
            placeholder="Start writing here…"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button className="btn-ghost" onClick={reset}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={countWords(essay) < 20}
          >
            Submit for scoring
          </button>
        </div>
      </div>
    );

  // setup
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900">Writing practice</h1>
        <p className="mt-1 text-slate-600">
          Choose a task. You’ll get a timer (20 min Task 1 / 40 min Task 2), a live word counter,
          and a scored report with inline corrections.
        </p>
      </header>

      <div className="card space-y-5 p-5">
        <div>
          <p className="label">Task</p>
          <div className="flex gap-2">
            {([1, 2] as Task[]).map((t) => (
              <button
                key={t}
                onClick={() => setTask(t)}
                className={`flex-1 rounded-xl border px-4 py-3 text-left transition ${
                  task === t
                    ? "border-brand-500 bg-brand-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <p className="font-bold text-slate-900">Task {t}</p>
                <p className="text-xs text-slate-500">
                  {t === 1 ? "150+ words · 20 min" : "Essay · 250+ words · 40 min"}
                </p>
              </button>
            ))}
          </div>
        </div>

        {task === 1 && (
          <div>
            <p className="label">Task 1 type</p>
            <div className="flex gap-2">
              {(["academic", "general"] as Variant[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setVariant(v)}
                  className={`flex-1 rounded-xl border px-4 py-3 text-left capitalize transition ${
                    variant === v
                      ? "border-brand-500 bg-brand-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <p className="font-bold text-slate-900">{v}</p>
                  <p className="text-xs text-slate-500">
                    {v === "academic" ? "Describe a chart/graph/process" : "Write a letter"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        <button className="btn-primary" onClick={generate}>
          Generate task
        </button>
      </div>
    </div>
  );
}

// Highlight the exact error substrings the examiner flagged, inside the essay.
function highlightEssay(essay: string, highlights: { original: string; issue: string }[]) {
  if (!highlights?.length) return essay;
  const targets = highlights
    .map((h) => h.original)
    .filter((s) => s && essay.includes(s))
    .sort((a, b) => b.length - a.length);
  if (!targets.length) return essay;

  const nodes: React.ReactNode[] = [];
  let rest = essay;
  let key = 0;
  while (rest.length) {
    let bestIdx = -1;
    let best = "";
    for (const t of targets) {
      const idx = rest.indexOf(t);
      if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
        bestIdx = idx;
        best = t;
      }
    }
    if (bestIdx === -1) {
      nodes.push(<span key={key++}>{rest}</span>);
      break;
    }
    if (bestIdx > 0) nodes.push(<span key={key++}>{rest.slice(0, bestIdx)}</span>);
    nodes.push(
      <mark key={key++} className="rounded bg-amber-200/70 px-0.5 text-slate-900">
        {best}
      </mark>
    );
    rest = rest.slice(bestIdx + best.length);
  }
  return nodes;
}

function Report({
  report,
  essay,
  onAgain,
}: {
  report: WritingReport;
  essay: string;
  onAgain: () => void;
}) {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-slate-900">Writing report</h1>
      <div className="flex flex-wrap items-center gap-4">
        <OverallBand band={report.overall} />
        <div className="card px-4 py-3 text-sm">
          <p className="text-slate-500">Word count</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900">{report.wordCount}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {report.criteria.map((c) => (
          <CriterionCard key={c.name} c={c} />
        ))}
      </div>

      {report.highlights?.length > 0 && (
        <div className="card p-5">
          <h4 className="font-semibold text-slate-800">Your response, with issues highlighted</h4>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {highlightEssay(essay, report.highlights)}
          </p>
          <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
            {report.highlights.map((h, i) => (
              <li key={i}>
                <span className="rounded bg-amber-100 px-1 text-slate-800">“{h.original}”</span>{" "}
                <span className="text-slate-500">— {h.issue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.correctedSamples?.length > 0 && (
        <div className="card p-5">
          <h4 className="font-semibold text-slate-800">Corrected sample sentences</h4>
          <ul className="mt-2 space-y-2">
            {report.correctedSamples.map((s, i) => (
              <li
                key={i}
                className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Priorities items={report.priorities} />
      {report.closing && (
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
          {report.closing}
        </div>
      )}
      <button className="btn-primary" onClick={onAgain}>
        Practise another task
      </button>
    </div>
  );
}
