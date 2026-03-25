# Travel & Broadcast Movement — Workable Logic

## Goal

- **Hunt (player):** Avatar moves smoothly along the route; one source of truth (in-memory + one DB write when travel starts).
- **Broadcast (viewer):** Same movement as hunt, same speed, no extra lag. No "simultaneous" competing updates.

---

## 1. Single formula (both hunt and broadcast)

```
position_at_time(route, startedAtMs, durationMs) → { lng, lat }
  • If now < startedAtMs  → return route[0]
  • If now > startedAtMs + durationMs → return route[last]
  • Else: progress = (now - startedAtMs) / durationMs  (clamp 0..1)
          → interpolate along route by distance (cumKm, targetKm, segment lerp)
          → return { lng, lat }
```

- **Same formula, same inputs ⇒ same position.** Hunt and broadcast must use this and only this during travel.
- No "speed" difference: broadcast is not faster or slower; it uses the same `startedAtMs` and `durationMs` as the hunt.

---

## 2. Hunt (player device) — flow

```
[User taps Go]
    ↓
startTravelWithRoute(from, to, coords, modeId, etaSeconds)
    ↓
• durationMs = f(etaSeconds, modeId): walk 5 km/h, others use DEMO_SPEED; then / SIM_SPEEDUP
• travelRef = { coords, startedAt: Date.now(), durationMs, cumKm, totalKm, to, ... }
• isTravelingRef.current = true
• setIsTraveling(true)
    ↓
• DB upsert ONCE: player_positions { lng, lat (start), travel_started_at, travel_route_coords, travel_duration_ms }
  (so broadcast gets route + start + duration; no need to rely on 1500ms position sync for movement)
    ↓
[Every 250ms while isTraveling]
    ↓
  pos = position_at_time(tr.coords, tr.startedAt, tr.durationMs)
  setPlayerPos(pos)
  (optional: every 1500ms sync current pos to DB for other tabs / fallback)
    ↓
[On arrival]
  travelRef = null, setIsTraveling(false)
  DB: set lng, lat to destination; clear travel_started_at, travel_route_coords, travel_duration_ms
```

**Important:** Realtime subscription on hunt must **ignore** incoming position updates for self when `isTravelingRef.current === true`. Otherwise our own 1500ms sync would overwrite the smooth interpolated position and cause jitter or "slowness".

---

## 3. Broadcast (viewer device) — flow

```
[Load]
  Fetch player_positions for hunt_id → list of { player_id, lng, lat, travel_started_at, travel_route_coords, travel_duration_ms, ... }
    ↓
[Realtime] on player_positions UPDATE/INSERT for this hunt
  Merge into local state (players array).
  Rule: if this player is "traveling" (has route + startedAt + duration and now in [start, start+duration]),
        do NOT replace with payload.lng/lat; only update route/start/duration/keys/constraint/quiz.
  So: during travel, position is NEVER taken from DB; it is always computed from route + time.
    ↓
[Every frame, requestAnimationFrame]
  For each player:
    if traveling(route, startedAt, duration):
      pos = position_at_time(route, startedAt, duration)
    else:
      pos = { lng, lat } from state (from DB)
    marker.setLngLat(pos)
  (No setState in this loop — only read from refs/state and update DOM/map.)
```

**Why same speed as hunt:** Broadcast uses the same `startedAt` and `durationMs` that the hunt wrote to the DB. So `position_at_time` gives the same result at the same real time. No extra delay except the one-time realtime delivery of the "travel started" row.

---

## 4. Why it might have felt "slow" or wrong

| Problem | Cause | Fix in this logic |
|--------|--------|-------------------|
| Hunt avatar not moving (e.g. walk) | Wrong duration (e.g. 0 or driving speed for walk), or travel never started (no route) | Walk uses 5 km/h for duration; fallback route for walk if directions fail; duration always > 0. |
| Broadcast "slower" than hunt | Using 1500ms-synced lng/lat instead of interpolating from route | Broadcast never uses lng/lat during travel; only route + startedAt + duration. |
| Both feel slow | durationMs too large (e.g. wrong speed or SIM_SPEEDUP) | durationMs = f(etaSeconds, modeId) with correct speed per mode and SIM_SPEEDUP. |
| Jitter / overwriting | Realtime applying stale lng/lat during travel | Hunt: ignore self position in realtime when isTraveling. Broadcast: ignore position payload during travel; only update route/start/duration. |

---

## 5. Data flow (summary)

```
HUNT:
  User Go → travelRef + 1× DB write (travel_*) → 250ms tick → position_at_time(tr) → setPlayerPos → marker
  Realtime: ignore self position while isTraveling

BROADCAST:
  Realtime → merge route/start/duration (never overwrite with lng/lat during travel) → RAF → position_at_time(route, start, duration) → marker.setLngLat
```

No "simultaneous" competing source of position: during travel, **hunt** is the only writer (in memory + initial DB write); **broadcast** is read-only and only computes from the same formula and the same three inputs (route, startedAt, durationMs).

---

## 6. Implementation checklist (when implementing)

- [ ] **Shared:** One `positionAlongRoute(route, startedAtMs, durationMs)` used by broadcast (and optionally by hunt for consistency). Hunt can keep inline math if that’s the "perfect" version; broadcast must use the same formula.
- [ ] **Hunt:** Walk duration from 5 km/h; fallback route for walk when directions fail; realtime ignores self when isTraveling; 250ms tick uses travelRef only.
- [ ] **Broadcast:** Realtime merges but never uses payload lng/lat for a player who is traveling (has route + in time window); RAF only reads state/refs and calls position_at_time + setLngLat; no setState in RAF.
- [ ] **DB:** Hunt writes travel_started_at, travel_route_coords, travel_duration_ms once when travel starts; on arrival clears them and sets final lng/lat.

This is the full workable logic; implement from here without adding a second source of truth for position during travel.
