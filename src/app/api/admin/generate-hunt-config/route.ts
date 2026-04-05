import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAdmin } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { getLgasForState } from "@/lib/nigeria-lgas";
import { buildRotatedQuestionCategories } from "@/lib/hunt-quiz-categories";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

const MAPBOX_TOKEN =
  process.env.MAPBOX_SECRET_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

/** All 36 Nigerian states + FCT Abuja (37 options). Use for AI to pick hunt location. */
const NIGERIAN_STATES_AND_FCT = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
  "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe", "Imo", "Jigawa",
  "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger",
  "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
  "Abuja",
] as const;

/** Nigeria bounds for validation. Mapbox returns center as [longitude, latitude]. */
const NIGERIA_BBOX = { minLng: 2.69, minLat: 4.27, maxLng: 14.68, maxLat: 13.9 };

/**
 * Pick n LGAs without repeating until every LGA has been used once (then cycle in order).
 * When `first` is set and exists in the list, it is always waypoint 0 (home LGA).
 */
function pickDistinctLgas(lgas: string[], n: number, first: string | null | undefined): string[] {
  if (lgas.length === 0 || n <= 0) return [];
  const uniq = [...new Set(lgas)];
  for (let i = uniq.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniq[i], uniq[j]] = [uniq[j], uniq[i]];
  }
  if (first && uniq.includes(first)) {
    uniq.splice(uniq.indexOf(first), 1);
    uniq.unshift(first);
  }
  if (n <= uniq.length) {
    return uniq.slice(0, n);
  }
  const out: string[] = [];
  let idx = 0;
  while (out.length < n) {
    out.push(uniq[idx % uniq.length]!);
    idx++;
  }
  return out;
}

/** Human waypoint label: place + LGA + state so players see where they are. */
function buildWaypointLabel(
  result: MapboxGeocodeResult,
  expectedLga: string | null,
  singleState: string | null,
): string {
  const rawName = (result.place_name || "").trim();
  const placeFirst =
    (result.placeText && result.placeText.trim()) ||
    (rawName.includes(",") ? rawName.split(",")[0]!.trim() : rawName) ||
    "Checkpoint";
  if (singleState && expectedLga) {
    return `${placeFirst} · ${expectedLga}, ${singleState}`;
  }
  if (singleState) {
    return `${placeFirst} · ${singleState}`;
  }
  return rawName || placeFirst;
}

function isInNigeria(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= NIGERIA_BBOX.minLng &&
    lng <= NIGERIA_BBOX.maxLng &&
    lat >= NIGERIA_BBOX.minLat &&
    lat <= NIGERIA_BBOX.maxLat
  );
}

/** Mapbox geocode result with context for state/LGA validation. */
type MapboxGeocodeResult = {
  lng: number;
  lat: number;
  place_name: string;
  /** State/region from Mapbox context (e.g. "Lagos") */
  regionText?: string;
  /** District from Mapbox context (often LGA-level in Nigeria) */
  districtText?: string;
  /** Place name from Mapbox context */
  placeText?: string;
};

type MapboxGeocodeOptions = {
  /** Bias results toward this point (e.g. verified LGA center). */
  proximity?: { lng: number; lat: number };
};

