import OpenAI from "openai";
import { logger } from "@/lib/logger";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

/**
 * Loota hunts use exactly four categories, rotated per waypoint (see `hunt-quiz-categories.ts`).
 * Prompts in generateQuestion must stay aligned with these names.
 */
export const STREET_QUIZ_CATEGORY_HINTS = [
  "Math — basic arithmetic, percentages, fractions, simple patterns (mental math)",
  "General Knowledge — world facts, geography, science, culture, history (no app/game trivia)",
  "Guess the logo — Clearbit logo URL + which brand",
  "Guess the flag — FlagCDN flag URL + which country",
] as const;

type QuizKind = "math" | "general_knowledge" | "guess_the_logo" | "guess_the_flag";

function classifyQuizCategory(topic: string): QuizKind {
  const t = topic.trim().toLowerCase();
  if (t.includes("guess the flag")) return "guess_the_flag";
  if (t.includes("guess the logo")) return "guess_the_logo";
  if (t === "math" || /\bmath\b/.test(t)) return "math";
  if (t.includes("general knowledge") || t === "general knowledge") return "general_knowledge";
  return "general_knowledge";
}

function isTriviallySimpleMathQuestion(question: string): boolean {
  const q = question.trim();
  // Reject ultra-basic one-step arithmetic like "12 / 4" or "5 + 7" (too easy / repetitive).
  // Allow equations, parentheses, powers, multi-step, fractions, or short algebra.
  const singleOp = /^\s*(?:compute:|solve:)?\s*\d{1,3}\s*([+\-*/])\s*\d{1,3}\s*(?:=\s*\?)?\s*$/i;
  if (singleOp.test(q)) return true;
  // Reject percent-only questions to avoid over-serving % rounds.
  const hasPercent = /%|percent/i.test(q);
  const hasVariable = /\b[xya]\b/i.test(q);
  const hasMultiStep = /[()^]|(?:\d+\s*[+\-*/]\s*\d+\s*[+\-*/])/.test(q);
  if (hasPercent && !hasVariable && !hasMultiStep) return true;
  return false;
}

type GeneratedQuestion = { question: string; answer: string; options?: string[] };

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeOptions(options: unknown): string[] | undefined {
  if (!Array.isArray(options)) return undefined;
  return options
    .map((o: unknown) => (o ?? "").toString().trim())
    .filter(Boolean);
}

function alignAnswerToOptions(answer: string, options?: string[]): string {
  if (!options || options.length === 0) return answer;
  const answerNorm = normalizeText(answer);
  const match = options.find((o) => normalizeText(o) === answerNorm);
  if (match) return match;
  const contains = options.find(
    (o) => normalizeText(o).includes(answerNorm) || answerNorm.includes(normalizeText(o))
  );
  return contains ?? options[0] ?? answer;
}

