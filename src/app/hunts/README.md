# Hunts page structure

The hunts page is split into shared modules and drawer components to keep the main page smaller and easier to work with.

## Modules (in `src/app/hunts/`)

- **types.ts** – Shared types: `LngLat`, `DrawerId`, `TravelModeId`, `VehicleId`, `StopFlow`, `TravelPause`, `PlaneFlow`, `VehicleState`, etc.
- **constants.ts** – `TASK_BANK`, `TRAVEL_MODES`, `VEHICLE_IDS`, `MAINTENANCE_TASKS`, costs (`MAINT_COST`, `TOW_COST`), `MODE_ICON`, and numeric constants.
- **utils.ts** – Pure helpers: `haversineKm`, `bearingDeg`, `clamp`, `normAnswer`, `fmtCoord`, `lightPresetForLocalTime`, `pickTask`, `taskCategoryForStep`, `arrivalRankFor`, `ordinal`.

## Drawer components (in `src/components/hunts/`)

Each modal/drawer is a separate component that receives props from the main page:

| Drawer        | Component                        | Status    |
|---------------|----------------------------------|-----------|
| Constraint    | `HuntsConstraintDrawerContent`   | Extracted |
| Breakdown     | `HuntsBreakdownDrawerContent`   | Extracted |
| Nav           | `HuntsNavDrawerContent`         | Existing  |
| Leaderboard   | `HuntsLeaderboardDrawerContent` | Existing  |
| Destination   | `HuntsDestinationDrawerContent` | Existing  |
| Status        | `HuntsStatusDrawerContent`      | Extracted |
| Garage        | `HuntsGarageDrawerContent`      | Extracted |
| Travel        | `HuntsTravelDrawerContent`      | Extracted |
| Plane         | `HuntsPlaneDrawerContent`       | Extracted |
| Inventory     | `HuntsInventoryDrawerContent`   | Extracted |
| Coins         | `HuntsCoinsDrawerContent`      | Extracted |

## Extracting another drawer

1. Add a new file under `src/components/hunts/`, e.g. `HuntsStatusDrawerContent.tsx`.
2. Define a `Props` type with the state and callbacks that drawer needs.
3. Move the drawer JSX from `page.tsx` into the new component and use the props.
4. In `page.tsx`, import the component and replace the inline block with `<HuntsStatusDrawerContent {...props} />`.
5. Export the component from `src/components/hunts/index.ts`.

The main page imports types from `./types`, constants from `./constants`, and utils from `./utils` to keep `page.tsx` shorter.
