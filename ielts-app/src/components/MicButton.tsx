import { useEffect, useRef, useState } from "react";
import { createRecognizer, isSTTSupported, type Recognizer } from "../lib/speech";

// Microphone record toggle. Appends finalized speech chunks via onFinalChunk
// and streams the interim guess via onInterim so the UI can preview it.
export function MicButton({
  onFinalChunk,
  onInterim,
  disabled,
}: {
  onFinalChunk: (text: string) => void;
  onInterim?: (text: string) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognizer | null>(null);
  const supported = isSTTSupported();

  useEffect(() => {
    return () => recRef.current?.stop();
  }, []);

  if (!supported) {
    return (
      <span className="text-xs text-slate-400">
        🎤 Speech input isn’t supported in this browser — type instead (try Chrome/Edge).
      </span>
    );
  }

  const toggle = () => {
    setError(null);
    if (recording) {
      recRef.current?.stop();
      setRecording(false);
      return;
    }
    const rec = createRecognizer({
      onFinal: (t) => onFinalChunk(t),
      onPartial: (t) => onInterim?.(t),
      onError: (e) => {
        setError(e);
        setRecording(false);
      },
      onEnd: () => {
        onInterim?.("");
      },
    });
    if (!rec) {
      setError("Could not start microphone.");
      return;
    }
    recRef.current = rec;
    rec.start();
    setRecording(true);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={`btn ${recording ? "btn-danger" : "btn-ghost"}`}
      >
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            recording ? "animate-pulse bg-white" : "bg-rose-500"
          }`}
        />
        {recording ? "Stop recording" : "Record answer"}
      </button>
      {error && <span className="text-xs text-rose-500">mic: {error}</span>}
    </div>
  );
}
