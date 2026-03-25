"use client";

import { useEffect, useState } from "react";
import type { LngLat, PlaneFlow } from "@/app/hunts/types";

const BOARDING_MINUTES = 10;
const DISEMBARKING_MINUTES = 5;

function formatCountdown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  planeFlow: PlaneFlow | null;
  setPlaneFlow: React.Dispatch<React.SetStateAction<PlaneFlow | null>>;
  progress: number;
  fmtCoord: (n: number) => string;
  setDrawer: (id: "travel" | null) => void;
  onChooseTransfer: (departureAirportTo: LngLat, arrivalAirportTo: LngLat) => void;
};

export function HuntsPlaneDrawerContent({
  planeFlow,
  setPlaneFlow,
  progress,
  fmtCoord,
  setDrawer,
  onChooseTransfer,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const isWaiting = planeFlow?.stage === "boarding" || planeFlow?.stage === "disembarking";
  useEffect(() => {
    if (!isWaiting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isWaiting]);

  const boardingRemainingMs =
    planeFlow?.stage === "boarding" && planeFlow.boardingStartedAt != null
      ? BOARDING_MINUTES * 60 * 1000 - (now - planeFlow.boardingStartedAt)
      : 0;
  const disembarkingRemainingMs =
    planeFlow?.stage === "disembarking" && planeFlow.disembarkingEndsAt != null
      ? planeFlow.disembarkingEndsAt - now
      : 0;

  return (
    <div className="space-y-4">
      <div className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Plane selected
        </p>
        <p className="mt-2 text-sm font-extrabold text-[#0F172A]">
          {planeFlow?.stage === "flying"
            ? "Flying…"
            : planeFlow?.stage === "boarding"
              ? "Boarding"
              : planeFlow?.stage === "disembarking"
                ? "Disembarking"
                : "Step 1: get to the airport"}
        </p>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          {planeFlow?.stage === "flying"
            ? "You're in the air. We'll open the travel picker when you land so you can continue to the final destination."
            : planeFlow?.stage === "boarding"
              ? `Your flight will depart in ${BOARDING_MINUTES} minutes. Please wait at the airport — boarding in progress.`
              : planeFlow?.stage === "disembarking"
                ? `You've landed. You can continue to your destination in ${DISEMBARKING_MINUTES} minutes.`
                : planeFlow?.stage === "to_departure"
                  ? "Transfer is selected. Choose a travel mode in the Travel drawer to reach the departure airport."
                  : "Choose a travel mode to reach the departure airport in your state. After you arrive, there is a 10 min boarding wait, then we'll fly you to the destination airport. After landing, a 5 min disembarking wait applies, then you can continue to the final destination."}
        </p>
        {planeFlow?.stage === "boarding" && planeFlow.boardingStartedAt != null ? (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Departure in
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 tabular-nums">
                {formatCountdown(boardingRemainingMs)}
              </p>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white border border-[#F1F5F9] overflow-hidden">
              <div
                className="h-full bg-[#0F172A] transition-all duration-1000"
                style={{
                  width: `${Math.min(100, (100 * (BOARDING_MINUTES * 60 * 1000 - boardingRemainingMs)) / (BOARDING_MINUTES * 60 * 1000))}%`,
                }}
              />
            </div>
          </div>
        ) : planeFlow?.stage === "disembarking" && planeFlow.disembarkingEndsAt != null ? (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                You can continue in
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 tabular-nums">
                {formatCountdown(disembarkingRemainingMs)}
              </p>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white border border-[#F1F5F9] overflow-hidden">
              <div
                className="h-full bg-[#2563EB] transition-all duration-1000"
                style={{
                  width: `${Math.min(100, (100 * (DISEMBARKING_MINUTES * 60 * 1000 - disembarkingRemainingMs)) / (DISEMBARKING_MINUTES * 60 * 1000))}%`,
                }}
              />
            </div>
          </div>
        ) : planeFlow?.stage === "flying" ? (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Flight progress
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 tabular-nums">
                {Math.round(progress * 100)}%
              </p>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white border border-[#F1F5F9] overflow-hidden">
              <div
                className="h-full bg-[#0F172A]"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">Destination</p>
        <p className="mt-2 text-sm font-extrabold">{planeFlow?.finalLabel || "—"}</p>
      </div>

      <div className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Airports</p>
          {planeFlow?.loadingDeparture || planeFlow?.loadingArrival ? (
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Finding in your state…
            </span>
          ) : null}
        </div>

        {planeFlow?.error ? (
          <div className="mt-3 p-4 rounded-2xl bg-red-50 border border-red-100">
            <p className="text-sm font-extrabold text-red-700">
              {planeFlow.error.includes("arrival") ||
              planeFlow.error.includes("destination") ||
              (!planeFlow.departureAirport && planeFlow.loadingArrival === false)
                ? "Cannot travel by plane"
                : "Airport search failed"}
            </p>
            <p className="mt-2 text-xs text-red-600 leading-relaxed">
              {planeFlow.error.includes("arrival") ||
              planeFlow.error.includes("destination") ||
              (!planeFlow.departureAirport && planeFlow.loadingArrival === false)
                ? "No airport found near your destination. Plane travel requires airports at both your current location and destination. Please choose a different travel mode."
                : planeFlow.error.includes("departure") ||
                    (!planeFlow.departureAirport && planeFlow.loadingDeparture === false)
                  ? "No airport found in your current state. Plane travel is not available from this location. Please choose a different travel mode."
                  : planeFlow.error}
            </p>
            {!planeFlow.error.includes("arrival") && !planeFlow.error.includes("destination") && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setPlaneFlow((p) =>
                      p
                        ? {
                            ...p,
                            departureAirport: undefined,
                            arrivalAirport: undefined,
                            loadingDeparture: false,
                            loadingArrival: false,
                            error: null,
                            lookupNonce: (p.lookupNonce || 0) + 1,
                          }
                        : p,
                    )
                  }
                  className="mt-3 px-4 py-2 rounded-full bg-white border border-red-200 text-red-700 text-xs font-black uppercase tracking-[0.18em] hover:border-red-300 transition-colors"
                >
                  Retry
                </button>
                <p className="mt-2 text-[11px] text-red-500 leading-relaxed">
                  First lookup can take a bit depending on the airport data source.
                </p>
              </>
            )}
          </div>
        ) : null}

        {planeFlow?.departureAirport ? (
          <>
            <p className="mt-3 text-xs font-black uppercase tracking-widest text-slate-500">
              Departure airport (your state)
            </p>
            <p className="mt-2 text-sm font-extrabold">{planeFlow.departureAirport.place_name}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {fmtCoord(planeFlow.departureAirport.center[1])},{" "}
              {fmtCoord(planeFlow.departureAirport.center[0])}
            </p>

            <div className="mt-4 border-t border-[#F1F5F9] pt-4">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                Arrival airport (destination state)
              </p>
              {planeFlow.arrivalAirport ? (
                <>
                  <p className="mt-2 text-sm font-extrabold">
                    {planeFlow.arrivalAirport.place_name}
                  </p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {fmtCoord(planeFlow.arrivalAirport.center[1])},{" "}
                    {fmtCoord(planeFlow.arrivalAirport.center[0])}
                  </p>
                </>
              ) : planeFlow.loadingArrival === true ? (
                <p className="mt-2 text-sm text-slate-600">Finding destination airport…</p>
              ) : planeFlow.error !== null &&
                (planeFlow.error.includes("arrival") ||
                  planeFlow.error.includes("destination") ||
                  !planeFlow.arrivalAirport) ? (
                <div className="mt-2 p-3 rounded-2xl bg-red-50 border border-red-100">
                  <p className="text-xs font-extrabold text-red-700">
                    Destination airport not found
                  </p>
                  <p className="mt-1 text-[11px] text-red-600 leading-relaxed">
                    No airport found near your destination. Plane travel requires airports at both
                    locations. Please choose a different travel mode.
                  </p>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              disabled={
                !planeFlow ||
                !planeFlow.departureAirport ||
                planeFlow.loadingArrival === true ||
                planeFlow.stage === "flying" ||
                planeFlow.stage === "boarding" ||
                planeFlow.stage === "disembarking" ||
                (planeFlow.error !== null &&
                  (planeFlow.error.includes("arrival") ||
                    planeFlow.error.includes("destination") ||
                    !planeFlow.arrivalAirport))
              }
              onClick={() => {
                if (!planeFlow || !planeFlow.departureAirport) return;
                if (planeFlow.stage === "flying" || planeFlow.stage === "boarding" || planeFlow.stage === "disembarking") return;
                if (planeFlow.loadingArrival === true) return;
                if (
                  planeFlow.error !== null &&
                  (planeFlow.error.includes("arrival") ||
                    planeFlow.error.includes("destination") ||
                    !planeFlow.arrivalAirport)
                )
                  return;
                if (planeFlow.stage === "to_departure") {
                  setDrawer("travel");
                  return;
                }
                const airportTo: LngLat = {
                  lng: planeFlow.departureAirport.center[0],
                  lat: planeFlow.departureAirport.center[1],
                };
                const arrivalAirportTo: LngLat = planeFlow.arrivalAirport
                  ? {
                      lng: planeFlow.arrivalAirport.center[0],
                      lat: planeFlow.arrivalAirport.center[1],
                    }
                  : planeFlow.finalTo;
                setPlaneFlow((p) => (p ? { ...p, stage: "to_departure" } : p));
                onChooseTransfer(airportTo, arrivalAirportTo);
              }}
              className={[
                "mt-4 w-full px-5 py-3 rounded-full font-extrabold text-xs uppercase tracking-[0.2em] transition-colors",
                !planeFlow ||
                !planeFlow.departureAirport ||
                planeFlow.loadingArrival === true ||
                planeFlow.stage === "flying" ||
                planeFlow.stage === "boarding" ||
                planeFlow.stage === "disembarking" ||
                (planeFlow.error !== null &&
                  (planeFlow.error.includes("arrival") ||
                    planeFlow.error.includes("destination") ||
                    !planeFlow.arrivalAirport))
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-[#0F172A] text-white hover:bg-[#2563EB]",
              ].join(" ")}
            >
              {planeFlow?.loadingArrival === true
                ? "Finding destination airport…"
                : planeFlow?.error !== null &&
                    (planeFlow.error.includes("arrival") ||
                      planeFlow.error.includes("destination") ||
                      !planeFlow.arrivalAirport)
                  ? "Airport not found"
                  : planeFlow?.stage === "to_departure"
                    ? "Continue transfer"
                    : planeFlow?.stage === "boarding"
                      ? "Boarding…"
                      : planeFlow?.stage === "flying"
                        ? "Flight in progress"
                        : planeFlow?.stage === "disembarking"
                          ? "Disembarking…"
                          : "Choose transfer mode"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
