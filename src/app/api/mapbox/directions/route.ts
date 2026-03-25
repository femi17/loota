import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server-auth";
import { checkMapboxRateLimit } from "@/lib/rate-limit-mapbox";

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
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

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
  /** Live traffic + optional alternate routes (Mapbox driving-traffic only; ignored for walk/cycle). */
  const wantTraffic =
    searchParams.get("traffic") === "1" || searchParams.get("traffic") === "true";
  const wantAlternatives =
    searchParams.get("alternatives") === "1" ||
    searchParams.get("alternatives") === "true";

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

  const mapboxProfile =
    safeProfile === "driving" && wantTraffic ? "driving-traffic" : safeProfile;

  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/${mapboxProfile}/${fromLng},${fromLat};${toLng},${toLat}`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("steps", "false");
  // Exclude ferries so avatars stay on land — avoid routing over water in creek/river areas.
  url.searchParams.set("exclude", "ferry");
  if (safeProfile === "driving" && wantAlternatives) {
    url.searchParams.set("alternatives", "true");
  }

  const doFetch = async (signal: AbortSignal): Promise<Response> => {
    return fetch(url.toString(), {
      headers: { "User-Agent": "loota" },
      cache: "no-store",
      signal,
    });
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  let res: Response;
  try {
    res = await doFetch(controller.signal);
  } catch (err) {
    clearTimeout(timeoutId);
    // Retry once on connect/timeout errors (transient network issues)
    try {
      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(() => retryController.abort(), 30_000);
      res = await doFetch(retryController.signal);
      clearTimeout(retryTimeoutId);
    } catch (retryErr) {
      const message =
        retryErr instanceof Error && retryErr.name === "AbortError"
          ? "Directions request timed out"
          : "Directions service unavailable";
      return NextResponse.json({ error: message }, { status: 504 });
    }
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    return NextResponse.json(
      { error: "Mapbox directions failed" },
      { status: 502 },
    );
  }

  type MbRoute = {
    geometry?: { coordinates?: unknown };
    distance?: number;
    duration?: number;
    duration_typical?: number;
  };

  let json: { routes?: MbRoute[] };
  try {
    json = await res.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid response from directions service" },
      { status: 502 },
    );
  }

  const routes = Array.isArray(json?.routes) ? json.routes : [];
  const route = routes[0];
  const coords = route?.geometry?.coordinates;

  if (!Array.isArray(coords) || coords.length < 2) {
    return NextResponse.json(
      { error: "No route found" },
      { status: 404 },
    );
  }

  const basePayload = {
    distanceMeters: route?.distance ?? null,
    durationSeconds: route?.duration ?? null,
    coordinates: coords as number[][],
  };

  const extendedDriving =
    safeProfile === "driving" && (wantTraffic || wantAlternatives);

  if (!extendedDriving) {
    return NextResponse.json(basePayload);
  }

  const typical = Number(route?.duration_typical);
  const currentDur = Number(route?.duration);
  const durationTypicalSeconds = Number.isFinite(typical) ? typical : null;
  let trafficDelaySeconds: number | null = null;
  if (
    Number.isFinite(typical) &&
    Number.isFinite(currentDur) &&
    currentDur > typical
  ) {
    trafficDelaySeconds = Math.round(currentDur - typical);
  }

  const alternateRoutes: Array<{
    distanceMeters: number | null;
    durationSeconds: number | null;
    coordinates: number[][];
  }> = [];

  if (wantAlternatives && routes.length > 1) {
    for (let i = 1; i < routes.length; i++) {
      const r = routes[i];
      const ac = r?.geometry?.coordinates;
      if (!Array.isArray(ac) || ac.length < 2) continue;
      alternateRoutes.push({
        distanceMeters: r?.distance ?? null,
        durationSeconds: r?.duration ?? null,
        coordinates: ac as number[][],
      });
    }
  }

  return NextResponse.json({
    ...basePayload,
    durationTypicalSeconds,
    trafficDelaySeconds,
    ...(alternateRoutes.length > 0 ? { alternateRoutes } : {}),
  });
}

