import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server-auth";
import { checkMapboxRateLimit } from "@/lib/rate-limit-mapbox";

/**
 * Map Matching API: snap a route to the road network so it aligns with the map.
 * Used so the broadcast (and stored route) stays on the road across devices/screen sizes.
 */

const MAX_COORDINATES = 100; // Mapbox Map Matching GET limit

function getToken() {
  return (
    process.env.MAPBOX_SECRET_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
    ""
  );
}

/** Downsample to at most MAX_COORDINATES, keeping first, last, and evenly spaced in between. */
function downsample(coords: [number, number][]): [number, number][] {
  if (coords.length <= MAX_COORDINATES) return coords;
  const out: [number, number][] = [];
  out.push(coords[0]!);
  const n = coords.length;
  const step = (n - 1) / (MAX_COORDINATES - 1);
  for (let i = 1; i < MAX_COORDINATES - 1; i++) {
    const idx = Math.round(i * step);
    out.push(coords[Math.min(idx, n - 1)]!);
  }
  out.push(coords[n - 1]!);
  return out;
}

export async function POST(req: Request) {
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

  let body: { coordinates?: unknown; profile?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const raw = body?.coordinates;
  if (!Array.isArray(raw) || raw.length < 2) {
    return NextResponse.json(
      { error: "coordinates must be an array of [lng, lat] with at least 2 points" },
      { status: 400 },
    );
  }

  const coords: [number, number][] = [];
  for (let i = 0; i < raw.length; i++) {
    const pt = raw[i];
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (lng < -180 || lng > 180 || lat < -85 || lat > 85) continue;
    coords.push([lng, lat]);
  }
  if (coords.length < 2) {
    return NextResponse.json(
      { error: "Need at least 2 valid coordinates" },
      { status: 400 },
    );
  }

  const profile = (body?.profile || "driving").toLowerCase();
  const safeProfile = ["walking", "driving", "cycling"].includes(profile)
    ? profile
    : "driving";

  const toMatch = downsample(coords);
  const coordString = toMatch.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const url = new URL(
    `https://api.mapbox.com/matching/v5/mapbox/${safeProfile}/${coordString}.json`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { "User-Agent": "loota" },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Map matching request timed out"
        : "Map matching service unavailable";
    return NextResponse.json({ error: message }, { status: 504 });
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    return NextResponse.json(
      { error: "Map matching failed" },
      { status: 502 },
    );
  }

  let json: {
    code?: string;
    matchings?: Array<{ geometry?: { coordinates?: unknown } }>;
  };
  try {
    json = await res.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid response from map matching service" },
      { status: 502 },
    );
  }

  if (json?.code !== "Ok" || !Array.isArray(json?.matchings) || json.matchings.length === 0) {
    return NextResponse.json(
      { error: "No match found" },
      { status: 404 },
    );
  }

  const geometry = json.matchings[0]?.geometry?.coordinates;
  if (!Array.isArray(geometry) || geometry.length < 2) {
    return NextResponse.json(
      { error: "No geometry in match" },
      { status: 502 },
    );
  }

  const coordinates = geometry as [number, number][];
  return NextResponse.json({ coordinates });
}
