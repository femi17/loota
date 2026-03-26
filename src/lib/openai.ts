import OpenAI from "openai";
import { logger } from "@/lib/logger";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

/**
 * Street-quiz style categories that resonate with viral "street interview" and
 * "Are You Smarter Than a Fifth Grader?" content. Used to steer both hunt config
 * and question generation toward engaging, shareable general-knowledge questions.
 * See docs/QUIZ_QUESTIONS.md for research and prompt design.
 */
export const STREET_QUIZ_CATEGORY_HINTS = [
  "Simple math (basic arithmetic, algebra, percentages, fractions, simple number patterns)",
  "General knowledge (facts, geography, culture, history, science)",
  "Viral & internet trends (Nigeria-focused: memes, slang, creators, what is trending online in Nigeria)",
  "Nigeria culture (music, slang, places, food, celebrities, Afrobeats)",
  "Guess the flag (show a flag image URL and ask the country)",
  "Quick trivia (one-line facts, pop culture)",
  "Word play (puns, fill-in-the-blank)",
  "Music & lyrics (song lines, artist names)",
  "Sports (football, Olympics, fun facts)",
  "Food & drink (dishes, ingredients)",
  "Movies & TV (quotes, characters, Nollywood)",
  "Logic puzzles (simple deductive)",
  "Number games (sequences, what comes next)",
  "Nature & animals (fun facts)",
  "Geography (cities, landmarks, capitals)",
  "Acronyms & abbreviations (CEO, WWW, H2O, etc.)",
  "Celebrities & names (who said it, who's this?)",
  "Slang & phrases (street talk, local expressions)",
  "Fill in the blank (complete the phrase/song)",
  "This or that (quick which-one choices)",
] as const;

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
- For "Simple math", allow variety (arithmetic, algebra, percentages, fractions, simple patterns), not only one type.
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
- Fairness depends on zero duplicates and zero same-fact variants across the entire hunt.

Questions already used in this hunt (do NOT use or closely mimic any of these):
${excludeQuestions.slice(0, 800).map((q) => `- "${q.replace(/"/g, "'")}"`).join("\n")}`
      : `

Uniqueness: Generate a fresh, original question. Vary the specific sub-topic (e.g. different facts, dates, or examples within the category). Do not ask the same fact as another question in different wording.`;

  const prompt = `Category: "${topic}". Generate a ${difficultyPrompt} street-quiz style question.${uniquenessBlock}

CRITICAL - Category scope: The question MUST be solely and clearly about this category. No mixing.
- For "Simple math" (or "math"): allow variety across basic arithmetic, simple algebra, percentages, fractions, and simple number patterns. Keep it short and solvable mentally; no advanced formulas.
- For "Guess the flag" (or if the category contains "flag"): you MUST include a single flag image URL from FlagCDN in the question text in this exact format:
  Flag: https://flagcdn.com/w320/{cc}.png
  where {cc} is a real ISO 3166-1 alpha-2 lowercase country code (e.g. ng, gh, us, fr).
  The question must be: "Which country is this flag?" (or equivalent).
  Options must be 4 country names. The correct answer must be the correct country for that flag and must match one option exactly.
- For "Geography" (or "cities", "capitals"): ONLY places, capitals, landmarks, countries. The correct answer must be the actual fact (e.g. capital of France = Paris, not Madrid or Rome).
- For "Viral & internet trends" (or "viral", "internet trends"): ONLY Nigerian internet culture—memes, slang, challenges, creators, hashtags, or platforms as they matter in Nigeria. Do not center US-only or generic Western viral topics unless clearly tied to Nigeria.
- For any other category: stay strictly within that topic. If the category is "Music", do not ask a geography question.

Style (street interview / viral quiz): One clear sentence, quick to read. Draw from general knowledge, geography, science basics, pop culture, music, sports, food, acronyms, Nigeria culture, riddles, number games. Keep it fun and accessible.

CRITICAL - Question scope: Questions MUST be about general world knowledge only. Do NOT ask about the game itself, game currency, or anything app-specific.

Requirements:
- One clear, unambiguous question (full sentence). No multi-part questions.
- The ANSWER must be SHORT: one or two words only (e.g. "Burna Boy", "Abuja", "50").
- For multiple choice you MUST provide exactly 4 options. The "answer" field MUST be exactly one of those four options—the correct one. Do not put a wrong option as the answer (e.g. for "capital of France" the answer must be "Paris", not "Madrid" or "Rome").
- Make it engaging—something that makes players think then react when they get it right.
- Self-check before finalizing: verify the correct answer is factual, belongs to options, and for math compute the result directly (not by pattern matching).

Format your response as JSON:
{
  "question": "the question text",
  "answer": "must be exactly one of the four options below, 1-2 words",
  "options": ["option1", "option2", "option3", "option4"]
}`;

  try {
    const MAX_VERIFICATION_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_VERIFICATION_RETRIES; attempt++) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a street-quiz question generator. Generate one clear, punchy question per response. The question MUST match the given category exactly (e.g. Simple math = varied basic math: arithmetic, algebra, percentages, fractions, simple patterns; Viral & internet trends = Nigeria-focused online culture). The 'answer' field must be 1-2 words only and MUST be exactly one of the four options you provide—never a wrong option. Do NOT repeat the same fact in different words. Always respond with valid JSON only.",
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
