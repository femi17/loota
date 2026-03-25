import { NextResponse } from "next/server";
import { generateQuestion } from "@/lib/openai";
import { requireAdmin } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { topic, difficulty, context } = await req.json();

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }

    const question = await generateQuestion(topic, difficulty || "medium", context);

    return NextResponse.json(question);
  } catch (error: unknown) {
    logger.error("admin/generate-question", "Error generating question", { err: error });
    return NextResponse.json(
      { error: "Failed to generate question" },
      { status: 500 }
    );
  }
}
