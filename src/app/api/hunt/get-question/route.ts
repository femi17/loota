import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/server-auth";
import { generateQuestion } from "@/lib/openai";
import { logger } from "@/lib/logger";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { TASK_TIME_SECONDS } from "@/app/hunts/constants";
import { isHuntPastEndDate } from "@/lib/hunt-schedule";

type DifficultyDist = { easy?: number; medium?: number; hard?: number };
type ServedRow = { question_text: string | null };
type AssignmentRow = { question_text: string | null };

function collectQuestionTexts(
  served: ServedRow[] | null | undefined,
  assigned: AssignmentRow[] | null | undefined
): string[] {
  const out = new Set<string>();
  for (const r of served ?? []) {
    const t = typeof r?.question_text === "string" ? r.question_text.trim() : "";
    if (t) out.add(t);
  }
  for (const r of assigned ?? []) {
    const t = typeof r?.question_text === "string" ? r.question_text.trim() : "";
    if (t) out.add(t);
  }
  return [...out];
}

/**
 * Every question_text already used on this hunt (any player, any step).
 * Must bypass RLS: authenticated SELECT on assignments/serves is limited to own rows,
 * which caused duplicate questions across different players.
 */
async function fetchHuntWideUsedQuestionTexts(
  huntId: string,
  userScoped: SupabaseClient
): Promise<string[]> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createServiceRoleClient();
      const [servedRes, assignedRes] = await Promise.all([
        admin.from("player_question_serves").select("question_text").eq("hunt_id", huntId),
        admin.from("player_question_assignments").select("question_text").eq("hunt_id", huntId),
      ]);
      if (!servedRes.error && !assignedRes.error) {
        return collectQuestionTexts(
          servedRes.data as ServedRow[] | null,
          assignedRes.data as AssignmentRow[] | null
        );
      }
      logger.warn("hunt/get-question", "service role hunt-wide question fetch failed", {
        served: servedRes.error?.message,
        assigned: assignedRes.error?.message,
      });
    } catch (e) {
      logger.warn("hunt/get-question", "service role client unavailable", { err: e });
    }
  }

  const { data: servedRows, error: servedErr } = await userScoped
    .from("player_question_serves")
    .select("question_text")
    .eq("hunt_id", huntId);
  const { data: assignedRows, error: assignedErr } = await userScoped
    .from("player_question_assignments")
    .select("question_text")
    .eq("hunt_id", huntId);
  if (servedErr || assignedErr) {
    logger.warn("hunt/get-question", "fallback user-scoped question fetch", {
      served: servedErr?.message,
      assigned: assignedErr?.message,
    });
  }
  return collectQuestionTexts(
    servedRows as ServedRow[] | null,
    assignedRows as AssignmentRow[] | null
  );
}

