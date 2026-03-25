"use client";

import { useEffect, useRef, useState } from "react";
import type { LngLat, TaskItem, HuntPhase, RpsMove } from "@/app/hunts/types";
import { TASK_CATEGORY_LABEL, TASK_TIME_SECONDS } from "@/app/hunts/constants";

/** Delay (ms) to show "Oh no" failure message before rerouting. */
const QUIZ_FAIL_REROUTE_DELAY_MS = 2500;
import { taskCategoryForStep, normAnswer } from "@/app/hunts/utils";

type TravelMode = { id: string; label: string; icon: string };
type DemoUnlockTask = {
  title: string;
  prompt: string;
  answers: readonly string[];
  next: { label: string; to: LngLat } | null;
};
type RpsState = { your: number; bot: number; done: boolean; last?: { you: RpsMove; bot: RpsMove; result: string } };

function WinnerConfetti() {
  const pieces = Array.from({ length: 120 }, (_, i) => i);
  const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#ec4899", "#a855f7"];
  return (
    <div className="pointer-events-none fixed inset-0 z-[120] overflow-hidden" aria-hidden>
      {pieces.map((i) => {
        const leftPct = (i * 37) % 100;
        const delay = (i % 20) * 0.11;
        const duration = 3 + (i % 7) * 0.45;
        const color = colors[i % colors.length]!;
        return (
          <span
            key={i}
            className="absolute top-[-16px] block h-3 w-2 rounded-sm win-confetti-fall"
            style={{
              left: `${leftPct}%`,
              backgroundColor: color,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
            }}
          />
        );
      })}
      <style jsx>{`
        .win-confetti-fall {
          opacity: 0.95;
          animation-name: win-confetti-fall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes win-confetti-fall {
          0% {
            transform: translateY(-8px) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          100% {
            transform: translateY(115vh) rotate(720deg);
            opacity: 0.9;
          }
        }
      `}</style>
    </div>
  );
}

function NextQuizAtLocation({
  nextWaypoint,
  stepIndex,
  getQuestionForStep,
  questionCategories,
  setDrawer,
}: {
  nextWaypoint: { label: string; to: LngLat };
  stepIndex: number;
  getQuestionForStep: (stepIndex: number) => Promise<{ prompt: string; options?: string[] } | null>;
  questionCategories?: string[];
  setDrawer: (id: "travel" | null) => void;
}) {
  const [question, setQuestion] = useState<{ prompt: string; options?: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    setError(null);
    getQuestionForStep(stepIndex)
      .then((res) => {
        setQuestion(res);
      })
      .catch(() => setError("Couldn't load question."))
      .finally(() => setLoading(false));
  }, [getQuestionForStep, stepIndex]);

  const catLabel =
    questionCategories?.length && questionCategories[stepIndex % questionCategories.length]
      ? questionCategories[stepIndex % questionCategories.length]
      : TASK_CATEGORY_LABEL[taskCategoryForStep(stepIndex + 1)] ?? "quiz";

  return (
    <div className="mt-4 p-4 rounded-2xl bg-[#F8FAFC] border border-[#F1F5F9]">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        Next quiz (step {stepIndex + 1})
      </p>
      <p className="mt-2 text-sm font-extrabold text-[#0F172A]">
        Travel to {nextWaypoint.label} to answer
      </p>
      {loading ? (
        <p className="mt-3 text-xs text-slate-500">Loading question…</p>
      ) : error ? (
        <p className="mt-3 text-xs font-bold text-red-600">{error}</p>
      ) : question ? (
        <>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{catLabel}</p>
          <p className="mt-1 text-sm text-slate-700 leading-relaxed">{question.prompt}</p>
        </>
      ) : null}
      <button
        type="button"
        onClick={() => setDrawer("travel")}
        className="mt-4 w-full px-5 py-3 rounded-full bg-[#0F172A] text-white font-extrabold text-xs uppercase tracking-[0.2em] hover:bg-[#2563EB] transition-colors"
      >
        Travel to answer
      </button>
    </div>
  );
}

