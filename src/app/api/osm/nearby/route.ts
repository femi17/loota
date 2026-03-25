import { NextResponse } from "next/server";
import { rateLimitByIp } from "@/lib/rate-limit-by-ip";

type Kind = "fuel" | "rest" | "rejuvenate" | "bus_stop" | "hospital";

type Hit = {
  place_name: string;
  center: [number, number]; // [lng, lat]
  distanceKm: number;
  kind: Kind;
  radiusMeters: number;
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
] as const;

async function nominatimFallback(kind: Kind, lat: number, lng: number) {
  // Nominatim often has better coverage than Overpass POI tags in some areas.
  const q =
    kind === "fuel"
      ? "fuel station"
      : kind === "bus_stop"
        ? "bus stop"
        : kind === "hospital"
          ? "hospital"
          : "restaurant cafe park mall market";
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "1");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("addressdetails", "0");
  // keep within Nigeria since the map is clamped to NG
  url.searchParams.set("countrycodes", "ng");
  // IMPORTANT: lat/lon only biases; it does not strictly bound results.
  // Use a bounded viewbox so we don't return a POI hundreds of km away.
  const delta = 0.35; // ~39km at equator; good enough for our stop-action needs
  url.searchParams.set(
    "viewbox",
    `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`,
  );
  url.searchParams.set("bounded", "1");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "loota-demo (nearby stop fallback)" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const rows: any[] = (await res.json().catch(() => [])) as any[];
  const first = rows?.[0];
  if (!first) return null;
  const rLat = Number(first.lat);
  const rLng = Number(first.lon);
  if (!Number.isFinite(rLat) || !Number.isFinite(rLng)) return null;
  const place_name = String(first.display_name || "").trim() || nameForKind(kind);
  const distanceKm = haversineKm({ lat, lng }, { lat: rLat, lng: rLng });
  const REJUVENATE_SUGGEST_MAX_KM = 2.5 * 1.609344; // 2.5 miles
  if ((kind === "rest" || kind === "rejuvenate") && distanceKm > REJUVENATE_SUGGEST_MAX_KM) return null;
  return {
    place_name,
    center: [rLng, rLat] as [number, number],
    distanceKm,
    kind,
    radiusMeters: 0,
  } satisfies Hit;
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

