# Loota – Full Logic Audit (Travel, Stop, Tasks, Credits, Map)

**Date:** February 2025  
**Scope:** All in-app business logic verified for correctness and edge cases.

---

## 1. Travel logic ✅

**Where:** `src/app/hunts/page.tsx` (startTravelWithRoute, animation loop), `src/lib/travel-config.ts`, `src/app/hunts/constants.ts`.

**Verified:**
- **Progress:** `p = clamp((now - startedAt) / durationMs, 0, 1)`; `durationMs` is now guarded with `Math.max(1, tr.durationMs)` so division by zero cannot occur.
- **Position along route:** `targetKm = totalKm * p`; segment index `i` is clamped to `[1, cumKm.length - 1]`; `segKm` uses `|| 1e-9` to avoid division by zero; `localT` is clamped to [0,1]. Single-segment and zero-length routes are safe.
- **Arrival:** Arrival is when `p >= 0.999` or `haversineKm(nextPos, tr.to) <= ARRIVAL_RADIUS_KM`. Position is then set to `tr.to`, `player_positions` is upserted, and `arrivalActionRef` is run (quiz, bus→walk, plane disembark, hospital, consequence return).
- **Bus → final destination:** On arrival at bus stop, if `finalDestination` is set, travel is switched to walk and `startTravelWithRoute(tr.to, finalDest, walkRoute.coords, "walk", walkEta)` is called. Fallback uses direct segment and 5 km/h for ETA.
- **Plane:** Boarding (10 min) and disembarking (5 min) use real-time timers; `arrivalActionRef` runs after disembarking to open travel drawer at destination.
- **Duration:** `durationMs` is either `max(2500, etaSeconds*1000/SIM_SPEEDUP)` or `max(5000, totalKm/speedKmPerMs*0.35)`, so never zero.
- **Rejuvenate/refuel/rest intervals:** `nextRejuvenateAtKm`, `nextRefuelAtKm`, `nextRestAtKm`, `nextBusStopAtKm` are set at start; bus advances `nextBusStopAtKm` by `BUS_STOP_EVERY_KM` after each stop. Resumed travel after “Pay & continue” receives `rejuvenateBonusKm = REJUVENATE_KM_BONUS_AFTER_VENUE` (2 km) when applicable.

**Fix applied:** Guard `tr.durationMs` with `Math.max(1, tr.durationMs)` in the animation loop to avoid any possible division by zero.

---

## 2. Stop logic (rejuvenate, refuel, rest, bus stop) ✅

**Where:** `src/app/hunts/page.tsx` (triggerDetour, travel loop), `src/components/hunts/HuntsConstraintDrawerContent.tsx`, `src/app/hunts/constants.ts`.

**Verified:**
- **When stops trigger:** Walk/bicycle: `travelledKm >= nextRejuvenateAtKm`. Motorbike/car refuel: `travelledKm >= nextRefuelAtKm` (after low-fuel warning at `LOW_FUEL_WARN_PCT`). Motorbike/car rest: `travelledKm >= nextRestAtKm`. Bus: `travelledKm >= nextBusStopAtKm` then 18s pause (`BUS_STOP_SECONDS`).
- **triggerDetour:** Clears travel, sets `stopFlow` with status `"finding"`, then async finds nearby stop (OSM/Nominatim). For rejuvenate/rest: enforces `REJUVENATE_MAX_DISTANCE_KM` (2.5 mi), “ahead on route” check, and route distance ≤ `REJUVENATE_MAX_DISTANCE_M`. If no venue: “Rest here” in place with `REST_IN_PLACE_SECONDS` (5 min) and `STOP_SPEEDUP_REST_IN_PLACE`.
- **Pay & continue:** Constraint drawer pays via `deductCredits(cost)`, then calls `startTravelWithRoute(from, to, resumeCoords, modeId, eta, undefined, bonusKm)` with `bonusKm = REJUVENATE_KM_BONUS_AFTER_VENUE` when kind is rejuvenate/rest and not rest-in-place. Clears `stopFlow` and drawer.
- **Relaxing → ready_to_pay:** Effect uses `clock` and `stopFlow.startedAt`; when `elapsed >= realTotalMs` (actionSeconds/speedup), sets status to `"ready_to_pay"`. Rest-in-place uses `STOP_SPEEDUP_REST_IN_PLACE`, others use `STOP_SPEEDUP`.
- **Keep going / consequence:** “Continue anyway” sets `consequenceTriggerRef` (e.g. faint after 1.25 km or 0.25 km on second warning, out_of_fuel after 0.5 km). Travel resumes to final destination; consequence is applied in the travel loop when `consequenceTriggerRef` is set and distance is reached.
- **Bus stop timer:** `travelPause.totalMs = BUS_STOP_SECONDS * 1000` (18s); effect clears pause when `elapsed >= totalMs`.

