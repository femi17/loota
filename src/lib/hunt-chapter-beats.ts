/**
 * Short narrative lines when the player earns a key — makes each leg feel like a story beat, not only distance.
 */

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function chapterBeatMessage(args: {
  keyCount: number;
  waypointLabel: string | null;
  huntTitle: string;
}): string {
  const { keyCount, waypointLabel, huntTitle } = args;
  const spot = waypointLabel?.trim() || `Checkpoint ${keyCount}`;
  const title = huntTitle.trim() || "the hunt";
  const lines = [
    `Leg ${keyCount}: "${spot}" is in the books — the thread through "${title}" pulls a little tighter.`,
    `Chapter ${keyCount}: You cracked "${spot}". The map stops being noise and starts becoming a plan.`,
    `Beat ${keyCount}: "${spot}" checks out. Momentum is a weapon; keep leaning on the route.`,
    `Milestone ${keyCount}: From "${spot}" onward, the hunt feels personal — the leaderboard notices consistency.`,
    `Arc ${keyCount}: "${spot}" joins your trail. Small wins stack until the prize stops sounding abstract.`,
  ];
  return lines[hash32(`${keyCount}:${spot}:${title}`) % lines.length]!;
}
