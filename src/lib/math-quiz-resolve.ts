/**
 * Deterministic arithmetic for Math multiple-choice questions so we never store
 * or grade against a wrong numeric answer when the expression is parseable.
 */

const MULT_SIGN = /\s*[×x]\s*/gi;

/** Strip trailing narration after the expression (e.g. "show your work"). */
function clipTrailingWords(expr: string): string {
  let s = expr.trim();
  const cut = /\b(show|explain|justify|prove|simplify\s+to)\b/i.exec(s);
  if (cut?.index != null && cut.index > 0) s = s.slice(0, cut.index).trim();
  return s.replace(/\?+$/, "").trim();
}

/**
 * Pull a single arithmetic expression from common quiz phrasings.
 * Returns null if we cannot isolate a safe numeric expression (e.g. algebra with x).
 */
export function extractArithmeticExpression(question: string): string | null {
  const trimmed = question.trim().replace(/\?+$/, "");
  const patterns: RegExp[] = [
    /\bresult\s+of\s+(.+)$/i,
    /\bvalue\s+of\s+(.+)$/i,
    /\bcompute[d]?\s*[:\s]\s*(.+)$/i,
    /\bcalculate\s+(.+)$/i,
    /\bevaluate\s+(.+)$/i,
    /\bwhat\s+is\s+the\s+result\s+of\s+(.+)$/i,
    /\bwhat\s+is\s+the\s+value\s+of\s+(.+)$/i,
    /\bwhat\s+is\s+(.+)$/i,
    /\bfind\s+(.+)$/i,
    /\bsimplify\s+(.+)$/i,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m?.[1]) {
      const raw = clipTrailingWords(m[1]);
      if (raw) {
        const normalized = normalizeMultiplyOperators(raw);
        if (isSafeNumericExpression(normalized)) return normalized;
      }
    }
  }
  const only = clipTrailingWords(trimmed);
  if (only && /^[\d\s+\-*/().,×x]+$/i.test(only)) {
    const normalized = normalizeMultiplyOperators(only);
    if (isSafeNumericExpression(normalized)) return normalized;
  }
  return null;
}

function normalizeMultiplyOperators(expr: string): string {
  return expr.replace(MULT_SIGN, "*");
}

/** Reject algebra, words, multiple equals, etc. */
function isSafeNumericExpression(expr: string): boolean {
  const s = expr.replace(/\s+/g, "");
  if (!s) return false;
  if (/[a-wyz]/i.test(s)) return false; // allow only 'e' for scientific notation below
  if (/e/i.test(s) && !/\d+e[+-]?\d+/i.test(s)) return false;
  if ((s.match(/=/g) || []).length > 0) return false;
  return /^[\d+\-*/().,eE]+$/.test(s);
}

type Tok =
  | { k: "num"; v: number }
  | { k: "op"; v: string }
  | { k: "lp" }
  | { k: "rp" };

function tokenize(expr: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  const n = expr.length;
  while (i < n) {
    const c = expr[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "(") {
      out.push({ k: "lp" });
      i++;
      continue;
    }
    if (c === ")") {
      out.push({ k: "rp" });
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < n && /[0-9.]/.test(expr[j]!)) j++;
      const raw = expr.slice(i, j);
      const v = parseFloat(raw);
      if (!Number.isFinite(v)) return null;
      out.push({ k: "num", v });
      i = j;
      continue;
    }
    if ("+-*/^".includes(c)) {
      out.push({ k: "op", v: c });
      i++;
      continue;
    }
    return null;
  }
  return out;
}

class Parser {
  private toks: Tok[];
  private i = 0;

  constructor(toks: Tok[]) {
    this.toks = toks;
  }

  parse(): number | null {
    const v = this.expr();
    if (v === null || this.i !== this.toks.length) return null;
    return v;
  }

  private peek(): Tok | undefined {
    return this.toks[this.i];
  }

