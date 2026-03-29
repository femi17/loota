/**
 * Adds Mapbox Traffic v1 (live congestion on roads) above the base map, below symbol labels.
 * Requires the same Mapbox access token used by the map (set on mapboxgl.accessToken).
 * @see https://docs.mapbox.com/vector-tiles/reference/mapbox-traffic-v1/
 */

const TRAFFIC_SOURCE_ID = "mapbox-traffic-data";
const TRAFFIC_LAYER_ID = "loota-traffic-congestion";

type MinimalMap = {
  getLayer: (id: string) => unknown;
  getSource: (id: string) => unknown;
  getStyle: () => { layers?: Array<{ id: string; type: string }> } | undefined;
  addSource: (id: string, source: object) => void;
  addLayer: (layer: object, beforeId?: string) => void;
};

/**
 * Streets v12 lists many symbol layers before road paint finishes (oneway arrows, etc.).
 * Inserting traffic before the *first* symbol buried it under all roads — invisible.
 * Place traffic immediately before road text labels so it sits on painted roads but under labels.
 */
function findTrafficInsertBeforeLayerId(map: MinimalMap): string | undefined {
  const layers = map.getStyle()?.layers;
  if (!layers?.length) return undefined;
  const prefer = [
    "road-label",
    "road-intersection",
    "road-number-shield",
    "path-pedestrian-label",
    "waterway-label",
  ];
  for (const id of prefer) {
    if (layers.some((l) => l.id === id)) return id;
  }
  const roadSymbol = layers.find(
    (l) =>
      l.type === "symbol" &&
      /road|street|path|bridge|tunnel/i.test(l.id) &&
      !/oneway|arrow|shield-exit/i.test(l.id),
  );
  if (roadSymbol) return roadSymbol.id;
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (l.type === "symbol") return l.id;
  }
  return undefined;
}

export function addMapboxTrafficLayer(map: MinimalMap): void {
  if (map.getLayer(TRAFFIC_LAYER_ID)) return;

  try {
    if (!map.getSource(TRAFFIC_SOURCE_ID)) {
      map.addSource(TRAFFIC_SOURCE_ID, {
        type: "vector",
        url: "mapbox://mapbox.mapbox-traffic-v1",
      });
    }
  } catch (e) {
    console.warn("[mapbox-traffic] addSource failed (token/plan or network)", e);
    return;
  }

  const beforeId = findTrafficInsertBeforeLayerId(map);

  const layer = {
    id: TRAFFIC_LAYER_ID,
    type: "line" as const,
    source: TRAFFIC_SOURCE_ID,
    "source-layer": "traffic",
    minzoom: 4,
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      // Slightly lower base opacity so traffic reads as context, not a second “route”.
      "line-opacity": 0.72,
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4,
        0,
        6,
        0.8,
        10,
        2,
        14,
        4,
        18,
        7,
      ],
      // “low” = free-flowing traffic (Mapbox). Keep it a soft, light green so it doesn’t
      // compete with hunt routes (#16A34A / dashed preview) which are intentionally vivid.
      "line-color": [
        "case",
        ["==", ["get", "closed"], "yes"],
        "#616161",
        [
          "match",
          ["get", "congestion"],
          "severe",
          "#B71C1C",
          "heavy",
          "#EF6C00",
          "moderate",
          "#F9A825",
          "low",
          "#C8E6C9",
          "#9E9E9E",
        ],
      ],
    },
  };

  try {
    if (beforeId) {
      map.addLayer(layer, beforeId);
    } else {
      map.addLayer(layer);
    }
  } catch (e) {
    console.warn("[mapbox-traffic] addLayer failed", e);
  }
}
