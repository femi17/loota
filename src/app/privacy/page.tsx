"use client";

import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-600">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-slate-700">
          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">1. What we collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-bold">Account data</span>: email, authentication identifiers,
                and basic profile fields (username, avatar).
              </li>
              <li>
                <span className="font-bold">Gameplay data</span>: hunt registrations, keys earned,
                actions taken, and in-game wallet/transactions.
              </li>
              <li>
                <span className="font-bold">Location data</span>: if you grant permission, we may
                use your approximate or precise location to place you on the map and support hunt
                mechanics.
              </li>
              <li>
                <span className="font-bold">Device & usage</span>: basic logs and diagnostics to
                keep the service reliable and secure.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">2. How we use data</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide core gameplay (hunts, broadcast/live view, leaderboards).</li>
              <li>Prevent fraud/cheating and protect game integrity.</li>
              <li>Operate payments and wallet top-ups (via payment providers).</li>
              <li>Improve performance and reliability.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">3. Sharing</h2>
            <p>
              We do not sell your personal information. We may share limited data with:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-bold">Infrastructure providers</span> (hosting, database,
                caching) to run the app.
              </li>
              <li>
                <span className="font-bold">Payment processors</span> (e.g. Paystack) to process
                wallet top-ups and verify transactions.
              </li>
              <li>
                <span className="font-bold">Maps providers</span> (e.g. Mapbox) to render maps and
                routing.
              </li>
              <li>
                <span className="font-bold">AI providers</span> (if enabled) to generate or grade
                questions. Do not submit sensitive information in free-text answers.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">4. Location choices</h2>
            <p>
              You can deny location permissions, but some features may not work (for example,
              accurate spawn/positioning). If enabled, location may be processed to update your
              position during hunts and broadcast views.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">5. Retention</h2>
            <p>
              We retain data as needed to operate hunts, prevent abuse, comply with legal
              obligations, and maintain audit trails for transactions.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">6. Security</h2>
            <p>
              We use reasonable safeguards to protect data (access controls, server-side verification
              for payments, and database policies). No system is 100% secure, so please use a strong
              password and keep your device secure.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">7. Your rights</h2>
            <p>
              Depending on your location, you may have rights to access, correct, or delete your
              personal data. Contact the team through the support channels in your deployment.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold text-[#0F172A]">8. Changes</h2>
            <p>
              We may update this policy from time to time. We’ll update the “Last updated” date and,
              where appropriate, provide additional notice in the app.
            </p>
          </section>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}

