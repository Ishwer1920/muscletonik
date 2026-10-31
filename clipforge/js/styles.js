/* Auto-edit style templates.
 * segDur  = seconds taken from each clip
 * from    = where to grab the segment: 'start' | 'middle' | 'smart'
 *           ('smart' = a bit in from the start, skipping dead air at the top)
 * fps     = output frame rate
 */
window.CLIPFORGE_STYLES = [
  {
    id: "fastcuts",
    emoji: "⚡",
    name: "Fast Cuts",
    desc: "Punchy 1.2s snippets. Great for hype reels & trailers.",
    segDur: 1.2, from: "middle", fps: 30,
  },
  {
    id: "highlights",
    emoji: "✨",
    name: "Highlights",
    desc: "2s per clip from the action. Balanced and clean.",
    segDur: 2.0, from: "smart", fps: 30,
  },
  {
    id: "montage",
    emoji: "🎞️",
    name: "Montage",
    desc: "Relaxed 3s beats. Good with mellow music.",
    segDur: 3.0, from: "middle", fps: 30,
  },
  {
    id: "vlog",
    emoji: "📹",
    name: "Vlog",
    desc: "4s per clip from the start. Keeps context & talking.",
    segDur: 4.0, from: "start", fps: 30,
  },
];

window.CLIPFORGE_RATIOS = [
  { id: "9:16", label: "9:16 · Reels", w: { "720": 720, "1080": 1080 }, hMul: 16 / 9 },
  { id: "1:1",  label: "1:1 · Square", w: { "720": 720, "1080": 1080 }, hMul: 1 },
  { id: "16:9", label: "16:9 · Wide",  w: { "720": 1280, "1080": 1920 }, hMul: 9 / 16 },
];

window.CLIPFORGE_QUALITIES = [
  { id: "720", label: "720p · faster" },
  { id: "1080", label: "1080p · slower" },
];
