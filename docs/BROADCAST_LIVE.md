# Broadcast live avatar movement – implementation and fixes

## What is implemented

### Public broadcast (`/broadcast/[huntId]`)

- **Data**
  - Loads hunt + `player_positions` and `player_profiles` (avatars) via PostgREST.
  - **Supabase Realtime** (recommended): `postgres_changes` on `player_positions` for this `hunt_id` triggers a debounced full snapshot so Show all stays aligned with hunts as soon as rows update. Run **`database_realtime_broadcast.sql`** in Supabase and add `player_positions` to the `supabase_realtime` publication if events don’t arrive.
  - **Full snapshot poll** (`POLL_INTERVAL_MS`, ~2s fallback): positions, travel fields, quiz, `question_responses`, `hunt_player_actions`, moments.
  - **Roster poll** (`ROSTER_POLL_MS`, ~1s): cheap `select player_id` on `player_positions` for this hunt. When the set of IDs changes, runs a **full snapshot** so joiners show up quickly.

- **Map and markers**
  - Mapbox map; one marker per player (avatar + travel-mode badge).
  - Markers are created/removed when `players` changes; **position is driven by an animation tick**, not only by state.

- **Live movement**
  - When a player **starts travel**, the hunts page upserts `player_positions` with:
    - `travel_started_at`, `travel_route_coords`, `travel_duration_ms`
  - Broadcast reads those fields on the next **snapshot** and animates along the route.
  - An **animation tick** (requestAnimationFrame) interpolates each avatar along `travel_route_coords` over `travel_duration_ms` using `travel_started_at`, so avatars move smoothly along the route instead of jumping.
  - When travel ends, the hunts page clears those fields; broadcast then shows the final `lng`/`lat`.

- **Trails and bearing**
  - Movement trail (polyline) and marker rotation (bearing) are updated from the animated position.

### Admin broadcast (`/admin/broadcast`)

- **Launcher only** (after admin sign-in): pick an active hunt and open **`/broadcast/[huntId]`** (same tab or new tab for OBS).
- Legacy **`/admin/broadcast?huntId=<uuid>`** redirects to **`/broadcast/<uuid>`**.

### Hunts page (writer side)

- On **travel start**: upserts `player_positions` with `travel_started_at`, `travel_route_coords`, `travel_duration_ms`.
- **During travel**: every ~1.5s upserts `lng`/`lat` (and other fields) but does **not** overwrite travel fields, so the row keeps the route for the broadcast to animate.
- On **travel end**: upserts with `travel_started_at` / `travel_route_coords` / `travel_duration_ms` set to `null`.

---

## Supabase setup (Realtime)

For near-instant position updates, run **`database_realtime_broadcast.sql`** so `player_positions` is in the `supabase_realtime` publication. Without it, broadcast still works using the ~2s poll only.

---

## Access control

- **`/broadcast/[huntId]`** is protected in **`middleware.ts`**: you must be **signed in** and have a row in **`admin_profiles`** (same as other admin tools). OBS / browser sources need a one-time admin login so the session cookie is sent with requests.
