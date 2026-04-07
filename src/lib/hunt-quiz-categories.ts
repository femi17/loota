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

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * One category per location, randomized at hunt creation.
 * Uses the same fixed category set, but shuffles order and repeats as needed.
 */
export function buildRandomQuestionCategories(n: number): string[] {
  const len = HUNT_QUESTION_CATEGORIES.length;
  const target = Math.max(0, n);
  if (target === 0) return [];
  const out: HuntQuestionCategory[] = [];
  while (out.length < target) {
    const block = shuffleInPlace([...HUNT_QUESTION_CATEGORIES]);
    for (const c of block) {
      out.push(c);
      if (out.length >= target) break;
    }
  }
  return out;
}
