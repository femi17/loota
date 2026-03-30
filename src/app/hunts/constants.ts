import type { TaskCategoryId, TaskItem, TravelModeId, VehicleId } from "./types";
import {
  MAINT_COST as MAINT_COST_CONFIG,
  TOW_COST as TOW_COST_CONFIG,
} from "@/lib/travel-config";

export const DEMO_TRAVEL_SPEED_KMH = 55;
export const ARRIVAL_RADIUS_KM = 0.06;
export const SIM_SPEEDUP = 15;
/** Extra animation speedup for walking. Lower = slower walk (1 = ~2x slower than bicycle for same distance). */
export const WALK_ANIMATION_SPEEDUP = 1;
/** Min real-time (ms) for walk so short distances don't zip by; long distances still capped below. */
export const MIN_WALK_ANIMATION_MS = 75 * 1000;
/** Max real-time (ms) for walk animation. 45 min cap keeps long walks distinctly slower than bicycle. */
export const MAX_WALK_ANIMATION_MS = 45 * 60 * 1000;
/** Speedup for walk-to-bus-stop and walk-to-rent (pickup) phases. 5 = 5 min in-world → 1 min real. */
export const PREP_WALK_SPEEDUP = 5;
export const STOP_SPEEDUP = 3;
/** Slower progress for free "Rest here" (no route drawn; avatar stays in place). */
export const STOP_SPEEDUP_REST_IN_PLACE = 1;
export const PLANE_MIN_KM = 120;
/** Real-time minutes at departure airport before flight starts (boarding). */
export const PLANE_BOARDING_MINUTES = 10;
/** Real-time minutes after landing before player can continue (disembarking). */
export const PLANE_DISEMBARKING_MINUTES = 5;
export const TASK_TIME_SECONDS = 15;
// Anti-cheat should only trigger when the player is effectively "at" a locked waypoint.
// Using a large radius (e.g. multiple km) causes false positives when consecutive waypoints are near each other.
export const CHEAT_LOCKED_DESTINATION_MATCH_KM = 0.12;
export const NIGERIA_BBOX = [2.69, 4.27, 14.68, 13.9] as const;
/** Lagos metropolitan area for test/demo locations. [minLng, minLat, maxLng, maxLat] */
export const LAGOS_BBOX = [3.2, 6.35, 3.55, 6.75] as const;

export const TASK_CATEGORY_ORDER: TaskCategoryId[] = ["math", "trivia", "flags"];
export const TASK_CATEGORY_LABEL: Record<TaskCategoryId, string> = {
  math: "math",
  trivia: "trivia",
  flags: "flags",
  quiz: "quiz",
};

export const TASK_BANK: Record<TaskCategoryId, TaskItem[]> = {
  math: [
    { id: "m1", category: "math", prompt: "Compute: 47 × 13", answers: ["611"] },
    { id: "m2", category: "math", prompt: "Compute: 9³ + 6²", answers: ["765"] },
    { id: "m3", category: "math", prompt: "Solve: (5/8) of 64", answers: ["40"] },
    { id: "m4", category: "math", prompt: "Compute: 2⁷ − 3⁴", answers: ["47"] },
    { id: "m5", category: "math", prompt: "Compute: 120 ÷ 7 (round down to whole number)", answers: ["17"] },
  ],
  trivia: [
    { id: "t1", category: "trivia", prompt: "Which Nigerian state is known as the \"Food Basket of the Nation\"?", answers: ["benue"] },
    { id: "t2", category: "trivia", prompt: "Which Nigerian state has the highest number of Local Government Areas (LGAs)?", answers: ["kano"] },
    { id: "t3", category: "trivia", prompt: "In what year did Nigeria return to democratic rule (Fourth Republic)?", answers: ["1999"] },
    { id: "t4", category: "trivia", prompt: "What is Nigeria's capital city?", answers: ["abuja"] },
    { id: "t5", category: "trivia", prompt: "Nigeria's currency is called what?", answers: ["naira"] },
  ],
  flags: [
    { id: "f1", category: "flags", prompt: "Flag: https://flagcdn.com/w320/ng.png\nWhich country is this flag?", answers: ["nigeria"] },
    { id: "f2", category: "flags", prompt: "Flag: https://flagcdn.com/w320/gh.png\nWhich country is this flag?", answers: ["ghana"] },
    { id: "f3", category: "flags", prompt: "Flag: https://flagcdn.com/w320/za.png\nWhich country is this flag?", answers: ["south africa", "southafrica"] },
    { id: "f4", category: "flags", prompt: "Flag: https://flagcdn.com/w320/fr.png\nWhich country is this flag?", answers: ["france"] },
    { id: "f5", category: "flags", prompt: "Flag: https://flagcdn.com/w320/us.png\nWhich country is this flag?", answers: ["united states", "usa", "us"] },
  ],
  quiz: [],
};