/** Resolve a place query to Mapbox coordinates and display name (Nigeria). Returns null if no result or outside Nigeria. Includes context for state/LGA validation. */
async function mapboxGeocode(
  query: string,
  options?: MapboxGeocodeOptions,
): Promise<MapboxGeocodeResult | null> {
  if (!MAPBOX_TOKEN || !query.trim()) return null;
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json`,
  );
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("limit", "1");
  url.searchParams.set("country", "ng");
  url.searchParams.set("bbox", "2.69,4.27,14.68,13.90");
  if (options?.proximity) {
    url.searchParams.set(
      "proximity",
      `${options.proximity.lng},${options.proximity.lat}`,
    );
  }
  url.searchParams.set(
    "types",
    "address,poi,place,neighborhood,locality,region,district",
  );
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "loota-admin" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  const feature = json?.features?.[0];
  if (!feature?.center || !Array.isArray(feature.center)) return null;
  // Mapbox Geocoding API: center is [longitude, latitude]
  const [lng, lat] = feature.center as [number, number];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (!isInNigeria(lng, lat)) return null;

  // Extract context for state/LGA validation (context: [{ id: "region.xxx", text: "Lagos" }, ...])
  let regionText: string | undefined;
  let districtText: string | undefined;
  const context = feature.context as Array<{ id?: string; text?: string }> | undefined;
  if (Array.isArray(context)) {
    for (const c of context) {
      const id = (c?.id ?? "").toString();
      const text = (c?.text ?? "").toString().trim();
      if (!text) continue;
      if (id.startsWith("region.")) regionText = text;
      else if (id.startsWith("district.")) districtText = text;
    }
  }
  // Feature's own text is often the place name (e.g. "Ikeja")
  const placeText = (feature.text ?? "").toString().trim() || undefined;

  return {
    lng,
    lat,
    place_name: String(feature.place_name ?? query),
    regionText,
    districtText,
    placeText,
  };
}

/** Normalize state name for comparison (trim, lowercase, remove " State" suffix). */
function normalizeStateName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+state\s*$/i, "")
    .replace(/\s+/g, " ");
}

/** Reverse-geocode aggregate for authoritative “what LGA/state is this coordinate in?”. */
type ReverseAgg = {
  allTextLower: string;
  regionText?: string;
  districtText?: string;
  place_name: string;
};

async function mapboxReverseAggregate(lng: number, lat: number): Promise<ReverseAgg | null> {
  if (!MAPBOX_TOKEN || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`,
  );
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("limit", "5");
  url.searchParams.set(
    "types",
    "country,region,district,place,locality,neighborhood,address,poi",
  );
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "loota-admin-reverse" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  const features = json?.features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const texts: string[] = [];
  let regionText: string | undefined;
  let districtText: string | undefined;
  let place_name = "";
  for (const feature of features) {
    const pn = String(feature?.place_name ?? "").trim();
    if (pn) {
      texts.push(pn);
      if (!place_name) place_name = pn;
    }
    const tx = String(feature?.text ?? "").trim();
    if (tx) texts.push(tx);
    const context = feature?.context as Array<{ id?: string; text?: string }> | undefined;
    if (Array.isArray(context)) {
      for (const c of context) {
        const id = (c?.id ?? "").toString();
        const t = (c?.text ?? "").toString().trim();
        if (!t) continue;
        texts.push(t);
        if (id.startsWith("region.")) regionText = t;
        if (id.startsWith("district.")) districtText = t;
      }
    }
  }
  if (!place_name && texts[0]) place_name = texts[0]!;
  return {
    allTextLower: texts.join(" ").toLowerCase(),
    regionText,
    districtText,
    place_name: place_name || `${lat}, ${lng}`,
  };
}

function stateMatchesReverseRegion(expectedState: string, regionText: string | undefined): boolean {
  const exp = normalizeStateName(expectedState);
  const reg = normalizeStateName(regionText ?? "");
  if (!reg) return false;
  if (reg === exp) return true;
  if (exp === "abuja" && /federal capital|fct|abuja/i.test(reg)) return true;
  return false;
}

/** Whether reverse-geocode text reliably mentions the expected LGA (handles slashes, hyphens). */
function reverseTextMentionsLga(allTextLower: string, expectedLga: string): boolean {
  const raw = expectedLga.trim();
  if (!raw) return false;
  const segments = raw.split("/").map((s) => s.trim()).filter(Boolean);
  const variants = new Set<string>();
  for (const seg of segments.length > 0 ? segments : [raw]) {
    const n = normalizeStateName(seg).replace(/-/g, " ");
    variants.add(n.replace(/\s+/g, ""));
    variants.add(n);
    for (const token of n.split(/\s+/)) {
      if (token.length >= 4) variants.add(token);
    }
  }
  for (const v of variants) {
    if (v.length >= 3 && allTextLower.includes(v)) return true;
  }
  return false;
}

