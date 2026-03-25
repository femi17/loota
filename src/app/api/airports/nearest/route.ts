import { NextResponse } from "next/server";
import { rateLimitByIp } from "@/lib/rate-limit-by-ip";

type AirportHit = {
  place_name: string;
  center: [number, number]; // [lng, lat]
  distanceKm: number;
  iata?: string;
  icao?: string;
  source: "overpass";
  radiusMeters?: number;
  adminLevel?: number;
};

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const CACHE = new Map<string, { expiresAt: number; value: AirportHit }>();

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
] as const;

async function fetchOverpass(data: string) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20_000);
  try {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const url = new URL(endpoint);
        url.searchParams.set("data", data);
        const res = await fetch(url.toString(), {
          headers: {
            "User-Agent": "loota-demo (airport lookup)",
            Accept: "application/json",
          },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) continue;
        const json: any = await res.json().catch(() => null);
        if (json && Array.isArray(json.elements)) return json;
      } catch {
        // try next endpoint
      }
    }
    return null;
  } finally {
    clearTimeout(t);
  }
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function pickBest(from: { lat: number; lng: number }, items: AirportHit[]) {
  // Prefer nearby results, but bias toward real airports (name includes Airport or has codes).
  const scored = items.map((it) => {
    const name = it.place_name.toLowerCase();
    const hasCodes = Boolean(it.iata || it.icao);
    const looksLikeAirport = name.includes("airport");
    const penalty = looksLikeAirport ? 0 : 8; // deprioritize aerodromes that aren't labeled airport
    const bonus = hasCodes ? -4 : 0;
    return { it, score: it.distanceKm + penalty + bonus };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.it || null;
}

async function overpassNearest(from: { lat: number; lng: number }) {
  const radii = [80_000, 150_000, 250_000, 400_000, 700_000, 1_200_000];
  for (const radiusMeters of radii) {
    const data = [
      "[out:json][timeout:25];",
      "(",
      `node(around:${radiusMeters},${from.lat},${from.lng})[aeroway=aerodrome];`,
      `way(around:${radiusMeters},${from.lat},${from.lng})[aeroway=aerodrome];`,
      `relation(around:${radiusMeters},${from.lat},${from.lng})[aeroway=aerodrome];`,
      ");",
      "out center 50;",
    ].join("");

    const json: any = await fetchOverpass(data);
    if (!json) continue;
    const els: any[] = Array.isArray(json?.elements) ? json.elements : [];

    const hits: AirportHit[] = els
      .map((e) => {
        const lat = Number.isFinite(Number(e?.lat)) ? Number(e.lat) : Number(e?.center?.lat);
        const lng = Number.isFinite(Number(e?.lon)) ? Number(e.lon) : Number(e?.center?.lon);
        const nameRaw =
          (e?.tags?.name as string | undefined) ||
          (e?.tags?.["name:en"] as string | undefined) ||
          "";
        const place_name = String(nameRaw || "").trim();
        if (!place_name) return null;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const d = haversineKm(from, { lat, lng });
        return {
          place_name,
          center: [lng, lat] as [number, number],
          distanceKm: d,
          iata: e?.tags?.iata ? String(e.tags.iata) : undefined,
          icao: e?.tags?.icao ? String(e.tags.icao) : undefined,
          source: "overpass" as const,
          radiusMeters,
        };
      })
      .filter(Boolean) as AirportHit[];

    if (hits.length) {
      const best = pickBest(from, hits);
      if (best) return best;
    }
  }
  return null;
}

async function overpassInAdminArea(from: { lat: number; lng: number }) {
  // "State you are in" varies globally; admin levels differ by country.
  // We try common levels in order: 4 (state/province), 6 (county/region), 8 (district).
  const adminLevels = [4, 6, 8];
  for (const adminLevel of adminLevels) {
    const data = [
      "[out:json][timeout:25];",
      `is_in(${from.lat},${from.lng})->.a;`,
      `area.a["boundary"="administrative"]["admin_level"="${adminLevel}"]->.admin;`,
      "(",
      "node(area.admin)[aeroway=aerodrome];",
      "way(area.admin)[aeroway=aerodrome];",
      "relation(area.admin)[aeroway=aerodrome];",
      ");",
      "out center 50;",
    ].join("");

    const json: any = await fetchOverpass(data);
    if (!json) continue;
    const els: any[] = Array.isArray(json?.elements) ? json.elements : [];

    const hits: AirportHit[] = els
      .map((e) => {
        const lat = Number.isFinite(Number(e?.lat)) ? Number(e.lat) : Number(e?.center?.lat);
        const lng = Number.isFinite(Number(e?.lon)) ? Number(e.lon) : Number(e?.center?.lon);
        const nameRaw =
          (e?.tags?.name as string | undefined) ||
          (e?.tags?.["name:en"] as string | undefined) ||
          "";
        const place_name = String(nameRaw || "").trim();
        if (!place_name) return null;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const d = haversineKm(from, { lat, lng });
        return {
          place_name,
          center: [lng, lat] as [number, number],
          distanceKm: d,
          iata: e?.tags?.iata ? String(e.tags.iata) : undefined,
          icao: e?.tags?.icao ? String(e.tags.icao) : undefined,
          source: "overpass" as const,
          adminLevel,
        };
      })
      .filter(Boolean) as AirportHit[];

    if (hits.length) {
      const best = pickBest(from, hits);
      if (best) return best;
    }
  }
  return null;
}

export async function GET(req: Request) {
  const rateLimitRes = await rateLimitByIp(req, {
    prefix: "airports:nearest",
    maxRequests: 30,
    windowMs: 60_000,
  });
  if (rateLimitRes) return rateLimitRes;

  const { searchParams } = new URL(req.url);
  const lng = Number(searchParams.get("lng"));
  const lat = Number(searchParams.get("lat"));

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return NextResponse.json({ error: "Missing lng/lat" }, { status: 400 });
  }

  const key = `${Math.round(lat * 200) / 200},${Math.round(lng * 200) / 200}`; // ~0.005° buckets
  const cached = CACHE.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.value);
  }

  // First: "airport in the state you are in" (admin area containing the player).
  // Fallback: expanding-radius nearest search if the area query yields nothing.
  const best =
    (await overpassInAdminArea({ lat, lng })) || (await overpassNearest({ lat, lng }));
  if (!best) {
    return NextResponse.json({ error: "No airport found nearby" }, { status: 404 });
  }

  CACHE.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: best });
  return NextResponse.json(best);
}

