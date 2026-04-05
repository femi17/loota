/**
 * Hunt “local council” districts for waypoint scoping.
 * - Lagos: official LCDAs (37).
 * - Every other state: same picker UX, backed by Nigeria’s standard LGA list from `nigeria-lgas`
 *   (there is no single nationwide LCDA dataset; LGAs are the comparable tier elsewhere).
 */
import { getLgasForState } from "@/lib/nigeria-lgas";

/** Lagos LCDAs — finer than the 20 LGAs. */
export const LAGOS_LCDAS = [
  "Agbado/Oke-Odo",
  "Agboyi-Ketu",
  "Apapa-Iganmu",
  "Ayobo-Ipaja",
  "Badagry West",
  "Bariga",
  "Coker-Aguda",
  "Egbe-Idimu",
  "Ejigbo",
  "Eredo",
  "Eti-Osa East",
  "Iba",
  "Ifelodun",
  "Igando-Ikotun",
  "Igbogbo-Baiyeku",
  "Ijede",
  "Ikosi-Ejirin",
  "Ikosi-Isheri",
  "Ikoyi-Obalende",
  "Imota",
  "Iru/Victoria Island",
  "Isolo",
  "Itire-Ikate",
  "Ikorodu North",
  "Ikorodu West",
  "Lagos Island East",
  "Lekki",
  "Mosan-Okunola",
  "Odi Olowo-Ojuwoye",
  "Ojodu",
  "Ojokoro",
  "Olorunda",
  "Onigbongbo",
  "Oriade",
  "Orile Agege",
  "Oto-Awori",
  "Yaba",
] as const;

const STATE_LCDAS: Record<string, readonly string[]> = {
  Lagos: LAGOS_LCDAS,
};

/**
 * Use “LCDA”-style Mapbox seed queries only where that label matches real admin units (Lagos).
 * Other states use LGA wording in forward/reverse geocode hints.
 */
export function stateUsesLcdaMapboxSeeds(state: string): boolean {
  return state.trim().toLowerCase() === "lagos";
}

/**
 * Districts used to pick random hunt waypoints: LCDAs for Lagos, LGAs for every other state.
 */
export function getHuntDistrictsForState(state: string): string[] {
  const key = state.trim();
  const lcdas = STATE_LCDAS[key];
  if (lcdas && lcdas.length > 0) return [...lcdas];
  return getLgasForState(key);
}
