type MapLike = {
  getZoom?: () => number;
  getCenter?: () => { lng: number; lat: number };
  getBearing?: () => number;
  getPitch?: () => number;
};

export type HuntsMapCameraDbFields = {
  map_zoom?: number;
  map_width_px?: number;
  map_center_lng?: number;
  map_center_lat?: number;
  map_bearing?: number;
  map_pitch?: number;
};

let snapshot: HuntsMapCameraDbFields = {};

function toFiniteNumber(n: unknown): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

export function refreshHuntsMapCameraSnapshot(
  map: MapLike | null | undefined,
  mapContainer: HTMLElement | null | undefined
): void {
  if (!map) return;

  const zoom = toFiniteNumber(map.getZoom?.());
  const center = map.getCenter?.();
  const centerLng = toFiniteNumber(center?.lng);
  const centerLat = toFiniteNumber(center?.lat);
  const bearing = toFiniteNumber(map.getBearing?.());
  const pitch = toFiniteNumber(map.getPitch?.());

  const widthPx =
    mapContainer && typeof mapContainer.getBoundingClientRect === "function"
      ? Math.round(mapContainer.getBoundingClientRect().width)
      : undefined;
  const widthPxFinite = toFiniteNumber(widthPx);

  // Only overwrite keys we can compute; keeps last-known camera stable when Mapbox isn't ready.
  snapshot = {
    ...snapshot,
    ...(zoom !== undefined ? { map_zoom: zoom } : null),
    ...(widthPxFinite !== undefined ? { map_width_px: widthPxFinite } : null),
    ...(centerLng !== undefined ? { map_center_lng: centerLng } : null),
    ...(centerLat !== undefined ? { map_center_lat: centerLat } : null),
    ...(bearing !== undefined ? { map_bearing: bearing } : null),
    ...(pitch !== undefined ? { map_pitch: pitch } : null),
  };
}

export function getHuntsMapCameraDbFields(): HuntsMapCameraDbFields {
  return snapshot;
}