export const WALK_REJUVENATE_EVERY_KM = 4;
export const BIKE_REJUVENATE_EVERY_KM = 8;
export const MOTO_REFUEL_EVERY_KM = 10;
export const CAR_REFUEL_EVERY_KM = 10;
export const DRIVE_REST_EVERY_KM = 250;
export const BUS_STOP_EVERY_KM = 12;
export const BUS_STOP_SECONDS = 18;

export const COST_REJUVENATE_WALK = 120;
export const COST_REJUVENATE_BIKE = 140;
/** Relax/rejuvenate: max distance from player. 2.5 miles (~4.02 km). If route to stop > this, reject (offer rest in place). */
export const REJUVENATE_MAX_DISTANCE_KM = 2.5 * 1.609344;
/** Same in metres for route-distance checks. */
export const REJUVENATE_MAX_DISTANCE_M = Math.round(REJUVENATE_MAX_DISTANCE_KM * 1000);
/** When no relax venue within 2.5 miles ahead on route, rest in place for this many in-world seconds (free, slow). */
export const REST_IN_PLACE_SECONDS = 5 * 60;
/** Extra km before next rejuvenate prompt after paying to relax at a venue (incentive to pay). */
export const REJUVENATE_KM_BONUS_AFTER_VENUE = 2;
export const COST_REFUEL_MOTO = 150;
export const COST_REFUEL_CAR = 250;
export const COST_REST_DRIVE = 120;

export const HOSPITAL_STAY_MINUTES = 30;
export const HOSPITAL_BILL = 250;
/** Time for ambulance to reach user after they faint (real ms). */
export const AMBULANCE_ARRIVAL_MS = 2 * 60 * 1000;
/** When user faints on an owned bicycle: recovery + repair cost (bike left at scene). */
export const BICYCLE_RECOVERY_REPAIR_COST_OWNED = 180;
/** When user faints on a rental bicycle: recovery + lost-bike fee. */
export const BICYCLE_RECOVERY_REPAIR_COST_RENTAL = 350;
/** Owned bicycle: real-time duration (ms) in "repairing" after faint before usable again. */
export const BICYCLE_RECOVERY_REPAIR_DURATION_MS = 2 * 60 * 1000;

export const TRAVEL_MODES: { id: TravelModeId; label: string; icon: string; speedKmh: number }[] = [
  { id: "walk", label: "Walk", icon: "directions_walk", speedKmh: 5 },
  { id: "bicycle", label: "Bicycle", icon: "directions_bike", speedKmh: 8 },
  { id: "motorbike", label: "Motorbike", icon: "two_wheeler", speedKmh: 55 },
  { id: "car", label: "Car", icon: "directions_car", speedKmh: 80 },
  { id: "bus", label: "Bus", icon: "directions_bus", speedKmh: 35 },
  { id: "plane", label: "Plane", icon: "flight_takeoff", speedKmh: 180 },
];

export const VEHICLE_IDS: VehicleId[] = ["bicycle", "motorbike", "car"];
export const MAINT_WARN_PCT = 10;
export const MAINT_WORLD_SECONDS = 10 * 60;
export const REPAIR_WORLD_SECONDS = 60 * 60;
export const MAINT_SPEEDUP = 1;

