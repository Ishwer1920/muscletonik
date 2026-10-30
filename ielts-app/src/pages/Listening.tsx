import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { store, makeRecord } from "../lib/storage";
import { Spinner } from "../components/Spinner";
import { QuestionRenderer } from "../components/QuestionRenderer";
import { OverallBand } from "../components/BandScoreCard";
import {
  speak,
  pauseSpeech,
  resumeSpeech,
  cancelSpeech,
  isTTSSupported,
} from "../lib/speech";
import type { ListeningTest, ScoreResult } from "../types";

type Phase = "intro" | "loading" | "test" | "scoring" | "results" | "error";

export function Listening() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<ListeningTest | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [activeSection, setActiveSection] = useState(1);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [playOnce, setPlayOnce] = useState(true);

  useEffect(() => () => cancelSpeech(), []);

  const start = async () => {
    setPhase("loading");
    setError(null);
    try {
      const t = await api.listeningGenerate();
      setTest(t);
      setAnswers({});
      setActiveSection(t.sections[0]?.number ?? 1);
      setPhase("test");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  };

  const submit = async () => {
    if (!test) return;
    cancelSpeech();
    setPhase("scoring");
    try {
      const r = await api.listeningScore(test.testId, answers);
      setResult(r);
      await store.add(
        makeRecord({
          module: "listening",
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
    return <Spinner label="Writing 4 original sections & 40 questions… (this can take a bit)" />;
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
          <h1 className="text-2xl font-extrabold text-slate-900">Listening test</h1>
          <p className="mt-1 text-slate-600">
            4 original sections read aloud by your browser’s text-to-speech, with form/note
            completion, multiple choice and matching questions, then automatic band scoring.
          </p>
        </header>
        {!isTTSSupported() && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            ⚠ Text-to-speech isn’t available in this browser, so audio won’t play. Try Chrome/Edge.
          </p>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={playOnce}
            onChange={(e) => setPlayOnce(e.target.checked)}
          />
          Play each section only once (realistic exam mode)
        </label>
        <button className="btn-primary" onClick={start}>
          Generate & start listening test
        </button>
      </div>
    );

  if (phase === "results" && result && test)
    return <Results test={test} result={result} onAgain={() => setPhase("intro")} />;

  if (phase === "test" && test) {
    const section = test.sections.find((s) => s.number === activeSection) ?? test.sections[0];
    const qs = test.questions.filter((q) => q.section === section.number);
    const answered = Object.values(answers).filter(Boolean).length;
    return (
      <div className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Listening test</h1>
            <p className="text-sm text-slate-500">
              {answered}/{test.questions.length} answered
            </p>
          </div>
          <button className="btn-primary" onClick={submit}>
            Submit test
          </button>
        </header>

        <div className="flex flex-wrap gap-2">
          {test.sections.map((s) => (
            <button
              key={s.number}
              onClick={() => setActiveSection(s.number)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                activeSection === s.number
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Section {s.number}
            </button>
          ))}
        </div>

        <AudioPlayer
          key={section.number}
          title={section.title}
          transcript={section.transcript}
          playOnce={playOnce}
        />

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
    );
  }

  return null;
}

function AudioPlayer({
  title,
  transcript,
  playOnce,
}: {
  title: string;
  transcript: string;
  playOnce: boolean;
}) {
  const [state, setState] = useState<"idle" | "playing" | "paused" | "done">("idle");
  const startedRef = useRef(false);

  useEffect(() => () => cancelSpeech(), []);

  const play = () => {
    startedRef.current = true;
    setState("playing");
    speak(transcript, {
      onEnd: () => setState("done"),
    });
  };
  const pause = () => {
    pauseSpeech();
    setState("paused");
  };
  const resume = () => {
    resumeSpeech();
    setState("playing");
  };

  const lockedAfterPlay = playOnce && (state === "done" || (startedRef.current && state === "idle"));

  return (
    <div className="card flex flex-wrap items-center gap-3 p-4">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-xl">🎧</div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">
          {state === "playing"
            ? "Playing…"
            : state === "paused"
            ? "Paused"
            : state === "done"
            ? playOnce
              ? "Finished — this section can’t be replayed."
              : "Finished."
            : "Ready to play"}
        </p>
      </div>
      {!isTTSSupported() ? (
        <span className="text-xs text-slate-400">audio unsupported</span>
      ) : state === "playing" ? (
        <button className="btn-ghost" onClick={pause}>
          ⏸ Pause
        </button>
      ) : state === "paused" ? (
        <button className="btn-primary" onClick={resume}>
          ▶ Resume
        </button>
      ) : (
        <button className="btn-primary" onClick={play} disabled={lockedAfterPlay}>
          ▶ {state === "done" ? "Play again" : "Play section"}
        </button>
      )}
    </div>
  );
}

function Results({
  test,
  result,
  onAgain,
}: {
  test: ListeningTest;
  result: ScoreResult;
  onAgain: () => void;
}) {
  const byId = useMemo(
    () => Object.fromEntries(result.perQuestion.map((p) => [p.id, p])),
    [result]
  );
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-slate-900">Listening results</h1>
      <div className="flex flex-wrap items-center gap-4">
        <OverallBand band={result.band} title="Listening band" />
        <div className="card px-4 py-3 text-sm">
          <p className="text-slate-500">Raw score</p>
          <p className="text-2xl font-bold tabular-nums text-slate-900">
            {result.raw}/{result.total}
          </p>
        </div>
      </div>

      {test.sections.map((s) => (
        <section key={s.number} className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">Section {s.number} — review</h2>
          <details className="card p-4 text-sm">
            <summary className="cursor-pointer font-medium text-brand-700">
              Show transcript
            </summary>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed text-slate-600">
              {s.transcript}
            </p>
          </details>
          {test.questions
            .filter((q) => q.section === s.number)
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
        New listening test
      </button>
    </div>
  );
}
