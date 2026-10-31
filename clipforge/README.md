# ClipForge — Auto Video Editor

Upload a few raw clips, pick a style, hit one button, and ClipForge cuts them
into a finished video — automatically. It runs **100% in your browser**: your
clips are never uploaded to any server.

## What it does

- **Auto-edit:** trims each clip to a style-based length and stitches them together.
- **Styles:** Fast Cuts, Highlights, Montage, Vlog (each controls segment length & pacing).
- **Formats:** 9:16 (Reels), 1:1 (Square), 16:9 (Wide) at 720p or 1080p.
- **Background music:** drop in any audio file; it's laid over the whole edit.
- **Title card:** optional text shown at the start of the video.
- **Export:** download the result as an MP4.

Powered by [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) — a real
video-processing engine compiled to run in the browser.

## How to run it

It needs to be served over `http://` (not opened as a `file://`), because the
editing engine loads as a web module.

```bash
cd clipforge
python3 serve.py
```

Then open **http://localhost:8000** in Chrome, Edge, or Firefox.

Any static server works — e.g. `npx serve` — if you'd rather not use Python.

## How to use it

1. **Drop in your clips** (MP4 / MOV / WebM). 2–8 short clips renders fastest.
2. **Pick a style.**
3. **Choose aspect ratio & quality**, and optionally add a **title** and **music**.
4. Click **✨ Auto-Edit my video**, wait for the progress bar, then **download**.

> **First render** downloads the ~30 MB engine once (then it's cached).
> Rendering happens on your own machine, so bigger/longer clips take longer —
> start small to get a feel for it.

## Notes & limits

- Single-threaded engine is used for maximum browser compatibility (no special
  hosting required). For much faster renders you can switch to the multi-threaded
  core later — `serve.py` already sends the headers it needs.
- Everything is local: no accounts, no uploads, no backend.

## Project layout

```
clipforge/
├── index.html        # UI
├── css/style.css     # styling
├── js/styles.js      # editing style/format presets
├── js/main.js        # app logic + ffmpeg pipeline
├── serve.py          # tiny local static server
└── README.md
```
