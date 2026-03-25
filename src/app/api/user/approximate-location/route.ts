import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server-auth";
import { getClientIp } from "@/lib/get-client-ip";
import { rateLimitByIp } from "@/lib/rate-limit-by-ip";

/** Lagos – visible fallback so the map moves from default Nigeria center (8.5, 9.5) when on localhost or lookup fails */
const FALLBACK_LNG = 3.3792;
const FALLBACK_LAT = 6.5244;

/**
 * GET /api/user/approximate-location
 * Returns approximate { lng, lat } from the client's IP (fallback when HTML5 geolocation fails).
 * Uses ip-api.com; on localhost or failure returns Lagos so the map visibly updates.
 * Authenticated only (used by app map fallback). Rate limited.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const rateLimitRes = await rateLimitByIp(request, {
    prefix: "user:approximate-location",
    maxRequests: 30,
    windowMs: 60_000,
  });
  if (rateLimitRes) return rateLimitRes;

  const ip = getClientIp(request);
  if (!ip || ip === "127.0.0.1" || ip === "::1") {
    return NextResponse.json({ lng: FALLBACK_LNG, lat: FALLBACK_LAT, approximate: true });
  }

  try {
    const url = `https://ipapi.co/${encodeURIComponent(ip)}/json/`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as { latitude?: number; longitude?: number };
    if (Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) {
      return NextResponse.json({
        lng: Number(data.longitude),
        lat: Number(data.latitude),
        approximate: true,
      });
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ lng: FALLBACK_LNG, lat: FALLBACK_LAT, approximate: true });
}
