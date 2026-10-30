import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ModuleCard } from "../components/ModuleCard";
import { BandBadge } from "../components/BandScoreCard";
import { store } from "../lib/storage";
import type { TestRecord } from "../types";

const MODULES = [
  {
    to: "/speaking",
    title: "Speaking",
    description: "A guided 3-part mock with an AI examiner, mic or typing, and a full band report.",
    icon: "🗣️",
    accent: "bg-rose-100 text-rose-600",
  },
  {
    to: "/writing",
    title: "Writing",
    description: "Task 1 (Academic/General) & Task 2 with timers, live word count, and scored feedback.",
    icon: "✍️",
    accent: "bg-amber-100 text-amber-600",
  },
  {
    to: "/reading",
    title: "Reading",
    description: "3 original passages, ~40 questions, 60-minute timer and automatic band scoring.",
    icon: "📖",
    accent: "bg-emerald-100 text-emerald-600",
  },
  {
    to: "/listening",
    title: "Listening",
    description: "4 original sections read aloud by text-to-speech, with auto-scored answers.",
    icon: "🎧",
    accent: "bg-brand-100 text-brand-600",
  },
];

export function Dashboard() {
  const [records, setRecords] = useState<TestRecord[]>([]);
  useEffect(() => {
    store.all().then(setRecords);
  }, []);

  const avg =
    records.length > 0
      ? records.reduce((s, r) => s + r.band, 0) / records.length
      : null;

  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white sm:p-8">
        <h1 className="text-2xl font-extrabold sm:text-3xl">Prepare for IELTS, the realistic way</h1>
        <p className="mt-2 max-w-2xl text-white/80">
          Four full modules, an AI examiner that scores against the official band descriptors, and
          a progress tracker. Pick a module and start a timed mock.
        </p>
        {avg !== null && (
          <div className="mt-4 inline-flex items-center gap-3 rounded-xl bg-white/10 px-4 py-2">
            <span className="text-sm text-white/80">Your running average</span>
            <span className="text-xl font-bold tabular-nums">{avg.toFixed(1)}</span>
            <Link to="/progress" className="text-sm font-semibold underline underline-offset-2">
              View history →
            </Link>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900">Modules</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m) => (
            <ModuleCard key={m.to} {...m} />
          ))}
        </div>
      </section>

      {records.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Recent results</h2>
            <Link to="/progress" className="text-sm font-semibold text-brand-600">
              All history →
            </Link>
          </div>
          <div className="card divide-y divide-slate-100">
            {records.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium capitalize text-slate-800">{r.module}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(r.date).toLocaleString()}
                  </p>
                </div>
                <BandBadge band={r.band} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
