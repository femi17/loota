"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import type { ReactNode } from "react";

export type AppNavKey =
  | "home"
  | "hunts"
  | "lobby"
  | "inventory"
  | "map"
  | "profile";

type Props = {
  active: AppNavKey;
  credits: string;
  tokens: string;
  tokensIcon?: string;
  username?: string;
  subtitle?: string;
  avatarUrl?: string;
  variant?: "page" | "overlay" | "minimal";
  rightSlot?: ReactNode;
  onMapClick?: () => void;
  onProfileClick?: () => void;
};

const defaultAvatar =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCuPKTQJY65HGtn_YBV1lqWdQ6_NdjGHBCY9Hf4NroVsUdsnVnlbsiD4gNiDOMIZcdLegnw79vNsrY4clY4Fg6R7vsRJxFdy_i4N7fEnKjGmjLM9VoqZdyFtmf1GBvPCh4Zsckm71im9h8aRv49WWquXGbPz3Wh96fg7jUk3hFbcBchgbd-3U7qy3O5AIqcgSrNMeXxXqlLjROz2sA1Fvlsh7lDvkBlRoGh1qZUbqJz2oOU_YYgxFXoP6wPYYO1lEjiMowqdDjODh3r";

function navClass(isActive: boolean) {
  return isActive
    ? "text-sm font-semibold text-[#0F172A] transition-all duration-200 relative py-2 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-[#2563EB] after:rounded-full"
    : "text-sm font-semibold text-[#0F172A]/50 hover:text-[#0F172A] transition-all duration-200 relative py-2";
}

