"use client";

type NavNotifications = {
  travel?: boolean;
  inventory?: boolean;
  garage?: boolean;
  leaderboard?: boolean;
  status?: boolean;
};

/** Drawer id when open; used to highlight the matching nav button. */
export type NavActiveDrawer =
  | "travel"
  | "inventory"
  | "garage"
  | "leaderboard"
  | "status"
  | null;

type Props = {
  onOpenTravel: () => void;
  onOpenInventory: () => void;
  onOpenGarage: () => void;
  onOpenLeaderboard: () => void;
  onOpenStatus: () => void;
  /** When true for a given key, show a notification badge/effect on that nav card. */
  notifications?: NavNotifications;
  /** Which nav section is active (drawer open); that button is shown as selected. */
  activeDrawer?: NavActiveDrawer;
  /** When true, travel button is disabled and styled inactive (e.g. when Loota is at a waypoint). */
  travelDisabled?: boolean;
};

const navButtonBase =
  "cursor-pointer size-12 rounded-2xl bg-white/90 backdrop-blur-md border soft-shadow flex items-center justify-center relative transition-all duration-200";
const navButtonDefault = "border-[#F1F5F9]";
const navButtonActive = "border-[#2563EB] bg-[#2563EB]/10 ring-2 ring-[#2563EB]/30";
const navButtonNotify =
  "border-red-500 ring-2 ring-red-400/60 shadow-[0_0_12px_rgba(239,68,68,0.35)]";

function NavButton({
  onClick,
  ariaLabel,
  icon,
  notify,
  active,
  disabled,
}: {
  onClick: () => void;
  ariaLabel: string;
  icon: string;
  notify?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  const style = disabled ? navButtonDefault : active ? navButtonActive : notify ? navButtonNotify : navButtonDefault;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${navButtonBase} ${style} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      aria-label={ariaLabel}
      aria-current={active ? "true" : undefined}
    >
      <span
        className={`material-symbols-outlined ${disabled ? "text-slate-400" : active ? "text-[#2563EB]" : notify ? "text-red-600" : "text-[#0F172A]"}`}
      >
        {icon}
      </span>
      {notify && !active && (
        <span
          className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-red-500 ring-2 ring-white"
          aria-hidden
        />
      )}
    </button>
  );
}

export function HuntsNavButtons({
  onOpenTravel,
  onOpenInventory,
  onOpenGarage,
  onOpenLeaderboard,
  onOpenStatus,
  notifications = {},
  activeDrawer = null,
  travelDisabled = false,
}: Props) {
  return (
    <div className="absolute top-24 left-4 z-50 flex flex-col gap-3">
      <NavButton
        onClick={onOpenTravel}
        ariaLabel="Open travel"
        icon="directions"
        notify={travelDisabled ? false : notifications.travel}
        active={activeDrawer === "travel"}
        disabled={travelDisabled}
      />
      <NavButton
        onClick={onOpenInventory}
        ariaLabel="Open inventory"
        icon="shopping_bag"
        notify={notifications.inventory}
        active={activeDrawer === "inventory"}
      />
      <NavButton
        onClick={onOpenGarage}
        ariaLabel="Open garage"
        icon="build"
        notify={notifications.garage}
        active={activeDrawer === "garage"}
      />
      <NavButton
        onClick={onOpenLeaderboard}
        ariaLabel="Open leaderboard"
        icon="emoji_events"
        notify={notifications.leaderboard}
        active={activeDrawer === "leaderboard"}
      />
      <NavButton
        onClick={onOpenStatus}
        ariaLabel="Open status"
        icon="tune"
        notify={notifications.status}
        active={activeDrawer === "status"}
      />
    </div>
  );
}

