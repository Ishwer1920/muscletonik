// Prompt builders for the Claude-powered IELTS examiner.
// Every builder returns { system, user }. The server asks Claude to reply with
// ONLY JSON matching the documented shape, then parses it.
//
// Keeping all prompt text here (server-side) means the frontend never needs the
// key and the "examiner" logic lives in one place.

const EXAMINER_PERSONA = `You are a certified, highly experienced IELTS examiner and speaking/writing coach.
You know the official IELTS band descriptors (public version) for all four criteria in each skill.
You score strictly but fairly, exactly as a real examiner would, using the 0-9 scale in 0.5 steps.
When you give corrections you quote the candidate's OWN words verbatim and show the fix.
You are warm and encouraging in tone but never inflate scores.`;

const JSON_RULES = `Respond with ONLY a single valid JSON object. No markdown, no code fences, no commentary before or after. Use plain ASCII double quotes for all keys and strings.`;

// ---------------------------------------------------------------------------
// SPEAKING
// ---------------------------------------------------------------------------

export function speakingSetupPrompt() {
  return {
    system: `${EXAMINER_PERSONA}\n${JSON_RULES}`,
    user: `Generate a complete IELTS Speaking test set. Pick a fresh, natural cue-card topic (vary it each time; avoid clichés).

Return JSON with this exact shape:
{
  "part1": {
    "intro": "a one-line friendly examiner greeting",
    "questions": [ "4 to 5 Part 1 questions about: name, hometown, study or work, hobbies, and daily technology use" ]
  },
  "part2": {
    "cueCard": {
      "topic": "Describe ...",
      "bullets": [ "You should say:", "3 to 4 'you should say' bullet points" ]
    }
  },
  "part3": {
    "questions": [ "4 to 5 abstract discussion questions clearly linked to the Part 2 cue-card topic" ]
  }
}

Make Part 1 questions short and conversational. Make Part 3 questions analytical (comparisons, opinions, future/past, causes/effects).`,
  };
}

export function speakingEvaluatePrompt(transcript) {
  const { part1 = [], part2 = "", part3 = [], inputMode = "text" } = transcript;
  const part1Text = part1
    .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer || "(no answer)"}`)
    .join("\n\n");
  const part3Text = part3
    .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer || "(no answer)"}`)
    .join("\n\n");

  return {
    system: `${EXAMINER_PERSONA}\n${JSON_RULES}`,
    user: `Here is a full IELTS Speaking mock from one candidate. The answers were captured by ${
      inputMode === "speech" ? "browser speech-to-text (so treat spelling/punctuation leniently; it is a transcript)" : "typing"
    }.

=== PART 1 ===
${part1Text || "(no answers)"}

=== PART 2 (Cue card long turn) ===
${part2 || "(no answer)"}

=== PART 3 ===
${part3Text || "(no answers)"}

Evaluate the candidate exactly like a real examiner. Score the four Speaking criteria (0-9, 0.5 steps). The overall band is the average of the four criteria rounded to the nearest 0.5 (standard IELTS rounding: .25 rounds up to .5, .75 rounds up to the next whole).

For EACH criterion, give 1-2 short lines on what worked, then SPECIFIC error corrections that QUOTE the candidate's own words, e.g. "'listen music' -> 'listen to music'". Give real quotes from the transcript above.

Return JSON with this exact shape:
{
  "overall": 6.5,
  "criteria": [
    {
      "name": "Fluency & Coherence",
      "band": 6.0,
      "whatWorked": "1-2 lines",
      "corrections": [ { "original": "candidate's words", "fixed": "corrected version", "note": "optional short why" } ]
    },
    { "name": "Lexical Resource", "band": 6.5, "whatWorked": "...", "corrections": [ ... ] },
    { "name": "Grammatical Range & Accuracy", "band": 6.0, "whatWorked": "...", "corrections": [ ... ] },
    { "name": "Pronunciation", "band": 6.0, "whatWorked": "...", "corrections": [ ... ] }
  ],
  "priorities": [ "Top 3 priorities to improve, most important first" ],
  "closing": "one encouraging closing line that also offers to run another round",
  "pronunciationNote": "a short note that pronunciation from a text/STT transcript is only an estimate"
}

Keep corrections grounded in the actual transcript. If an answer is empty, note the missing response rather than inventing quotes.`,
  };
}

// ---------------------------------------------------------------------------
// WRITING
// ---------------------------------------------------------------------------

export function writingPromptTask({ task, variant }) {
  // task: 1 | 2 ; variant (task 1 only): "academic" | "general"
  let ask;
  if (task === 1 && variant === "academic") {
    ask = `Create an IELTS Academic Writing Task 1. The candidate must describe/summarise visual information in at least 150 words. Since this app shows no real image, describe the chart/graph/table/process IN WORDS precisely enough that the candidate can write about it (give the data verbally).`;
  } else if (task === 1) {
    ask = `Create an IELTS General Training Writing Task 1 (a letter). At least 150 words. Include the situation and the three bullet points the letter must cover, and state whether the tone is formal, semi-formal, or informal.`;
  } else {
    ask = `Create an IELTS Writing Task 2 essay question (opinion / discussion / problem-solution / two-part). At least 250 words. Pick a fresh, commonly examined theme.`;
  }
  return {
    system: `${EXAMINER_PERSONA}\n${JSON_RULES}`,
    user: `${ask}

Return JSON with this exact shape:
{
  "title": "short label, e.g. 'Task 2 - Opinion'",
  "minWords": 150,
  "timeLimitMinutes": 20,
  "prompt": "the full task text shown to the candidate (include any verbal data description or letter bullet points here, using newlines)"
}
Set minWords to 150 for Task 1 or 250 for Task 2, and timeLimitMinutes to 20 for Task 1 or 40 for Task 2.`,
  };
}

