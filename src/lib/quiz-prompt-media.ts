/**
 * Quiz prompts may embed media on their own lines (from OpenAI):
 *   Flag: https://flagcdn.com/w320/ng.png
 *   Logo: https://logo.clearbit.com/nike.com
 * Strip those for readable text; return URLs for <img>.
 */
export type QuizPromptMedia = { kind: "flag" | "logo"; url: string };

export function parseQuizPromptMedia(raw: string): { text: string; media: QuizPromptMedia[] } {
  const media: QuizPromptMedia[] = [];
  const lines = raw.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const flagM = /^\s*Flag:\s*(https?:\/\/\S+)/i.exec(line);
    const logoM = /^\s*Logo:\s*(https?:\/\/\S+)/i.exec(line);
    if (flagM?.[1]) {
      media.push({ kind: "flag", url: flagM[1] });
      continue;
    }
    if (logoM?.[1]) {
      media.push({ kind: "logo", url: logoM[1] });
      continue;
    }
    kept.push(line);
  }
  const text = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: text || raw.trim(), media };
}
