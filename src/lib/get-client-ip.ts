/**
 * Get the client IP from the incoming request.
 * Checks common headers set by proxies and load balancers; use for geolocation lookup, logging, etc.
 */
export function getClientIp(request: Request): string | null {
  const headers = request.headers;

  // x-forwarded-for can be "client, proxy1, proxy2" — client is first
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();

  // Cloudflare
  const cf = headers.get("cf-connecting-ip");
  if (cf?.trim()) return cf.trim();

  // Vercel
  const vercel = headers.get("x-vercel-forwarded-for");
  if (vercel?.trim()) return vercel.trim();

  return null;
}
