# App security & reliability audit

*(This file was reconstructed after accidental corruption. You may want to merge in any backup you have.)*

---

## 1. Critical and high-priority issues

### 1.1 Critical

| Issue | Where | Risk | Recommendation |
|-------|--------|------|----------------|
| **Wallet credits without payment verification** | `POST /api/wallet/add-coins` | Anyone could add arbitrary credits. | **Fixed:** Paystack webhook verifies; add-coins accepts only `reference` and verifies with Paystack. |
| **Mapbox token in repo** | `next.config.ts` | Token exposed if repo public/leaked. | **Fixed:** Use only `process.env.NEXT_PUBLIC_MAPBOX_TOKEN`. |
| **Open redirect on auth callback** | `src/app/auth/callback/page.tsx` | `next` param could redirect off-site. | **Fixed:** Allow only same-origin paths (e.g. start with `/`, not `//`). |

### 1.2 High-priority issues

- **create-profile:** **Fixed:** On conflict, update only username/avatar (not credits); username validated (length + charset); default name `Loota_`.
- **Hunt APIs:** **Fixed:** get-question, validate-answer, deduct-credits enforce user in `hunt_registrations`; 403 if not registered.
- **credit-invite-reward:** **Fixed:** Referrer resolved from `pending_hunt_referrals` / token, not client-supplied.
- **Referral `?ref=`:** **Fixed:** Ref validated as UUID; default name `Loota_`.
- **Mapbox proxy:** **Fixed:** Auth required + rate limit.
- **my-ip / approximate-location:** **Fixed:** Rate limited; approximate-location requires auth; IP no longer logged.
- **innerHTML in broadcast:** **Fixed:** Marker icon via `createElement` + `textContent`.

---

## 2. URL and auth

- **Auth callback / redirect URLs:** **Addressed:** `next` restricted to same-origin; email confirmation deep-links use `NEXT_PUBLIC_APP_URL`; Supabase redirect URLs documented in ENV_SETUP.

---

## 3. Data and validation

- **Request body size:** **Addressed:** `checkRequestBodySize()` used in create-profile, add-coins, purchase (e.g. 50KB); 413 when over limit.
- **Idempotency:** **Addressed:** Purchase accepts `idempotency_key`; cached response within 24h; inventory sends key and reuses per item.
- **Rate limits:** Applied where needed (e.g. mapbox, my-ip, approximate-location).

---

## 4. How data is requested and sent (server → client)

- **Supabase:** Client uses anon key; RLS enforces who can read/write what. Good.
- **API responses:** **Addressed:** JSON with `error` or typed payloads; no raw DB rows or stack traces. Error handlers do not return raw `error.message`, `details`, or stack traces; 500/400 responses use generic messages (e.g. "Failed to create profile", "Could not verify payment"). Internal details are logged server-side only.
- **Exposing internal details:** APIs return generic error messages only; no internal IDs or DB/stack details in responses.

---

## 5. What's missing or incomplete

| Area | Status | Suggestion |
|------|--------|------------|
| **Paystack verification** | **Fixed** | Webhook verifies signature and credits from verified amount only; add-coins accepts only `reference`, verifies with Paystack API, and derives coins from `data.amount` (kobo) via `PAYSTACK_KOBOS_PER_COIN`. Client `coins` is never trusted. |
| **Middleware** | **Fixed** | `src/middleware.ts`: optional auth (Supabase session refresh), per-IP rate limit (120 req/60s at edge), security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP), redirect to login for protected routes (`/hunts`, `/lobby`, `/inventory`, `/admin`, `/profile`, `/hunt`), redirect to lobby when logged-in users hit login/signup. |
| **Env validation** | **Fixed** | Required env validated at startup in `src/instrumentation.ts` (Node.js runtime): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Missing vars throw with a clear message and reference ENV_SETUP.md. Optional vars (Paystack, Mapbox, OpenAI, service role) logged as warning when unset. |
| **Error logging** | **Fixed** | Structured logger in `src/lib/logger.ts`: JSON logs with level, context, message; PII keys stripped from meta; error objects logged as name/code only. API routes and lib use `logger.error`/`logger.warn`. Optional 500 reporting: call `logger.setCaptureFn(Sentry.captureException)` after adding Sentry. |
| **Audit trail** | **Fixed** | `transactions` table used for wallet audit: add-coins inserts `wallet_topup` after verification; purchase inserts `purchase` (negative amount). Run `database_transactions_audit.sql` to add `wallet_topup` to transaction_type if needed. |
| **Broadcast useRouter** | **Fixed** | Unused `useRouter` import and variable removed from `src/app/broadcast/[huntId]/page.tsx`. |
| **Documentation** | **Fixed** | API contracts centralized in `docs/API.md`: request/response shapes for auth, wallet, inventory, hunt, mapbox, user, admin, webhooks. |
| (Add other items as needed) | | |

---

*End of reconstructed audit.*
