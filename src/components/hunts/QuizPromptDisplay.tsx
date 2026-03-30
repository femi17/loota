"use client";

import { parseQuizPromptMedia } from "@/lib/quiz-prompt-media";

type Props = {
  prompt: string;
  className?: string;
  /** `light` = white text and borders for dark overlays (e.g. broadcast). */
  variant?: "dark" | "light";
};

/**
 * Renders quiz question text with optional Flag:/Logo: image lines shown as images above the text.
 */
export function QuizPromptDisplay({ prompt, className = "", variant = "dark" }: Props) {
  const { text, media } = parseQuizPromptMedia(prompt);
  const isLight = variant === "light";
  const textClass = isLight ? "text-white" : "text-[#0F172A]";
  const imgFlag = isLight
    ? "max-h-28 sm:max-h-36 w-auto max-w-full rounded-lg border border-white/25 shadow-sm object-contain bg-white"
    : "max-h-28 sm:max-h-36 w-auto max-w-full rounded-lg border border-slate-200 shadow-sm object-contain bg-white";
  const imgLogo = isLight
    ? "max-h-24 sm:max-h-32 w-auto max-w-[min(100%,280px)] rounded-lg border border-white/25 shadow-sm object-contain bg-white p-3"
    : "max-h-24 sm:max-h-32 w-auto max-w-[min(100%,280px)] rounded-lg border border-slate-200 shadow-sm object-contain bg-white p-3";
  return (
    <div className={className}>
      {media.length > 0 ? (
        <div className="flex flex-col items-center gap-3 mb-3">
          {media.map((m, i) => (
            <img
              key={`${m.kind}-${i}`}
              src={m.url}
              alt=""
              className={m.kind === "flag" ? imgFlag : imgLogo}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ))}
        </div>
      ) : null}
      <p className={`text-sm font-extrabold ${textClass} whitespace-pre-wrap`}>{text}</p>
    </div>
  );
}
