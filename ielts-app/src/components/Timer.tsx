import { useEffect, useRef, useState } from "react";

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Count-down timer. Calls onExpire once when it reaches 0. `running` lets the
// parent pause/resume. `warnAt` highlights the last N seconds in red.
export function Timer({
  seconds,
  running = true,
  warnAt = 60,
  onExpire,
  label,
}: {
  seconds: number;
  running?: boolean;
  warnAt?: number;
  onExpire?: () => void;
  label?: string;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const firedRef = useRef(false);

  useEffect(() => {
    setRemaining(seconds);
    firedRef.current = false;
  }, [seconds]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          if (!firedRef.current) {
            firedRef.current = true;
            onExpire?.();
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, onExpire]);

  const warn = remaining <= warnAt;
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold tabular-nums ${
        warn ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"
      }`}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2 2M9 2h6" strokeLinecap="round" />
      </svg>
      {label && <span className="font-medium opacity-70">{label}</span>}
      <span>{fmt(remaining)}</span>
    </div>
  );
}
