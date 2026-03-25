# Broadcast vs Hunts Map Settings Comparison

## Map initialization

| Setting | Hunts page | Broadcast page |
|---------|------------|----------------|
| **Style** | `mapbox://styles/mapbox/streets-v12` | `mapbox://styles/mapbox/streets-v12` ✓ |
| **Initial center** | `[8.5, 9.5]` (Nigeria) | Waypoint-based or `[8.5, 9.5]` |
| **Initial zoom** | 5 | 16 |
| **Travel zoom** | 14 (when following avatar) | 16 (DEFAULT_ZOOM) |
| **Plane zoom** | 6.8 | 6.8 ✓ |
| **maxBounds** | `[[2.69, 4.27], [14.68, 13.9]]` | Same ✓ |
| **interactive** | false | false ✓ |

## Avatar marker

| Setting | Hunts page | Broadcast page |
|---------|------------|----------------|
| **Element size** | 40×40px (avatar) | 44×44px (container), 40×40px (avatar) |
| **Anchor** | Default (center) | Default (center) ✓ |
| **Position source** | Local travel tick (interpolated) | Shared simulation + DB re-sync |

## Route line

| Setting | Hunts page | Broadcast page |
|---------|------------|----------------|
| **line-width** | 4 | 4 (route), 3 (trail) |
| **line-join/cap** | round | round ✓ |
| **Coordinates** | Same (from DB sync) | Same ✓ |

## Root cause of avatar offset (fixed)

The broadcast simulation was seeded once from the DB position when travel started, then ran independently. The hunts page syncs position to the DB every 1500ms, but the broadcast never re-synced. Over time this caused drift (avatar appearing meters off the path).

**Fix:** Re-sync the broadcast simulation from the DB position every ~1.5 seconds so it stays aligned with the hunts page.
