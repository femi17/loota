/**
 * Resolve map center / bounds for a hunt from admin-chosen state (hunt_location) or display region (region_name).
 * Never uses clue waypoints — broadcast frames the hunt area, then shows players where they actually are.
 */

export type RegionMapView = {
  center: { lng: number; lat: number };
  /** When set, fit the map to this box after load (state / nationwide). */
  fitBounds?: [[number, number], [number, number]];
  /** Fallback zoom if fitBounds is not used */
  zoom: number;
};

/** Nigeria bounds — same corners as broadcast map maxBounds */
export const NIGERIA_MAP_BOUNDS_SW_NE: [[number, number], [number, number]] = [
  [2.69, 4.27],
  [14.68, 13.9],
];

/** True when this view uses the full Nigeria bbox (not a single-state frame). */
export function regionMapViewIsWholeNigeria(rv: RegionMapView | null): boolean {
  if (!rv?.fitBounds) return false;
  const [[w1, s1], [e1, n1]] = rv.fitBounds;
  const [[w2, s2], [e2, n2]] = NIGERIA_MAP_BOUNDS_SW_NE;
  const eq = (a: number, b: number) => Math.abs(a - b) < 0.03;
  return eq(w1, w2) && eq(s1, s2) && eq(e1, e2) && eq(n1, n2);
}

const DEFAULT_CENTER = { lng: 8.5, lat: 9.5 };

function normRegionName(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\bstate\b/g, "")
    .replace(/\bfederal capital territory\b/g, "fct")
    .trim();
}

function isNationwideLabel(q: string): boolean {
  const t = q.toLowerCase().trim();
  return (
    t === "" ||
    t === "nationwide" ||
    t === "nation wide" ||
    t === "all nigeria" ||
    t === "whole nigeria" ||
    t === "nigeria" ||
    t === "ng"
  );
}

/**
 * Prefer hunt_location (state chosen at create); fall back to region_name.
 */
export function pickHuntRegionGeocodeQuery(
  huntLocation: string | null | undefined,
  regionName: string | null | undefined
): string | null {
  const h = String(huntLocation ?? "").trim();
  const r = String(regionName ?? "").trim();
  const q = h || r;
  if (!q) return null;
  if (isNationwideLabel(q)) return null;
  return q;
}

function nationwideView(): RegionMapView {
  const [[w, s], [e, n]] = NIGERIA_MAP_BOUNDS_SW_NE;
  return {
    center: { lng: (w + e) / 2, lat: (s + n) / 2 },
    fitBounds: NIGERIA_MAP_BOUNDS_SW_NE,
    zoom: 5.2,
  };
}

/**
 * Geocode a region label (client-side; requires logged-in session for /api/mapbox/geocode).
 */
export async function fetchRegionMapViewForQuery(query: string | null): Promise<RegionMapView> {
  if (query == null || typeof window === "undefined") {
    return nationwideView();
  }

  try {
    const url = new URL("/api/mapbox/geocode", window.location.origin);
    url.searchParams.set("q", query);
    url.searchParams.set("types", "region");
    url.searchParams.set("limit", "5");
    const res = await fetch(url.toString());
    const json = await res.json().catch(() => null);
    const target = normRegionName(query);
    const features = Array.isArray(json?.features) ? json.features : [];
    const best =
      features.find(
        (f: { bbox?: unknown; place_name?: string }) =>
          Array.isArray(f?.bbox) &&
          (f.bbox as number[]).length === 4 &&
          normRegionName(String(f?.place_name ?? "")).includes(target)
      ) ||
      features.find(
        (f: { bbox?: unknown }) => Array.isArray(f?.bbox) && (f.bbox as number[]).length === 4
      ) ||
      features.find(
        (f: { center?: unknown }) => Array.isArray(f?.center) && (f.center as number[]).length >= 2
      ) ||
      null;

    if (best?.bbox && Array.isArray(best.bbox) && best.bbox.length === 4) {
      const [minLng, minLat, maxLng, maxLat] = best.bbox.map((x: unknown) => Number(x));
      if (
        [minLng, minLat, maxLng, maxLat].every((n) => Number.isFinite(n)) &&
        maxLng > minLng &&
        maxLat > minLat
      ) {
        return {
          center: { lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 },
          fitBounds: [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          zoom: 6.5,
        };
      }
    }
    if (best?.center && Array.isArray(best.center) && best.center.length >= 2) {
      const lng = Number(best.center[0]);
      const lat = Number(best.center[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        return { center: { lng, lat }, zoom: 6.8 };
      }
    }
  } catch {
    /* use default */
  }

  return { center: { ...DEFAULT_CENTER }, zoom: 6 };
}

const viewCache = new Map<string, RegionMapView>();

export async function fetchRegionMapViewForHuntCached(
  huntId: string,
  huntLocation: string | null | undefined,
  regionName: string | null | undefined
): Promise<RegionMapView> {
  const q = pickHuntRegionGeocodeQuery(huntLocation, regionName);
  const key = `${huntId}:${q ?? "__nationwide__"}`;
  const hit = viewCache.get(key);
  if (hit) return hit;
  const view = await fetchRegionMapViewForQuery(q);
  viewCache.set(key, view);
  return view;
}
