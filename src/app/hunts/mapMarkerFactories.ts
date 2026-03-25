/**
 * DOM element factories for Mapbox markers (player avatar, destination pin, plane, ambulance, etc.).
 * Used by the hunts page map effects only; no React.
 */
import type { TravelModeId } from "./types";
import { MODE_ICON } from "./constants";

export function makeAvatarEl(avatarUrl: string, ringColor: string): HTMLDivElement {
  const container = document.createElement("div");
  container.style.width = "40px";
  container.style.height = "40px";
  container.style.position = "relative";
  container.style.overflow = "visible";

  const el = document.createElement("div");
  el.style.width = "40px";
  el.style.height = "40px";
  el.style.borderRadius = "9999px";
  el.style.border = `3px solid ${ringColor}`;
  el.style.boxShadow = "0 8px 20px rgba(15,23,42,0.25)";
  el.style.overflow = "hidden";
  el.style.background = "#fff";
  el.style.display = "grid";
  el.style.placeItems = "center";

  const inner = document.createElement("div");
  inner.style.width = "100%";
  inner.style.height = "100%";
  inner.style.backgroundImage = `url("${avatarUrl}")`;
  inner.style.backgroundSize = "cover";
  inner.style.backgroundPosition = "center";
  inner.style.borderRadius = "9999px";
  el.appendChild(inner);

  container.appendChild(el);

  const badge = document.createElement("div");
  badge.setAttribute("data-mode-badge-wrap", "1");
  badge.style.position = "absolute";
  badge.style.right = "-6px";
  badge.style.bottom = "-6px";
  badge.style.width = "22px";
  badge.style.height = "22px";
  badge.style.borderRadius = "9999px";
  badge.style.background = "rgba(255,255,255,0.92)";
  badge.style.border = "1px solid rgba(241,245,249,1)";
  badge.style.boxShadow = "0 8px 18px rgba(15,23,42,0.16)";
  badge.style.display = "none";
  badge.style.placeItems = "center";

  const badgeIcon = document.createElement("span");
  badgeIcon.setAttribute("data-mode-badge", "1");
  badgeIcon.className = "material-symbols-outlined";
  badgeIcon.style.fontSize = "14px";
  badgeIcon.style.color = "#0F172A";
  badge.appendChild(badgeIcon);
  container.appendChild(badge);

  const sos = document.createElement("div");
  sos.setAttribute("data-sos", "1");
  sos.className = "loota-sos";
  sos.style.position = "absolute";
  sos.style.left = "50%";
  sos.style.top = "-14px";
  sos.style.transform = "translateX(-50%)";
  sos.style.padding = "4px 8px";
  sos.style.borderRadius = "9999px";
  sos.style.background = "#EF4444";
  sos.style.border = "2px solid rgba(255,255,255,0.95)";
  sos.style.color = "#fff";
  sos.style.fontSize = "10px";
  sos.style.fontWeight = "900";
  sos.style.letterSpacing = "0.22em";
  sos.style.textTransform = "uppercase";
  sos.style.lineHeight = "1";
  sos.style.display = "none";
  sos.style.pointerEvents = "none";
  sos.textContent = "SOS";
  container.appendChild(sos);

  return container;
}

export function makePlaneEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "32px";
  el.style.height = "32px";
  el.style.display = "grid";
  el.style.placeItems = "center";
  el.style.background = "transparent";
  el.style.pointerEvents = "none";
  el.style.overflow = "visible";

  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined";
  icon.textContent = "flight";
  icon.style.fontSize = "28px";
  icon.style.color = "#0F172A";
  icon.style.filter = "drop-shadow(0 6px 14px rgba(15,23,42,0.30))";
  icon.setAttribute("data-plane-icon", "1");
  el.appendChild(icon);

  return el;
}

export function makeAmbulanceEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "36px";
  el.style.height = "36px";
  el.style.display = "grid";
  el.style.placeItems = "center";
  el.style.background = "#DC2626";
  el.style.borderRadius = "8px";
  el.style.border = "2px solid #fff";
  el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";
  el.style.pointerEvents = "none";
  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined";
  icon.textContent = "local_shipping";
  icon.style.fontSize = "22px";
  icon.style.color = "#fff";
  el.appendChild(icon);
  return el;
}