  private expr(): number | null {
    let left = this.term();
    if (left === null) return null;
    while (true) {
      const t = this.peek();
      if (!t || t.k !== "op" || (t.v !== "+" && t.v !== "-")) break;
      this.i++;
      const right = this.term();
      if (right === null) return null;
      left = t.v === "+" ? left + right : left - right;
    }
    return left;
  }

  private term(): number | null {
    let left = this.power();
    if (left === null) return null;
    while (true) {
      const t = this.peek();
      if (!t || t.k !== "op" || (t.v !== "*" && t.v !== "/")) break;
      this.i++;
      const right = this.power();
      if (right === null) return null;
      if (t.v === "*") left = left * right;
      else {
        if (right === 0) return null;
        left = left / right;
      }
    }
    return left;
  }

  private power(): number | null {
    let left = this.factor();
    if (left === null) return null;
    const t = this.peek();
    if (t?.k === "op" && t.v === "^") {
      this.i++;
      const right = this.power();
      if (right === null) return null;
      left = Math.pow(left, right);
    }
    return left;
  }

  private factor(): number | null {
    const t = this.peek();
    if (!t) return null;
    if (t.k === "op" && t.v === "-") {
      this.i++;
      const v = this.factor();
      return v === null ? null : -v;
    }
    if (t.k === "op" && t.v === "+") {
      this.i++;
      return this.factor();
    }
    if (t.k === "lp") {
      this.i++;
      const v = this.expr();
      const cl = this.peek();
      if (!cl || cl.k !== "rp") return null;
      this.i++;
      return v;
    }
    if (t.k === "num") {
      this.i++;
      return t.v;
    }
    return null;
  }
}

export function evaluateArithmeticExpression(expr: string): number | null {
  const normalized = expr.replace(/,/g, "").trim();
  if (!normalized) return null;
  const toks = tokenize(normalized);
  if (!toks) return null;
  const p = new Parser(toks);
  const v = p.parse();
  if (v === null || !Number.isFinite(v)) return null;
  return v;
}

function parseOptionAsNumber(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const frac = /^(-?\d+)\s*\/\s*(-?\d+)$/.exec(t);
  if (frac) {
    const a = parseInt(frac[1]!, 10);
    const b = parseInt(frac[2]!, 10);
    if (b === 0) return null;
    return a / b;
  }
  const n = parseFloat(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const NUMERIC_TOL = 1e-6;

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= NUMERIC_TOL;
}

export type MathMcResolution = {
  /** Exact option string to store as correct answer */
  canonicalOption: string;
  value: number;
};

/**
 * If the question contains a computable numeric expression and exactly one option
 * matches the value, return that option. Otherwise null (fall back to AI).
 */
export function tryResolveMathMultipleChoice(
  question: string,
  options: string[] | undefined,
): MathMcResolution | null {
  if (!options || options.length === 0) return null;
  const expr = extractArithmeticExpression(question);
  if (!expr) return null;
  const value = evaluateArithmeticExpression(expr);
  if (value === null || !Number.isFinite(value)) return null;

  const matches: string[] = [];
  for (const o of options) {
    const n = parseOptionAsNumber(o);
    if (n !== null && nearlyEqual(n, value)) matches.push(o);
  }
  if (matches.length !== 1) return null;
  return { canonicalOption: matches[0]!, value };
}

/** Normalize player text for numeric comparison */
export function parsePlayerNumericAnswer(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  return parseOptionAsNumber(t);
}

/** When the expression resolves, grade the player against the computed value (fixes wrong stored answers). */
export function playerAnswerMatchesMathResolution(
  playerAnswer: string,
  resolved: MathMcResolution,
): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  if (norm(playerAnswer) === norm(resolved.canonicalOption)) return true;
  const pNum = parsePlayerNumericAnswer(playerAnswer);
  return pNum !== null && nearlyEqual(pNum, resolved.value);
}