type Props = {
  /** When false, show a locked message instead of keys/position/wallet etc. */
  huntHasStarted?: boolean;
  huntPhase: HuntPhase;
  keys: number;
  keysToWin: number;
  clock: number;
  playerPos: LngLat | null;
  credits: number;
  huntersHunting: number;
  formatNaira: (n: number) => string;
  travelMode: TravelMode;
  isTraveling: boolean;
  prep: boolean;
  progress: number;
  fmtCoord: (n: number) => string;
  getTaskSeed: () => number;
  publicTaskStepNumber: number;
  publicTaskDeadlineMs: number | null;
  publicTaskQuestion: TaskItem | null;
  publicTaskStage: "intro" | "active";
  publicLocation: LngLat | null;
  publicTaskAttempt: number;
  relocationCountdown: number | null;
  /** When set, location quiz failed — show this in the status modal until reroute completes. */
  locationQuizFailMessage: string | null;
  publicTaskFeedback: string | null;
  publicTaskAnswer: string;
  publicTaskError: string | null;
  setPublicTaskQuestion: (v: TaskItem | null) => void;
  setPublicTaskStage: (v: "intro" | "active") => void;
  setPublicTaskDeadlineMs: (v: number | null) => void;
  setPublicTaskAnswer: (v: string) => void;
  setPublicTaskError: (v: string | null) => void;
  setDestinationLabel: (v: string) => void;
  setPendingDestination: (v: LngLat | null) => void;
  setPendingDestinationLabel: (v: string) => void;
  setHuntPhase: (v: HuntPhase) => void;
  setDrawer: (id: "travel" | null) => void;
  publicTaskFromHunt: TaskItem | null;
  firstNextLocation: { label: string; to: LngLat };
  failPublicTask: (reason: "wrong" | "timeout" | "cheat") => Promise<void>;
  arrivedForChallenge: boolean;
  setArrivedForChallenge?: (v: boolean) => void;
  /** When Loota is at a waypoint, the 0-based index in hunt waypoints; used to show the quiz for that location. */
  waypointIndexAtPlayer: number | null;
  arrivalChallengeIntro: boolean;
  setArrivalChallengeIntro: (v: boolean) => void;
  startRpsChallenge: () => void;
  rps: RpsState | null;
  playRps: (move: RpsMove) => void;
  clueUnlocked: boolean;
  demoUnlockTasks: readonly DemoUnlockTask[];
  unlockCheckpoint: { stepNumber: number; to: LngLat; label?: string } | null;
  /** When set, user failed the unlock task and is re-traveling; don't show "Start" until they arrive again. */
  unlockRetry?: { stepNumber: number; to: LngLat; label?: string } | null;
  unlockTaskDeadlineMs: number | null;
  unlockTaskQuestion: TaskItem | null;
  unlockTaskStage: "intro" | "active";
  unlockTaskFeedback: string | null;
  unlockTaskAttempt: number;
  unlockAnswer: string;
  unlockError: string | null;
  setUnlockTaskQuestion: (v: TaskItem | null) => void;
  setUnlockTaskStage: (v: "intro" | "active") => void;
  setUnlockTaskDeadlineMs: (v: number | null) => void;
  setUnlockAnswer: (v: string) => void;
  setUnlockError: (v: string | null) => void;
  setClueUnlocked: (v: boolean) => void;
  failUnlockTask: (reason: "wrong" | "timeout" | "cheat") => Promise<void>;
  /** When set, quiz answers are graded by OpenAI (server) instead of local exact match. */
  validateAnswer?: (
    params:
      | { question: string; correctAnswer: string; playerAnswer: string; options?: string[] }
      | { huntId: string; stepIndex: number; playerAnswer: string }
  ) => Promise<{ correct: boolean }>;
  /** When set (AI quiz brain), fetch question from API when player clicks Start. */
  activeHuntId?: string | null;
  getQuestionForStep?: (stepIndex: number) => Promise<{ prompt: string; options?: string[] } | null>;
  /** Hunt's question categories (one per location). Used for label and API uses same for OpenAI. */
  questionCategories?: string[];
  /** Called when unlock-task quiz is answered correctly. Pass target key count (e.g. waypointIndex+1). Idempotent vs DB trigger on submit. */
  onUnlockTaskCorrect?: (targetKeys: number) => void;
  /** Called when public-task or first-waypoint quiz is answered correctly. targetKeys is usually 1. */
  onPublicTaskCorrect?: (targetKeys: number) => void;
  /** Called when location quiz fails (wrong answer or timeout). Triggers reroute/penalty. */
  failLocationQuiz?: (reason: "wrong" | "timeout") => Promise<void>;
  /** Next waypoint (from DB) after current; set as travel destination when user continues after correct. */
  nextWaypointAfterCurrent?: { label: string; to: LngLat } | null;
  /** True only when Loota is at the target waypoint (next to complete). When false, show "Travel to next location" instead of quiz. */
  showLocationQuiz?: boolean;
};

