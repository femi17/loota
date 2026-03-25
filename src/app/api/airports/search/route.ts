import { NextResponse } from "next/server";
import { rateLimitByIp } from "@/lib/rate-limit-by-ip";

type Feature = {
  id: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
};

function normalizeQuery(q: string) {
  const cleaned = q
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .toLowerCase();
  // "Ibadan Airport" -> "ibadan"
  const withoutAirport = cleaned.replace(/\bairport\b/g, "").replace(/\s+/g, " ").trim();
  return withoutAirport || cleaned;
}

export async function GET(req: Request) {
  const rateLimitRes = await rateLimitByIp(req, {
    prefix: "airports:search",
    maxRequests: 40,
    windowMs: 60_000,
  });
  if (rateLimitRes) return rateLimitRes;

  const { searchParams } = new URL(req.url);
  const qRaw = (searchParams.get("q") || "").trim();
  const limitRaw = Number(searchParams.get("limit"));
  const limit = Math.min(10, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 8));

  if (!qRaw) return NextResponse.json({ features: [] });

  const q = normalizeQuery(qRaw);

  // Use Nominatim for forward-searching airports (more reliable than Mapbox POIs here).
  // NOTE: For production, consider hosting your own instance or using a paid geocoder.
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", qRaw); // keep the user's full query
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("countrycodes", "ng");
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "loota-demo (airport search)" },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json({ features: [] });
  }

  const rows: any[] = (await res.json().catch(() => [])) as any[];

  const feats: Feature[] = rows
    .filter((r) => {
      const cls = String(r?.class || "");
      const type = String(r?.type || "");
      const name = String(r?.display_name || "").toLowerCase();
      const matchesAirportWord = name.includes("airport") || q.includes("airport");
      // Prefer real aeroway aerodromes, but allow airport word matches too.
      return (cls === "aeroway" && type === "aerodrome") || matchesAirportWord;
    })
    .map((r) => {
      const lat = Number(r?.lat);
      const lng = Number(r?.lon);
      const place_name = String(r?.display_name || "").trim();
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !place_name) return null;
      const id = `nominatim.${String(r?.place_id || place_name)}`;
      return { id, place_name, center: [lng, lat] as [number, number] };
    })
    .filter(Boolean) as Feature[];

  return NextResponse.json({ features: feats });
}

