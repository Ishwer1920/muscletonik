// Web Speech API helpers: SpeechRecognition (speech-to-text) for the Speaking
// module's mic input, and SpeechSynthesis (text-to-speech) for Listening audio.
//
// These APIs are browser-dependent. SpeechRecognition is best supported in
// Chrome/Edge; SpeechSynthesis is broadly supported. Callers must handle the
// `isSupported` flags and degrade gracefully (the UI falls back to typing).

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- Speech-to-text --------------------------------------------------------

type SpeechRecognitionLike = any;

function getRecognitionCtor(): any {
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function isSTTSupported(): boolean {
  return Boolean(getRecognitionCtor());
}

export interface Recognizer {
  start(): void;
  stop(): void;
}

export function createRecognizer(opts: {
  onPartial?: (text: string) => void; // interim transcript since start
  onFinal?: (text: string) => void; // appended final chunk
  onEnd?: () => void;
  onError?: (err: string) => void;
}): Recognizer | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;
  const rec: SpeechRecognitionLike = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";

  rec.onresult = (event: any) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript;
      if (result.isFinal) {
        opts.onFinal?.(text.trim() + " ");
      } else {
        interim += text;
      }
    }
    if (interim) opts.onPartial?.(interim);
  };
  rec.onerror = (e: any) => opts.onError?.(e?.error || "speech-error");
  rec.onend = () => opts.onEnd?.();

  return {
    start: () => {
      try {
        rec.start();
      } catch {
        /* already started */
      }
    },
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}

// ---- Text-to-speech --------------------------------------------------------

export function isTTSSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function cancelSpeech() {
  if (isTTSSupported()) window.speechSynthesis.cancel();
}

export function pauseSpeech() {
  if (isTTSSupported()) window.speechSynthesis.pause();
}

export function resumeSpeech() {
  if (isTTSSupported()) window.speechSynthesis.resume();
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /en-GB/i.test(v.lang)) ||
    voices.find((v) => /en[-_]/i.test(v.lang)) ||
    voices[0]
  );
}

export function speak(
  text: string,
  opts: { rate?: number; onBoundary?: (charIndex: number) => void; onEnd?: () => void } = {}
) {
  if (!isTTSSupported()) {
    opts.onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) utter.voice = voice;
  utter.rate = opts.rate ?? 0.95;
  utter.pitch = 1;
  utter.onboundary = (e) => opts.onBoundary?.(e.charIndex);
  utter.onend = () => opts.onEnd?.();
  window.speechSynthesis.speak(utter);
}
