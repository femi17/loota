/**
 * Shared travel mode pricing and timing (Naira / NGN).
 * Single source of truth for inventory and hunts pages.
 */

export type TravelModeId =
  | "walk"
  | "bicycle"
  | "motorbike"
  | "car"
  | "bus"
  | "bus_pass"
  | "plane"
  | "air_taxi";

export const CURRENCY_CODE = "NGN" as const;
export const CURRENCY_SYMBOL = "₦" as const;

/** Buy cost (NGN). Only for modes that can be owned. */
export const BUY_COST: Partial<Record<TravelModeId, number>> = {
  bicycle: 2_500,
  motorbike: 9_000,
  car: 22_000,
};

/** Base rent (NGN) – minimum from distance formula. Shown as "From ₦X" on inventory. */
export const RENT_FROM: Partial<Record<TravelModeId, number>> = {
  bicycle: 120,
  motorbike: 250,
  car: 650,
};

/** Rent cap (NGN) – max from distance formula. */
export const RENT_CAP: Partial<Record<TravelModeId, number>> = {
  bicycle: 2_000,
  motorbike: 4_500,
  car: 8_000,
};

/** Pickup/wait time in seconds before travel starts (e.g. walk to pickup, wait for rental). */
export const PICKUP_SECONDS: Record<TravelModeId, number> = {
  walk: 0,
  bicycle: 5 * 60,   // 5 min – walk to bicycle pickup
  motorbike: 5 * 60, // 5 min – walk to bike pickup
  car: 5 * 60,      // 5 min – rental car arriving
  bus: 7 * 60,      // 7 min – walk to bus stop (5m) + wait (2m)
  bus_pass: 7 * 60,
  plane: 0,
  air_taxi: 0,
};

/** Bus fare base (NGN). Actual fare is distance-based, capped. */
export const BUS_FARE_BASE = 200;
export const BUS_FARE_CAP = 2_500;

/** Plane fare base (NGN). Actual fare is distance-based. */
export const PLANE_FARE_BASE = 2_000;

/** Maintenance cost (NGN) for owned vehicles. */
export const MAINT_COST: Partial<Record<TravelModeId, number>> = {
  bicycle: 180,
  motorbike: 260,
  car: 320,
};

/** Tow cost (NGN) when vehicle breaks down. */
export const TOW_COST: Partial<Record<TravelModeId, number>> = {
  bicycle: 250,
  motorbike: 450,
  car: 650,
};

/** Get rent display price for inventory: "from" base in NGN. */
export function getRentFrom(modeId: TravelModeId): number | null {
  if (modeId === "bus_pass" || modeId === "air_taxi") return null;
  return RENT_FROM[modeId] ?? null;
}

/** Fare per ride (bus) or from (plane) in NGN for inventory display. */
export function getFareDisplay(modeId: TravelModeId): number | null {
  if (modeId === "bus_pass") return BUS_FARE_BASE;
  if (modeId === "air_taxi") return PLANE_FARE_BASE;
  return null;
}

/** Get pickup seconds (inventory uses bus_pass/air_taxi; hunts uses bus/plane). */
export function getPickupSeconds(modeId: TravelModeId): number {
  return PICKUP_SECONDS[modeId] ?? 0;
}

/** Format amount in Naira (no decimals). Use for real-money / admin. */
export function formatNaira(amount: number): string {
  return `${CURRENCY_SYMBOL}${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

/** Format amount as in-game coins (no Naira symbol, no "coins" suffix). Use in hunt modals/drawers. */
export function formatCoins(amount: number): string {
  return amount.toLocaleString("en-NG", { maximumFractionDigits: 0 });
}

// ---------------------------------------------------------------------------
// Everyone's a winner – 30% off vehicle purchase for non–prize winners
// ---------------------------------------------------------------------------
export const NON_WINNER_VEHICLE_DISCOUNT_PCT = 30;

/** Apply non-winner discount to vehicle buy cost (pool still sets base). */
export function applyNonWinnerDiscount(cost: number): number {
  return Math.max(0, Math.round(cost * (1 - NON_WINNER_VEHICLE_DISCOUNT_PCT / 100)));
}

// ---------------------------------------------------------------------------
// Vehicle upsells (add-ons)
// ---------------------------------------------------------------------------
export type VehicleAddonId =
  | "helmet"
  | "lights"
  | "insurance"
  | "registration"
  | "license";

/** Add-ons that expire and can be renewed. */
export const RENEWABLE_ADDON_TYPES: VehicleAddonId[] = ["license", "insurance", "registration"];

export function isRenewableAddon(addon: VehicleAddonId): boolean {
  return RENEWABLE_ADDON_TYPES.includes(addon);
}

/** Upsell add-ons per vehicle (bicycle, motorbike, car only). */
export const VEHICLE_ADDONS: Record<string, VehicleAddonId[]> = {
  bicycle: ["helmet", "lights"],
  motorbike: ["helmet", "insurance", "registration", "license"],
  car: ["registration", "insurance", "license"],
};

export function getAddonsForVehicle(vehicleId: string): VehicleAddonId[] {
  return VEHICLE_ADDONS[vehicleId] ?? [];
}

// ---------------------------------------------------------------------------
// Warnings (hunts)
// ---------------------------------------------------------------------------
/** Fuel % below this: show low fuel warning. */
export const LOW_FUEL_WARN_PCT = 20;

/** Vehicle health % below this: show maintenance warning (already used as MAINT_WARN_PCT in hunts). */
export const MAINT_WARN_PCT = 10;
