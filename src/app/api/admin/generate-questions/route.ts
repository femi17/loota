import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server-auth";
import { generateQuestion } from "@/lib/openai";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { categories, numberOfHunts, difficultyDistribution, existingQuestions } = await req.json();

    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return NextResponse.json({ error: "Categories are required" }, { status: 400 });
    }

    if (!numberOfHunts || numberOfHunts < 1) {
      return NextResponse.json({ error: "Number of hunts is required" }, { status: 400 });
    }

    const dist = difficultyDistribution ?? { easy: 40, medium: 40, hard: 20 };
    const excludeQuestions: string[] = Array.isArray(existingQuestions)
      ? existingQuestions.filter((q: unknown) => typeof q === "string" && q.trim().length > 0).map((q: string) => q.trim())
      : [];

    const questions: Array<{ question: string; answer: string; options?: string[]; category: string; difficulty: string }> = [];
    const usedQuestions = [...excludeQuestions];
    const normalize = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");
    const excludeSet = new Set(usedQuestions.map(normalize));
    const excludeListNormalized = [...excludeSet];
    const MIN_SUBSTRING_LEN = 15;
    const isDuplicate = (normNew: string): boolean => {
      if (!normNew) return true;
      if (excludeSet.has(normNew)) return true;
      for (const existing of excludeListNormalized) {
        if (existing.length < MIN_SUBSTRING_LEN) continue;
        if (normNew.includes(existing) || existing.includes(normNew)) return true;
      }
      return false;
    };
    const MAX_ATTEMPTS_PER_SLOT = 3;

    for (let i = 0; i < numberOfHunts; i++) {
      const category = categories[i % categories.length] as string;
      const rand = Math.random() * 100;
      let difficulty: "easy" | "medium" | "hard" = "medium";
      if (rand < (dist.easy ?? 40)) difficulty = "easy";
      else if (rand < (dist.easy ?? 40) + (dist.medium ?? 40)) difficulty = "medium";
      else difficulty = "hard";

      let added = false;
      for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_SLOT && !added; attempt++) {
        try {
          const generated = await generateQuestion(category, difficulty, undefined, usedQuestions);
          const normalizedNew = normalize(generated.question);
          if (normalizedNew && !isDuplicate(normalizedNew)) {
            questions.push({
              question: generated.question,
              answer: generated.answer,
              options: generated.options,
              category,
              difficulty,
            });
            usedQuestions.push(generated.question);
            excludeSet.add(normalizedNew);
            excludeListNormalized.push(normalizedNew);
            added = true;
          } else {
            usedQuestions.push(generated.question);
            excludeSet.add(normalizedNew);
            excludeListNormalized.push(normalizedNew);
          }
        } catch (error) {
          logger.error("admin/generate-questions", "Error generating question in batch", { index: i + 1, err: error });
          break;
        }
      }
    }

    return NextResponse.json({ questions });
  } catch (error: unknown) {
    logger.error("admin/generate-questions", "Error generating questions", { err: error });
    return NextResponse.json(
      { error: "Failed to generate questions" },
      { status: 500 }
    );
  }
}