async function verifyGeneratedQuestion(
  generated: GeneratedQuestion,
  topic: string
): Promise<boolean> {
  const verificationPrompt = `You are validating a multiple-choice quiz item before it is shown to users.
Return JSON only:
{
  "valid": true|false,
  "reason":"short reason",
  "independentAnswer":"short answer based on facts/computation only",
  "confidence":"high|medium|low"
}

Category/topic: ${topic}
Question: ${generated.question}
Answer marked as correct: ${generated.answer}
Options: ${(generated.options ?? []).join(", ")}

Validation rules:
- The marked answer must be factually correct for the question.
- The marked answer must exactly match one option.
- Reject if the question is ambiguous, has multiple plausible correct answers, or is misleading.
- For math questions, compute the result; do not infer by option patterns.
- For "Guess the flag" / FlagCDN questions: the question text MUST contain a line "Flag: https://flagcdn.com/..." and the answer must match that flag's country.
- For "Guess the logo" / Clearbit questions: the question text MUST contain a line "Logo: https://logo.clearbit.com/..." and the answer must match that brand.
- For person/country identity facts (e.g. nationality), verify against real-world facts.
- First derive the answer independently from world knowledge or calculation, then compare to the marked answer.
- If uncertain, set valid=false and confidence="low".
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a strict fact-checking question verifier. Never guess. Respond with valid JSON only.",
        },
        { role: "user", content: verificationPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return false;
    const parsed = JSON.parse(content) as {
      valid?: boolean;
      independentAnswer?: string;
      confidence?: string;
    };
    const aiSaysValid = Boolean(parsed.valid);
    const confidence = normalizeText((parsed.confidence ?? "").toString());
    const independentAnswer = (parsed.independentAnswer ?? "").toString().trim();
    const independentAligned = alignAnswerToOptions(independentAnswer, generated.options);
    const sameAsMarked = normalizeText(independentAligned) === normalizeText(generated.answer);
    const markedInOptions =
      (generated.options ?? []).some((o) => normalizeText(o) === normalizeText(generated.answer));
    // Accept only when all checks agree and verifier is not uncertain.
    return aiSaysValid && markedInOptions && sameAsMarked && confidence !== "low";
  } catch (error) {
    logger.warn("openai", "verifyGeneratedQuestion failed", { err: error });
    return false;
  }
}

export async function generateQuestion(
  topic: string,
  difficulty: "easy" | "medium" | "hard",
  context?: string,
  excludeQuestions: string[] = []
): Promise<GeneratedQuestion> {
  const kind = classifyQuizCategory(topic);
  const difficultyPrompt =
    difficulty === "easy"
      ? "simple and straightforward—the kind people answer in one breath"
      : difficulty === "medium"
        ? "moderately challenging but still quick to get"
        : "complex and thought-provoking";

  const uniquenessBlock =
    excludeQuestions.length > 0
      ? `

CRITICAL - No question may ever be repeated in this hunt. The list below is every question already asked (any step, any category, any player). You MUST generate a completely different question.
- Do NOT repeat, rephrase, or ask the SAME FACT in different words (e.g. "capital of France" vs "France's capital" = same fact).
- Pick a different sub-topic, fact, date, place, or example within the category.
- For logo/flag rounds, pick a DIFFERENT country code or brand domain than in any prior question.
- Fairness depends on zero duplicates and zero same-fact variants across the entire hunt.

Questions already used in this hunt (do NOT use or closely mimic any of these):
${excludeQuestions.slice(0, 800).map((q) => `- "${q.replace(/"/g, "'")}"`).join("\n")}`
      : `

Uniqueness: Generate a fresh, original question. Vary the specific sub-topic (e.g. different facts, dates, or examples within the category). Do not ask the same fact as another question in different wording.`;

  const categoryInstructions =
    kind === "math"
      ? `Category: Math (mental math only).
- Ask ONE clear ${difficultyPrompt} *tricky-but-solvable* math problem. Rotate across:
  - quick algebra (solve for x, simplify an expression)
  - 2-step arithmetic (mix operations, order of operations)
  - fractions/ratios, percentages (NOT every time)
  - short number patterns
- Avoid ultra-basic one-step questions (e.g. "12 / 4") and avoid percent-only questions repeatedly.
- No calculators needed; answer must be a short number or fraction (e.g. "47", "3/4", "40").
- Prefer questions that require at least 2 mental steps OR solving a small equation.
- "question" field must be ONLY the math problem text (no image lines).`
      : kind === "general_knowledge"
        ? `Category: General Knowledge.
- Ask ONE ${difficultyPrompt} trivia question about real-world facts (geography, science, history, culture, sports).
- Do NOT ask about this app, Loota, or game mechanics.
- "question" must be a single sentence ending with ?`
        : kind === "guess_the_flag"
          ? `Category: Guess the flag.
- Put the FIRST line of "question" EXACTLY as:
  Flag: https://flagcdn.com/w320/{cc}.png
  where {cc} is a real ISO 3166-1 alpha-2 lowercase country code (e.g. ng, ke, gh, za, fr).
- Then on the next line: "Which country is this flag?" (or equivalent).
- Options: exactly 4 real country names; "answer" must be the exact country name for that flag and must match one option.`
          : `Category: Guess the logo.
- Put the FIRST line of "question" EXACTLY as:
  Logo: https://logo.clearbit.com/{domain}
  where {domain} is a well-known global brand's website domain (e.g. nike.com, apple.com, spotify.com, mcdonalds.com). Use a diverse, recognizable brand.
- Then on the next line: "Which brand's logo is this?" (or equivalent).
- Options: exactly 4 distinct brand/company names; "answer" must be the brand that owns that domain and must match one option exactly.
- Do NOT use placeholder domains; use real logos served by Clearbit.`;

  const prompt = `Category label: "${topic}". ${categoryInstructions}${uniquenessBlock}

CRITICAL - Question scope: Questions MUST be about general world knowledge only (or pure math). Do NOT ask about the game itself, game currency, or anything app-specific.

Requirements:
- For multiple choice you MUST provide exactly 4 options. The "answer" field MUST be exactly one of those four options—the correct one.
- For math, numeric answers can be one token (e.g. "48" or "9/10").
- For General Knowledge, the answer must be 1–3 short words (e.g. "Paris", "Pacific Ocean").
- Self-check: for math, compute the result; for flag/logo, verify the image URL matches the answer.

Format your response as JSON:
{
  "question": "full question text including Flag: or Logo: line on its own line when required",
  "answer": "must be exactly one of the four options",
  "options": ["option1", "option2", "option3", "option4"]
}`;

  const systemSystem =
    kind === "math"
      ? "You are a math quiz generator. Respond with valid JSON only. The answer must match one of the four options."
      : kind === "guess_the_flag" || kind === "guess_the_logo"
        ? "You are a visual quiz generator. Always include the required Flag: or Logo: URL line exactly as specified. Respond with valid JSON only."
        : "You are a general-knowledge quiz generator. Respond with valid JSON only. The answer must match one of the four options.";

  try {
    const MAX_VERIFICATION_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_VERIFICATION_RETRIES; attempt++) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemSystem,
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: excludeQuestions.length > 0 ? 0.95 : 0.85,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) continue;

      const parsed = JSON.parse(content);
      const question = (parsed.question ?? "").toString().trim();
      const options = normalizeOptions(parsed.options);
      let answer = (parsed.answer ?? "").toString().trim();
      answer = alignAnswerToOptions(answer, options);

      const candidate: GeneratedQuestion = { question, answer, options };
      if (!candidate.question || !candidate.answer || !candidate.options || candidate.options.length !== 4) {
        continue;
      }

      if (kind === "guess_the_flag" && !/flag:\s*https:\/\/flagcdn\.com\//i.test(question)) {
        continue;
      }
      if (kind === "guess_the_logo" && !/logo:\s*https:\/\/logo\.clearbit\.com\//i.test(question)) {
        continue;
      }
      if (kind === "math" && isTriviallySimpleMathQuestion(question)) {
        continue;
      }

      const verified = await verifyGeneratedQuestion(candidate, topic);
      if (verified) return candidate;
    }

    throw new Error("OpenAI question failed verification retries");
  } catch (error) {
    logger.error("openai", "generateQuestion failed", { err: error });
    throw new Error("Failed to generate question");
  }
}

/**
 * Use OpenAI as the "brain" for grading quiz answers.
 * Accepts synonyms, different phrasing, and minor typos instead of exact string match.
 */
export async function validateQuizAnswer(
  question: string,
  correctAnswer: string,
  playerAnswer: string,
  options?: string[]
): Promise<{ correct: boolean; reason?: string }> {
  if (!playerAnswer?.trim()) {
    return { correct: false, reason: "empty" };
  }

  const prompt = `You are a strict but fair quiz grader. Decide if the player's answer is correct.

Question: ${question}
Correct answer (or acceptable variants): ${correctAnswer}
${options?.length ? `Multiple choice options (one is correct): ${options.join(", ")}` : ""}

Player's answer: "${playerAnswer.trim()}"

Rules:
- Accept exact matches (ignore case and extra spaces).
- Accept clear synonyms and equivalent phrasing (e.g. "Nigeria's capital" = "Abuja").
- Accept minor typos if the intent is unambiguous.
- Reject wrong answers and vague answers that don't match the correct one.
- Respond with JSON only: { "correct": true or false, "reason": "brief reason" }`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a quiz answer grader. Respond only with valid JSON: { \"correct\": boolean, \"reason\": string }.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return { correct: false, reason: "no_response" };
    }

    const parsed = JSON.parse(content) as { correct?: boolean; reason?: string };
    const correct = Boolean(parsed.correct);
    return { correct, reason: parsed.reason };
  } catch (error) {
    logger.error("openai", "validateQuizAnswer failed", { err: error });
    throw new Error("Failed to validate answer");
  }
}