/**
 * Mapbox forward results can land in the wrong LGA (e.g. “Badagry” query → Lagos mainland).
 * Reverse-geocode the coordinates and require state + LGA to appear in the response.
 */
async function verifyCoordinatesWithMapboxReverse(
  lng: number,
  lat: number,
  expectedState: string,
  expectedLga: string | null,
): Promise<boolean> {
  const agg = await mapboxReverseAggregate(lng, lat);
  if (!agg) return false;
  if (!stateMatchesReverseRegion(expectedState, agg.regionText)) return false;
  if (!expectedLga?.trim()) return true;
  return reverseTextMentionsLga(agg.allTextLower, expectedLga);
}

/** Find a coordinate inside the LGA using seed geocodes + optional random jitter; all points reverse-verified. */
async function resolveCoordinatesInsideLga(
  expectedLga: string,
  expectedState: string,
  seenKeys: Set<string>,
  keyFn: (lat: number, lng: number) => string,
  preferredQueries: string[],
): Promise<MapboxGeocodeResult | null> {
  const seedQueries = [
    ...preferredQueries.filter(Boolean),
    `${expectedLga}, ${expectedState}, Nigeria`,
    `${expectedLga} Local Government Area, ${expectedState}, Nigeria`,
    `${expectedLga} LGA, ${expectedState}, Nigeria`,
  ];
  const uniqSeeds = [...new Set(seedQueries.map((q) => q.trim()).filter(Boolean))];

  let verifiedCenter: { lng: number; lat: number } | null = null;
  for (const q of uniqSeeds) {
    const r = await mapboxGeocode(q);
    if (!r || !isInNigeria(r.lng, r.lat)) continue;
    if (
      !(await verifyCoordinatesWithMapboxReverse(r.lng, r.lat, expectedState, expectedLga))
    ) {
      continue;
    }
    const k = keyFn(r.lat, r.lng);
    verifiedCenter = { lng: r.lng, lat: r.lat };
    if (!seenKeys.has(k)) {
      const agg = await mapboxReverseAggregate(r.lng, r.lat);
      return {
        ...r,
        place_name: agg?.place_name ?? r.place_name,
        regionText: agg?.regionText ?? r.regionText,
        districtText: agg?.districtText ?? r.districtText,
      };
    }
    for (let micro = 0; micro < 14; micro++) {
      const jlng = r.lng + (Math.random() - 0.5) * 0.004;
      const jlat = r.lat + (Math.random() - 0.5) * 0.004;
      if (!isInNigeria(jlng, jlat)) continue;
      if (
        !(await verifyCoordinatesWithMapboxReverse(jlng, jlat, expectedState, expectedLga))
      ) {
        continue;
      }
      const k2 = keyFn(jlat, jlng);
      if (seenKeys.has(k2)) continue;
      const agg = await mapboxReverseAggregate(jlng, jlat);
      return {
        lng: jlng,
        lat: jlat,
        place_name: agg?.place_name ?? r.place_name,
        regionText: agg?.regionText ?? r.regionText,
        districtText: agg?.districtText ?? r.districtText,
        placeText: undefined,
      };
    }
  }

  if (!verifiedCenter) return null;

  const proximity = verifiedCenter;
  for (const q of uniqSeeds) {
    const r = await mapboxGeocode(q, { proximity });
    if (!r || !isInNigeria(r.lng, r.lat)) continue;
    if (
      !(await verifyCoordinatesWithMapboxReverse(r.lng, r.lat, expectedState, expectedLga))
    ) {
      continue;
    }
    const k = keyFn(r.lat, r.lng);
    if (!seenKeys.has(k)) {
      const agg = await mapboxReverseAggregate(r.lng, r.lat);
      return {
        ...r,
        place_name: agg?.place_name ?? r.place_name,
        regionText: agg?.regionText ?? r.regionText,
        districtText: agg?.districtText ?? r.districtText,
      };
    }
  }

  const span = 0.055;
  for (let attempt = 0; attempt < 22; attempt++) {
    const lng = verifiedCenter.lng + (Math.random() - 0.5) * span;
    const lat = verifiedCenter.lat + (Math.random() - 0.5) * span;
    if (!isInNigeria(lng, lat)) continue;
    if (
      !(await verifyCoordinatesWithMapboxReverse(lng, lat, expectedState, expectedLga))
    ) {
      continue;
    }
    const k = keyFn(lat, lng);
    if (seenKeys.has(k)) continue;
    const agg = await mapboxReverseAggregate(lng, lat);
    return {
      lng,
      lat,
      place_name: agg?.place_name ?? `${expectedLga}, ${expectedState}`,
      regionText: agg?.regionText,
      districtText: agg?.districtText,
      placeText: undefined,
    };
  }

  return null;
}