export function writingEvaluatePrompt({ task, variant, prompt, essay }) {
  const taskCriterion = task === 1 ? "Task Achievement" : "Task Response";
  return {
    system: `${EXAMINER_PERSONA}\n${JSON_RULES}`,
    user: `Score this IELTS Writing ${task === 1 ? `Task 1 (${variant})` : "Task 2"} response like a real examiner.

=== TASK PROMPT ===
${prompt}

=== CANDIDATE RESPONSE ===
${essay || "(no response)"}

Score the four Writing criteria (0-9, 0.5 steps): ${taskCriterion}, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy. Overall band = average of the four rounded to the nearest 0.5 (.25 up to .5, .75 up to next whole).

Return JSON with this exact shape:
{
  "overall": 6.5,
  "wordCount": 240,
  "criteria": [
    { "name": "${taskCriterion}", "band": 6.0, "whatWorked": "1-2 lines", "corrections": [ { "original": "candidate's words", "fixed": "corrected version", "note": "short why" } ] },
    { "name": "Coherence & Cohesion", "band": 6.5, "whatWorked": "...", "corrections": [ ... ] },
    { "name": "Lexical Resource", "band": 6.0, "whatWorked": "...", "corrections": [ ... ] },
    { "name": "Grammatical Range & Accuracy", "band": 6.0, "whatWorked": "...", "corrections": [ ... ] }
  ],
  "highlights": [ { "original": "an exact substring copied verbatim from the candidate response that contains an error", "issue": "what is wrong" } ],
  "correctedSamples": [ "1-2 fully rewritten, improved sample sentences based on the candidate's own content" ],
  "priorities": [ "Top 3 priorities to improve" ],
  "closing": "one encouraging closing line"
}
Each "highlights[].original" MUST be copied exactly (character for character) from the candidate response so the UI can highlight it. If the response is empty or far under the minimum word count, reflect that strongly in the band and notes.`,
  };
}

// ---------------------------------------------------------------------------
// READING
// ---------------------------------------------------------------------------

export function readingGeneratePrompt() {
  return {
    system: `You are an expert IELTS Academic Reading test author. You write ORIGINAL passages and never reproduce copyrighted IELTS material.\n${JSON_RULES}`,
    user: `Author a complete, ORIGINAL IELTS Academic Reading test: 3 passages of increasing difficulty, ~40 questions total (aim for 13-14 per passage). Use a mix of these question types across the test: "tfng" (True/False/Not Given), "matching_headings", "mcq" (multiple choice), "gap" (sentence/summary gap completion). Number questions 1..N sequentially across the whole test.

Each passage must be 600-850 words of original non-fiction prose on a real-world academic topic (science, history, environment, social science, technology). Do NOT copy any existing IELTS passage.

Return JSON with this exact shape:
{
  "passages": [
    {
      "number": 1,
      "title": "...",
      "text": "the full passage with \\n between paragraphs",
      "headingsBank": [ "only for matching_headings: list of candidate headings labelled i, ii, iii..." ]
    }
  ],
  "questions": [
    {
      "id": 1,
      "passage": 1,
      "type": "tfng",
      "prompt": "the statement or question",
      "options": [ "True", "False", "Not Given" ],      // for tfng and mcq; matching_headings options come from the passage headingsBank; omit for gap
      "answer": "False",                                   // the correct answer (exact string, or for gap the exact accepted word/phrase)
      "acceptable": [ "alternate accepted answers for gaps, lowercase" ],  // optional
      "explanation": "one line citing where in the passage the answer is supported"
    }
  ]
}
For matching_headings questions, set "options" to the passage's headingsBank entries and "answer" to the correct heading text. For gap completion, keep answers to 1-3 words as IELTS requires and include an "acceptable" array of lowercase variants. Ensure every question id is unique and sequential.`,
  };
}

// ---------------------------------------------------------------------------
// LISTENING
// ---------------------------------------------------------------------------

export function listeningGeneratePrompt() {
  return {
    system: `You are an expert IELTS Listening test author. You write ORIGINAL transcripts and never reproduce copyrighted IELTS material.\n${JSON_RULES}`,
    user: `Author a complete, ORIGINAL IELTS Listening test with 4 sections, ~40 questions total (10 per section). The transcripts will be read aloud by a browser text-to-speech voice, so write them as natural spoken monologue/dialogue.

Section 1: everyday conversation (e.g. booking, enquiry) between two speakers.
Section 2: a monologue on a everyday/social topic (e.g. a tour, facility info).
Section 3: academic discussion between 2-3 speakers (e.g. students + tutor).
Section 4: an academic lecture monologue.

Use a mix of question types: "form" (form/note/table completion), "mcq" (multiple choice), "matching". Number questions 1..40 sequentially.

Return JSON with this exact shape:
{
  "sections": [
    {
      "number": 1,
      "title": "...",
      "transcript": "the full spoken transcript. For dialogue, prefix lines with the speaker name and a colon. Use \\n between lines."
    }
  ],
  "questions": [
    {
      "id": 1,
      "section": 1,
      "type": "form",
      "prompt": "the field label or question (e.g. 'Name of hotel: ____')",
      "options": [ "for mcq/matching only" ],
      "answer": "the correct answer exactly as spoken",
      "acceptable": [ "lowercase accepted variants for completion answers" ],
      "explanation": "one line: what in the transcript gives the answer"
    }
  ]
}
Keep completion answers to 1-3 words. Make sure every answer is clearly findable in the matching section's transcript. Ensure ids are unique and sequential 1..40.`,
  };
}
