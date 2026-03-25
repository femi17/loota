import { NextResponse } from "next/server";
import { checkMapboxRateLimit } from "@/lib/rate-limit-mapbox";

/**
 * Public directions endpoint for broadcast viewers (no auth).
 * Same behaviour as /api/mapbox/directions but allows unauthenticated requests.
 * Rate limit per IP still applies.
 */
function getToken() {
  return (
    process.env.MAPBOX_SECRET_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
    ""
  );
}

function num(v: string | null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  const rateLimitRes = await checkMapboxRateLimit(req);
  if (rateLimitRes) return rateLimitRes;

  const token = getToken();
  if (!token) {
    return NextResponse.json(
      { error: "Missing Mapbox token" },
      { status: 400 },
    );
  }

  const { searchParams } = new URL(req.url);
  const fromLng = num(searchParams.get("fromLng"));
  const fromLat = num(searchParams.get("fromLat"));
  const toLng = num(searchParams.get("toLng"));
  const toLat = num(searchParams.get("toLat"));
  const profile =
    (searchParams.get("profile") || "walking").toLowerCase() || "walking";

  if (
    fromLng == null ||
    fromLat == null ||
    toLng == null ||
    toLat == null ||
    fromLng < -180 ||
    fromLng > 180 ||
    toLng < -180 ||
    toLng > 180 ||
    fromLat < -85 ||
    fromLat > 85 ||
    toLat < -85 ||
    toLat > 85
  ) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const safeProfile = ["walking", "driving", "cycling"].includes(profile)
    ? profile
    : "walking";

  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/${safeProfile}/${fromLng},${fromLat};${toLng},${toLat}`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("steps", "false");
  url.searchParams.set("exclude", "ferry");

  const doFetch = async (signal: AbortSignal): Promise<Response> => {
    return fetch(url.toString(), {
      headers: { "User-Agent": "loota" },
      cache: "no-store",
      signal,
    });
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await doFetch(controller.signal);
  } catch (err) {
    clearTimeout(timeoutId);
    try {
      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(() => retryController.abort(), 15_000);
      res = await doFetch(retryController.signal);
      clearTimeout(retryTimeoutId);
    } catch {
      return NextResponse.json(
        { error: "Directions service unavailable" },
        { status: 504 },
      );
    }
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    return NextResponse.json(
      { error: "Mapbox directions failed" },
      { status: 502 },
    );
  }

  let json: { routes?: Array<{ geometry?: { coordinates?: unknown }; distance?: number; duration?: number }> };
  try {
    json = await res.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid response from directions service" },
      { status: 502 },
    );
  }

  const route = json?.routes?.[0];
  const coords = route?.geometry?.coordinates;

  if (!Array.isArray(coords) || coords.length < 2) {
    return NextResponse.json(
      { error: "No route found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    distanceMeters: route?.distance ?? null,
    durationSeconds: route?.duration ?? null,
    coordinates: coords,
  });
}
