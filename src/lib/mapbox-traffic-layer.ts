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

function findFirstSymbolLayerId(map: MinimalMap): string | undefined {
  const layers = map.getStyle()?.layers;
  if (!layers) return undefined;
  for (const layer of layers) {
    if (layer.type === "symbol") return layer.id;
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
  } catch {
    return;
  }

  const beforeId = findFirstSymbolLayerId(map);

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
      "line-opacity": 0.85,
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
          "#2E7D32",
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
  } catch {
    /* style race or duplicate */
  }
}
