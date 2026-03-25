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

export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const rateLimitRes = await checkMapboxRateLimit(req);
  if (rateLimitRes) return rateLimitRes;

  const token = getToken();
  if (!token) {
    return NextResponse.json({ error: "Missing Mapbox token" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const lng = Number(searchParams.get("lng"));
  const lat = Number(searchParams.get("lat"));
  const typesRaw = (searchParams.get("types") || "").trim();
  const limitRaw = searchParams.get("limit");

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return NextResponse.json({ features: [] });
  }

  const limit = Math.min(
    10,
    Math.max(1, Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : 5),
  );

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("types", typesRaw || "place,region,country");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "loota" },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Mapbox reverse geocoding failed" }, { status: 502 });
  }

  const json = await res.json();
  const features = Array.isArray(json?.features)
    ? json.features.map((f: any) => ({
        id: String(f.id ?? ""),
        place_name: String(f.place_name ?? ""),
        center: Array.isArray(f.center) ? f.center : null,
      }))
    : [];

  return NextResponse.json({ features });
}

