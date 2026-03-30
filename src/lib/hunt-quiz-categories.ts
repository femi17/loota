/**
 * Fixed quiz categories for Loota hunts — rotated across waypoint order (step 0, 1, 2, …).
 * Must stay in sync with OpenAI prompts in `openai.ts` (generateQuestion).
 */
export const HUNT_QUESTION_CATEGORIES = [
  "Math",
  "General Knowledge",
  "Guess the logo",
  "Guess the flag",
] as const;

export type HuntQuestionCategory = (typeof HUNT_QUESTION_CATEGORIES)[number];

/** One category per location, cycling Math → GK → Logo → Flag → Math → … */
export function buildRotatedQuestionCategories(n: number): string[] {
  const len = HUNT_QUESTION_CATEGORIES.length;
  return Array.from({ length: Math.max(0, n) }, (_, i) => HUNT_QUESTION_CATEGORIES[i % len]!);
}
