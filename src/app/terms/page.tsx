"use client";

import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white text-[#0F172A]">
      <AppHeader
        variant="page"
        active="home"
        credits="0"
        tokens="0"
        rightSlot={
          <Link
            href="/"
            className="text-sm font-bold px-4 py-2 hover:opacity-70 transition-opacity"
          >
            Back to Home
          </Link>
        }
      />

      <main className="flex-1 max-w-3xl mx-auto w-full p-6 lg:p-10 pt-24 lg:pt-28">
        <h1 className="text-3xl font-extrabold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-600">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-slate-700">
          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">1. Overview</h2>
            <p>
              Loota is a location-based treasure hunt game. By creating an account, joining hunts,
              or using any part of the service, you agree to these Terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">2. Eligibility</h2>
            <p>
              You must be legally able to use the service in your jurisdiction. Some hunts may have
              additional eligibility requirements (for example, minimum level or region).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">3. Account and Security</h2>
            <p>
              You are responsible for your account, device, and any activity on your account.
              Do not share access tokens, passwords, or payment references.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">4. Gameplay, Fair Play, and Cheating</h2>
            <p>
              Hunts are competitive. You agree not to exploit bugs, automate actions, manipulate
              location signals, or otherwise gain an unfair advantage. We may suspend or terminate
              accounts involved in cheating or abuse.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">5. Location and Safety</h2>
            <p>
              Loota may use your device location to show hunts and gameplay state. You are
              responsible for your own safety. Do not play in dangerous areas, do not trespass, and
              never use the game while driving or operating vehicles.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">6. Coins, Wallet, and Payments</h2>
            <p>
              The game may offer a wallet balance (“coins”) used for in-game actions. Coins are not
              legal tender and have no cash value unless explicitly stated for a specific promotion
              or payout flow. Payment processing for top-ups may be handled by third parties (for
              example, Paystack) and is subject to their terms.
            </p>
            <p>
              We may apply verification and anti-fraud checks. If a payment fails verification, we
              may refuse to credit coins.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">7. Hunt Prizes</h2>
            <p>
              Some hunts may offer prizes. Prize rules may include number of winners, time windows,
              and eligibility requirements. We may require identity or eligibility verification
              before awarding prizes. If a hunt is cancelled or compromised (for example, cheating
              or system failure), we may modify, pause, or void results to protect fairness.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">8. Content and Acceptable Use</h2>
            <p>
              You agree not to post unlawful, harmful, or abusive content (including in lobby chat).
              We may remove content or restrict features to protect the community.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">9. Service Availability</h2>
            <p>
              We work hard to keep Loota available, but we do not guarantee uninterrupted service.
              Features may change, and maintenance or outages may occur.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">10. Termination</h2>
            <p>
              We may suspend or terminate accounts for violations of these Terms, suspected fraud,
              cheating, or abuse. You can stop using the service at any time.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">11. Contact</h2>
            <p>
              For support or questions about these Terms, contact the team through the channels
              provided in the app or your deployment’s support email.
            </p>
          </section>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}