export function HuntsStatusDrawerContent({
  huntHasStarted = true,
  huntPhase,
  keys,
  keysToWin,
  clock,
  playerPos,
  credits,
  huntersHunting,
  formatNaira,
  travelMode,
  isTraveling,
  prep,
  progress,
  fmtCoord,
  getTaskSeed,
  publicTaskStepNumber,
  publicTaskDeadlineMs,
  publicTaskQuestion,
  publicTaskStage,
  publicLocation,
  publicTaskAttempt,
  relocationCountdown,
  locationQuizFailMessage,
  publicTaskFeedback,
  publicTaskAnswer,
  publicTaskError,
  setPublicTaskQuestion,
  setPublicTaskStage,
  setPublicTaskDeadlineMs,
  setPublicTaskAnswer,
  setPublicTaskError,
  setDestinationLabel,
  setPendingDestination,
  setPendingDestinationLabel,
  setHuntPhase,
  setDrawer,
  publicTaskFromHunt,
  firstNextLocation,
  failPublicTask,
  arrivedForChallenge,
  setArrivedForChallenge,
  waypointIndexAtPlayer = null,
  arrivalChallengeIntro,
  setArrivalChallengeIntro,
  startRpsChallenge,
  rps,
  playRps,
  clueUnlocked,
  demoUnlockTasks,
  unlockCheckpoint,
  unlockRetry = null,
  unlockTaskDeadlineMs,
  unlockTaskQuestion,
  unlockTaskStage,
  unlockTaskFeedback,
  unlockTaskAttempt,
  unlockAnswer,
  unlockError,
  setUnlockTaskQuestion,
  setUnlockTaskStage,
  setUnlockTaskDeadlineMs,
  setUnlockAnswer,
  setUnlockError,
  setClueUnlocked,
  failUnlockTask,
  validateAnswer,
  activeHuntId,
  getQuestionForStep,
  questionCategories,
  onUnlockTaskCorrect,
  onPublicTaskCorrect,
  failLocationQuiz,
  nextWaypointAfterCurrent = null,
  showLocationQuiz = false,
}: Props) {
  const [publicTaskSubmitting, setPublicTaskSubmitting] = useState(false);
  const [unlockTaskSubmitting, setUnlockTaskSubmitting] = useState(false);
  const [publicTaskLoadingQuestion, setPublicTaskLoadingQuestion] = useState(false);
  const [unlockTaskLoadingQuestion, setUnlockTaskLoadingQuestion] = useState(false);
  const publicTaskStartInProgressRef = useRef(false);
  const unlockTaskStartInProgressRef = useRef(false);
  const [publicTaskJustCorrect, setPublicTaskJustCorrect] = useState(false);
  const [unlockTaskJustCorrect, setUnlockTaskJustCorrect] = useState(false);

  // Location quiz: when status is open at a waypoint, show quiz for that step
  const [locationQuizQuestion, setLocationQuizQuestion] = useState<TaskItem | null>(null);
  const [locationQuizAnswer, setLocationQuizAnswer] = useState("");
  const [locationQuizStage, setLocationQuizStage] = useState<"intro" | "active">("intro");
  const [locationQuizDeadlineMs, setLocationQuizDeadlineMs] = useState<number | null>(null);
  const [locationQuizLoading, setLocationQuizLoading] = useState(false);
  const [locationQuizSubmitting, setLocationQuizSubmitting] = useState(false);
  const [locationQuizJustCorrect, setLocationQuizJustCorrect] = useState(false);
  const [locationQuizError, setLocationQuizError] = useState<string | null>(null);
  /** When set, show "Oh no" message then call failLocationQuiz after delay (no immediate reroute). */
  const [locationQuizFailPending, setLocationQuizFailPending] = useState<"wrong" | "timeout" | null>(null);
  /** When checking answer, freeze the displayed timer so it doesn't count down during the API call. */
  const locationQuizFrozenSecondsLeftRef = useRef<number | null>(null);
  const locationQuizTimedOutRef = useRef(false);
  /** Guard so "Start" for location quiz only runs once (avoids double fetch / double UI). */
  const locationQuizStartInProgressRef = useRef(false);
  /** Guard so we only award key once per quiz (Continue handler). */
  const locationQuizKeyAwardedRef = useRef(false);
  /** Waypoint index for the quiz just passed — captured on submit so Continue is correct after realtime bumps keys. */
  const locationQuizCompletedWaypointRef = useRef<number | null>(null);
  /** Target keys after unlock-task quiz (keys+1 at submit time). */
  const unlockTaskKeyTargetRef = useRef<number | null>(null);
  useEffect(() => {
    if (waypointIndexAtPlayer == null) {
      setLocationQuizQuestion(null);
      setLocationQuizAnswer("");
      setLocationQuizStage("intro");
      setLocationQuizDeadlineMs(null);
      setLocationQuizJustCorrect(false);
      setLocationQuizError(null);
      setLocationQuizFailPending(null);
      locationQuizStartInProgressRef.current = false;
    }
  }, [waypointIndexAtPlayer]);

  // After showing "Oh no" message, wait then trigger reroute.
  useEffect(() => {
    if (locationQuizFailPending == null || !failLocationQuiz) return;
    const t = setTimeout(() => {
      void failLocationQuiz(locationQuizFailPending);
      setLocationQuizFailPending(null);
      if (locationQuizFailPending === "timeout") locationQuizTimedOutRef.current = false;
    }, QUIZ_FAIL_REROUTE_DELAY_MS);
    return () => clearTimeout(t);
  }, [locationQuizFailPending, failLocationQuiz]);

  // Location quiz timer: when time runs out, show "Oh no" then reroute after delay.
  // Do not run while checking answer (locationQuizSubmitting) or when user already got it right (locationQuizJustCorrect).
  useEffect(() => {
    if (waypointIndexAtPlayer == null || locationQuizStage !== "active" || !locationQuizDeadlineMs || !failLocationQuiz) return;
    if (locationQuizSubmitting || locationQuizJustCorrect) return;
    const left = Math.ceil((locationQuizDeadlineMs - clock) / 1000);
    if (left > 0) return;
    if (locationQuizTimedOutRef.current) return;
    locationQuizTimedOutRef.current = true;
    setLocationQuizStage("intro");
    setLocationQuizQuestion(null);
    setLocationQuizDeadlineMs(null);
    setLocationQuizAnswer("");
    setLocationQuizError(null);
    setLocationQuizFailPending("timeout");
  }, [clock, waypointIndexAtPlayer, locationQuizStage, locationQuizDeadlineMs, failLocationQuiz, locationQuizSubmitting, locationQuizJustCorrect]);

  if (!huntHasStarted) {
    return (
      <div className="space-y-5">
        <div className="p-5 rounded-3xl bg-amber-50 border border-amber-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
            Status locked
          </p>
          <p className="mt-2 text-sm font-semibold text-[#0F172A]">
            The hunt has not started yet.
          </p>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Your keys, position, wallet and travel mode will appear here when the countdown reaches zero.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Hunt</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {huntPhase === "public_trip" || huntPhase === "public_task"
              ? "Public start"
              : `Step ${Math.min(keysToWin, keys + 1)}`}
          </p>
        </div>
        <p className="mt-2 text-sm font-extrabold text-[#0F172A]">
          Keys: {keys}/{keysToWin}
        </p>

        {keys >= keysToWin ? (
          <div className="relative mt-4 p-4 rounded-2xl bg-[#0F172A] text-white">
            <WinnerConfetti />
            <p className="text-sm font-extrabold">You won the hunt.</p>
            <p className="mt-1 text-xs text-white/80">The hunt has ended for you.</p>
          </div>
        ) : waypointIndexAtPlayer !== null && showLocationQuiz ? (
          <div className="mt-4 p-4 rounded-2xl bg-[#F8FAFC] border border-[#F1F5F9]">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Quiz at this location (step {waypointIndexAtPlayer + 1})
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-600">
              Category:{" "}
              {questionCategories?.length && questionCategories[waypointIndexAtPlayer % questionCategories.length]
                ? questionCategories[waypointIndexAtPlayer % questionCategories.length]
                : TASK_CATEGORY_LABEL[taskCategoryForStep(waypointIndexAtPlayer + 1)] ?? "quiz"}
            </p>
            {locationQuizFailPending ? (
              <div className="mt-3 p-4 rounded-2xl bg-amber-500 text-white">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/90">
                  Quiz failed
                </p>
                <p className="mt-2 text-sm font-extrabold">
                  {locationQuizFailPending === "timeout" ? "Time's up!" : "Wrong answer."}
                </p>
                <p className="mt-2 text-xs text-white/90">
                  Rerouting you 2 km away… Please wait.
                </p>
              </div>
            ) : locationQuizFailMessage ? (
              <div className="mt-3 p-4 rounded-2xl bg-amber-500 text-white">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/90">
                  Quiz failed
                </p>
                <p className="mt-2 text-sm font-extrabold">{locationQuizFailMessage}</p>
                <p className="mt-2 text-xs text-white/90">Rerouting…</p>
              </div>
            ) : locationQuizJustCorrect ? (
              <div className="mt-3 p-4 rounded-2xl bg-emerald-600 text-white">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/90">
                  Correct
                </p>
                <p className="mt-2 text-sm font-extrabold">
                  {waypointIndexAtPlayer === 0
                    ? "You got a key! Now continue your journey."
                    : "You got a key! Now continue your journey."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const w = locationQuizCompletedWaypointRef.current;
                    // Target keys = w+1; max(k, target) avoids double count if DB/realtime already incremented on submit.
                    if (!locationQuizKeyAwardedRef.current && w != null) {
                      locationQuizKeyAwardedRef.current = true;
                      const targetKeys = w + 1;
                      if (w === 0) onPublicTaskCorrect?.(targetKeys);
                      else onUnlockTaskCorrect?.(targetKeys);
                    }
                    setLocationQuizJustCorrect(false);
                    setLocationQuizStage("intro");
                    setLocationQuizQuestion(null);
                    setLocationQuizDeadlineMs(null);
                    setLocationQuizAnswer("");
                    locationQuizStartInProgressRef.current = false;
                    locationQuizCompletedWaypointRef.current = null;
                    if (w === 0) {
                      setPublicTaskStage("intro");
                      setPublicTaskQuestion(null);
                      setPublicTaskDeadlineMs(null);
                      setPublicTaskAnswer("");
                      setPublicTaskError(null);
                      setDestinationLabel(firstNextLocation.label);
                      setPendingDestination(firstNextLocation.to);
                      setPendingDestinationLabel(firstNextLocation.label);
                      setHuntPhase("hunt");
                      // Hide unlock-task card until they reach the next physical checkpoint.
                      setClueUnlocked(false);
                    } else {
                      if (nextWaypointAfterCurrent) {
                        setDestinationLabel(nextWaypointAfterCurrent.label);
                        setPendingDestination(nextWaypointAfterCurrent.to);
                        setPendingDestinationLabel(nextWaypointAfterCurrent.label);
                      } else {
                        // Clear destination if there's no next waypoint
                        setDestinationLabel("");
                        setPendingDestination(null);
                        setPendingDestinationLabel("");
                      }
                      setArrivedForChallenge?.(false);
                      // Critical: "unlock next destination" task must NOT show again until arrival at
                      // the next waypoint. Otherwise clueUnlocked stays true and a second quiz appears
                      // immediately while travel already shows the next pin.
                      setClueUnlocked(false);
                    }
                  }}
                  className="mt-4 w-full px-5 py-3 rounded-full bg-white text-emerald-700 font-extrabold text-xs uppercase tracking-[0.2em] hover:bg-emerald-50 transition-colors"
                >
                  Continue
                </button>
              </div>
            ) : locationQuizStage === "intro" ? (
              <>
                <p className="mt-2 text-sm font-extrabold text-[#0F172A]">
                  You&apos;re at a checkpoint. Solve the task below for this location.
                </p>
                <button
                  type="button"
                  disabled={locationQuizLoading || !activeHuntId || !getQuestionForStep}
                  onClick={async () => {
                    if (locationQuizStartInProgressRef.current) return;
                    if (!activeHuntId || !getQuestionForStep) {
                      setLocationQuizError("Quiz not available. Join a hunt from the lobby.");
                      return;
                    }
                    locationQuizStartInProgressRef.current = true;
                    setLocationQuizLoading(true);
                    setLocationQuizError(null);
                    try {
                      const res = await getQuestionForStep(waypointIndexAtPlayer!);
                      if (res) {
                        setLocationQuizQuestion({
                          id: `location-${waypointIndexAtPlayer}`,
                          category: "quiz",
                          prompt: res.prompt,
                          answers: res.options ?? [],
                        });
                        setLocationQuizStage("active");
                        setLocationQuizDeadlineMs(Date.now() + TASK_TIME_SECONDS * 1000);
                        setLocationQuizAnswer("");
                      } else {
                        setLocationQuizError("Couldn't load question. Tap Start to try again.");
                      }
                    } finally {
                      setLocationQuizLoading(false);
                      locationQuizStartInProgressRef.current = false;
                    }
                  }}
                  className="mt-4 w-full px-5 py-3 rounded-full bg-[#0F172A] text-white font-extrabold text-xs uppercase tracking-[0.2em] hover:bg-[#2563EB] transition-colors disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  {locationQuizLoading ? (
                    <>
                      <span className="inline-block size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Loading question…
                    </>
                  ) : (
                    "Start"
                  )}
                </button>
              </>
            ) : (
              <>
                <div
                  className="mt-2 select-none"
                  onCopy={(e) => e.preventDefault()}
                  onCut={(e) => e.preventDefault()}
                  onContextMenu={(e) => e.preventDefault()}
                  onDragStart={(e) => e.preventDefault()}
                >
                  <p className="text-sm font-extrabold text-[#0F172A]">
                    {locationQuizQuestion?.prompt || "Solve the task…"}
                  </p>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Answer correctly to get the key for this location.
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {locationQuizSubmitting ? "Checking…" : "Time left"}
                  </p>
                  <p className="text-xs font-extrabold tabular-nums text-[#0F172A]">
                    {locationQuizDeadlineMs
                      ? `${locationQuizSubmitting && locationQuizFrozenSecondsLeftRef.current != null ? locationQuizFrozenSecondsLeftRef.current : Math.max(0, Math.ceil((locationQuizDeadlineMs - clock) / 1000))}s`
                      : "—"}
                  </p>
                </div>
                <div className="mt-4 flex flex-col gap-3">
                  <input
                    className="w-full bg-white border border-[#F1F5F9] rounded-2xl px-4 py-3 text-xs font-semibold outline-none focus:border-[#2563EB]/40"
                    placeholder="Type your answer…"
                    value={locationQuizAnswer}
                    onChange={(e) => setLocationQuizAnswer(e.target.value)}
                    disabled={locationQuizSubmitting}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const raw = locationQuizAnswer.trim();
                      if (!raw) {
                        setLocationQuizError("Enter an answer.");
                        return;
                      }
                      const secondsLeft = locationQuizDeadlineMs
                        ? Math.ceil((locationQuizDeadlineMs - clock) / 1000)
                        : 0;
                      if (secondsLeft <= 0 && !locationQuizSubmitting) return;
                      locationQuizFrozenSecondsLeftRef.current = Math.max(0, secondsLeft);
                      setLocationQuizSubmitting(true);
                      setLocationQuizError(null);
                      let ok = false;
                      try {
                        if (validateAnswer && locationQuizQuestion != null) {
                          if (activeHuntId) {
                            const res = await validateAnswer({
                              huntId: activeHuntId,
                              stepIndex: waypointIndexAtPlayer!,
                              playerAnswer: raw,
                            });
                            ok = res.correct;
                          } else {
                            const correctAnswer = locationQuizQuestion.answers[0] ?? "";
                            const res = await validateAnswer({
                              question: locationQuizQuestion.prompt,
                              correctAnswer,
                              playerAnswer: raw,
                              options:
                                locationQuizQuestion.answers.length > 1
                                  ? locationQuizQuestion.answers
                                  : undefined,
                            });
                            ok = res.correct;
                          }
                        } else {
                          ok =
                            locationQuizQuestion != null &&
                            locationQuizQuestion.answers.some((x) => normAnswer(x) === normAnswer(raw));
                        }
                      } catch {
                        ok =
                          locationQuizQuestion != null &&
                          locationQuizQuestion.answers.length > 0 &&
                          locationQuizQuestion.answers.some((x) => normAnswer(x) === normAnswer(raw));
                      } finally {
                        locationQuizFrozenSecondsLeftRef.current = null;
                        setLocationQuizSubmitting(false);
                      }
                      if (!ok) {
                        setLocationQuizError(null);
                        setLocationQuizStage("intro");
                        setLocationQuizQuestion(null);
                        setLocationQuizDeadlineMs(null);
                        setLocationQuizAnswer("");
                        if (failLocationQuiz) {
                          setLocationQuizFailPending("wrong");
                        } else {
                          setLocationQuizError("Wrong answer. Try again.");
                        }
                        return;
                      }
                      // Award key only when user clicks Continue (below), so we stay in "Correct!" UI
                      // instead of keys incrementing and showing the next step's question.
                      setLocationQuizDeadlineMs(null);
                      locationQuizKeyAwardedRef.current = false; // Reset so Continue can award once
                      locationQuizCompletedWaypointRef.current = waypointIndexAtPlayer ?? null;
                      setLocationQuizJustCorrect(true);
                    }}
                    disabled={
                      !locationQuizAnswer.trim() ||
                      (locationQuizDeadlineMs != null && locationQuizDeadlineMs - clock <= 0) ||
                      locationQuizSubmitting
                    }
                    className={[
                      "w-full px-4 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-colors inline-flex items-center justify-center gap-2",
                      locationQuizAnswer.trim() &&
                      (locationQuizDeadlineMs == null || locationQuizDeadlineMs - clock > 0) &&
                      !locationQuizSubmitting
                        ? "bg-[#0F172A] text-white hover:bg-[#2563EB]"
                        : "bg-slate-100 text-slate-400 cursor-not-allowed",
                    ].join(" ")}
                  >
                    {locationQuizSubmitting ? (
                      <>
                        <span className="inline-block size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Checking…
                      </>
                    ) : (
                      "Submit"
                    )}
                  </button>
                </div>
              </>
            )}
            {locationQuizError ? (
              <p className="mt-3 text-xs font-bold text-red-600">{locationQuizError}</p>
            ) : null}
          </div>
        ) : waypointIndexAtPlayer !== null && !showLocationQuiz && nextWaypointAfterCurrent && keys < keysToWin && activeHuntId && getQuestionForStep ? (
          <NextQuizAtLocation
            nextWaypoint={nextWaypointAfterCurrent}
            stepIndex={keys}
            getQuestionForStep={getQuestionForStep}
            questionCategories={questionCategories}
            setDrawer={setDrawer}
          />
        ) : huntPhase === "public_task" ? (
          <div className="mt-4 p-4 rounded-2xl bg-[#F8FAFC] border border-[#F1F5F9]">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Task (unlock next location)
            </p>
            {(() => {
              const stepNumber = publicTaskStepNumber;
              const stepIndex = 0;
              const catLabel =
                questionCategories?.length &&
                questionCategories[stepIndex % questionCategories.length]
                  ? questionCategories[stepIndex % questionCategories.length]
                  : TASK_CATEGORY_LABEL[taskCategoryForStep(stepNumber)] ?? "quiz";
              const secondsLeft = publicTaskDeadlineMs
                ? Math.max(0, Math.ceil((publicTaskDeadlineMs - clock) / 1000))
                : TASK_TIME_SECONDS;
              const q = publicTaskQuestion;
              return (
                <>
                  {publicTaskJustCorrect ? (
                    <div className="mt-3 p-4 rounded-2xl bg-emerald-600 text-white">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/90">
                        Correct
                      </p>
                      <p className="mt-2 text-sm font-extrabold">
                        You got a key! Now continue your journey.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          onPublicTaskCorrect?.(1);
                          setPublicTaskJustCorrect(false);
                          setDestinationLabel(firstNextLocation.label);
                          setPendingDestination(firstNextLocation.to);
                          setPendingDestinationLabel(firstNextLocation.label);
                          setPublicTaskStage("intro");
                          setPublicTaskQuestion(null);
                          setPublicTaskDeadlineMs(null);
                          setPublicTaskAnswer("");
                          setHuntPhase("hunt");
                          // Stay on Status to show next quiz
                        }}
                        className="mt-4 w-full px-5 py-3 rounded-full bg-white text-emerald-700 font-extrabold text-xs uppercase tracking-[0.2em] hover:bg-emerald-50 transition-colors"
                      >
                        Continue
                      </button>
                    </div>
                  ) : relocationCountdown !== null ? (
                    <div className="mt-3 p-4 rounded-2xl bg-amber-500 text-white">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/90">
                        Relocation in progress
                      </p>
                      <p className="mt-3 text-4xl font-extrabold text-center tabular-nums">
                        {relocationCountdown}
                      </p>
                      <p className="mt-2 text-xs text-white/90 text-center">
                        You will be moved 1km away in {relocationCountdown} second
                        {relocationCountdown !== 1 ? "s" : ""}
                      </p>
                    </div>
                  ) : publicTaskFeedback ? (
                    <div className="mt-3 p-4 rounded-2xl bg-[#0F172A] text-white">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/70">
                        The hunt speaks
                      </p>
                      <p className="mt-2 text-sm font-extrabold">{publicTaskFeedback}</p>
                      <p className="mt-2 text-xs text-white/75">Something weird is happening…</p>
                    </div>
                  ) : publicTaskStage === "intro" ? (
                    <>
                      <p className="mt-2 text-sm font-extrabold text-[#0F172A]">
                        {publicTaskAttempt > 0
                          ? "You are here, let's try."
                          : "Welcome. Solve the task below to get the next location."}
                      </p>
                      <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                        To get the location of the next clue, you need to solve this{" "}
                        <span className="font-bold">{catLabel}</span>.
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        Should you miss… weird things happen.
                      </p>
                      <button
                        type="button"
                        disabled={publicTaskLoadingQuestion || !activeHuntId || !getQuestionForStep}
                        onClick={async () => {
                          if (publicTaskStartInProgressRef.current) return;
                          if (!activeHuntId || !getQuestionForStep) {
                            setPublicTaskError("Quiz not available. Join a hunt from the lobby.");
                            return;
                          }
                          publicTaskStartInProgressRef.current = true;
                          setPublicTaskLoadingQuestion(true);
                          setPublicTaskError(null);
                          try {
                            const res = await getQuestionForStep(0);
                            if (res) {
                              setPublicTaskQuestion({
                                id: "ai-public-0",
                                category: catLabel,
                                prompt: res.prompt,
                                answers: res.options ?? [],
                              });
                              setPublicTaskStage("active");
                              setPublicTaskDeadlineMs(Date.now() + TASK_TIME_SECONDS * 1000);
                              setPublicTaskAnswer("");
                            } else {
                              setPublicTaskError("Couldn't load question. Tap Start to try again.");
                            }
                          } finally {
                            setPublicTaskLoadingQuestion(false);
                            publicTaskStartInProgressRef.current = false;
                          }
                        }}
                        className="mt-4 w-full px-5 py-3 rounded-full bg-[#0F172A] text-white font-extrabold text-xs uppercase tracking-[0.2em] hover:bg-[#2563EB] transition-colors disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                      >
                        {publicTaskLoadingQuestion ? (
                          <>
                            <span className="inline-block size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Loading question…
                          </>
                        ) : (
                          "Start"
                        )}
                      </button>
                    </>
                  ) : (
                    <>
                      <div
                        className="mt-2 select-none"
                        onCopy={(e) => e.preventDefault()}
                        onCut={(e) => e.preventDefault()}
                        onContextMenu={(e) => e.preventDefault()}
                        onDragStart={(e) => e.preventDefault()}
                      >
                        <p className="text-sm font-extrabold text-[#0F172A]">
                          {q?.prompt || "Solve the task…"}
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        Answer correctly to get the next location (private).
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {publicTaskSubmitting ? "Checking…" : "Time left"}
                        </p>
                        <p className="text-xs font-extrabold tabular-nums text-[#0F172A]">
                          {publicTaskSubmitting ? "—" : `${secondsLeft}s`}
                        </p>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <input
                          className="flex-1 bg-white border border-[#F1F5F9] rounded-2xl px-4 py-3 text-xs font-semibold outline-none focus:border-[#2563EB]/40"
                          placeholder="Type your answer…"
                          value={publicTaskAnswer}
                          onChange={(e) => setPublicTaskAnswer(e.target.value)}
                          disabled={publicTaskSubmitting}
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (secondsLeft <= 0 && !publicTaskSubmitting) {
                              void failPublicTask("timeout");
                              return;
                            }
                            const raw = publicTaskAnswer.trim();
                            if (!raw) {
                              setPublicTaskError("Enter an answer.");
                              return;
                            }
                            setPublicTaskSubmitting(true);
                            setPublicTaskError(null);
                            let ok = false;
                            try {
                              if (validateAnswer && q != null) {
                                if (activeHuntId) {
                                  const res = await validateAnswer({
                                    huntId: activeHuntId,
                                    stepIndex: 0,
                                    playerAnswer: raw,
                                  });
                                  ok = res.correct;
                                } else {
                                  const correctAnswer = q.answers[0] ?? "";
                                  const res = await validateAnswer({
                                    question: q.prompt,
                                    correctAnswer,
                                    playerAnswer: raw,
                                    options: q.answers.length > 1 ? q.answers : undefined,
                                  });
                                  ok = res.correct;
                                }
                              } else {
                                ok = q != null && q.answers.some((x) => normAnswer(x) === normAnswer(raw));
                              }
                            } catch {
                              ok = q != null && q.answers.length > 0 && q.answers.some((x) => normAnswer(x) === normAnswer(raw));
                            } finally {
                              setPublicTaskSubmitting(false);
                            }
                            if (!ok) {
                              void failPublicTask("wrong");
                              return;
                            }
                            // Award key on Continue, not here (avoids double-add with DB trigger)
                            setPublicTaskJustCorrect(true);
                          }}
                          disabled={!publicTaskAnswer.trim() || secondsLeft <= 0 || publicTaskSubmitting}
                          className={[
                            "px-4 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-colors inline-flex items-center justify-center gap-2",
                            publicTaskAnswer.trim() && secondsLeft > 0 && !publicTaskSubmitting
                              ? "bg-[#0F172A] text-white hover:bg-[#2563EB]"
                              : "bg-slate-100 text-slate-400 cursor-not-allowed",
                          ].join(" ")}
                        >
                          {publicTaskSubmitting ? (
                            <>
                              <span className="inline-block size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Checking…
                            </>
                          ) : (
                            "Submit"
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </>
              );
            })()}
            {publicTaskError ? (
              <p className="mt-3 text-xs font-bold text-red-600">{publicTaskError}</p>
            ) : null}
          </div>
        ) : null}
        {arrivedForChallenge && arrivalChallengeIntro && !activeHuntId ? (
          <div className="mt-4 p-4 rounded-2xl bg-[#F8FAFC] border border-[#F1F5F9]">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Welcome
            </p>
            <p className="mt-2 text-sm font-extrabold text-[#0F172A]">
              You've arrived at a new checkpoint
            </p>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              To unlock the next location, you need to win a quick game of Rock • Paper • Scissors
              (best of 3).
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Win the challenge to proceed to the unlock task.
            </p>
            <button
              type="button"
              onClick={() => {
                setArrivalChallengeIntro(false);
                startRpsChallenge();
              }}
              className="mt-4 w-full px-5 py-3 rounded-full bg-[#0F172A] text-white font-extrabold text-xs uppercase tracking-[0.2em] hover:bg-[#2563EB] transition-colors"
            >
              Start Challenge
            </button>
          </div>
        ) : null}
        {arrivedForChallenge && !arrivalChallengeIntro && !activeHuntId ? (
          <div className="mt-4 p-4 rounded-2xl bg-[#F8FAFC] border border-[#F1F5F9]">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Arrival challenge
            </p>
            <p className="mt-2 text-sm font-extrabold text-[#0F172A]">
              Rock • Paper • Scissors (best of 3)
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs font-extrabold">
              <span className="px-3 py-1.5 rounded-full bg-white border border-[#F1F5F9]">
                You: {rps?.your ?? 0}
              </span>
              <span className="px-3 py-1.5 rounded-full bg-white border border-[#F1F5F9]">
                Bot: {rps?.bot ?? 0}
              </span>
              {rps?.done ? (
                <span
                  className={[
                    "px-3 py-1.5 rounded-full border",
                    (rps?.your ?? 0) > (rps?.bot ?? 0)
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-red-50 text-red-700 border-red-200",
                  ].join(" ")}
                >
                  {(rps?.your ?? 0) > (rps?.bot ?? 0) ? "Key secured" : "Try again"}
                </span>
              ) : null}
            </div>
            {rps?.last ? (
              <p className="mt-3 text-xs text-slate-600">
                Last round: you <span className="font-bold">{rps.last.you}</span> vs bot{" "}
                <span className="font-bold">{rps.last.bot}</span> (
                <span className="font-bold">{rps.last.result}</span>)
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => playRps("rock")}
                disabled={Boolean(rps?.done)}
                className={[
                  "px-4 py-2.5 rounded-full font-black text-[11px] uppercase tracking-[0.18em] border transition-colors",
                  rps?.done
                    ? "bg-slate-100 text-slate-400 border-[#F1F5F9] cursor-not-allowed"
                    : "bg-white text-[#0F172A] border-[#F1F5F9] hover:border-[#2563EB]/40",
                ].join(" ")}
              >
                Rock
              </button>
              <button
                type="button"
                onClick={() => playRps("paper")}
                disabled={Boolean(rps?.done)}
                className={[
                  "px-4 py-2.5 rounded-full font-black text-[11px] uppercase tracking-[0.18em] border transition-colors",
                  rps?.done
                    ? "bg-slate-100 text-slate-400 border-[#F1F5F9] cursor-not-allowed"
                    : "bg-white text-[#0F172A] border-[#F1F5F9] hover:border-[#2563EB]/40",
                ].join(" ")}
              >
                Paper
              </button>
              <button
                type="button"
                onClick={() => playRps("scissors")}
                disabled={Boolean(rps?.done)}
                className={[
                  "px-4 py-2.5 rounded-full font-black text-[11px] uppercase tracking-[0.18em] border transition-colors",
                  rps?.done
                    ? "bg-slate-100 text-slate-400 border-[#F1F5F9] cursor-not-allowed"
                    : "bg-white text-[#0F172A] border-[#F1F5F9] hover:border-[#2563EB]/40",
                ].join(" ")}
              >
                Scissors
              </button>
              {rps?.done && (rps?.your ?? 0) <= (rps?.bot ?? 0) ? (
                <button
                  type="button"
                  onClick={() => {
                    setArrivalChallengeIntro(false);
                    startRpsChallenge();
                  }}
                  className="px-4 py-2.5 rounded-full bg-[#0F172A] text-white font-black text-[11px] uppercase tracking-[0.18em] hover:bg-[#2563EB] transition-colors"
                >
                  Retry
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {huntPhase !== "public_task" &&
          (clueUnlocked || (arrivedForChallenge && activeHuntId)) &&
          !(unlockRetry && !arrivedForChallenge) &&
          !(waypointIndexAtPlayer !== null && showLocationQuiz) ? (
          <div className="mt-4 p-4 rounded-2xl bg-[#F8FAFC] border border-[#F1F5F9]">
            {(() => {
              const idx = Math.max(0, keys - 1) % demoUnlockTasks.length;
              const next = demoUnlockTasks[idx]?.next ?? null;
              const stepNumber = unlockCheckpoint?.stepNumber ?? Math.max(2, keys + 1);
              const stepIndex = keys;
              const catLabel =
                questionCategories?.length &&
                questionCategories[stepIndex % questionCategories.length]
                  ? questionCategories[stepIndex % questionCategories.length]
                  : TASK_CATEGORY_LABEL[taskCategoryForStep(stepNumber)] ?? "quiz";
              const attempt = unlockTaskAttempt;
              const secondsLeft = unlockTaskDeadlineMs
                ? Math.max(0, Math.ceil((unlockTaskDeadlineMs - clock) / 1000))
                : TASK_TIME_SECONDS;
              const q = unlockTaskQuestion;
              return (
                <>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Task (unlock next destination)
                  </p>
                  {unlockTaskJustCorrect ? (
                    <div className="mt-3 p-4 rounded-2xl bg-emerald-600 text-white">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/90">
                        Correct
                      </p>
                      <p className="mt-2 text-sm font-extrabold">
                        You got a key! Now continue your journey.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const t = unlockTaskKeyTargetRef.current ?? keys + 1;
                          unlockTaskKeyTargetRef.current = null;
                          onUnlockTaskCorrect?.(t);
                          setUnlockTaskJustCorrect(false);
                          if (next) {
                            setDestinationLabel(next.label);
                            setPendingDestination(next.to);
                            setPendingDestinationLabel(next.label);
                          }
                          setClueUnlocked(false);
                          setUnlockTaskStage("intro");
                          setUnlockTaskQuestion(null);
                          setUnlockTaskDeadlineMs(null);
                          setArrivedForChallenge?.(false);
                          setDrawer(null);
                        }}
                        className="mt-4 w-full px-5 py-3 rounded-full bg-white text-emerald-700 font-extrabold text-xs uppercase tracking-[0.2em] hover:bg-emerald-50 transition-colors"
                      >
                        Continue
                      </button>
                    </div>
                  ) : unlockTaskFeedback ? (
                    <div className="mt-3 p-4 rounded-2xl bg-[#0F172A] text-white">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/70">
                        The hunt speaks
                      </p>
                      <p className="mt-2 text-sm font-extrabold">{unlockTaskFeedback}</p>
                      <p className="mt-2 text-xs text-white/75">Something weird is happening…</p>
                    </div>
                  ) : unlockTaskStage === "intro" ? (
                    <>
                      <p className="mt-2 text-sm font-extrabold text-[#0F172A]">
                        {attempt > 0
                          ? "You are here, let's try."
                          : "Welcome. Solve the task below to get the next location."}
                      </p>
                      <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                        To get the location of the next clue, you need to solve this{" "}
                        <span className="font-bold">{catLabel}</span>.
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        Should you miss… weird things happen.
                      </p>
                      {unlockCheckpoint?.label ? (
                        <p className="mt-2 text-xs text-slate-500">
                          Checkpoint: <span className="font-bold">{unlockCheckpoint.label}</span>
                        </p>
                      ) : null}
                      <button
                        type="button"
                        disabled={unlockTaskLoadingQuestion || !activeHuntId || !getQuestionForStep}
                        onClick={async () => {
                          if (unlockTaskStartInProgressRef.current) return;
                          if (!activeHuntId || !getQuestionForStep) {
                            setUnlockError("Quiz not available. Join a hunt from the lobby.");
                            return;
                          }
                          unlockTaskStartInProgressRef.current = true;
                          setUnlockTaskLoadingQuestion(true);
                          setUnlockError(null);
                          try {
                            const res = await getQuestionForStep(keys);
                            if (res) {
                              setUnlockTaskQuestion({
                                id: `ai-unlock-${idx}`,
                                category: catLabel,
                                prompt: res.prompt,
                                answers: res.options ?? [],
                              });
                              setUnlockTaskStage("active");
                              setUnlockTaskDeadlineMs(Date.now() + TASK_TIME_SECONDS * 1000);
                              setUnlockAnswer("");
                            } else {
                              setUnlockError("Couldn't load question. Tap Start to try again.");
                            }
                          } finally {
                            setUnlockTaskLoadingQuestion(false);
                            unlockTaskStartInProgressRef.current = false;
                          }
                        }}
                        className="mt-4 w-full px-5 py-3 rounded-full bg-[#0F172A] text-white font-extrabold text-xs uppercase tracking-[0.2em] hover:bg-[#2563EB] transition-colors disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                      >
                        {unlockTaskLoadingQuestion ? (
                          <>
                            <span className="inline-block size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Loading question…
                          </>
                        ) : (
                          "Start"
                        )}
                      </button>
                    </>
                  ) : (
                    <>
                      <div
                        className="mt-2 select-none"
                        onCopy={(e) => e.preventDefault()}
                        onCut={(e) => e.preventDefault()}
                        onContextMenu={(e) => e.preventDefault()}
                        onDragStart={(e) => e.preventDefault()}
                      >
                        <p className="text-sm font-extrabold text-[#0F172A]">
                          {q?.prompt || "Solve the task…"}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {unlockTaskSubmitting ? "Checking…" : "Time left"}
                        </p>
                        <p className="text-xs font-extrabold tabular-nums text-[#0F172A]">
                          {unlockTaskSubmitting ? "—" : `${secondsLeft}s`}
                        </p>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <input
                          className="flex-1 bg-white border border-[#F1F5F9] rounded-2xl px-4 py-3 text-xs font-semibold outline-none focus:border-[#2563EB]/40"
                          placeholder="Type your answer…"
                          value={unlockAnswer}
                          onChange={(e) => setUnlockAnswer(e.target.value)}
                          disabled={unlockTaskSubmitting}
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (secondsLeft <= 0 && !unlockTaskSubmitting) {
                              void failUnlockTask("timeout");
                              return;
                            }
                            const raw = unlockAnswer.trim();
                            if (!raw) {
                              setUnlockError("Enter an answer.");
                              return;
                            }
                            setUnlockTaskSubmitting(true);
                            setUnlockError(null);
                            let ok = false;
                            try {
                              if (validateAnswer && q != null) {
                                if (activeHuntId) {
                                  const res = await validateAnswer({
                                    huntId: activeHuntId,
                                    stepIndex: keys,
                                    playerAnswer: raw,
                                  });
                                  ok = res.correct;
                                } else {
                                  const correctAnswer = q.answers[0] ?? "";
                                  const res = await validateAnswer({
                                    question: q.prompt,
                                    correctAnswer,
                                    playerAnswer: raw,
                                    options: q.answers.length > 1 ? q.answers : undefined,
                                  });
                                  ok = res.correct;
                                }
                              } else {
                                ok = q != null && q.answers.some((x) => normAnswer(x) === normAnswer(raw));
                              }
                            } catch {
                              ok = q != null && q.answers.length > 0 && q.answers.some((x) => normAnswer(x) === normAnswer(raw));
                            } finally {
                              setUnlockTaskSubmitting(false);
                            }
                            if (!ok) {
                              void failUnlockTask("wrong");
                              return;
                            }
                            unlockTaskKeyTargetRef.current = keys + 1;
                            setUnlockTaskJustCorrect(true);
                          }}
                          disabled={!unlockAnswer.trim() || secondsLeft <= 0 || unlockTaskSubmitting}
                          className={[
                            "px-4 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-colors inline-flex items-center justify-center gap-2",
                            unlockAnswer.trim() && secondsLeft > 0 && !unlockTaskSubmitting
                              ? "bg-[#0F172A] text-white hover:bg-[#2563EB]"
                              : "bg-slate-100 text-slate-400 cursor-not-allowed",
                          ].join(" ")}
                        >
                          {unlockTaskSubmitting ? (
                            <>
                              <span className="inline-block size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Checking…
                            </>
                          ) : (
                            "Submit"
                          )}
                        </button>
                      </div>
                    </>
                  )}
                  {unlockError ? (
                    <p className="mt-3 text-xs font-bold text-red-600">{unlockError}</p>
                  ) : null}
                </>
              );
            })()}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-600">
            {huntPhase === "public_trip"
              ? "Your first location is public. Travel there to get the start task."
              : huntPhase === "hunt"
                ? "Travel to the next location. When you arrive, you'll play a mini-game to earn the key."
                : "Complete the start task to unlock the next location."}
          </p>
        )}
      </div>

      <div className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Position</p>
        <p className="mt-1 text-sm font-extrabold">
          {playerPos ? `${fmtCoord(playerPos.lat)}, ${fmtCoord(playerPos.lng)}` : "—"}
        </p>
      </div>

      <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Travel mode
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[#0F172A] text-lg">
              {travelMode.icon}
            </span>
            <p className="text-sm font-extrabold truncate">{travelMode.label}</p>
          </div>
          <span
            className={[
              "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border",
              isTraveling || prep
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-slate-50 text-slate-500 border-slate-200",
            ].join(" ")}
          >
            {isTraveling || prep ? "Current" : "Last used"}
          </span>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Travel mode is set when you start a journey.
        </p>
      </div>

      <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Progress
          </p>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {isTraveling ? "Moving" : "Idle"}
          </p>
        </div>
        <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden border border-[#F1F5F9]">
          <div
            className="h-full bg-[#2563EB]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
