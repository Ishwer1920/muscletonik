import type { CriterionScore } from "../types";
import { bandBg, bandColor } from "../lib/bands";

function BandBadge({ band, large }: { band: number; large?: boolean }) {
  return (
    <span
      className={`pill ${bandBg(band)} ${
        large ? "px-3 py-1 text-base" : ""
      } tabular-nums`}
    >
      {band.toFixed(1)}
    </span>
  );
}

export function OverallBand({ band, title = "Overall band" }: { band: number; title?: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
      <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-white/15">
        <span className="text-3xl font-extrabold tabular-nums">{band.toFixed(1)}</span>
      </div>
      <div>
        <p className="text-sm uppercase tracking-wide text-white/70">{title}</p>
        <p className="text-lg font-semibold">out of 9.0</p>
      </div>
    </div>
  );
}

export function CriterionCard({ c }: { c: CriterionScore }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold text-slate-800">{c.name}</h4>
        <BandBadge band={c.band} />
      </div>
      {c.whatWorked && <p className="mt-2 text-sm text-slate-600">{c.whatWorked}</p>}
      {c.corrections?.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {c.corrections.map((corr, i) => (
            <li key={i} className="text-sm">
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-600 line-through">
                {corr.original}
              </span>{" "}
              <span className="text-slate-400">→</span>{" "}
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
                {corr.fixed}
              </span>
              {corr.note && <span className="ml-1 text-xs text-slate-400">({corr.note})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Priorities({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="card p-4">
      <h4 className="font-semibold text-slate-800">Top priorities to improve</h4>
      <ol className="mt-2 space-y-2">
        {items.map((p, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-700">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
              {i + 1}
            </span>
            {p}
          </li>
        ))}
      </ol>
    </div>
  );
}

export { BandBadge };
export const bandTone = bandColor;
