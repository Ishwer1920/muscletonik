// Shared domain types for the whole app.

export type ModuleKey = "speaking" | "writing" | "reading" | "listening";

export interface CriterionScore {
  name: string;
  band: number;
  whatWorked: string;
  corrections: { original: string; fixed: string; note?: string }[];
}

// ---- Speaking ----
export interface SpeakingSetup {
  part1: { intro: string; questions: string[] };
  part2: { cueCard: { topic: string; bullets: string[] } };
  part3: { questions: string[] };
}

export interface SpeakingReport {
  overall: number;
  criteria: CriterionScore[];
  priorities: string[];
  closing: string;
  pronunciationNote: string;
}

// ---- Writing ----
export interface WritingTask {
  title: string;
  minWords: number;
  timeLimitMinutes: number;
  prompt: string;
}

export interface WritingReport {
  overall: number;
  wordCount: number;
  criteria: CriterionScore[];
  highlights: { original: string; issue: string }[];
  correctedSamples: string[];
  priorities: string[];
  closing: string;
}

// ---- Reading / Listening ----
export type QuestionType = "tfng" | "matching_headings" | "mcq" | "gap" | "form" | "matching";

export interface Question {
  id: number;
  passage?: number;
  section?: number;
  type: QuestionType;
  prompt: string;
  options?: string[];
}

export interface ReadingPassage {
  number: number;
  title: string;
  text: string;
  headingsBank?: string[];
}

export interface ListeningSection {
  number: number;
  title: string;
  transcript: string;
}

export interface ReadingTest {
  testId: string;
  passages: ReadingPassage[];
  questions: Question[];
}

export interface ListeningTest {
  testId: string;
  sections: ListeningSection[];
  questions: Question[];
}

export interface ScoreResult {
  raw: number;
  total: number;
  band: number;
  perQuestion: {
    id: number;
    given: string;
    correct: boolean;
    correctAnswer: string;
    explanation: string;
  }[];
}

// ---- Progress / history ----
export interface TestRecord {
  id: string;
  module: ModuleKey;
  date: string; // ISO
  band: number;
  // per-criterion or per-section breakdown { label: band|score }
  breakdown: { label: string; value: number }[];
  meta?: Record<string, string | number>;
}
