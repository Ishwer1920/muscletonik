// Client-side copy of the raw-score -> IELTS band conversion tables, used for
// display (e.g. showing the conversion on results screens). The authoritative
// scoring happens server-side so answer keys never reach the browser early.

export function readingRawToBand(raw: number): number {
  const t: [number, number][] = [
    [39, 9.0], [37, 8.5], [35, 8.0], [33, 7.5], [30, 7.0],
    [27, 6.5], [23, 6.0], [19, 5.5], [15, 5.0], [13, 4.5],
    [10, 4.0], [8, 3.5], [6, 3.0], [4, 2.5],
  ];
  for (const [min, band] of t) if (raw >= min) return band;
  return raw >= 1 ? 2.0 : 0.0;
}

export function listeningRawToBand(raw: number): number {
  const t: [number, number][] = [
    [39, 9.0], [37, 8.5], [35, 8.0], [32, 7.5], [30, 7.0],
    [26, 6.5], [23, 6.0], [18, 5.5], [16, 5.0], [13, 4.5],
    [10, 4.0], [8, 3.5], [6, 3.0], [4, 2.5],
  ];
  for (const [min, band] of t) if (raw >= min) return band;
  return raw >= 1 ? 2.0 : 0.0;
}

export function bandColor(band: number): string {
  if (band >= 7.5) return "text-emerald-600";
  if (band >= 6.5) return "text-brand-600";
  if (band >= 5.0) return "text-amber-600";
  return "text-rose-600";
}

export function bandBg(band: number): string {
  if (band >= 7.5) return "bg-emerald-100 text-emerald-700";
  if (band >= 6.5) return "bg-brand-100 text-brand-700";
  if (band >= 5.0) return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}
