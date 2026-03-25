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

type CustomFeature = {
  id: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
  matches: (qLower: string) => boolean;
};

// Custom POIs for Lagos that Mapbox Geocoding may not return reliably.
// (This keeps demos + platform tasks consistent.)
const CUSTOM_LAGOS_FEATURES: CustomFeature[] = [
  {
    id: "custom.poi.isolo_general_hospital",
    place_name: "Isolo General Hospital, Oshodi-Isolo, Lagos, Nigeria",
    center: [3.31926, 6.52719],
    matches: (q) =>
      (q.includes("isolo") &&
        (q.includes("hospital") || q.includes("hosp") || q.includes("hos")) &&
        (q.includes("general") || q.includes("gen"))) ||
      q.includes("isolo general hospital") ||
      q.includes("general hospital isolo"),
  },
];

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
  const q = (searchParams.get("q") || "").trim();
  const limitRaw = searchParams.get("limit");
  const typesRaw = (searchParams.get("types") || "").trim();
  const proximityLng = searchParams.get("proximityLng");
  const proximityLat = searchParams.get("proximityLat");
  const countryRaw = (searchParams.get("country") || "").trim();

  if (!q) {
    return NextResponse.json({ features: [] });
  }

  const limit = Math.min(
    10,
    Math.max(1, Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : 5),
  );

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      q,
    )}.json`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("limit", String(limit));
  // Limit search to Nigeria for now (requested). Can be overridden by passing ?country=...
  url.searchParams.set("country", countryRaw || "ng");
  // Nigeria bounding box (approx): [minLng, minLat, maxLng, maxLat]
  url.searchParams.set("bbox", "2.69,4.27,14.68,13.90");
  url.searchParams.set(
    "types",
    typesRaw || "address,poi,place,neighborhood,locality",
  );
  if (proximityLng && proximityLat) {
    url.searchParams.set("proximity", `${proximityLng},${proximityLat}`);
  }

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "loota" },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Mapbox geocoding failed" },
      { status: 502 },
    );
  }

  const json = await res.json();
  const features = Array.isArray(json?.features)
    ? json.features.map((f: any) => ({
        id: String(f.id ?? ""),
        place_name: String(f.place_name ?? ""),
        center: Array.isArray(f.center) ? f.center : null,
        bbox:
          Array.isArray(f.bbox) && f.bbox.length === 4
            ? ([
                Number(f.bbox[0]),
                Number(f.bbox[1]),
                Number(f.bbox[2]),
                Number(f.bbox[3]),
              ] as [number, number, number, number])
            : null,
      }))
    : [];

  const qLower = q.toLowerCase();
  const customMatches = CUSTOM_LAGOS_FEATURES.filter((f) => f.matches(qLower));

  // Prepend custom matches (dedupe by id)
  const merged = [
    ...customMatches.map((f) => ({
      id: f.id,
      place_name: f.place_name,
      center: f.center,
      bbox: null,
    })),
    ...features,
  ].filter((f, idx, arr) => {
    if (!f?.id) return false;
    return arr.findIndex((x) => x.id === f.id) === idx;
  });

  return NextResponse.json({ features: merged });
}