async function fetchOverpass(data: string) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 18_000);
  try {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const url = new URL(endpoint);
        url.searchParams.set("data", data);
        const res = await fetch(url.toString(), {
          headers: {
            "User-Agent": "loota-demo (nearby stop lookup)",
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

function qForKind(kind: Kind, lat: number, lng: number, radiusMeters: number) {
  const around = `around:${radiusMeters},${lat},${lng}`;
  if (kind === "fuel") {
    return [
      "[out:json][timeout:25];(",
      `node(${around})[amenity=fuel];`,
      `way(${around})[amenity=fuel];`,
      `relation(${around})[amenity=fuel];`,
      ");out center 50;",
    ].join("");
  }
  if (kind === "bus_stop") {
    return [
      "[out:json][timeout:25];(",
      `node(${around})[highway=bus_stop];`,
      `node(${around})[public_transport=platform][bus=yes];`,
      `node(${around})[amenity=bus_station];`,
      `way(${around})[highway=bus_stop];`,
      `way(${around})[public_transport=platform][bus=yes];`,
      `relation(${around})[highway=bus_stop];`,
      `relation(${around})[public_transport=platform][bus=yes];`,
      ");out center 50;",
    ].join("");
  }
  if (kind === "hospital") {
    return [
      "[out:json][timeout:25];(",
      `node(${around})[amenity=hospital];`,
      `node(${around})[healthcare=hospital];`,
      `way(${around})[amenity=hospital];`,
      `way(${around})[healthcare=hospital];`,
      `relation(${around})[amenity=hospital];`,
      `relation(${around})[healthcare=hospital];`,
      ");out center 50;",
    ].join("");
  }

  // rest/rejuvenate: places you can relax — Park, Mall, House (guest house), Market, or fork-and-knife (cafe/restaurant/food)
  const tags = [
    "[leisure=park]",
    "[shop=mall]",
    "[building=mall]",
    "[tourism=guest_house]",
    "[amenity=marketplace]",
    "[building=marketplace]",
    "[amenity=cafe]",
    "[amenity=restaurant]",
    "[amenity=fast_food]",
    "[amenity=bar]",
    "[amenity=pub]",
    "[tourism=hotel]",
  ];
  const parts = tags
    .map(
      (t) =>
        `node(${around})${t};way(${around})${t};relation(${around})${t};`,
    )
    .join("");
  return ["[out:json][timeout:25];(", parts, ");out center 60;"].join("");
}

function nameForKind(kind: Kind) {
  if (kind === "fuel") return "Fuel station";
  if (kind === "rest") return "Relax stop";
  if (kind === "bus_stop") return "Bus stop";
  if (kind === "hospital") return "Hospital";
  return "Rejuvenate spot";
}

export async function GET(req: Request) {
  const rateLimitRes = await rateLimitByIp(req, {
    prefix: "osm:nearby",
    maxRequests: 40,
    windowMs: 60_000,
  });
  if (rateLimitRes) return rateLimitRes;

  try {
    const { searchParams } = new URL(req.url);
    const kindRaw = (searchParams.get("kind") || "").trim();
    const kind = (kindRaw || "rest") as Kind;
    const lng = Number(searchParams.get("lng"));
    const lat = Number(searchParams.get("lat"));

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return NextResponse.json({ error: "Missing lng/lat" }, { status: 400 });
    }
    if (!["fuel", "rest", "rejuvenate", "bus_stop", "hospital"].includes(kind)) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }

    // For rest/rejuvenate: suggest venues within 2.5 miles (~4.02 km). Search in steps up to ~4 km.
    const REJUVENATE_SUGGEST_MAX_KM = 2.5 * 1.609344;
    const isRestOrRejuvenate = kind === "rest" || kind === "rejuvenate";
    const radii = isRestOrRejuvenate
      ? [500, 1000, 2000, 3200, 4000]
      : [900, 1500, 2500, 4000, 6500, 12_000, 25_000, 50_000];

    for (const radiusMeters of radii) {
      try {
        const data = qForKind(kind, lat, lng, radiusMeters);
        const json: any = await fetchOverpass(data);
        const els: any[] = Array.isArray(json?.elements) ? json.elements : [];

        let hits: Hit[] = els
          .map((e) => {
            const eLat = Number.isFinite(Number(e?.lat)) ? Number(e.lat) : Number(e?.center?.lat);
            const eLng = Number.isFinite(Number(e?.lon)) ? Number(e.lon) : Number(e?.center?.lon);
            if (!Number.isFinite(eLat) || !Number.isFinite(eLng)) return null;

            const tagName =
              (e?.tags?.name as string | undefined) ||
              (e?.tags?.["name:en"] as string | undefined) ||
              "";
            const place_name = String(tagName || "").trim() || nameForKind(kind);
            const distanceKm = haversineKm({ lat, lng }, { lat: eLat, lng: eLng });
            return {
              place_name,
              center: [eLng, eLat] as [number, number],
              distanceKm,
              kind,
              radiusMeters,
            };
          })
          .filter(Boolean) as Hit[];

        if (isRestOrRejuvenate) {
          hits = hits.filter((h) => h.distanceKm <= REJUVENATE_SUGGEST_MAX_KM);
        }
        if (hits.length) {
          hits.sort((a, b) => a.distanceKm - b.distanceKm);
          return NextResponse.json(hits[0]);
        }
      } catch (e) {
        // Continue to next radius or fallback
        continue;
      }
    }

    try {
      const fallback = await nominatimFallback(kind, lat, lng);
      if (fallback) return NextResponse.json(fallback);
    } catch (e) {
      // Fallback failed, continue to error response
    }

    return NextResponse.json({ error: "No nearby stop found" }, { status: 404 });
  } catch (e: any) {
    // Catch any unexpected errors and return a proper JSON response
    return NextResponse.json(
      { error: "Failed to search for nearby stop. Please try again." },
      { status: 500 }
    );
  }
}

