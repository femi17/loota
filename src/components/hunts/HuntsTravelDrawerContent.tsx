"use client";

import type { LngLat, PlaneFlow, TravelModeId, TravelOffer } from "@/app/hunts/types";

export type BaseDirs = {
  loading: boolean;
  error: string | null;
  networkError?: boolean;
  walking?: { coords: Array<[number, number]>; durationSeconds: number; distanceMeters: number };
  cycling?: { coords: Array<[number, number]>; durationSeconds: number; distanceMeters: number };
  driving?: {
    coords: Array<[number, number]>;
    durationSeconds: number;
    distanceMeters: number;
    durationTypicalSeconds?: number | null;
    trafficDelaySeconds?: number | null;
    alternate?: {
      coords: Array<[number, number]>;
      durationSeconds: number;
      distanceMeters: number;
    };
  };
};

type Props = {
  /** When false, destination and Go are locked until the hunt officially starts. */
  huntHasStarted?: boolean;
  huntHasEnded?: boolean;
  pendingDestination: LngLat | null;
  destination: LngLat | null;
  pendingDestinationLabel: string;
  destinationLabel: string;
  huntPhase: "public_trip" | "public_task" | "hunt";
  publicLocation: LngLat | null;
  fmtCoord: (n: number) => string;
  setPendingDestination: (v: LngLat | null) => void;
  setPendingDestinationLabel: (v: string) => void;
  baseDirs: BaseDirs;
  setBaseDirs: React.Dispatch<React.SetStateAction<BaseDirs>>;
  travelOffers: TravelOffer[];
  travelPickModeId: TravelModeId;
  setTravelPickModeId: (id: TravelModeId) => void;
  vehicleState: Record<string, { healthPct: number }>;
  modeRoute: (modeId: TravelModeId) => { coords?: Array<[number, number]> } | undefined;
  selectedTravelOffer: TravelOffer | undefined;
  playerPos: LngLat | null;
  credits: number;
  formatNaira: (n: number) => string;
  deductCredits: (amount: number, huntId?: string | null) => Promise<number | null>;
  setPayError: (v: string | null) => void;
  openDrawer: (id: "coins") => void;
  beginTravelWithMode: (modeId: TravelModeId) => void;
  setPlaneFlow: React.Dispatch<React.SetStateAction<PlaneFlow | null>>;
  setDrawer: (id: "plane" | null) => void;
  fmtEta: (seconds: number | null) => string;
  /** When true and not walking: show all mode options but disabled (not blank). */
  isTraveling?: boolean;
  travelModeId?: TravelModeId;
  /** Effective mode when traveling (from travelRef); use for disable logic so it's correct with owned vehicles. */
  effectiveTravelModeId?: TravelModeId;
  /** Mode id for which an action (Board/Rent/Use/Go) is in progress; show loading on that button. */
  travelActionLoading?: TravelModeId | null;
  /** When true, player is at a quiz location; disable all travel until they answer the riddle or move on. */
  atQuizLocation?: boolean;
  /** When true, player is going to a constraint/stop location; disable mode selection to prevent cheating. */
  hasActiveStopFlow?: boolean;
  /** When set with a non-walk mode, player is in prep (walking to rent/board); lock all other travel modes. */
  prepModeLock?: TravelModeId | null;
  /** Car/motorbike: which driving route geometry to use when starting travel. */
  drivingRouteChoice?: "primary" | "alternate";
  setDrivingRouteChoice?: (choice: "primary" | "alternate") => void;
};

