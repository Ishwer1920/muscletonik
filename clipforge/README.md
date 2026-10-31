# ClipForge — AI Auto Video Editor

Upload a few raw clips, pick a style, and ClipForge cuts them into a finished
video — automatically. The video processing runs **100% in your browser**
(your clips are never uploaded). An optional **AI backend** adds scripts,
voiceover, auto-captions, smart highlight picking, and auto music.

---

## Two ways to run it

### A) Core editor only (no AI, no keys, nothing to install)

```bash
cd clipforge
python3 serve.py
```
Open **http://localhost:8000**. You get the full auto-editor: multi-clip upload,
styles, aspect ratios, title card, background music, MP4 export.

### B) Full version with AI features (recommended)

Needs [Node.js](https://nodejs.org) 18+.

```bash
cd clipforge/server
npm install
cp .env.example .env      # then open .env and add your API key(s)
npm start
```
Open the URL it prints (**http://localhost:8787**). The backend serves the app
*and* powers the AI tools. Your API keys stay on the server, never in the browser.

---

## Features

### Core auto-editor (browser, no keys)
- **Multi-clip upload** — drag & drop, reorder, remove, thumbnails.
- **Styles** — Fast Cuts, Highlights, Montage, Vlog (control segment length & pacing).
- **Formats** — 9:16 (Reels), 1:1 (Square), 16:9 (Wide) at 720p / 1080p.
- **Title card** + **background music**.
- **MP4 export**, powered by [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm).

### AI Studio (needs the Node backend + keys)

| Tool | What it does | Needs |
|------|--------------|-------|
| ✍️ **AI Script** | Writes punchy narration + a title from a topic | Anthropic (Claude) key |
| 🎙️ **Voiceover** | Turns the script into a narration track | OpenAI key |
| 💬 **Auto captions** | Transcribes the voiceover & burns word-timed subtitles | OpenAI key |
| 🎯 **Smart highlights** | AI picks the best moment of each clip | Anthropic key |
| 🎵 **Auto music** | Recommends a mood & picks a track from your library | Anthropic key |

> **Why two providers?** Claude handles the text/creative work (scripts,
> highlight picking, music mood). Anthropic has no audio models, so
> speech-to-text (captions) and text-to-speech (voiceover) use OpenAI.
> You only need the key(s) for the features you want.

The default Claude model is **`claude-opus-5-5`** (change it in `.env`).

---

## The AI workflow (a typical run)

1. Drop in your clips.
2. **AI Script** → type a topic → get a title + narration.
3. **Voiceover** → pick a voice → narration becomes the audio track.
4. **Auto captions** → subtitles get burned on, synced to the voiceover.
5. **Smart highlights** → AI picks the best moment of each clip.
6. **Auto music** → describe the vibe → a track is laid under the narration (ducked).
7. **✨ Auto-Edit my video** → download the MP4.

Every AI step is optional — use any combination, or none.

---

## Adding music for the "Auto music" feature

Drop royalty-free `.mp3` / `.wav` files into `clipforge/server/music/`. The AI
picks the best match by filename, so name them descriptively
(`upbeat-summer-pop.mp3`, `cinematic-emotional.mp3`). If the folder is empty,
the AI just recommends a mood + search terms.

---

## Project layout

```
clipforge/
├── index.html          # UI
├── css/style.css       # styling
├── js/styles.js        # editing style/format presets
├── js/ai.js            # AI Studio frontend (talks to the backend)
├── js/main.js          # core app + ffmpeg render pipeline
├── serve.py            # tiny static server (core editor, no AI)
└── server/             # AI backend (Node + Express)
    ├── server.js       # serves the app + /api/* endpoints
    ├── lib/anthropic.js# Claude: scripts, highlights, music mood
    ├── lib/openai.js   # OpenAI: captions (STT) + voiceover (TTS)
    ├── music/          # drop your royalty-free tracks here
    └── .env.example    # copy to .env and add keys
```

---

## Notes & limits

- Rendering happens **on your machine** in the browser, so long/large clips are
  slower. Start with 2–8 short clips.
- First render downloads the ~30 MB engine once (then cached).
- Captions currently sync to the **voiceover** (generate a voiceover first).
- `.env` and `node_modules/` are gitignored — your keys never get committed.
- AI calls cost money on your own API accounts; short scripts/voiceovers are cheap.
