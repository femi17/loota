# Hunts page hooks

The hunts page logic is split across 5 files:

1. **page.tsx** – Composes hooks and renders the view (early return + main UI).
2. **hooks/useHuntsCore.ts** – Auth, hunt data, credits, drawer, nav, leaderboard, keys, huntPhase, playerPos, waypoints, map refs, mapReady, and related state/effects.
3. **hooks/useHuntsMap.ts** – Map init and marker/trail effects. Depends on core.
4. **hooks/useHuntsTravel.ts** – Travel state (destination, isTraveling, prep, planeFlow), startTravelWithRoute, travel tick, prep effect, sync effects. Depends on core.
5. **hooks/useHuntsTasks.ts** – Stop flow, vehicle, breakdown, hospital, faint, task handlers, openDrawer, closeDrawer, HUD derived, leaderboard fetch, inventory, paystack. Depends on core and travel.

Flow: `core = useHuntsCore()` → `useHuntsMap(core)` → `travel = useHuntsTravel(core)` → `tasks = useHuntsTasks(core, travel)` → merge and pass to view.
