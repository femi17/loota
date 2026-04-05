import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server-auth";
import { validateQuizAnswer } from "@/lib/openai";
import {
  tryResolveMathMultipleChoice,
  playerAnswerMatchesMathResolution,
} from "@/lib/math-quiz-resolve";
import { logger } from "@/lib/logger";
import { isHuntPastEndDate } from "@/lib/hunt-schedule";

/**
 * POST /api/hunt/validate-answer
 * Uses OpenAI to grade a quiz answer (accepts synonyms, phrasing, minor typos).
 *
 * Mode A (server loads answer – use with get-question for anti-cheat):
 *   Body: { hunt_id: string, step_index: number, question_index: number, playerAnswer: string }
 *
 * Mode B (client sends all – backward compatible):
 *   Body: { question: string, correctAnswer: string, playerAnswer: string, options?: string[] }
 *
 * Returns: { correct: boolean, reason?: string } or { error: string }
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  let body: {
    question?: string;
    correctAnswer?: string;
    playerAnswer?: string;
    options?: string[];
    hunt_id?: string;
    step_index?: number;
    question_index?: number;
    time_taken_seconds?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const playerAnswer =
    typeof body?.playerAnswer === "string" ? body.playerAnswer : "";
  const timeTakenSeconds =
    typeof body?.time_taken_seconds === "number" && body.time_taken_seconds >= 0
      ? body.time_taken_seconds
      : null;

  let question: string;
  let correctAnswer: string;
  let options: string[] | undefined;

  const huntId = typeof body?.hunt_id === "string" ? body.hunt_id.trim() : "";
  const stepIndex = typeof body?.step_index === "number" ? body.step_index : null;
  const questionIndex =
    typeof body?.question_index === "number" ? body.question_index : null;

  if (huntId && stepIndex !== null) {
    const supabase = auth.supabase;
    const userId = auth.user.id;

    const { data: hunt, error: huntErr } = await supabase
      .from("hunts")
      .select("id, status, questions, end_date")
      .eq("id", huntId)
      .single();
    if (huntErr || !hunt || hunt.status !== "active") {
      return NextResponse.json({ error: "Hunt not found or not active" }, { status: 404 });
    }
    const endD = (hunt as { end_date?: string | null }).end_date;
    if (isHuntPastEndDate(endD ?? null)) {
      return NextResponse.json(
        { error: "This hunt has ended. No more quiz answers can be submitted." },
        { status: 403 }
      );
    }
    const { data: registration } = await supabase
      .from("hunt_registrations")
      .select("id")
      .eq("hunt_id", huntId)
      .eq("player_id", userId)
      .maybeSingle();
    if (!registration) {
      return NextResponse.json({ error: "You are not registered for this hunt" }, { status: 403 });
    }

    // Prefer assignment (AI-generated or pre-assigned): has question_text/correct_answer
    const { data: assignment } = await supabase
      .from("player_question_assignments")
      .select("question_text, correct_answer, options")
      .eq("hunt_id", huntId)
      .eq("player_id", userId)
      .eq("step_index", stepIndex)
      .maybeSingle();

    if (assignment?.question_text && assignment?.correct_answer != null) {
      question = String(assignment.question_text).trim();
      correctAnswer = String(assignment.correct_answer).trim();
      options = Array.isArray(assignment.options)
        ? assignment.options.filter((x) => typeof x === "string")
        : undefined;
    } else {
      // Pre-generated questions: load from hunt.questions (already fetched above)
      const questions = (hunt.questions ?? []) as Array<{
        question?: string;
        answer?: string;
        options?: string[];
      }>;
      const idx = questionIndex !== null ? questionIndex : stepIndex % Math.max(1, questions.length);
      const q = questions[idx];
      if (!q) {
        return NextResponse.json({ error: "Question not found" }, { status: 400 });
      }
      question = String(q.question ?? "").trim();
      correctAnswer = String(q.answer ?? "").trim();
      options = Array.isArray(q.options) ? q.options.filter((x) => typeof x === "string") : undefined;
    }
  } else {
    question = typeof body?.question === "string" ? body.question.trim() : "";
    correctAnswer =
      typeof body?.correctAnswer === "string" ? body.correctAnswer.trim() : "";
    options = Array.isArray(body?.options)
      ? body.options.filter((o) => typeof o === "string")
      : undefined;
  }

  if (!question || !correctAnswer) {
    return NextResponse.json(
      { error: "question and correctAnswer are required (or hunt_id + step_index + question_index)" },
      { status: 400 }
    );
  }

  let correct: boolean;

  const mathMc = tryResolveMathMultipleChoice(question, options);
  if (mathMc) {
    correct = playerAnswerMatchesMathResolution(playerAnswer, mathMc);
  } else if (!process.env.OPENAI_API_KEY) {
    const normalized = playerAnswer.trim().toLowerCase().replace(/\s+/g, " ");
    const correctNormalized = correctAnswer.trim().toLowerCase().replace(/\s+/g, " ");
    const optionMatched =
      options?.some((o) => o.trim().toLowerCase().replace(/\s+/g, " ") === normalized) ?? false;
    correct = normalized === correctNormalized || optionMatched;
  } else {
    try {
      const result = await validateQuizAnswer(
        question,
        correctAnswer,
        playerAnswer,
        options
      );
      correct = Boolean(result.correct);
    } catch (e: unknown) {
      logger.error("hunt/validate-answer", "validate-answer error", { err: e });
      return NextResponse.json({ error: "Failed to validate answer" }, { status: 500 });
    }
  }

  // Record response for broadcast (question + answer + result) when in hunt context.
  // IMPORTANT: Do NOT update player_positions.keys here. Keys are awarded only by the client
  // when the user clicks Continue (see HuntsStatusDrawerContent). If a DB trigger on
  // question_responses increments keys, run database_keys_single_source.sql to drop it.
  let responseQuizStreak: number | undefined;
  let responseStreakBonusCoins: number | undefined;
  let responseStreakMilestone: number | undefined;
  let responseNewCredits: number | undefined;

  if (huntId && auth.user.id) {
    const questionId = stepIndex !== null ? `step-${stepIndex}` : "unknown";
    const keysEarned = correct ? 1 : 0;
    await auth.supabase.from("question_responses").insert({
      hunt_id: huntId,
      player_id: auth.user.id,
      question_id: questionId,
      question_text: question.slice(0, 2000),
      answer: playerAnswer.slice(0, 1000),
      is_correct: correct,
      time_taken_seconds: timeTakenSeconds,
      keys_earned: keysEarned,
    });

    // Action feed for broadcast: "Sarah got a key!" / "Mike failed the quiz"
    const userId = auth.user.id;
    const { data: posRow } = await auth.supabase
      .from("player_positions")
      .select("player_name, narrator_state")
      .eq("hunt_id", huntId)
      .eq("player_id", userId)
      .maybeSingle();
    const playerName = (posRow?.player_name as string) || "Loota";
    await auth.supabase.from("hunt_player_actions").insert({
      hunt_id: huntId,
      player_id: userId,
      player_name: playerName,
      action_type: "quiz_answered",
      payload: { correct, keys_earned: keysEarned, time_taken_seconds: timeTakenSeconds },
    });

    const rawNs = posRow?.narrator_state;
    const ns: Record<string, unknown> =
      rawNs && typeof rawNs === "object" && !Array.isArray(rawNs)
        ? { ...(rawNs as Record<string, unknown>) }
        : {};
    const prevStreak = Math.max(0, Math.floor(Number(ns.quiz_answer_streak) || 0));
    const nextStreak = correct ? prevStreak + 1 : 0;
    ns.quiz_answer_streak = nextStreak;

    let streakBonusCoins = 0;
    let streakMilestone: number | null = null;
    if (correct && (nextStreak === 3 || nextStreak === 5 || nextStreak === 7)) {
      streakMilestone = nextStreak;
      streakBonusCoins = nextStreak === 3 ? 25 : nextStreak === 5 ? 50 : 100;
    }

    await auth.supabase
      .from("player_positions")
      .update({
        answering_question: false,
        current_question: null,
        question_deadline_at: null,
        narrator_state: ns,
      })
      .eq("hunt_id", huntId)
      .eq("player_id", userId);

    let newCredits: number | undefined;
    if (streakBonusCoins > 0) {
      const { data: prof, error: profErr } = await auth.supabase
        .from("player_profiles")
        .select("credits")
        .eq("user_id", userId)
        .maybeSingle();
      if (!profErr && prof != null) {
        const cur = Number(prof.credits) || 0;
        newCredits = Math.round((cur + streakBonusCoins) * 100) / 100;
        const { error: upErr } = await auth.supabase
          .from("player_profiles")
          .update({ credits: newCredits })
          .eq("user_id", userId);
        if (!upErr) {
          await auth.supabase.from("transactions").insert({
            player_id: userId,
            hunt_id: huntId,
            transaction_type: "question_reward",
            amount: streakBonusCoins,
            description: `Quiz streak bonus (${nextStreak} correct in a row)`,
            item_id: `quiz_streak_${nextStreak}`,
          });
          responseStreakBonusCoins = streakBonusCoins;
          responseStreakMilestone = streakMilestone ?? undefined;
          responseNewCredits = newCredits;
        }
      }
    }

    responseQuizStreak = nextStreak;
  }

  return NextResponse.json({
    correct,
    reason: correct ? "match" : "no_match",
    ...(responseQuizStreak !== undefined ? { quizStreak: responseQuizStreak } : {}),
    ...(responseStreakBonusCoins !== undefined ? { streakBonusCoins: responseStreakBonusCoins } : {}),
    ...(responseStreakMilestone !== undefined ? { streakMilestone: responseStreakMilestone } : {}),
    ...(responseNewCredits !== undefined ? { newCredits: responseNewCredits } : {}),
  });
}
