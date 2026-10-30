# IELTS Practice Studio

A full-featured IELTS practice web app that runs on localhost. It covers all four
modules — **Speaking, Writing, Reading, Listening** — plus a **Progress / band
history** page, and uses the Anthropic Claude API as the examiner for scoring and
for generating original practice material.

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Node.js + Express — its _only_ job is to hold the LLM API key and
  proxy requests to Claude. The key is **never** exposed to the browser.
- **LLM:** Anthropic Claude (`claude-opus-5-5` by default), key read from `.env`
- **Storage:** browser `localStorage` (progress, test history, band scores),
  behind a small `ProgressStore` interface so it can later swap to MongoDB
- **Audio:** Web Speech API — `SpeechRecognition` (speech-to-text) for Speaking
  input, `SpeechSynthesis` (text-to-speech) for Listening audio

---

## Quick start

```bash
cd ielts-app
npm install
cp .env.example .env     # then edit .env and paste your Anthropic API key
npm run dev
```

`npm run dev` starts **both** the Express backend and the Vite dev server with one
command, and opens the app at **http://localhost:5173**. The frontend proxies all
`/api/*` requests to the backend on port `8787`.

### `.env`

```ini
ANTHROPIC_API_KEY=sk-ant-...      # required — read only by the backend
# ANTHROPIC_MODEL=claude-opus-5-5 # optional override
# PORT=8787                       # optional backend port
```

Get a key at <https://console.anthropic.com>. Without a key the app loads and shows
a banner; question generation and scoring stay disabled until a key is set and the
server is restarted.

---

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | **The single command.** Runs backend + frontend together (opens http://localhost:5173). |
| `npm run dev:server` | Express backend only (http://localhost:8787). |
| `npm run dev:client` | Vite dev server only. |
| `npm run build` | Typecheck + build the frontend to `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm start` | Alias for `npm run dev`. |

For a production-style run on one port: `npm run build` then `node server/index.js`
(the backend serves `dist/` at http://localhost:8787).

---

## Modules

### Speaking (guided 3-part mock)
- **Part 1:** 4–5 interview questions (name, hometown, study/work, hobbies, daily tech use).
- **Part 2:** a cue card with a 60-second preparation countdown, then a 1–2 minute
  long turn with a live word count (target 150–220 words).
- **Part 3:** 4–5 discussion questions linked to the cue-card topic.
- Each answer can be **typed or spoken** (mic → speech-to-text).
- The AI examiner returns an **overall band**, a **per-criterion breakdown**
  (Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy,
  Pronunciation) with what worked + specific corrections quoting your own words, a
  **Top-3 priorities** list, an encouraging closing line, and a note that
  pronunciation from a text/STT transcript is only an estimate.

### Writing
- Task 1 (Academic chart/graph/process **or** General letter) and Task 2 (essay).
- Timer (20 min Task 1 / 40 min Task 2) and a live word counter with the
  minimum-word warning (150 / 250).
- On submit, the AI scores the four Writing criteria + overall band, highlights the
  exact error substrings inline, and gives corrected sample sentences.

### Reading
- 3 **original** AI-generated passages, ~40 questions (True/False/Not Given,
  matching headings, multiple choice, gap/sentence completion).
- 60-minute timer, auto-scored against the answer key, raw score → IELTS band via
  the Academic Reading conversion table.

### Listening
- 4 **original** AI-generated sections, played via browser text-to-speech with
  play/pause controls and an optional "play once" exam mode.
- Form/note completion, multiple choice and matching questions, auto-scored with a
  raw → band conversion table. Transcripts are revealed only in the review screen.

> All passages, questions and audio are AI-generated and original. No copyrighted
> IELTS material is reproduced. Band scores are practice estimates.

---

## Architecture notes

```
ielts-app/
├── server/
│   ├── index.js        Express proxy: /api/* routes, Claude gateway, band scoring
│   └── prompts.js      All examiner/generation prompts (kept server-side)
├── src/
│   ├── lib/
│   │   ├── api.ts      Frontend client — talks only to /api/*
│   │   ├── storage.ts  ProgressStore interface + localStorage impl (swap for Mongo)
│   │   ├── speech.ts   Web Speech API helpers (STT + TTS)
│   │   └── bands.ts    Raw-score → band tables (display)
│   ├── components/     Timer, WordCounter, QuestionRenderer, BandScoreCard, …
│   └── pages/          Dashboard, Speaking, Writing, Reading, Listening, Progress
```

- **Security:** the browser never sees the API key. It only calls `/api/*`, which
  the Express server proxies to Claude using the server-side key.
- **Answer keys stay hidden:** for Reading/Listening the server generates the test,
  keeps the answer key in memory keyed by a `testId`, and ships only the questions
  to the browser. Scoring happens on `/api/*/score`.
- **Swappable storage:** everything persists through the `ProgressStore` interface
  in `src/lib/storage.ts`. To move to MongoDB later, implement that interface with
  `fetch()` calls to new backend endpoints and swap the exported `store` — no page
  or component changes required.

## Browser support for audio

Speech-to-text (Speaking mic input) is best supported in Chrome/Edge;
text-to-speech (Listening) is broadly supported. Where a feature is unavailable the
UI degrades gracefully — Speaking falls back to typing, and Listening shows a notice.