/** Parse expected state from OpenAI-style query "Place, State, Nigeria". */
function parseStateFromQuery(query: string): string | null {
  const parts = query.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[1] ?? null;
  return null;
}

/**
 * Ask OpenAI for specific place queries inside each selected LGA.
 * Falls back to plain "LGA, State, Nigeria" outside this helper when parsing fails.
 */
async function generateLgaSpecificPlaceQueries(
  state: string,
  lgas: string[],
): Promise<string[] | null> {
  if (!lgas.length) return null;
  const prompt = `Generate one specific, interesting, mappable place query for EACH LGA below in ${state}, Nigeria.

LGAs:
${lgas.map((lga, i) => `${i + 1}. ${lga}`).join("\n")}

Rules:
- Return exactly ${lgas.length} place queries, same order as the LGAs.
- Each query must name a precise place INSIDE that row's LGA (not another LGA).
- Each query MUST include the LGA name in the string (middle segment), e.g. "Oshodi Bus Terminal, Oshodi-Isolo, ${state}, Nigeria".
- Use DIFFERENT venue types across rows (market, stadium, hospital, junction, mall, school, park, bus stop) — do not repeat the same venue name twice.
- Prefer real places Mapbox can geocode in Nigeria.
- The server reverse-geocodes every waypoint and discards coordinates that are not inside the named LGA—queries must name places that actually lie in that LGA.
- Avoid vague names like only "Market, Lagos, Nigeria" without LGA context.
- Format each as: "Place name, LGA name, ${state}, Nigeria"
- Keep each query short and geocoding-friendly.

Return JSON only:
{
  "queries": ["...", "..."]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You generate geocoding-friendly Nigerian place queries. Always return strict JSON only.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.95,
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as { queries?: unknown };
    if (!Array.isArray(parsed.queries)) return null;
    const out = parsed.queries
      .map((q) => String(q ?? "").trim())
      .filter(Boolean)
      .slice(0, lgas.length);
    return out.length === lgas.length ? out : null;
  } catch (error) {
    logger.warn("admin/generate-hunt-config", "generateLgaSpecificPlaceQueries failed", { err: error });
    return null;
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const {
      prize,
      prizePool,
      numberOfWinners,
      targetSpendPerUser,
      startDate,
      endDate,
      huntLocation,
      huntLga,
    } = await req.json();

    if (!prize || !prizePool || !numberOfWinners || !targetSpendPerUser) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const isNationwide =
      typeof huntLocation === "string" &&
      huntLocation.trim().toLowerCase() === "nationwide";
    const singleState =
      typeof huntLocation === "string" && huntLocation.trim() && !isNationwide
        ? huntLocation.trim()
        : null;

    // Calculate duration in hours
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    const prompt = `You are a game designer creating a treasure hunt. Analyze the following parameters and generate a complete hunt configuration:

Prize: ${prize}
Prize Pool (TOTAL amount to be shared among all winners): ₦${prizePool.toLocaleString()}
Number of Winners: ${numberOfWinners}
So per-winner amount = ₦${(prizePool / numberOfWinners).toLocaleString()}
Target Spend Per User: ₦${targetSpendPerUser.toLocaleString()}
Duration: ${durationHours.toFixed(1)} hours

Target Spend Per User drives everything. From it, determine in this order:

1. Number of hunts/locations (numberOfHunts): From how much a user can realistically spend on travel, rent, bus, constraints, etc., so total expected spend is close to the target. More target spend → more locations; less → fewer. Return this as numberOfHunts.

2. Number of keys to win: MUST equal numberOfHunts (one key per location). We will set keysToWin = numberOfHunts.

3. Question categories: OMIT from your JSON. The server assigns exactly four categories in rotation for every hunt: Math, General Knowledge, Guess the logo, Guess the flag (repeating across locations in that order).

4. Where the hunt takes place (locations drive spending: travel, rent, bus, plane, refuel, rest):
   - Host chose: ${singleState ? `Single state = "${singleState}". Locations will be chosen automatically from random Local Government Areas (LGAs) within ${singleState}. Return regionName as "${singleState}". Do NOT return startLocationQuery or waypointQueries—we will assign LGA-based locations server-side.` : "Nationwide. You may spread waypoints across different states. Pick a start state and location, then distribute waypoints across states. Return regionName as \"Nigeria\" or \"Nationwide\". Return startLocationQuery and waypointQueries: array of exactly numberOfHunts strings, each in \"Place, State, Nigeria\" format."}
   - You MUST use only these 37 options for state names: ${NIGERIAN_STATES_AND_FCT.join(", ")}.
   - CRITICAL for accurate map pins: Every location string will be geocoded by Mapbox. Use the exact format "Place, State, Nigeria" so Mapbox returns correct coordinates. Examples: "Ikeja, Lagos, Nigeria", "Victoria Island, Lagos, Nigeria", "Port Harcourt, Rivers, Nigeria". Do NOT use abbreviations or missing "Nigeria".
   - ${singleState ? "Return regionName only (no startLocationQuery or waypointQueries)." : "Return regionName, startLocationQuery (one string for the first location), and waypointQueries: array of exactly numberOfHunts strings, each in \"Place, State, Nigeria\" format. Do NOT return coordinates."}

5. All pricing for the hunt:
   - Refuel cost
   - Rest cost
   - Rejuvenate cost
   - Maintenance costs (bicycle, motorbike, car)
   - Rent costs (bicycle, motorbike, car, bus)
   - Bus fare
   - Plane fare
   The total expected spend per user should be close to the target spend per user.

6. Question difficulty distribution (easy/medium/hard percentages)

7. Briefing text explaining the hunt to players. Mention the TOTAL prize pool and that the more keys they collect, the higher their chances. Be clear if you mention per-winner amount. Mention the region (e.g. "This hunt takes place across Lagos." or "This nationwide hunt starts in Bayelsa and spans multiple states.").

Return your response as JSON:
{
  "numberOfHunts": number,
  "regionName": "string (one state from the 37, or 'Nigeria'/'Nationwide' for nationwide hunts)",
  "startLocationQuery": "string (Mapbox-searchable e.g. Yenagoa, Bayelsa, Nigeria or Ikeja, Lagos, Nigeria)",
  "waypointQueries": [ "string", "string", ... ],
  "pricing": {
    "refuelCost": number,
    "restCost": number,
    "rejuvenateCost": number,
    "maintenanceCost": {
      "bicycle": number,
      "motorbike": number,
      "car": number
    },
    "rentCost": {
      "bicycle": number,
      "motorbike": number,
      "car": number,
      "bus": number
    },
    "busFare": number,
    "planeFare": number
  },
  "difficultyDistribution": {
    "easy": number,
    "medium": number,
    "hard": number
  },
  "briefing": "text explaining the hunt"
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert game designer. Always respond with valid JSON only. Be strategic about pricing to match target spend.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const config = JSON.parse(content);
    // Target spend → numberOfHunts → keysToWin; categories must match
    const n = Math.max(1, Number(config.numberOfHunts) || 1);
    config.numberOfHunts = n;
    config.keysToWin = n;
    config.questionCategories = buildRotatedQuestionCategories(n);

    // When single state: pick LGAs (use huntLga for first if provided), then one location per LGA
    const chosenLga = typeof huntLga === "string" && huntLga.trim() ? huntLga.trim() : null;
    let startQuery =
      typeof config.startLocationQuery === "string"
        ? config.startLocationQuery.trim()
        : "";
    let waypointQueries: string[] = Array.isArray(config.waypointQueries)
      ? config.waypointQueries.slice(0, n).map((q: unknown) => String(q ?? "").trim())
      : [];

    let selectedLgasForWaypoints: string[] = [];
    if (singleState && n > 0) {
      const lgas = getLgasForState(singleState);
      if (lgas.length > 0) {
        const selectedLgas: string[] = pickDistinctLgas(lgas, n, chosenLga && lgas.includes(chosenLga) ? chosenLga : null);
        selectedLgasForWaypoints = selectedLgas;
        // Ask OpenAI for specific places inside each selected LGA (not just LGA centroids).
        const specificQueries = await generateLgaSpecificPlaceQueries(singleState, selectedLgas);
        waypointQueries = specificQueries ?? selectedLgas.map((lga) => `${lga}, ${singleState}, Nigeria`);
        startQuery = waypointQueries[0] ?? startQuery;
      }
    }

    const defaultStart = { lng: 3.3792, lat: 6.5244 };
    if (MAPBOX_TOKEN && startQuery) {
      const startResult = await mapboxGeocode(startQuery);
      config.startLocation = startResult
        ? { lng: startResult.lng, lat: startResult.lat }
        : defaultStart;
    } else {
      config.startLocation = defaultStart;
    }

    const waypoints: { label: string; lng: number; lat: number }[] = [];
    const MAX_RETRIES = 4;
    /** Key for dedup: same (lat,lng) rounded to 5 decimals = same waypoint */
    const waypointKey = (lat: number, lng: number) => `${Number(lat.toFixed(5))},${Number(lng.toFixed(5))}`;
    const seenKeys = new Set<string>();

    for (let i = 0; i < n; i++) {
      const expectedState = singleState ?? parseStateFromQuery(waypointQueries[i] ?? "") ?? "";
      const expectedLga = singleState ? (selectedLgasForWaypoints[i] ?? (i === 0 ? chosenLga : null)) : null;
      let result: MapboxGeocodeResult | null = null;

      const stateForLga =
        (expectedState && expectedState.trim()) || (singleState && singleState.trim()) || "";
      if (singleState && expectedLga && stateForLga) {
        const preferred: string[] = [];
        const primary = waypointQueries[i];
        if (primary) preferred.push(primary);
        const lgas = getLgasForState(singleState);
        if (lgas.length > 0) {
          const others = lgas.filter((lga) => primary !== `${lga}, ${singleState}, Nigeria`);
          const shuffledOthers = [...others];
          for (let si = shuffledOthers.length - 1; si > 0; si--) {
            const j = Math.floor(Math.random() * (si + 1));
            [shuffledOthers[si], shuffledOthers[j]] = [shuffledOthers[j]!, shuffledOthers[si]!];
          }
          shuffledOthers
            .slice(0, Math.min(MAX_RETRIES + 3, shuffledOthers.length))
            .forEach((lga) => preferred.push(`${lga}, ${singleState}, Nigeria`));
        }
        result = await resolveCoordinatesInsideLga(
          expectedLga,
          stateForLga,
          seenKeys,
          waypointKey,
          preferred,
        );
      } else {
        const queriesToTry: string[] = [];
        if (singleState) {
          const lgas = getLgasForState(singleState);
          if (lgas.length > 0) {
            const primary = waypointQueries[i];
            if (primary) queriesToTry.push(primary);
            queriesToTry.push(`${singleState}, Nigeria`);
          } else {
            queriesToTry.push(`${singleState}, Nigeria`);
          }
        } else {
          const primary = waypointQueries[i];
          if (primary) queriesToTry.push(primary);
          if (expectedState) queriesToTry.push(`${expectedState}, Nigeria`);
          if (config.regionName) queriesToTry.push(`${String(config.regionName).trim()}, Nigeria`);
        }

        for (let attempt = 0; attempt < Math.min(MAX_RETRIES, Math.max(1, queriesToTry.length)); attempt++) {
          const query = queriesToTry[attempt] ?? queriesToTry[0] ?? "";
          if (!query) continue;
          result = await mapboxGeocode(query);
          if (!result || !isInNigeria(result.lng, result.lat)) {
            result = null;
            continue;
          }
          if (
            expectedState &&
            !(await verifyCoordinatesWithMapboxReverse(
              result.lng,
              result.lat,
              expectedState,
              expectedLga,
            ))
          ) {
            result = null;
            continue;
          }
          if (seenKeys.has(waypointKey(result.lat, result.lng))) {
            result = null;
            continue;
          }
          break;
        }
      }

      if (result && isInNigeria(result.lng, result.lat)) {
        const key = waypointKey(result.lat, result.lng);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          waypoints.push({
            label: buildWaypointLabel(result, expectedLga, singleState),
            lng: result.lng,
            lat: result.lat,
          });
        }
      } else if (singleState && expectedLga) {
        logger.warn("admin/generate-hunt-config", "No Mapbox-verified point inside LGA (waypoint skipped)", {
          index: i,
          expectedLga,
          expectedState: stateForLga,
        });
      } else {
        const stateFallback = (singleState || expectedState || config.regionName)?.trim();
        const fallbackQuery = stateFallback ? `${stateFallback}, Nigeria` : "Lagos, Nigeria";
        const fallback = MAPBOX_TOKEN ? await mapboxGeocode(fallbackQuery) : null;
        const fallbackOk =
          fallback &&
          isInNigeria(fallback.lng, fallback.lat) &&
          (!stateFallback ||
            (await verifyCoordinatesWithMapboxReverse(
              fallback.lng,
              fallback.lat,
              stateFallback,
              null,
            )));
        if (fallbackOk) {
          const key = waypointKey(fallback.lat, fallback.lng);
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            waypoints.push({
              label: buildWaypointLabel(fallback, expectedLga, singleState),
              lng: fallback.lng,
              lat: fallback.lat,
            });
          }
        } else {
          const lastValid = waypoints.length > 0 ? waypoints[waypoints.length - 1]! : config.startLocation ?? defaultStart;
          const jitterLng = lastValid.lng + (waypoints.length * 0.01);
          const jitterLat = lastValid.lat + (waypoints.length * 0.005);
          const key = waypointKey(jitterLat, jitterLng);
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            waypoints.push({
              label:
                expectedLga && singleState
                  ? `Checkpoint · ${expectedLga}, ${singleState}`
                  : config.regionName || "Checkpoint",
              lng: jitterLng,
              lat: jitterLat,
            });
          }
        }
      }
    }

    // Final dedupe by (lat, lng) in case any duplicate slipped through
    const deduped: { label: string; lng: number; lat: number }[] = [];
    const dedupKeys = new Set<string>();
    for (const w of waypoints) {
      const key = waypointKey(w.lat, w.lng);
      if (!dedupKeys.has(key)) {
        dedupKeys.add(key);
        deduped.push(w);
      }
    }
    config.waypoints = deduped;
    config.keysToWin = deduped.length;
    config.numberOfHunts = deduped.length;

    // Align start with first waypoint so hunt start and first destination match (avoids e.g. start in Kano but waypoints in Lagos)
    if (config.waypoints.length > 0) {
      config.startLocation = { lng: config.waypoints[0].lng, lat: config.waypoints[0].lat };
    }

    if (!config.regionName || typeof config.regionName !== "string") {
      config.regionName = "Nigeria";
    }
    return NextResponse.json(config);
  } catch (error: unknown) {
    logger.error("admin/generate-hunt-config", "OpenAI error", { err: error });
    return NextResponse.json(
      { error: "Failed to generate hunt configuration" },
      { status: 500 }
    );
  }
}
