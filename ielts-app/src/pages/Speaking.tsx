import { useCallback, useRef, useState } from "react";
import { api } from "../lib/api";
import { store, makeRecord } from "../lib/storage";
import { Spinner } from "../components/Spinner";
import { Timer } from "../components/Timer";
import { AnswerInput } from "../components/AnswerInput";
import {
  OverallBand,
  CriterionCard,
  Priorities,
} from "../components/BandScoreCard";
import type { SpeakingSetup, SpeakingReport } from "../types";

type Phase =
  | "intro"
  | "loading"
  | "part1"
  | "part2-prep"
  | "part2-answer"
  | "part3"
  | "evaluating"
  | "report"
  | "error";

export function Speaking() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<SpeakingSetup | null>(null);

  const [p1, setP1] = useState<string[]>([]);
  const [p1Index, setP1Index] = useState(0);
  const [p2, setP2] = useState("");
  const [p3, setP3] = useState<string[]>([]);
  const [p3Index, setP3Index] = useState(0);

  const usedSpeech = useRef(false);
  const [report, setReport] = useState<SpeakingReport | null>(null);

  const markSpeech = useCallback((m: "type" | "speak") => {
    if (m === "speak") usedSpeech.current = true;
  }, []);

  const start = async () => {
    setPhase("loading");
    setError(null);
    try {
      const s = await api.speakingSetup();
      setSetup(s);
      setP1(new Array(s.part1.questions.length).fill(""));
      setP3(new Array(s.part3.questions.length).fill(""));
      setP1Index(0);
      setP3Index(0);
      setP2("");
      usedSpeech.current = false;
      setPhase("part1");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  };

  const evaluate = async () => {
    if (!setup) return;
    setPhase("evaluating");
    try {
      const payload = {
        part1: setup.part1.questions.map((q, i) => ({ question: q, answer: p1[i] })),
        part2: p2,
        part3: setup.part3.questions.map((q, i) => ({ question: q, answer: p3[i] })),
        inputMode: usedSpeech.current ? "speech" : "text",
      };
      const r = await api.speakingEvaluate(payload);
      setReport(r);
      await store.add(
        makeRecord({
          module: "speaking",
          band: r.overall,
          breakdown: r.criteria.map((c) => ({ label: c.name, value: c.band })),
        })
      );
      setPhase("report");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  };

  const reset = () => {
    setPhase("intro");
    setReport(null);
  };

  // ---- renderers ----

  if (phase === "loading") return <Spinner label="The examiner is preparing your questions…" />;
  if (phase === "evaluating")
    return <Spinner label="The examiner is scoring your responses…" />;

  if (phase === "error")
    return (
      <div className="card p-6">
        <p className="text-rose-600">Something went wrong: {error}</p>
        <button className="btn-primary mt-4" onClick={reset}>
          Back to start
        </button>
      </div>
    );

  if (phase === "intro")
    return (
      <Intro onStart={start} />
    );

  if (phase === "report" && report)
    return <Report report={report} onAgain={reset} />;

  if (!setup) return null;

  // Part 1 — one question at a time
  if (phase === "part1") {
    const q = setup.part1.questions[p1Index];
    const last = p1Index === setup.part1.questions.length - 1;
    return (
      <StepShell title="Part 1 — Interview" subtitle={setup.part1.intro}>
        <ProgressDots total={setup.part1.questions.length} current={p1Index} />
        <QuestionBlock
          index={p1Index}
          total={setup.part1.questions.length}
          question={q}
          value={p1[p1Index]}
          onChange={(v) => setP1((arr) => arr.map((x, i) => (i === p1Index ? v : x)))}
          onModeChange={markSpeech}
        />
        <div className="flex justify-between">
          <button
            className="btn-ghost"
            disabled={p1Index === 0}
            onClick={() => setP1Index((i) => i - 1)}
          >
            ← Previous
          </button>
          {last ? (
            <button className="btn-primary" onClick={() => setPhase("part2-prep")}>
              Continue to Part 2 →
            </button>
          ) : (
            <button className="btn-primary" onClick={() => setP1Index((i) => i + 1)}>
              Next question →
            </button>
          )}
        </div>
      </StepShell>
    );
  }

  // Part 2 — prep countdown
  if (phase === "part2-prep") {
    const cue = setup.part2.cueCard;
    return (
      <StepShell title="Part 2 — Cue Card" subtitle="You have 1 minute to prepare.">
        <div className="card border-2 border-dashed border-brand-200 bg-brand-50/40 p-5">
          <h3 className="text-lg font-bold text-slate-900">{cue.topic}</h3>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
            {cue.bullets.map((b, i) => (
              <li key={i} className={i === 0 ? "font-medium" : "pl-4"}>
                {i === 0 ? b : `• ${b}`}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Timer
            seconds={60}
            warnAt={15}
            label="Prep"
            onExpire={() => setPhase("part2-answer")}
          />
          <button className="btn-primary" onClick={() => setPhase("part2-answer")}>
            I’m ready — start speaking →
          </button>
        </div>
      </StepShell>
    );
  }

  // Part 2 — long turn answer
  if (phase === "part2-answer") {
    const cue = setup.part2.cueCard;
    return (
      <StepShell title="Part 2 — Your long turn" subtitle="Speak or type for 1–2 minutes (aim 150–220 words).">
        <div className="card bg-slate-50 p-4 text-sm">
          <p className="font-semibold text-slate-800">{cue.topic}</p>
          <ul className="mt-1 text-slate-600">
            {cue.bullets.slice(1).map((b, i) => (
              <li key={i}>• {b}</li>
            ))}
          </ul>
        </div>
        <div className="flex items-center justify-end">
          <Timer seconds={120} warnAt={20} label="Speaking" />
        </div>
        <AnswerInput
          value={p2}
          onChange={setP2}
          rows={8}
          placeholder="Deliver your 1–2 minute answer here…"
          showWordCount
          targetMin={150}
          targetMax={220}
          onModeChange={markSpeech}
        />
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => setPhase("part3")}>
            Continue to Part 3 →
          </button>
        </div>
      </StepShell>
    );
  }

  // Part 3 — discussion
  if (phase === "part3") {
    const q = setup.part3.questions[p3Index];
    const last = p3Index === setup.part3.questions.length - 1;
    return (
      <StepShell title="Part 3 — Discussion" subtitle="Follow-up questions on the cue-card topic.">
        <ProgressDots total={setup.part3.questions.length} current={p3Index} />
        <QuestionBlock
          index={p3Index}
          total={setup.part3.questions.length}
          question={q}
          value={p3[p3Index]}
          onChange={(v) => setP3((arr) => arr.map((x, i) => (i === p3Index ? v : x)))}
          onModeChange={markSpeech}
        />
        <div className="flex justify-between">
          <button
            className="btn-ghost"
            disabled={p3Index === 0}
            onClick={() => setP3Index((i) => i - 1)}
          >
            ← Previous
          </button>
          {last ? (
            <button className="btn-primary" onClick={evaluate}>
              Finish & get examiner report →
            </button>
          ) : (
            <button className="btn-primary" onClick={() => setP3Index((i) => i + 1)}>
              Next question →
            </button>
          )}
        </div>
      </StepShell>
    );
  }

  return null;
}

// ---- small building blocks ----

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900">Speaking mock test</h1>
        <p className="mt-1 text-slate-600">
          A realistic 3-part IELTS Speaking test with an AI examiner. You can type or use your
          microphone for each answer.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Part 1", "4–5 interview questions about you."],
          ["Part 2", "A cue card with 60s prep, then a 1–2 minute long turn."],
          ["Part 3", "4–5 discussion questions on the topic."],
        ].map(([t, d]) => (
          <div key={t} className="card p-4">
            <p className="font-bold text-brand-700">{t}</p>
            <p className="mt-1 text-sm text-slate-600">{d}</p>
          </div>
        ))}
      </div>
      <button className="btn-primary" onClick={onStart}>
        Start Speaking test
      </button>
    </div>
  );
}

function StepShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-extrabold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
      </header>
      {children}
    </div>
  );
}

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full ${
            i < current ? "bg-brand-400" : i === current ? "bg-brand-600" : "bg-slate-200"
          }`}
        />
      ))}
    </div>
  );
}

function QuestionBlock({
  index,
  total,
  question,
  value,
  onChange,
  onModeChange,
}: {
  index: number;
  total: number;
  question: string;
  value: string;
  onChange: (v: string) => void;
  onModeChange: (m: "type" | "speak") => void;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Question {index + 1} of {total}
      </p>
      <p className="mt-1 text-lg font-medium text-slate-900">{question}</p>
      <div className="mt-4">
        <AnswerInput
          value={value}
          onChange={onChange}
          rows={4}
          placeholder="Your answer…"
          onModeChange={onModeChange}
        />
      </div>
    </div>
  );
}

function Report({ report, onAgain }: { report: SpeakingReport; onAgain: () => void }) {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-slate-900">Examiner report</h1>
      <OverallBand band={report.overall} />
      <div className="grid gap-4 sm:grid-cols-2">
        {report.criteria.map((c) => (
          <CriterionCard key={c.name} c={c} />
        ))}
      </div>
      <Priorities items={report.priorities} />
      {report.closing && (
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
          {report.closing}
        </div>
      )}
      {report.pronunciationNote && (
        <p className="text-xs text-slate-400">ℹ {report.pronunciationNote}</p>
      )}
      <div className="flex gap-3">
        <button className="btn-primary" onClick={onAgain}>
          Run another round
        </button>
      </div>
    </div>
  );
}