export const MAINTENANCE_TASKS: Record<VehicleId, { label: string; icon: string; completionPercent: number }[]> = {
  bicycle: [
    { label: "Chain lubrication", icon: "oil_barrel", completionPercent: 20 },
    { label: "Tyre pressure check", icon: "air", completionPercent: 40 },
    { label: "Brake adjustment", icon: "hand_brake", completionPercent: 60 },
    { label: "Gear tuning", icon: "settings", completionPercent: 80 },
    { label: "Final inspection", icon: "verified", completionPercent: 100 },
  ],
  motorbike: [
    { label: "Oil change", icon: "oil_barrel", completionPercent: 25 },
    { label: "Chain cleaning", icon: "cleaning_services", completionPercent: 45 },
    { label: "Tyre pressure check", icon: "air", completionPercent: 60 },
    { label: "Brake pad inspection", icon: "hand_brake", completionPercent: 75 },
    { label: "Battery check", icon: "battery_charging_full", completionPercent: 90 },
    { label: "Final inspection", icon: "verified", completionPercent: 100 },
  ],
  car: [
    { label: "Oil change", icon: "oil_barrel", completionPercent: 20 },
    { label: "Tyre rotation", icon: "tire_repair", completionPercent: 35 },
    { label: "Brake fluid check", icon: "water_drop", completionPercent: 50 },
    { label: "Air filter replacement", icon: "air", completionPercent: 65 },
    { label: "Battery test", icon: "battery_charging_full", completionPercent: 80 },
    { label: "Engine diagnostics", icon: "build", completionPercent: 90 },
    { label: "Final inspection", icon: "verified", completionPercent: 100 },
  ],
};

export const VEHICLE_WEAR_PCT_PER_KM: Record<VehicleId, number> = {
  bicycle: 0.25,
  motorbike: 0.15,
  car: 0.12,
};

export const MAINT_COST: Record<VehicleId, number> = {
  bicycle: MAINT_COST_CONFIG.bicycle ?? 180,
  motorbike: MAINT_COST_CONFIG.motorbike ?? 260,
  car: MAINT_COST_CONFIG.car ?? 320,
};

export const TOW_COST: Record<VehicleId, number> = {
  bicycle: TOW_COST_CONFIG.bicycle ?? 250,
  motorbike: TOW_COST_CONFIG.motorbike ?? 450,
  car: TOW_COST_CONFIG.car ?? 650,
};

export const MODE_ICON: Record<TravelModeId, string> = {
  walk: "directions_walk",
  bicycle: "directions_bike",
  motorbike: "two_wheeler",
  car: "directions_car",
  bus: "directions_bus",
  plane: "flight",
};

/** Lagos-area waypoints for "next" locations when using real hunt questions (no coords in DB). */
export const NEXT_LOCATIONS: { label: string; to: { lng: number; lat: number } }[] = [
  { label: "Ikeja, Lagos", to: { lng: 3.3485, lat: 6.6018 } },
  { label: "Victoria Island, Lagos", to: { lng: 3.4212, lat: 6.4281 } },
  { label: "Lekki, Lagos", to: { lng: 3.4594, lat: 6.4474 } },
  { label: "Ajah, Lagos", to: { lng: 3.5781, lat: 6.4694 } },
  { label: "Surulere, Lagos", to: { lng: 3.3522, lat: 6.4969 } },
  { label: "Yaba, Lagos", to: { lng: 3.3717, lat: 6.5078 } },
  { label: "Ikorodu, Lagos", to: { lng: 3.5042, lat: 6.6203 } },
  { label: "Badagry, Lagos", to: { lng: 2.8833, lat: 6.4167 } },
  { label: "Alimosho, Lagos", to: { lng: 3.3186, lat: 6.6144 } },
  { label: "Ojodu, Lagos", to: { lng: 3.3786, lat: 6.6458 } },
  { label: "Maryland, Lagos", to: { lng: 3.3653, lat: 6.5678 } },
  { label: "Gbagada, Lagos", to: { lng: 3.3911, lat: 6.5486 } },
  { label: "Apapa, Lagos", to: { lng: 3.3589, lat: 6.4489 } },
  { label: "Agege, Lagos", to: { lng: 3.3183, lat: 6.6203 } },
  { label: "Oshodi, Lagos", to: { lng: 3.3361, lat: 6.5547 } },
];
