import { NextResponse } from "next/server";

/** Max body size for JSON APIs that expect small payloads (e.g. wallet, profile, purchase). */
const MAX_BODY_BYTES = 50_000; // 50KB

/**
 * Returns 413 Payload Too Large if Content-Length exceeds maxBytes, otherwise null.
 * Use before reading the body for routes that expect small JSON payloads.
 */
export function checkRequestBodySize(
  request: Request,
  maxBytes: number = MAX_BODY_BYTES
): NextResponse | null {
  const contentLength = request.headers.get("content-length");
  if (contentLength === null) return null; // no header, let the route handle it
  const n = parseInt(contentLength, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > maxBytes) {
    return NextResponse.json(
      { error: "Request body too large" },
      { status: 413 }
    );
  }
  return null;
}
