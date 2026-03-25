/**
 * One ID per browser (localStorage). Multiple tabs in the same browser share
 * this ID. A different browser/device gets a different ID so we can detect
 * multi-device / multi-browser logins.
 */
const STORAGE_KEY = "loota_active_client_id";

let cached: string | null = null;

export function getClientId(): string {
  if (cached) return cached;
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    const uuid =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : null;
    id = uuid ?? `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(STORAGE_KEY, id);
  }
  cached = id;
  return id;
}
