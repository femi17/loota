# Broadcast: Recorded Actions & Map (No Label Jitter)

## 1. Every user action is recorded

All display on the broadcast is driven by data stored when the user acts on the **hunts** page. Nothing is inferred only on the client.

| User action | Where it's recorded | Table(s) / fields |
|-------------|---------------------|-------------------|
| **Locator click** (start position) | After `setPlayerPos`, debounced save + heartbeat | `player_positions`: `lng`, `lat`, `player_name`, `travel_mode`, etc. |
| **Position (any update)** | Debounced 2s save; on key increase; heartbeat every 4s | `player_positions` upsert |
| **Travel: choose mode + Go / Board / Rent** | When travel starts (`startTravelWithRoute`) | `player_positions`: `travel_mode`, `travel_started_at`, `travel_route_coords`, `travel_duration_ms` |
| **While traveling** | Interval every 1.5s | `player_positions` upsert with current sync pos + same route/duration |
| **Travel ends (arrival)** | On arrival or travel end effect | `player_positions`: final `lng`/`lat`, `travel_started_at`/`travel_route_coords`/`travel_duration_ms` cleared |
| **Constraint (stop/refuel/relax) entered** | When `stopFlow` is set (constraint triggered) | `player_positions.constraint_state`; `hunt_player_actions` insert `constraint_entered` |
| **Constraint exited** | When `stopFlow` becomes null (paid/continued) | `player_positions.constraint_state` = null; `hunt_player_actions` insert `constraint_exited` |
| **At quiz (waypoint)** | When user is at waypoint and status opens | `player_positions.answering_question` = true; `hunt_player_actions` insert `quiz_started` |
| **Quiz question shown** | When get-question API returns question | `player_positions.current_question` = question text |
| **Quiz answer submitted** | validate-answer API | `question_responses` insert; `player_positions.answering_question` = false, `current_question` = null; `hunt_player_actions` insert `quiz_answered` |
| **Keys / leaderboard** | On quiz correct + DB trigger | `player_positions.keys` (via sync trigger from `question_responses`) |

So: **every action that affects what the audience sees is written to the database first.** Broadcast only reads from `player_positions`, `question_responses`, `hunt_player_actions`, and `hunts` (waypoints).

---

## 2. Broadcast map = same as hunt map; no label jitter

The broadcast map does **not** recompute positions or routes on the client. It uses the same data-driven approach as the hunts page:

- **Player list** comes only from `player_positions` (initial select + realtime).
- **Avatar position** on the map is either:
  - **Interpolated** along the **stored** `travel_route_coords` with `travel_started_at` and `travel_duration_ms` (same logic as hunts), or
  - **Static** `lng`/`lat` from the DB when not traveling.
- **Waypoint (quiz) pins** depend only on `hunt?.waypoints` — effect runs when `[mapReady, hunt?.waypoints]` change, **not** on every player move.
- **Constraint/stop pins** depend only on `constraintStopCentersKey` (derived from which players have a stop center) — effect runs when `[mapReady, constraintStopCentersKey]` change, **not** on every position update.
- **Route line (authoritative path)** is updated with `setData` **only when the route JSON actually changes** (`lastRouteCoordsJsonRef`), not on every realtime tick — avoids street label flicker.
- **Trail (breadcrumb)** is updated with `setData` only in the animation tick and **only when not interpolating** (so we don’t call `setData` every frame while the avatar moves along the route).
- **When viewing an individual (focus):** we do a **single** `flyTo` when the user selects that player, then the camera stays fixed. We do **not** continuously re-center the camera (no interval calling `easeTo`/`flyTo`). Repeated camera moves cause Mapbox to re-layout labels and jitter. The avatar still moves smoothly (marker position updates every frame via `setLngLat`); only the camera stops updating after the initial fly. To re-center, the user can switch back to “Show all” or focus another player.
- **Pan/zoom to focused player** runs only when `focusPlayerId` (or `mapReady`) changes (one-time), not on every position update.

**Smooth movement (no label jitter in show-all or individual):**
- **Trail (breadcrumb)**: We only add a point when the player has moved at least 15 m (`TRAIL_MIN_MOVE_KM`), and we only call `setData` on the trail source at most every 1.2 s per player (`TRAIL_SETDATA_INTERVAL_MS`). So Mapbox is not re-laying out on every realtime tick.
- **Status pills**: We only update the marker’s status pill DOM when the activity (quiz / stop / rest / refuel / sos) actually changes (`lastActivityRef`), not on every `players` update. That avoids DOM thrash and map repaint when only position changed.
- **Route line**: Still only updated when the route GeoJSON actually changes (`lastRouteCoordsJsonRef`).
- **Avatar position**: Only `marker.setLngLat()` every frame (no `setData`), same as hunts.

**Same logic as hunts (no flicker):**
- **Position during travel** is computed from `travel_started_at` + `travel_route_coords` + `travel_duration_ms` (same formula as hunts). We do **not** use realtime `lng`/`lat` updates while a player is traveling — we ignore those so the map doesn’t re-render on every 1.5s sync. We only apply realtime when something meaningful changes: new route (Go/Rent/Board), constraint, quiz, or keys.
- So: **user input is captured on the hunts page and stored (start position, travel mode, Go/Rent/Board → route + start time + duration; constraints; quiz). Broadcast reads that and replays using the same movement logic (interpolate along route).** No interaction on broadcast; it’s a read-only duplicate of the hunt.

So the broadcast map behaves like the hunts map: **one source of truth (DB), same movement rule (route + time), ignore position-only updates during travel, throttled setData (trail + route), no status-pill thrash (smooth labels in show-all and individual).**
