import { useEffect, useMemo, useState } from "react";
import { store } from "../lib/storage";
import { BandBadge } from "../components/BandScoreCard";
import type { ModuleKey, TestRecord } from "../types";

const MODULE_COLORS: Record<ModuleKey, string> = {
  speaking: "#e11d48",
  writing: "#d97706",
  reading: "#059669",
  listening: "#3b55e0",
};

export function Progress() {
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = () => store.all().then((r) => {
    setRecords(r);
    setLoaded(true);
  });
  useEffect(() => {
    refresh();
  }, []);

  const avg =
    records.length > 0 ? records.reduce((s, r) => s + r.band, 0) / records.length : null;

  const perModule = useMemo(() => {
    const groups: Record<string, number[]> = {};
    for (const r of records) (groups[r.module] ??= []).push(r.band);
    return (Object.keys(groups) as ModuleKey[]).map((m) => ({
      module: m,
      count: groups[m].length,
      avg: groups[m].reduce((a, b) => a + b, 0) / groups[m].length,
    }));
  }, [records]);

  const remove = async (id: string) => {
    await store.remove(id);
    refresh();
  };
  const clearAll = async () => {
    if (confirm("Delete all saved test history? This cannot be undone.")) {
      await store.clear();
      refresh();
    }
  };

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-slate-900">Progress & band history</h1>
        {records.length > 0 && (
          <button className="btn-ghost text-rose-600" onClick={clearAll}>
            Clear history
          </button>
        )}
      </header>

      {records.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          No completed tests yet. Finish a module and your band scores will appear here.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card p-4">
              <p className="text-sm text-slate-500">Running average</p>
              <p className="text-3xl font-extrabold tabular-nums text-brand-700">
                {avg!.toFixed(1)}
              </p>
              <p className="text-xs text-slate-400">{records.length} tests</p>
            </div>
            {perModule.map((m) => (
              <div key={m.module} className="card p-4">
                <p className="text-sm capitalize text-slate-500">{m.module}</p>
                <p
                  className="text-3xl font-extrabold tabular-nums"
                  style={{ color: MODULE_COLORS[m.module] }}
                >
                  {m.avg.toFixed(1)}
                </p>
                <p className="text-xs text-slate-400">{m.count} tests</p>
              </div>
            ))}
          </div>

          <div className="card p-5">
            <h2 className="mb-4 font-bold text-slate-800">Band over time</h2>
            <BandChart records={[...records].reverse()} />
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Module</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Breakdown</th>
                  <th className="px-4 py-3">Band</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium capitalize text-slate-800">
                      {r.module}
                      {r.meta?.task && (
                        <span className="ml-1 text-xs text-slate-400">({r.meta.task})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(r.date).toLocaleDateString()}{" "}
                      <span className="text-xs text-slate-400">
                        {new Date(r.date).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {r.breakdown
                        .map((b) => `${b.label}: ${b.value}`)
                        .join(" · ")}
                    </td>
                    <td className="px-4 py-3">
                      <BandBadge band={r.band} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="text-xs text-slate-400 hover:text-rose-600"
                        onClick={() => remove(r.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// Minimal dependency-free SVG line chart of band (0–9) over time.
function BandChart({ records }: { records: TestRecord[] }) {
  const W = 720;
  const H = 240;
  const pad = { l: 28, r: 16, t: 12, b: 28 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const n = records.length;

  const x = (i: number) => pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (band: number) => pad.t + innerH - (band / 9) * innerH;

  const points = records.map((r, i) => ({ x: x(i), y: y(r.band), r }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img" aria-label="Band score over time">
        {[0, 3, 5, 7, 9].map((b) => (
          <g key={b}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(b)}
              y2={y(b)}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            <text x={4} y={y(b) + 4} fontSize="10" fill="#94a3b8">
              {b}
            </text>
          </g>
        ))}
        {n > 1 && <path d={path} fill="none" stroke="#3b55e0" strokeWidth="2" />}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4.5" fill={MODULE_COLORS[p.r.module]} stroke="white" strokeWidth="1.5">
              <title>
                {p.r.module} · band {p.r.band} · {new Date(p.r.date).toLocaleDateString()}
              </title>
            </circle>
          </g>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
        {(Object.keys(MODULE_COLORS) as ModuleKey[]).map((m) => (
          <span key={m} className="flex items-center gap-1 capitalize">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: MODULE_COLORS[m] }} />
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}