export function HuntsTravelDrawerContent({
  huntHasStarted = true,
  huntHasEnded = false,
  pendingDestination,
  destination,
  pendingDestinationLabel,
  destinationLabel,
  huntPhase,
  publicLocation,
  fmtCoord,
  setPendingDestination,
  setPendingDestinationLabel,
  baseDirs,
  setBaseDirs,
  travelOffers,
  travelPickModeId,
  setTravelPickModeId,
  vehicleState,
  modeRoute,
  selectedTravelOffer,
  playerPos,
  credits,
  formatNaira,
  deductCredits,
  setPayError,
  openDrawer,
  beginTravelWithMode,
  setPlaneFlow,
  setDrawer,
  fmtEta,
  isTraveling = false,
  travelModeId = "walk",
  effectiveTravelModeId,
  travelActionLoading = null,
  atQuizLocation = false,
  hasActiveStopFlow = false,
  prepModeLock = null,
  drivingRouteChoice = "primary",
  setDrivingRouteChoice,
}: Props) {
  const currentMode = effectiveTravelModeId ?? travelModeId;
  const optionsDisabledWhileTraveling =
    (isTraveling && currentMode !== "walk") ||
    (prepModeLock != null && prepModeLock !== "walk") ||
    atQuizLocation ||
    hasActiveStopFlow;
  // When traveling by walk, user can still rent/board other modes — don't disable them for loading or missing route.
  const canRentOtherModesWhileWalking = isTraveling && currentMode === "walk" && !atQuizLocation;

  if (!huntHasStarted) {
    return (
      <div className="space-y-4">
        <div className="p-5 rounded-3xl bg-amber-50 border border-amber-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
            Travel locked
          </p>
          <p className="mt-2 text-sm font-semibold text-[#0F172A]">
            The hunt has not started yet.
          </p>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            The first location and travel options will unlock when the countdown reaches zero. You can stay on the map until then.
          </p>
        </div>
      </div>
    );
  }

  if (huntHasEnded) {
    return (
      <div className="space-y-4">
        <div className="p-5 rounded-3xl bg-slate-100 border border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
            Travel closed
          </p>
          <p className="mt-2 text-sm font-semibold text-[#0F172A]">
            This hunt has ended.
          </p>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Open the lobby for the next hunt.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pendingDestination || destination ? (
        <div className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Destination
          </p>
          <p className="mt-2 text-sm font-extrabold text-[#0F172A]">
            {pendingDestinationLabel || destinationLabel || "—"}
          </p>
          {(pendingDestination || destination) ? (
            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {fmtCoord((pendingDestination || destination)!.lat)}, {fmtCoord((pendingDestination || destination)!.lng)}
            </p>
          ) : null}
        </div>
      ) : huntPhase === "public_trip" && publicLocation ? (
        <div className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Next Location
          </p>
          <p className="mt-2 text-sm font-extrabold text-[#0F172A]">Continue to checkpoint</p>
          <p className="mt-2 text-xs text-slate-500">
            Travel to the next checkpoint to continue your hunt.
          </p>
          <button
            type="button"
            disabled={atQuizLocation}
            onClick={() => {
              if (atQuizLocation) return;
              setPendingDestination(publicLocation);
              setPendingDestinationLabel("Next checkpoint");
            }}
            className={[
              "mt-3 w-full px-4 py-2.5 rounded-full font-black text-xs uppercase tracking-[0.18em] transition-colors",
              atQuizLocation
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-[#0F172A] text-white hover:bg-[#2563EB]",
            ].join(" ")}
          >
            Set as destination
          </button>
        </div>
      ) : (
        <div className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            No destination
          </p>
          <p className="mt-2 text-sm text-slate-600">
            You need to set a destination first. Continue your hunt to get the next location.
          </p>
        </div>
      )}

      <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">
            Choose travel mode
          </p>
          {baseDirs.loading ? (
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Calculating…
            </span>
          ) : null}
        </div>

        {baseDirs.error ? (
          <div className="mt-3 p-4 rounded-2xl bg-red-50 border border-red-100">
            <p className="text-sm font-extrabold text-red-700">{baseDirs.error}</p>
            {baseDirs.networkError ? (
              <button
                type="button"
                onClick={() => {
                  if (pendingDestination && playerPos) {
                    setBaseDirs((s) => ({ ...s, loading: true, error: null, networkError: false }));
                    const temp = pendingDestination;
                    setPendingDestination(null);
                    setTimeout(() => setPendingDestination(temp), 10);
                  }
                }}
                className="mt-3 px-4 py-2 rounded-full bg-white border border-red-200 text-red-700 text-xs font-black uppercase tracking-[0.18em] hover:border-red-300 transition-colors"
              >
                Retry
              </button>
            ) : null}
            <p className="mt-2 text-[11px] text-red-600 leading-relaxed">
              {baseDirs.networkError
                ? "This might be a temporary network issue. Please check your internet connection."
                : "This could be due to missing road data in the area or invalid coordinates."}
            </p>
          </div>
        ) : null}

        <div className="mt-4">
          {atQuizLocation ? (
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
              Answer the riddle in Status first, then you can travel to the next location.
            </p>
          ) : hasActiveStopFlow ? (
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
              Going to stop — travel mode locked
            </p>
          ) : prepModeLock ? (
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
              Preparing — travel mode locked
            </p>
          ) : optionsDisabledWhileTraveling ? (
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
              Traveling — options available at next stop
            </p>
          ) : null}
          <div className="grid grid-cols-3 gap-2">
            {travelOffers.map((o) => {
              // Allow selecting a mode whenever hunt has started; only action buttons (Go/Rent/Use) need destination + routes.
              const selectionDisabled = optionsDisabledWhileTraveling || !o.enabled;
              const selected = travelPickModeId === o.modeId;
              const isOwnedVehicle =
                o.owned &&
                (o.modeId === "bicycle" || o.modeId === "motorbike" || o.modeId === "car");
              const vehiclePct = isOwnedVehicle
                ? Math.max(
                    0,
                    Math.min(100, Math.round(vehicleState[o.modeId]?.healthPct ?? 0)),
                  )
                : null;

              return (
                <button
                  key={o.modeId}
                  type="button"
                  disabled={selectionDisabled}
                  onClick={() => {
                    if (selectionDisabled) return;
                    setTravelPickModeId(o.modeId);
                  }}
                  className={[
                    "relative group h-[76px] rounded-2xl border transition-colors flex flex-col items-center justify-center gap-1.5",
                    selectionDisabled ? "opacity-45 cursor-not-allowed" : "hover:border-[#2563EB]/40",
                    selected
                      ? "bg-[#0F172A] text-white border-white/10"
                      : "bg-[#F8FAFC] text-[#0F172A] border-[#F1F5F9]",
                  ].join(" ")}
                  title={o.prepLabel}
                >
                  {isOwnedVehicle ? (
                    <span className="absolute top-2 right-2">
                      <span className="relative group">
                        <span
                          className={[
                            "inline-flex items-center justify-center size-5 rounded-full border",
                            selected
                              ? "bg-white/10 border-white/15 text-white"
                              : "bg-white border-[#F1F5F9] text-slate-500",
                          ].join(" ")}
                          aria-label={`Maintenance ${vehiclePct ?? 0}%`}
                          title="Maintenance"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                            info
                          </span>
                        </span>
                        <span
                          className={[
                            "pointer-events-none absolute z-20 -top-2 right-0 translate-y-[-100%] whitespace-nowrap",
                            "px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                            "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity",
                            selected ? "bg-black/70 text-white" : "bg-[#0F172A] text-white",
                          ].join(" ")}
                        >
                          Maintenance {vehiclePct ?? 0}%
                        </span>
                      </span>
                    </span>
                  ) : null}
                  <span
                    className={["material-symbols-outlined", selected ? "text-white" : "text-[#0F172A]"].join(" ")}
                    style={{ fontSize: 22 }}
                  >
                    {o.icon}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest">{o.label}</span>
                </button>
              );
            })}
          </div>

          {selectedTravelOffer ? (
            <div className="mt-3 p-4 rounded-3xl border border-[#F1F5F9] bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-[#0F172A] truncate">
                    {selectedTravelOffer.label}
                    {selectedTravelOffer.canOwn && selectedTravelOffer.owned ? (
                      <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-[#10B981]">
                        Owned
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    ETA: {fmtEta(selectedTravelOffer.etaSeconds)}
                    {selectedTravelOffer.prepSeconds
                      ? ` + prep ${Math.round(selectedTravelOffer.prepSeconds / 60)} min`
                      : ""}
                  </p>
                </div>
              </div>

              {selectedTravelOffer.prepLabel ? (
                <p className="mt-3 text-xs text-slate-600">{selectedTravelOffer.prepLabel}</p>
              ) : null}

              {typeof selectedTravelOffer.trafficDelaySeconds === "number" &&
              selectedTravelOffer.trafficDelaySeconds >= 60 &&
              (selectedTravelOffer.modeId === "car" ||
                selectedTravelOffer.modeId === "motorbike" ||
                selectedTravelOffer.modeId === "bus") ? (
                <p className="mt-2 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  Live traffic: about {Math.round(selectedTravelOffer.trafficDelaySeconds / 60)} min slower than usual on
                  this road. Faster vehicles are not always faster today.
                </p>
              ) : null}

              {selectedTravelOffer.trafficAlternateAvailable &&
              setDrivingRouteChoice &&
              (selectedTravelOffer.modeId === "car" || selectedTravelOffer.modeId === "motorbike") ? (
                <div className="mt-3 p-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Route choice
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Another road is quicker right now. Pick which route to follow on the map.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={optionsDisabledWhileTraveling}
                      onClick={() => setDrivingRouteChoice("primary")}
                      className={[
                        "px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors",
                        drivingRouteChoice === "primary"
                          ? "bg-[#0F172A] text-white"
                          : "bg-white border border-[#E2E8F0] text-slate-600 hover:border-[#2563EB]/40",
                      ].join(" ")}
                    >
                      Main route
                    </button>
                    <button
                      type="button"
                      disabled={optionsDisabledWhileTraveling}
                      onClick={() => setDrivingRouteChoice("alternate")}
                      className={[
                        "px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors",
                        drivingRouteChoice === "alternate"
                          ? "bg-[#0F172A] text-white"
                          : "bg-white border border-[#E2E8F0] text-slate-600 hover:border-[#2563EB]/40",
                      ].join(" ")}
                    >
                      Faster route
                      {typeof selectedTravelOffer.trafficAlternateEtaSeconds === "number"
                        ? ` (~${fmtEta(selectedTravelOffer.trafficAlternateEtaSeconds)})`
                        : ""}
                    </button>
                  </div>
                </div>
              ) : null}

              {selectedTravelOffer.busSuggestAlightWalk ? (
                <div className="mt-3 p-3 rounded-2xl border border-amber-200 bg-amber-50/90">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">
                    Heavy traffic on the bus corridor
                  </p>
                  <p className="mt-1 text-xs text-amber-950/90">
                    You can still board the bus (it stops before the quiz, then you walk). Or switch to Walk if you
                    prefer to skip the jam on the map — no extra fare for walking.
                  </p>
                  <button
                    type="button"
                    disabled={optionsDisabledWhileTraveling}
                    onClick={() => setTravelPickModeId("walk")}
                    className={[
                      "mt-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest",
                      optionsDisabledWhileTraveling
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : "bg-white border border-amber-300 text-amber-900 hover:bg-amber-100",
                    ].join(" ")}
                  >
                    Switch to Walk
                  </button>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {(() => {
                  const o = selectedTravelOffer;
                  const disabled =
                    optionsDisabledWhileTraveling ||
                    (!pendingDestination && !destination) ||
                    (baseDirs.loading && !canRentOtherModesWhileWalking) ||
                    !o.enabled ||
                    (!canRentOtherModesWhileWalking && o.profile !== null && !modeRoute(o.modeId)?.coords?.length);
                  const loadingThisMode = travelActionLoading === o.modeId;

                  const btnBase =
                    "px-4 py-2.5 rounded-full font-black text-[11px] uppercase tracking-[0.18em] transition-colors whitespace-nowrap inline-flex items-center justify-center gap-2";

                  if (o.modeId === "walk") {
                    const goDisabled =
                      disabled || (isTraveling && currentMode === "walk") || loadingThisMode;
                    return (
                      <button
                        type="button"
                        disabled={goDisabled}
                        onClick={() => beginTravelWithMode(o.modeId)}
                        className={[
                          btnBase,
                          goDisabled
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "bg-[#0F172A] text-white hover:bg-[#2563EB]",
                        ].join(" ")}
                        title={
                          isTraveling && currentMode === "walk"
                            ? "Already walking"
                            : undefined
                        }
                      >
                        {loadingThisMode ? (
                          <>
                            <span className="inline-block size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Starting…
                          </>
                        ) : isTraveling && currentMode === "walk" ? (
                          "Walking…"
                        ) : (
                          "Go"
                        )}
                      </button>
                    );
                  }

                  if (o.modeId === "plane") {
                    return (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (!o.enabled) return;
                          if (!playerPos || !pendingDestination) return;
                          if (!o.fareCoins || credits < o.fareCoins) {
                            setPayError("Not enough coins for plane. Buy coins to continue.");
                            openDrawer("coins");
                            return;
                          }
                          setPlaneFlow({
                            stage: "choose_transfer",
                            finalTo: pendingDestination,
                            finalLabel: pendingDestinationLabel || destinationLabel,
                            from: playerPos,
                            fareCoins: o.fareCoins,
                            lookupNonce: 0,
                            loadingDeparture: false,
                            loadingArrival: false,
                            error: null,
                          });
                          setDrawer("plane");
                        }}
                        className={[
                          btnBase,
                          disabled
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "bg-[#0F172A] text-white hover:bg-[#2563EB]",
                        ].join(" ")}
                      >
                        Fly {o.fareCoins ? formatNaira(o.fareCoins) : ""}
                      </button>
                    );
                  }
                  if (o.modeId === "bus") {
                    const busDisabled = disabled || loadingThisMode;
                    return (
                      <button
                        type="button"
                        disabled={busDisabled}
                        onClick={() => beginTravelWithMode(o.modeId)}
                        className={[
                          btnBase,
                          busDisabled
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "bg-[#0F172A] text-white hover:bg-[#2563EB]",
                        ].join(" ")}
                      >
                        {loadingThisMode ? (
                          <>
                            <span className="inline-block size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Boarding…
                          </>
                        ) : (
                          <>Board {formatNaira(o.farePerRide ?? 0)}</>
                        )}
                      </button>
                    );
                  }

                  if (o.owned) {
                    const blocked = o.ownedUsable === false && Boolean(o.ownedBlockedReason);
                    if (blocked) {
                      return (
                        <>
                          <button
                            type="button"
                            disabled
                            className={[btnBase, "bg-slate-100 text-slate-400 cursor-not-allowed"].join(" ")}
                            title={o.ownedBlockedReason || ""}
                          >
                            {o.ownedBlockedReason || "Unavailable"}
                          </button>
                          {typeof o.rentCost === "number" ? (
                            <button
                              type="button"
                              disabled={disabled || loadingThisMode}
                              onClick={() => beginTravelWithMode(o.modeId)}
                              className={[
                                btnBase,
                                disabled || loadingThisMode
                                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                  : "bg-white border border-[#F1F5F9] text-[#0F172A] hover:border-[#2563EB]/40",
                              ].join(" ")}
                            >
                              {loadingThisMode ? (
                                <>
                                  <span className="inline-block size-3.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                                  {o.modeId === "car" ? "Booking…" : "Renting…"}
                                </>
                              ) : (
                                <>{o.modeId === "car" ? "Book" : "Rent"} {formatNaira(o.rentCost)}</>
                              )}
                            </button>
                          ) : null}
                        </>
                      );
                    }

                    const useDisabled = disabled || loadingThisMode;
                    return (
                      <button
                        type="button"
                        disabled={useDisabled}
                        onClick={() => beginTravelWithMode(o.modeId)}
                        className={[
                          btnBase,
                          useDisabled
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "bg-[#0F172A] text-white hover:bg-[#2563EB]",
                        ].join(" ")}
                      >
                        {loadingThisMode ? (
                          <>
                            <span className="inline-block size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Activating…
                          </>
                        ) : (
                          "Use"
                        )}
                      </button>
                    );
                  }

                  return (
                    <>
                      {typeof o.rentCost === "number" ? (
                        <button
                          type="button"
                          disabled={disabled || loadingThisMode}
                          onClick={() => beginTravelWithMode(o.modeId)}
                          className={[
                            btnBase,
                            disabled || loadingThisMode
                              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                              : "bg-white border border-[#F1F5F9] text-[#0F172A] hover:border-[#2563EB]/40",
                          ].join(" ")}
                        >
                          {loadingThisMode ? (
                            <>
                              <span className="inline-block size-3.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                              {o.modeId === "car" ? "Booking…" : "Renting…"}
                            </>
                          ) : (
                            <>{o.modeId === "car" ? "Book" : "Rent"} {formatNaira(o.rentCost)}</>
                          )}
                        </button>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