/**
 * GET /api/hunt/get-question?hunt_id=...&step_index=0
 * Returns a question for this player at this step. OpenAI only: when the hunt has
 * question_categories, we always generate via OpenAI from that category (no hardcoded or
 * pre-generated pool). Does not return the correct answer (validation is server-side).
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const huntId = searchParams.get("hunt_id");
  const stepIndexParam = searchParams.get("step_index");

  if (!huntId?.trim()) {
    return NextResponse.json({ error: "hunt_id required" }, { status: 400 });
  }
  const stepIndex = stepIndexParam !== null ? parseInt(stepIndexParam, 10) : 0;
  if (!Number.isFinite(stepIndex) || stepIndex < 0) {
    return NextResponse.json({ error: "step_index must be a non-negative integer" }, { status: 400 });
  }

  const { supabase } = auth;

  const { data: hunt, error: huntError } = await supabase
    .from("hunts")
    .select("id, question_categories, difficulty_distribution, end_date")
    .eq("id", huntId)
    .eq("status", "active")
    .single();

  if (huntError || !hunt) {
    return NextResponse.json({ error: "Hunt not found or not active" }, { status: 404 });
  }

  const endD = (hunt as { end_date?: string | null }).end_date;
  if (isHuntPastEndDate(endD ?? null)) {
    return NextResponse.json(
      { error: "This hunt has ended. Questions are no longer available." },
      { status: 403 }
    );
  }

  const userId = auth.user.id;
  const { data: registration } = await supabase
    .from("hunt_registrations")
    .select("id")
    .eq("hunt_id", huntId)
    .eq("player_id", userId)
    .maybeSingle();
  if (!registration) {
    return NextResponse.json({ error: "You are not registered for this hunt" }, { status: 403 });
  }

  const categories = (hunt.question_categories ?? []) as string[];

  if (categories.length > 0) {
    // Return existing assignment if this player already has a question for this step
    // BUT: do not re-serve any question that was ever served before (correct or wrong).
    const { data: existingAssignment } = await supabase
      .from("player_question_assignments")
      .select("question_text, options, correct_answer")
      .eq("hunt_id", huntId)
      .eq("player_id", userId)
      .eq("step_index", stepIndex)
      .maybeSingle();

    // Load "served question" history for this player+step.
    // This table may not exist in some deployments; fail open to avoid breaking gameplay.
    let servedForThisStep: string[] = [];
    try {
      const { data: servedRows, error: servedErr } = await supabase
        .from("player_question_serves")
        .select("question_text")
        .eq("hunt_id", huntId)
        .eq("player_id", userId)
        .eq("step_index", stepIndex);
      if (!servedErr) {
        servedForThisStep = (servedRows as ServedRow[] | null | undefined ?? [])
          .map((r) => (typeof r?.question_text === "string" ? r.question_text.trim() : ""))
          .filter((t) => t.length > 0);
      }
    } catch {
      servedForThisStep = [];
    }

    if (
      existingAssignment?.question_text &&
      typeof existingAssignment.question_text === "string" &&
      existingAssignment.question_text.trim().length > 0
    ) {
      const existingQ = existingAssignment.question_text.trim();
      const alreadyServed = servedForThisStep.some((t) => t === existingQ);
      if (!alreadyServed) {
        // Log "served" so future retries don't repeat this question.
        try {
          await supabase.from("player_question_serves").insert({
            hunt_id: huntId,
            player_id: userId,
            step_index: stepIndex,
            question_text: existingQ,
          });
        } catch {
          // ignore (table missing or RLS)
        }
        // Store current question + timer so broadcast can show question + countdown
        const questionDeadlineAt = new Date(Date.now() + TASK_TIME_SECONDS * 1000).toISOString();
        await supabase
          .from("player_positions")
          .update({
            current_question: existingQ.slice(0, 2000),
            answering_question: true,
            question_deadline_at: questionDeadlineAt,
          })
          .eq("hunt_id", huntId)
          .eq("player_id", userId);

        const res = NextResponse.json({
          question: existingQ,
          options: existingAssignment.options ?? undefined,
          category: categories[stepIndex % categories.length] ?? null,
          difficulty: null,
          questionIndex: null,
        });
        res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
        res.headers.set("Pragma", "no-cache");
        return res;
      }
      // If it was already served, generate a new one below (and overwrite assignment).
    }

    const dist = (hunt.difficulty_distribution ?? { easy: 40, medium: 40, hard: 20 }) as DifficultyDist;
    const category = categories[stepIndex % categories.length]!;
    const r = Math.random() * 100;
    const easy = Number(dist.easy) || 40;
    const medium = Number(dist.medium) || 40;
    let difficulty: "easy" | "medium" | "hard" = "medium";
    if (r < easy) difficulty = "easy";
    else if (r < easy + medium) difficulty = "medium";
    else difficulty = "hard";

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI is not configured; cannot generate questions for this hunt." },
        { status: 503 }
      );
    }

    // Hunt-wide list for OpenAI + isDuplicate (RLS would hide other players' rows without service role).
    const excludeQuestions = await fetchHuntWideUsedQuestionTexts(huntId, supabase);

    /** Normalize for duplicate check: trim, lowercase, collapse spaces. */
    const normalize = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");
    const excludeSet = new Set(excludeQuestions.map(normalize));
    const excludeListNormalized = [...excludeSet];

    /**
     * Treat as duplicate if: exact match OR one question contains the other (catches
     * rephrases like "What is the capital of France?" vs "What is France's capital?").
     * Only compare when the shorter string is at least MIN_SUBSTRING_LEN chars to avoid false positives.
     */
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

    const MAX_DUPLICATE_RETRIES = 5;
    let uniqueGenerated: { question: string; answer: string; options?: string[] } | null = null;
    let currentExclude = excludeQuestions;

    try {
      for (let attempt = 0; attempt < MAX_DUPLICATE_RETRIES; attempt++) {
        const generated = await generateQuestion(
          category,
          difficulty,
          undefined, // no game context—questions must be general world knowledge only
          currentExclude
        );
        const normalizedNew = normalize(generated.question);
        if (normalizedNew && !isDuplicate(normalizedNew)) {
          excludeSet.add(normalizedNew);
          excludeListNormalized.push(normalizedNew);
          uniqueGenerated = generated;
          break;
        }
        // OpenAI returned a duplicate or same-fact variant; add to exclude and retry
        currentExclude = [...currentExclude, generated.question];
        excludeSet.add(normalizedNew);
        excludeListNormalized.push(normalizedNew);
      }

      if (!uniqueGenerated) {
        logger.error("hunt/get-question", "No unique question after retries");
        return NextResponse.json(
          { error: "Failed to generate a unique question" },
          { status: 500 }
        );
      }

      const generated = uniqueGenerated;

      await supabase.from("player_question_assignments").upsert(
        {
          hunt_id: huntId,
          player_id: userId,
          step_index: stepIndex,
          question_text: generated.question,
          correct_answer: generated.answer,
          options: generated.options ?? null,
        },
        { onConflict: "hunt_id,player_id,step_index" }
      );

      // Log "served" so it never repeats later (even if player fails/timeout).
      try {
        await supabase.from("player_question_serves").insert({
          hunt_id: huntId,
          player_id: userId,
          step_index: stepIndex,
          question_text: generated.question,
        });
      } catch {
        // ignore (table missing or RLS)
      }

      const questionDeadlineAt = new Date(Date.now() + TASK_TIME_SECONDS * 1000).toISOString();
      await supabase
        .from("player_positions")
        .update({
          current_question: generated.question.slice(0, 2000),
          answering_question: true,
          question_deadline_at: questionDeadlineAt,
        })
        .eq("hunt_id", huntId)
        .eq("player_id", userId);

      const res = NextResponse.json({
        question: generated.question,
        options: generated.options ?? undefined,
        category,
        difficulty,
        questionIndex: null,
      });
      res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      res.headers.set("Pragma", "no-cache");
      return res;
    } catch (e) {
      logger.error("hunt/get-question", "AI generate error", { err: e });
      return NextResponse.json(
        { error: "Failed to generate question" },
        { status: 500 }
      );
    }
  }

  // Hunt has no question_categories: cannot generate (OpenAI or nothing).
  return NextResponse.json(
    { error: "Hunt has no question categories; questions are generated by OpenAI only." },
    { status: 400 }
  );
}