export function makeAmbulanceWithAvatarEl(avatarUrl: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "44px";
  el.style.height = "44px";
  el.style.position = "relative";
  el.style.display = "grid";
  el.style.placeItems = "center";
  el.style.pointerEvents = "none";
  const ambulance = document.createElement("div");
  ambulance.style.width = "44px";
  ambulance.style.height = "44px";
  ambulance.style.display = "grid";
  ambulance.style.placeItems = "center";
  ambulance.style.background = "#DC2626";
  ambulance.style.borderRadius = "10px";
  ambulance.style.border = "2px solid #fff";
  ambulance.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";
  const truckIcon = document.createElement("span");
  truckIcon.className = "material-symbols-outlined";
  truckIcon.textContent = "local_shipping";
  truckIcon.style.fontSize = "24px";
  truckIcon.style.color = "#fff";
  ambulance.appendChild(truckIcon);
  el.appendChild(ambulance);
  const avatar = document.createElement("div");
  avatar.style.position = "absolute";
  avatar.style.right = "-4px";
  avatar.style.bottom = "-4px";
  avatar.style.width = "20px";
  avatar.style.height = "20px";
  avatar.style.borderRadius = "9999px";
  avatar.style.border = "2px solid #fff";
  avatar.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";
  avatar.style.overflow = "hidden";
  avatar.style.background = "#fff";
  avatar.style.backgroundImage = `url("${avatarUrl}")`;
  avatar.style.backgroundSize = "cover";
  avatar.style.backgroundPosition = "center";
  el.appendChild(avatar);
  return el;
}

export function makeDestinationPinEl(
  color: "blue" | "green" | "red" | "yellow" = "yellow"
): HTMLDivElement {
  const hex =
    color === "red"
      ? "#DC2626"
      : color === "blue"
        ? "#2563EB"
        : color === "green"
          ? "#16A34A"
          : "#EAB308";
  const el = document.createElement("div");
  el.style.width = "32px";
  el.style.height = "32px";
  el.style.display = "grid";
  el.style.placeItems = "center";
  el.style.background = "transparent";
  el.style.pointerEvents = "none";
  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined";
  icon.textContent = "place";
  icon.style.fontSize = "36px";
  icon.style.color = hex;
  icon.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.3))";
  el.appendChild(icon);
  return el;
}

export function makePickupVehicleEl(symbol: string, color?: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "30px";
  el.style.height = "30px";
  el.style.display = "grid";
  el.style.placeItems = "center";
  el.style.background = "transparent";
  el.style.pointerEvents = "none";

  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined";
  icon.textContent = symbol;
  icon.style.fontSize = "26px";
  icon.style.color = color ?? "#0F172A";
  icon.style.filter = "drop-shadow(0 6px 14px rgba(0,0,0,0.25))";
  el.appendChild(icon);
  return el;
}

export function makeDirectionalModeEl(modeId: TravelModeId): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "34px";
  el.style.height = "34px";
  el.style.position = "relative";
  el.style.display = "grid";
  el.style.placeItems = "center";
  el.style.background = "transparent";
  el.style.pointerEvents = "none";
  el.style.overflow = "visible";

  const arrow = document.createElement("span");
  arrow.className = "material-symbols-outlined";
  arrow.textContent = "navigation";
  arrow.style.fontSize = "32px";
  arrow.style.color = "#0F172A";
  arrow.style.filter = "drop-shadow(0 6px 14px rgba(15,23,42,0.30))";
  arrow.setAttribute("data-heading-arrow", "1");
  el.appendChild(arrow);

  const badge = document.createElement("div");
  badge.style.position = "absolute";
  badge.style.left = "50%";
  badge.style.top = "50%";
  badge.style.transform = "translate(-50%, -50%)";
  badge.style.width = "18px";
  badge.style.height = "18px";
  badge.style.borderRadius = "9999px";
  badge.style.background = "rgba(255,255,255,0.92)";
  badge.style.border = "1px solid rgba(241,245,249,1)";
  badge.style.display = "grid";
  badge.style.placeItems = "center";

  const modeIcon = document.createElement("span");
  modeIcon.className = "material-symbols-outlined";
  modeIcon.textContent = MODE_ICON[modeId];
  modeIcon.style.fontSize = "14px";
  modeIcon.style.color = "#0F172A";
  badge.appendChild(modeIcon);
  el.appendChild(badge);

  return el;
}

export function addNameplate(el: HTMLElement, name: string): HTMLElement {
  const label = document.createElement("div");
  label.textContent = name;
  label.style.position = "absolute";
  label.style.left = "50%";
  label.style.top = "-18px";
  label.style.transform = "translateX(-50%)";
  label.style.padding = "2px 7px";
  label.style.borderRadius = "9999px";
  label.style.background = "rgba(255,255,255,0.88)";
  label.style.border = "1px solid rgba(241,245,249,1)";
  label.style.boxShadow = "0 8px 18px rgba(15,23,42,0.12)";
  label.style.fontSize = "10px";
  label.style.fontWeight = "800";
  label.style.letterSpacing = "0.08em";
  label.style.textTransform = "uppercase";
  label.style.whiteSpace = "nowrap";
  label.style.color = "#0F172A";
  el.style.position = "relative";
  el.style.overflow = "visible";
  el.appendChild(label);
  return el;
}
