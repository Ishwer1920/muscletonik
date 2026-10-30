import type { Question, ScoreResult } from "../types";

// Renders a single reading/listening question with the right input for its
// type. In review mode it shows correct/incorrect + the answer key explanation.
export function QuestionRenderer({
  question,
  value,
  onChange,
  review,
}: {
  question: Question;
  value: string;
  onChange: (v: string) => void;
  review?: ScoreResult["perQuestion"][number];
}) {
  const disabled = Boolean(review);
  const isText = question.type === "gap" || question.type === "form";
  const options = question.options ?? [];

  const borderTone = review
    ? review.correct
      ? "border-emerald-300 bg-emerald-50/50"
      : "border-rose-300 bg-rose-50/50"
    : "border-slate-200";

  return (
    <div className={`rounded-xl border p-3 ${borderTone}`}>
      <div className="flex gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-bold text-white">
          {question.id}
        </span>
        <p className="text-sm leading-relaxed text-slate-800">{question.prompt}</p>
      </div>

      <div className="mt-3 pl-8">
        {isText ? (
          <input
            className="input max-w-sm"
            value={value}
            disabled={disabled}
            placeholder="Type your answer (1–3 words)"
            onChange={(e) => onChange(e.target.value)}
          />
        ) : options.length > 4 || question.type === "matching_headings" ? (
          <select
            className="input max-w-md"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">— choose —</option>
            {options.map((opt, i) => (
              <option key={i} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex flex-wrap gap-2">
            {options.map((opt, i) => {
              const selected = value === opt;
              return (
                <label
                  key={i}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition ${
                    selected
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-300 hover:bg-slate-50"
                  } ${disabled ? "cursor-default opacity-90" : ""}`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name={`q-${question.id}`}
                    checked={selected}
                    disabled={disabled}
                    onChange={() => onChange(opt)}
                  />
                  {opt}
                </label>
              );
            })}
          </div>
        )}

        {review && (
          <div className="mt-2 text-xs">
            {!review.correct && (
              <p className="text-rose-600">
                Correct answer: <span className="font-semibold">{review.correctAnswer}</span>
              </p>
            )}
            {review.explanation && <p className="mt-0.5 text-slate-500">{review.explanation}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
