"use client";

import Link from "next/link";
import { AppHeaderWithAuth } from "@/components/AppHeaderWithAuth";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { useAuth } from "@/hooks/useAuth";

export default function HowItWorksPage() {
  const { user, loading } = useAuth();

  const header = loading ? (
    <AppHeader variant="overlay" active="home" credits="0" tokens="0" />
  ) : user ? (
    <AppHeaderWithAuth variant="overlay" active="home" tokensIcon="groups" />
  ) : (
    <AppHeader
      variant="overlay"
      active="home"
      credits="0"
      tokens="0"
      rightSlot={
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/auth/login" className="text-sm font-bold px-4 py-2 hover:opacity-70 transition-opacity">
            Sign In
          </Link>
          <Link
            href="/auth/signup"
            className="bg-[#0F172A] text-white text-sm font-extrabold px-5 py-3 rounded-full soft-shadow hover:bg-[#2563EB] transition-colors"
          >
            Create Hunter Profile
          </Link>
        </div>
      }
    />
  );

  return (
    <div className="min-h-screen relative overflow-x-hidden bg-black text-[#0F172A]">
      <div className="fixed inset-0 z-0 map-bg" aria-hidden="true" />
      <div className="fixed inset-0 z-0 bg-white/55" aria-hidden="true" />
      <div className="fixed inset-0 z-0 grid-overlay pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 min-h-screen flex flex-col">
        {header}

        <main className="flex-1 max-w-4xl mx-auto w-full p-6 lg:p-8 pt-24 lg:pt-28">
          <div className="bg-white/92 backdrop-blur-md border border-[#F1F5F9] rounded-[2.5rem] soft-shadow p-7 sm:p-10">
            <p className="text-[11px] font-black uppercase tracking-[0.35em] text-[#2563EB]">
              How it works
            </p>
            <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0F172A]">
              A live treasure hunt on a real map.
            </h1>

            <div className="mt-5 p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
              <p className="text-sm font-extrabold text-emerald-800">
                The hunt is free to join.
              </p>
              <p className="mt-1 text-sm text-emerald-900/80 leading-relaxed">
                You can start playing without paying. Coins only affect optional travel choices and
                convenience (e.g. bus/plane, booking a ride), not your ability to join the hunt.
              </p>
              <p className="mt-2 text-sm text-emerald-900/80 leading-relaxed">
                Loading your wallet is done via <span className="font-bold">Paystack</span> — a secured payment gateway.
                <span className="font-bold"> Wallet top-up is free and unlimited</span> (no extra charges/fees from Loota);
                you only pay the amount you choose to add.
              </p>
            </div>

            <section className="mt-8">
              <h2 className="text-lg font-extrabold text-[#0F172A]">What you should expect</h2>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {
                    title: "Live objectives",
                    body:
                      "You’ll see checkpoints on the map. Each checkpoint is a real place and has a short timed quiz.",
                  },
                  {
                    title: "Skill matters",
                    body:
                      "Win by solving fast, choosing smart routes, and managing constraints (rest/refuel).",
                  },
                  {
                    title: "Travel choices",
                    body:
                      "Walk is always available. You can also use bike/motorbike/bus/plane. Car can be owned or booked as a ride.",
                  },
                  {
                    title: "Fair play",
                    body:
                      "Questions are generated per step and graded strictly. You can’t skip a checkpoint task and still progress.",
                  },
                ].map((x) => (
                  <div key={x.title} className="p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9]">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">{x.title}</p>
                    <p className="mt-2 text-sm text-slate-700 leading-relaxed">{x.body}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-extrabold text-[#0F172A]">Step-by-step</h2>
              <ol className="mt-4 space-y-4">
                {[
                  {
                    title: "Create your hunter profile",
                    body:
                      "Sign up, pick a username, and you’re ready. Your avatar is generated automatically unless you set one.",
                  },
                  {
                    title: "Enter the lobby / hunt",
                    body:
                      "When a hunt is active, enter it. If it hasn’t started yet, you’ll see a countdown in the lobby.",
                  },
                  {
                    title: "Set your destination",
                    body:
                      "Open Travel and set the next checkpoint as your destination. You’ll see route + ETA for your travel mode.",
                  },
                  {
                    title: "Move to the checkpoint",
                    body:
                      "As you travel, the marker advances on the route. Some modes have short prep time (pickup/boarding).",
                  },
                  {
                    title: "Answer the checkpoint quiz (timed)",
                    body:
                      "When you arrive, open Status and tap Start. Solve the quiz before time runs out to earn the key for that checkpoint.",
                  },
                  {
                    title: "Repeat until you have all keys",
                    body:
                      "Every checkpoint gives one key. Collect all required keys to finish the hunt.",
                  },
                ].map((s, i) => (
                  <li key={s.title} className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
                    <div className="flex items-start gap-3">
                      <div className="size-8 rounded-full bg-[#0F172A] text-white grid place-items-center font-black text-sm shrink-0">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-[#0F172A]">{s.title}</p>
                        <p className="mt-1 text-sm text-slate-600 leading-relaxed">{s.body}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-extrabold text-[#0F172A]">Coins and pricing (simple)</h2>
              <div className="mt-4 p-5 rounded-3xl bg-[#F8FAFC] border border-[#F1F5F9] space-y-3">
                <p className="text-sm text-slate-700 leading-relaxed">
                  Loota is free to join. Coins are used for some travel and recovery actions.
                </p>
                <ul className="text-sm text-slate-700 leading-relaxed list-disc pl-5 space-y-1">
                  <li><span className="font-bold">Free:</span> joining the hunt, walking, and playing quizzes.</li>
                  <li>
                    <span className="font-bold">Optional spend:</span> boarding bus, taking a plane, booking a ride, renting modes, or paying for stops (rest/refuel/rejuvenate) when enforced.
                  </li>
                  <li>
                    <span className="font-bold">Owned vehicles:</span> if you own a vehicle, you can use it without rental costs, but it may require maintenance over time.
                  </li>
                </ul>
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-extrabold text-[#0F172A]">Quick FAQ</h2>
              <div className="mt-4 space-y-3">
                {[
                  {
                    q: "Do I have to pay to play?",
                    a: "No. The hunt is free to join and play. Coins only affect travel options and convenience.",
                  },
                  {
                    q: "What happens if I fail a quiz?",
                    a: "You won’t get the key for that checkpoint. You may be rerouted and you’ll need to reach the checkpoint again to try a new question.",
                  },
                  {
                    q: "Why do I see prep timers (boarding / driver arriving)?",
                    a: "Some modes simulate pickup/boarding so travel feels realistic. When the timer ends, the journey continues automatically.",
                  },
                ].map((f) => (
                  <div key={f.q} className="p-5 rounded-3xl bg-white border border-[#F1F5F9]">
                    <p className="text-sm font-extrabold text-[#0F172A]">{f.q}</p>
                    <p className="mt-1 text-sm text-slate-600 leading-relaxed">{f.a}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <Link
                href="/"
                className="flex-1 px-6 py-4 rounded-full bg-white border border-[#F1F5F9] font-black text-xs uppercase tracking-[0.2em] text-[#0F172A] hover:border-[#2563EB]/40 transition-colors text-center"
              >
                Back to home
              </Link>
              <Link
                href="/lobby"
                className="flex-1 px-6 py-4 rounded-full bg-[#0F172A] text-white font-black text-xs uppercase tracking-[0.2em] hover:bg-[#2563EB] transition-colors text-center"
              >
                Enter lobby
              </Link>
            </div>
          </div>
        </main>

        <AppFooter />
      </div>
    </div>
  );
}