---

## 3. Hospital & faint logic ✅

**Where:** `src/app/hunts/page.tsx` (faintPhase, isTravellingToHospital, hospitalStay, arrival at hospital), `src/components/hunts/HuntsHospitalDrawerContent.tsx`, `src/app/hunts/constants.ts`.

**Verified:**
- **Faint:** Consequence sets `faintPhase` (at, startedAt, ambulanceArrivalMs = 2 min). Ambulance animation runs; after 2 min, route to hospital starts and `travellingToHospitalRef` is set.
- **Arrival at hospital:** When `travellingToHospitalRef.current` and we’re in arrival block, we set `hospitalStay` (startedAt, durationMs = HOSPITAL_STAY_MINUTES*60*1000/STOP_SPEEDUP, costCoins = HOSPITAL_BILL + bikeFee). Bicycle recovery cost: owned vs rental from `bicycleFaintRef`.
- **Pay & leave:** Hospital drawer deducts `costCoins`, then `onAfterPayAndLeave` runs (clears stay, sets destination from `huntDestinationAfterHospitalRef`, opens travel drawer). Bicycle recovery state is cleared.

---

## 4. Credits & wallet ✅

**Where:** `src/app/hunts/page.tsx` (credits, deductCredits), `src/contexts/AuthContext.tsx`, `POST /api/hunt/deduct-credits`, `POST /api/inventory/purchase`, `POST /api/wallet/add-coins`.

**Verified:**
- **Sync:** `useEffect` syncs `profile?.credits` to local `credits` state when profile changes.
- **deductCredits(amount, huntId):** Calls `POST /api/hunt/deduct-credits` (atomic RPC `deduct_credits`); on success updates local `credits`, `updateCredits(newCredits)`, and `refreshProfile()`. Returns `newCredits` or `null`. Early return when `amount <= 0` returns current `credits` (defensive).
- **Usage:** Travel (rent, bus fare, plane fare), constraint (rejuvenate/refuel/rest), hospital (bill + bike recovery), garage (maintenance, tow), inventory (purchase). All use the same `deductCredits` and optional `hunt_id`.

---

## 5. Task / quiz logic ✅

**Where:** `src/app/hunts/utils.ts` (taskCategoryForStep, pickTask, normAnswer), `src/app/hunts/constants.ts` (TASK_BANK, TASK_CATEGORY_ORDER), `src/app/hunts/page.tsx` (public/unlock task state), API get-question & validate-answer.

**Verified:**
- **taskCategoryForStep(stepNumber):** `(max(1, floor(stepNumber)) - 1) % TASK_CATEGORY_ORDER.length` — correct rotation.
- **pickTask(category, seed, stepNumber, attempt):** Mulberry32 RNG with deterministic seed; index into `TASK_BANK[category]`; fallback when bank is empty.
- **normAnswer:** trim, toLowerCase, collapse spaces — used for client-side demo match; server uses OpenAI or exact/match for real hunts.
- **Arrival at waypoint:** `arrivedForChallenge` is true when within `ARRIVAL_RADIUS_KM` of current waypoint; status drawer shows quiz; validate flows through API when `activeHuntId` is set.

---

## 6. Map & location ✅

**Where:** `src/app/hunts/utils.ts` (haversineKm, bearingDeg, isLngLatInNigeria, parseWaypointCoords), `src/app/hunts/page.tsx` (playerPos, destination, routeCoords, markers), `src/app/hunts/mapMarkerFactories.ts`, `src/app/hunts/constants.ts` (NIGERIA_BBOX).

