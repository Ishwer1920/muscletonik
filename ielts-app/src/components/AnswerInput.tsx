import { useState } from "react";
import { MicButton } from "./MicButton";
import { WordCounter } from "./WordCounter";

type Mode = "type" | "speak";

// Reusable answer box with a Type / Speak toggle. In speak mode, finalized
// speech is appended to the text so the candidate can also edit it afterwards.
export function AnswerInput({
  value,
  onChange,
  placeholder,
  rows = 4,
  showWordCount = false,
  targetMin,
  targetMax,
  onModeChange,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  showWordCount?: boolean;
  targetMin?: number;
  targetMax?: number;
  onModeChange?: (m: Mode) => void;
}) {
  const [mode, setMode] = useState<Mode>("type");
  const [interim, setInterim] = useState("");

  const setModeAndNotify = (m: Mode) => {
    setMode(m);
    onModeChange?.(m);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-sm w-fit">
        {(["type", "speak"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModeAndNotify(m)}
            className={`rounded-md px-3 py-1 font-medium capitalize transition ${
              mode === m ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
            }`}
          >
            {m === "type" ? "⌨ Type" : "🎤 Speak"}
          </button>
        ))}
      </div>

      <textarea
        className="input resize-y"
        rows={rows}
        value={interim ? `${value}${interim}` : value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        {mode === "speak" ? (
          <MicButton
            onFinalChunk={(chunk) => {
              onChange((value + " " + chunk).replace(/\s+/g, " ").trimStart());
              setInterim("");
            }}
            onInterim={setInterim}
          />
        ) : (
          <span />
        )}
        {showWordCount && <WordCounter text={value} targetMin={targetMin} targetMax={targetMax} />}
      </div>
    </div>
  );
}