export function AppHeader({
  active,
  credits,
  tokens,
  tokensIcon = "token",
  username = "Cipher_Player",
  subtitle = "Level 14 Scavenger",
  avatarUrl = defaultAvatar,
  variant = "page",
  rightSlot,
  onMapClick,
  onProfileClick,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (menuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [menuOpen]);
  const containerClass =
    variant === "overlay"
      ? "fixed top-4 left-4 right-4 z-[100]"
      : variant === "minimal"
        ? "fixed top-4 left-4 right-4 z-[100]"
        : "sticky top-0 z-50 px-4 sm:px-6 md:px-8 py-4";

  const showNav = variant !== "minimal";

  return (
    <div className={containerClass}>
      <div className="flex items-start justify-between gap-3 pointer-events-auto">
        {/* Left segment: logo + menus (hidden when minimal) */}
        <header className="h-11 md:h-14 bg-white/85 backdrop-blur-md border border-[#F1F5F9] rounded-xl md:rounded-2xl soft-shadow px-3 sm:px-4 flex items-center gap-4 min-w-0 flex-1 md:flex-initial">
          <Link className="flex items-center group min-w-0 shrink-0" href="/">
            <Image
              src="/logo.png"
              alt="Loota"
              width={280}
              height={112}
              className="h-12 md:h-14 w-auto object-contain group-hover:opacity-90 transition-opacity"
              priority
            />
          </Link>

          {showNav && (
          <nav className="hidden md:flex items-center gap-7 pl-2 shrink-0">
            <Link className={navClass(active === "home")} href="/">
              Home
            </Link>
            <Link className={navClass(active === "lobby")} href="/lobby">
              Lobby
            </Link>
            <Link className={navClass(active === "inventory")} href="/inventory">
              Inventory
            </Link>
            <Link className={navClass(active === "hunts")} href="/hunts">
              Hunts
            </Link>

            {onProfileClick ? (
              <button
                type="button"
                onClick={onProfileClick}
                className={navClass(active === "profile")}
              >
                Profile
              </button>
            ) : (
              <Link className={navClass(active === "profile")} href="/profile">
                Profile
              </Link>
            )}
          </nav>
          )}

          {/* Mobile menu button — visible only below md when nav shown */}
          {showNav && (
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="md:hidden ml-auto shrink-0 size-9 flex items-center justify-center rounded-lg hover:bg-[#F1F5F9] transition-colors text-[#0F172A] border-0 bg-transparent cursor-pointer"
            aria-label="Open menu"
          >
            <span className="material-symbols-outlined text-2xl select-none" aria-hidden>menu</span>
          </button>
          )}
        </header>

        {/* Right segment(s): when minimal only rightSlot; else wallet + user or rightSlot */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {variant === "minimal" ? (
            rightSlot ? (
              <div className="flex h-11 md:h-14 bg-white/85 backdrop-blur-md border border-[#F1F5F9] rounded-xl md:rounded-2xl soft-shadow px-3 sm:px-4 items-center">
                {rightSlot}
              </div>
            ) : null
          ) : rightSlot ? (
            <div className="hidden md:flex h-14 bg-white/85 backdrop-blur-md border border-[#F1F5F9] rounded-2xl soft-shadow px-3 sm:px-4 items-center">
              {rightSlot}
            </div>
          ) : (
            <>
              <div className="h-11 md:h-14 bg-white/85 backdrop-blur-md border border-[#F1F5F9] rounded-xl md:rounded-2xl soft-shadow px-2.5 md:px-4 flex items-center">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="flex items-center gap-1 md:gap-1.5">
                    <span className="material-symbols-outlined text-[#F59E0B] text-base md:text-lg fill-1">
                      database
                    </span>
                    <span className="text-xs md:text-sm font-extrabold text-[#0F172A] tabular-nums">
                      {credits}
                    </span>
                  </div>
                  <div className="w-px h-3.5 md:h-4 bg-slate-200" />
                  <div className="flex items-center gap-1 md:gap-1.5">
                    <span className="material-symbols-outlined text-[#2563EB] text-base md:text-lg">
                      {tokensIcon}
                    </span>
                    <span className="text-xs md:text-sm font-extrabold text-[#0F172A] tabular-nums">
                      {tokens}
                    </span>
                  </div>
                </div>
              </div>

              <div className="h-11 md:h-14 bg-white/85 backdrop-blur-md border border-[#F1F5F9] rounded-xl md:rounded-2xl soft-shadow pl-2 pr-2.5 md:px-4 flex items-center gap-2 md:gap-3">
                {onProfileClick ? (
                  <button
                    type="button"
                    onClick={onProfileClick}
                    className="flex items-center gap-2 md:gap-3 cursor-pointer group hover:opacity-90 transition-opacity text-left"
                    aria-label="Profile"
                  >
                    <div className="text-right hidden md:block">
                      <p className="text-xs font-bold leading-none">{username}</p>
                      <p className="text-[10px] text-slate-400 font-medium mt-1">
                        {subtitle}
                      </p>
                    </div>
                    <div className="size-8 md:size-10 rounded-full border-2 border-white shadow-sm overflow-hidden ring-1 ring-slate-100 shrink-0">
                      <Image
                        alt="Profile"
                        src={avatarUrl}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    </div>
                  </button>
                ) : (
                  <Link
                    href="/profile"
                    className="flex items-center gap-2 md:gap-3 cursor-pointer group hover:opacity-90 transition-opacity text-left"
                    aria-label="Profile"
                  >
                    <div className="text-right hidden md:block">
                      <p className="text-xs font-bold leading-none">{username}</p>
                      <p className="text-[10px] text-slate-400 font-medium mt-1">
                        {subtitle}
                      </p>
                    </div>
                    <div className="size-8 md:size-10 rounded-full border-2 border-white shadow-sm overflow-hidden ring-1 ring-slate-100 shrink-0">
                      <Image
                        alt="Profile"
                        src={avatarUrl}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    </div>
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile menu overlay + drawer (hidden from md up; tablets use desktop nav) */}
      {menuOpen && (
        <>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="md:hidden fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
            aria-label="Close menu"
          />
          <div className="md:hidden fixed top-0 right-0 bottom-0 z-[71] w-full max-w-[320px] bg-white border-l border-[#F1F5F9] shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[#F1F5F9]">
              <span className="text-lg font-extrabold tracking-tighter">Menu</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="size-10 flex items-center justify-center rounded-xl hover:bg-[#F1F5F9] transition-colors"
                aria-label="Close menu"
              >
                <span className="material-symbols-outlined text-2xl">close</span>
              </button>
            </div>
            <nav className="flex flex-col p-4 gap-1">
              <Link
                className={`block py-3 px-4 rounded-xl ${active === "home" ? "bg-[#2563EB]/10 text-[#0F172A] font-semibold" : "text-slate-600 hover:bg-[#F8FAFC]"}`}
                href="/"
                onClick={() => setMenuOpen(false)}
              >
                Home
              </Link>
              <Link
                className={`block py-3 px-4 rounded-xl ${active === "lobby" ? "bg-[#2563EB]/10 text-[#0F172A] font-semibold" : "text-slate-600 hover:bg-[#F8FAFC]"}`}
                href="/lobby"
                onClick={() => setMenuOpen(false)}
              >
                Lobby
              </Link>
              <Link
                className={`block py-3 px-4 rounded-xl ${active === "inventory" ? "bg-[#2563EB]/10 text-[#0F172A] font-semibold" : "text-slate-600 hover:bg-[#F8FAFC]"}`}
                href="/inventory"
                onClick={() => setMenuOpen(false)}
              >
                Inventory
              </Link>
              <Link
                className={`block py-3 px-4 rounded-xl ${active === "hunts" ? "bg-[#2563EB]/10 text-[#0F172A] font-semibold" : "text-slate-600 hover:bg-[#F8FAFC]"}`}
                href="/hunts"
                onClick={() => setMenuOpen(false)}
              >
                Hunts
              </Link>
              {onProfileClick ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onProfileClick();
                  }}
                  className={`block w-full text-left py-3 px-4 rounded-xl ${active === "profile" ? "bg-[#2563EB]/10 text-[#0F172A] font-semibold" : "text-slate-600 hover:bg-[#F8FAFC]"}`}
                >
                  Profile
                </button>
              ) : (
                <Link
                  className={`block py-3 px-4 rounded-xl ${active === "profile" ? "bg-[#2563EB]/10 text-[#0F172A] font-semibold" : "text-slate-600 hover:bg-[#F8FAFC]"}`}
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                >
                  Profile
                </Link>
              )}
            </nav>
            {rightSlot ? (
              <div className="mt-auto p-4 border-t border-[#F1F5F9]">
                <div className="flex flex-col gap-3 [&>*]:flex [&>*]:flex-col [&>*]:gap-2 [&>*]:w-full [&_a]:block [&_a]:text-center [&_a]:py-3 [&_button]:block [&_button]:text-center [&_button]:py-3 [&_span]:block [&_span]:text-center [&_span]:py-3" onClick={() => setMenuOpen(false)}>
                  {rightSlot}
                </div>
              </div>
            ) : (
              <div className="mt-auto p-4 border-t border-[#F1F5F9] space-y-3">
                <div className="flex items-center justify-between gap-4 py-2 px-3 rounded-xl bg-[#F8FAFC]">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#F59E0B] text-lg fill-1">database</span>
                    <span className="text-sm font-extrabold text-[#0F172A]">{credits}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#2563EB] text-lg">{tokensIcon}</span>
                    <span className="text-sm font-extrabold text-[#0F172A]">{tokens}</span>
                  </div>
                </div>
                {onProfileClick ? (
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); onProfileClick(); }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#F8FAFC] transition-colors text-left"
                  >
                    <div className="size-10 rounded-full border-2 border-[#F1F5F9] overflow-hidden ring-1 ring-slate-100 shrink-0">
                      <Image alt="" src={avatarUrl} width={40} height={40} className="w-full h-full object-cover" unoptimized />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#0F172A] truncate">{username}</p>
                      <p className="text-[10px] text-slate-400 truncate">{subtitle}</p>
                    </div>
                  </button>
                ) : (
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#F8FAFC] transition-colors text-left"
                  >
                    <div className="size-10 rounded-full border-2 border-[#F1F5F9] overflow-hidden ring-1 ring-slate-100 shrink-0">
                      <Image alt="" src={avatarUrl} width={40} height={40} className="w-full h-full object-cover" unoptimized />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#0F172A] truncate">{username}</p>
                      <p className="text-[10px] text-slate-400 truncate">{subtitle}</p>
                    </div>
                  </Link>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