**Verified:**
- **haversineKm:** Standard formula; used for distance checks, progress, and OSM/Nominatim.
- **parseWaypointCoords:** Handles array, coordinates, lng/lat; validates with `isLngLatInNigeria`; tolerates lat/lng swap.
- **Waypoint index:** `waypointIndexAtPlayer` (useMemo) returns first waypoint index within `ARRIVAL_RADIUS_KM` of player; used to show status/quiz and lock travel when at a waypoint.
- **Stop location vs waypoint:** `stopLocationMatchesWaypoint` used so quiz destination and stop don’t double-open constraint drawer.

---

## 7. Vehicle wear, breakdown, garage ✅

**Where:** `src/app/hunts/page.tsx` (vehicleState, breakdownFlow, travel loop wear), `src/app/hunts/constants.ts` (VEHICLE_WEAR_PCT_PER_KM, MAINT_WARN_PCT, MAINT_COST, TOW_COST), `HuntsGarageDrawerContent`, `HuntsBreakdownDrawerContent`.

**Verified:**
- **Wear in travel:** Only when mode is owned bicycle/motorbike/car and status is `"ok"`. Delta km applied with speed/health/road factors; health drops; at 0% → status `broken_needs_tow`, `breakdownFlow` set, travel stopped, drawer “breakdown”.
- **Tow:** Deduct TOW_COST; vehicle enters “repairing” for REPAIR_WORLD_SECONDS (1h) with speedup.
- **Maintenance:** Cost from MAINT_COST; tasks from MAINTENANCE_TASKS; completion and “servicing” timing use MAINT_WORLD_SECONDS and MAINT_SPEEDUP.

---

## 8. API usage ✅

**Verified:**
- **Directions:** `GET /api/mapbox/directions` — coords length ≥ 2 enforced; returns coordinates, distance, duration. Client builds cumKm and totalKm; `startTravelWithRoute` bails if `coords.length < 2`.
- **OSM nearby:** `GET /api/osm/nearby` — kind (fuel, rest, rejuvenate, bus_stop, hospital); viewbox and countrycodes=ng; Nominatim fallback; rejuvenate/rest filtered by REJUVENATE_SUGGEST_MAX_KM.
- **Deduct credits:** Uses RPC `deduct_credits`; errors mapped to 400/403/401/500.
- **Purchase:** Uses RPC `purchase_travel_mode`; idempotency handled in route before/after RPC.

---

## 9. Edge cases covered

| Case | Handling |
|------|----------|
| Zero or negative `durationMs` | Clamp to ≥ 1 in progress calculation. |
| Route with 2 points (totalKm 0) | cumKm = [0,0]; segment index clamped; segKm = 1e-9; position stays at start until p=1. |
| No nearby stop for rejuvenate | “Rest here” in place with 5 min and restInPlace flag. |
| Second rejuvenate warning | consequenceTriggerRef with stage "second_warning"; next trigger sets isSecondWarning. |
| Bus stop mid-route | travelPause 18s; after elapsed ≥ totalMs, pause cleared and travel continues. |
| Arrival at hospital | travellingToHospitalRef cleared; hospitalStay set; drawer “hospital”; pay then onAfterPayAndLeave. |
| Credits sync | profile.credits → setCredits on change; deductCredits updates local + updateCredits + refreshProfile. |

---

## 10. Summary

- **Travel:** Progress, position interpolation, arrival, bus→walk, plane boarding/disembarking, and duration are correct; duration is guarded against zero.
- **Stops:** Rejuvenate/refuel/rest triggers, OSM nearby, rest-in-place, Pay & continue with bonus km, and consequence flow are consistent with constants and types.
- **Hospital:** Faint → ambulance → hospital → stay → pay & leave and bicycle recovery costs are wired correctly.
- **Credits:** Synced from profile; deductions go through atomic RPC and update local + context.
- **Tasks & map:** Step→category, pickTask, arrival at waypoint, and geo utils behave as intended.
- **Vehicle:** Wear, breakdown, tow, and maintenance use the same constants and state.

**Code changes from audit:** (1) Travel animation loop uses `durationMs = Math.max(1, tr.durationMs)` so progress is never computed with zero or negative duration. (2) Auth callback: `ensureProfileExists` moved to module scope so it is declared before use (fixes "accessed before declaration" lint/behavior).
