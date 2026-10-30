export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

// Live word counter with a minimum-word warning and an optional target range.
export function WordCounter({
  text,
  min,
  targetMin,
  targetMax,
}: {
  text: string;
  min?: number;
  targetMin?: number;
  targetMax?: number;
}) {
  const count = countWords(text);
  const belowMin = min !== undefined && count < min;
  const inTarget =
    targetMin !== undefined && targetMax !== undefined
      ? count >= targetMin && count <= targetMax
      : undefined;

  let tone = "text-slate-500";
  if (belowMin) tone = "text-rose-600";
  else if (inTarget === true) tone = "text-emerald-600";
  else if (inTarget === false) tone = "text-amber-600";

  return (
    <div className={`flex items-center gap-2 text-xs font-medium ${tone}`}>
      <span className="tabular-nums">{count} words</span>
      {min !== undefined && belowMin && <span>· min {min}</span>}
      {targetMin !== undefined && targetMax !== undefined && (
        <span className="opacity-70">
          · target {targetMin}–{targetMax}
        </span>
      )}
    </div>
  );
}
