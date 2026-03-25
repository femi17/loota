# Loota – Senior Developer Audit Report

**Date:** February 2025  
**Scope:** Logic correctness, efficiency, security, and maintainability.

---

## Executive summary

The app is well structured (Next.js 16 App Router, Supabase, Mapbox, Paystack, OpenAI). Several **correctness and efficiency issues** were fixed in code; the rest are documented below with recommendations.

---

## Fixes applied (this audit)

1. **Middleware – security headers on cookie refresh**  
   When Supabase’s `setAll` ran (session refresh), the response was replaced with a new `NextResponse` and cookies were set, but security headers were not applied to that response. **Fix:** Call `applySecurityHeaders(response)` inside the `setAll` callback so the final response always has CSP, X-Frame-Options, etc.

2. **API hunt/get-question – redundant Supabase client**  
   The handler called `requireUser()` (which returns `{ user, supabase }`) but then created a second client with `createClient()`. **Fix:** Use `auth.supabase` only.

3. **API hunt/validate-answer – redundant client and extra round-trip**  
   - Used a new `createClient()` instead of `auth.supabase` (and again when recording the response). **Fix:** Use `auth.supabase` throughout.  
   - When loading pre-generated questions, the code did two hunt queries: one for `id, status` and one for `questions`. **Fix:** Single query with `select("id, status, questions")` and reuse the result.

4. **AuthContext – efficiency**  
   - **Double profile load:** Both `getSession().then(...)` and `onAuthStateChange` called `loadProfile`, so on initial load the profile could be fetched twice. **Fix:** Auth effect only sets `user`; a separate `useEffect` depending on `user?.id` runs `loadProfile` once.  
   - **Extra `getUser()` in create-profile path:** When creating a new profile (PGRST116), the code called `supabase.auth.getUser()` just to get `user_metadata.username`. **Fix:** `loadProfile(userId, authUser)` now accepts the current user; the effect passes `user` so we don’t call `getUser()` again.  
   - **Context re-renders:** The context value was a new object every render, so all consumers re-rendered whenever `AuthProvider` re-rendered. **Fix:** `useMemo` for the context value with stable dependencies.  
   - **Stale profile on user change:** When the logged-in user changed, the previous user’s profile could remain in state until the new profile loaded. **Fix:** Clear profile with `setProfile(null)` when starting to load for a new `user.id`.

---

## Recommendations

### High priority

1. **Atomic credit updates (deduct-credits, inventory/purchase)** ✅  
   **Done:** Added `database_atomic_credits.sql` with RPCs **deduct_credits(p_amount, p_hunt_id)** and **purchase_travel_mode(p_item_id, p_cost)**. Both API routes now call these; run the SQL in Supabase before deploying.  
   ~~Both routes do **read credits → compute new value → update**. Under concurrency, two requests can read the same balance and both succeed, leading to double spend or incorrect balance.  
   **Recommendation:** Use an atomic update, e.g.:
   - Postgres: `UPDATE player_profiles SET credits = credits - $1 WHERE user_id = $2 AND credits >= $1 RETURNING credits`, then check row count; or
   - Supabase RPC: e.g. `deduct_credits(amount, hunt_id?)` that does the same in a single transaction.  
   Same idea for **inventory/purchase**: deduct and add item (or record idempotency) in one transaction or RPC so that a failed “add to inventory” doesn’t leave credits already deducted.

2. **Paystack webhook – unique constraint**  
   Idempotency is done by checking `payment_credits` for `reference` then inserting. A race can allow two webhook deliveries to pass the check before either inserts. **Recommendation:** Ensure a **UNIQUE constraint on `payment_credits.reference`** (and handle `23505` as “already credited”, which the code already does). Verify the constraint exists in production.

3. **Inventory purchase – ordering and failure handling** ✅  
   Addressed by **purchase_travel_mode** RPC (one transaction).  
   ~~Current flow: deduct credits → upsert inventory → insert transaction. If the upsert fails, credits are already deducted. **Recommendation:** Either (a) use a DB transaction/RPC that does deduct + upsert + transaction insert atomically, or (b) first upsert inventory (e.g. with a “pending” or idempotency key), then deduct credits, then update status; and have a clear rollback or reconciliation path if deduct fails.

### Medium priority

4. **useHuntData – dependency array**  
   The registration-check effect lists `supabase` in the dependency array. `supabase` is a module-level import and stable. Removing it doesn’t change behavior but keeps the array minimal.

5. **requireAdmin – extra round-trip**  
   `requireAdmin()` calls `requireUser()` then does a second query to `admin_profiles`. You could combine into one flow (e.g. single query joining auth + admin_profiles or a small RPC) to save a round-trip on admin routes. Optional and low impact.

6. **Hunts page size**  
   `app/hunts/page.tsx` is very large (6000+ lines). **Recommendation:** Split by feature (map, travel, tasks, HUD, drawer panels, etc.) into smaller components or hooks to improve maintainability and reuse.

### Low priority / nice-to-have

7. **Rate limiting – in-memory**  
   Middleware and Mapbox rate limits use in-memory maps. In serverless/multi-instance deployments, limits are per instance, not global. For strict global limits, use a shared store (e.g. Redis/Vercel KV). Documented in code; acceptable for many deployments.

8. **get-question – exclude list size**  
   When generating unique questions, the code loads all `player_question_serves` and assignments for the hunt into memory. For very large hunts this could grow. Consider limiting (e.g. last N questions) or pagination if you scale to huge question sets.

9. **OpenAI – trim prompt size**  
   `excludeQuestions.slice(0, 800)` is already applied; keep an eye on token usage if categories or exclude lists grow.

---

## What was audited

- **Middleware:** Auth, rate limit, security headers, cookie refresh, redirects.
- **Auth:** AuthContext, loadProfile, create-profile fallback, realtime profile updates.
- **Server auth:** requireUser/requireAdmin usage and Supabase client reuse.
- **API routes:** get-question, validate-answer, deduct-credits, wallet/add-coins, inventory/purchase, webhooks/paystack.
- **Lib:** server-auth, openai, rate-limit-mapbox, get-client-ip, request-utils, supabase server/client.
- **Hunt data:** useHuntData (active hunt, registration, countdown).

---

## Summary

- **Security:** Middleware and Paystack signature verification are solid. Ensure `payment_credits.reference` is unique and consider atomic credit operations to avoid races.
- **Efficiency:** Redundant Supabase clients and duplicate profile/request work were removed; context value is memoized.
- **Correctness:** Double profile load and wrong response object (missing security headers) are fixed. Remaining risks are around concurrent credit updates and purchase flow ordering; address with atomic DB operations or RPCs.

Implementing the high-priority recommendations (atomic credits, unique constraint, and purchase flow/transaction) will make the app robust under concurrency and failures.
