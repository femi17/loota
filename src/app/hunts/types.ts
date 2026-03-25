/** Shared types for the hunts page and drawer components */

export type LngLat = { lng: number; lat: number };

export type DrawerId =
  | null
  | "nav"
  | "status"
  | "leaderboard"
  | "breakdown"
  | "garage"
  | "constraint"
  | "consequence"
  | "destination"
  | "hospital"
  | "travel"
  | "plane"
  | "inventory"
  | "coins";

export type LightPreset = "dawn" | "day" | "dusk" | "night";

export type TaskCategoryId = "riddle" | "math" | "trivia";
export type TaskStage = "intro" | "active";
export type TaskItem = { id: string; category: TaskCategoryId; prompt: string; answers: string[] };

export type TravelModeId = "walk" | "bicycle" | "motorbike" | "car" | "bus" | "plane";
export type TravelMode = { id: TravelModeId; label: string; icon: string; speedKmh: number };

export type RpsMove = "rock" | "paper" | "scissors";
export type HuntPhase = "public_trip" | "public_task" | "hunt";

export type VehicleId = "bicycle" | "motorbike" | "car";

export type TravelOffer = {
  modeId: TravelModeId;
  label: string;
  icon: string;
  enabled: boolean;
  canOwn: boolean;
  owned: boolean;
  ownedUsable?: boolean;
  ownedBlockedReason?: string | null;
  fareCoins?: number;
  buyCost?: number;
  rentCost?: number;
  farePerRide?: number;
  prepSeconds: number;
  prepLabel?: string;
  etaSeconds: number | null;
  profile: "walking" | "cycling" | "driving" | null;
  /** Seconds slower than typical free-flow (live traffic API); null if unknown. */
  trafficDelaySeconds?: number | null;
  /** Car/motorbike: a faster alternate route exists. */
  trafficAlternateAvailable?: boolean;
  /** ETA (move time only) if player picks the alternate route. */
  trafficAlternateEtaSeconds?: number | null;
  /** Bus: heavy delay — offer alight and walk the rest. */
  busSuggestAlightWalk?: boolean;
};

export type MaintenanceTask = {
  label: string;
  icon: string;
  completionPercent: number;
};

export type StopFlow = {
  kind: "rejuvenate" | "refuel" | "rest";
  modeId: TravelModeId;
  status: "finding" | "to_stop" | "relaxing" | "ready_to_pay";
  stop?: { place_name: string; center: [number, number] };
  finalTo: LngLat;
  finalLabel: string;
  resumeCoords?: Array<[number, number]>;
  resumeEtaSeconds?: number;
  costCoins: number;
  actionSeconds: number;
  startedAt?: number;
  error?: string | null;
  distanceMetersToStop?: number;
  durationSecondsToStop?: number;
  /** Route coords to the stop (so "Go to this stop" can start travel without auto-starting). */
  coordsToStop?: Array<[number, number]>;
  /** True when this is the second rejuvenate prompt (user already ignored once); show "You have reached your limit". */
  isSecondWarning?: boolean;
  /** True when no relax venue within 2.5 miles ahead on route: rest in place for 5 mins instead of going somewhere. */
  restInPlace?: boolean;
};

export type TravelPause = {
  kind: "bus_stop";
  startedAt: number;
  totalMs: number;
};

/** After ignoring rejuvenate/refuel/rest, something bad happens; user must go to hospital / gas / bike shop. */
export type ConsequenceFlow = {
  kind: "faint" | "out_of_fuel" | "bike_repair";
  at: LngLat;
  modeId: TravelModeId;
};

export type PlaneFlow = {
  stage: "choose_transfer" | "to_departure" | "boarding" | "flying" | "disembarking";
  finalTo: LngLat;
  finalLabel: string;
  from: LngLat;
  fareCoins: number;
  lookupNonce: number;
  loadingDeparture: boolean;
  loadingArrival: boolean;
  error: string | null;
  departureAirport?: { place_name: string; center: [number, number] };
  arrivalAirport?: { place_name: string; center: [number, number] };
  /** When stage is "boarding", time (ms) when boarding started; flight starts after 10 min. */
  boardingStartedAt?: number;
  /** When stage is "disembarking", time (ms) when disembarking ends; then open travel drawer. */
  disembarkingEndsAt?: number;
};

export type VehicleState = {
  healthPct: number;
  warnedLow: boolean;
  status: "ok" | "servicing" | "broken_needs_tow" | "repairing";
  untilMs?: number;
};
