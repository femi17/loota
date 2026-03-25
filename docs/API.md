# API contracts

Central reference for request/response shapes of Loota API routes. All routes that require auth use the session cookie (Supabase); no API key in headers unless noted.

---

## Auth

### POST /api/auth/create-profile

Creates or updates the current user’s player profile (username, avatar). On conflict (existing profile), only username/avatar are updated; credits are not overwritten.

**Request body**

```ts
{ username?: string }  // optional; validated (length, charset). If missing, defaults to Loota_<random>
```

**Response**

- `200`: `{ profile: { id, user_id, username, credits, level, avatar_url, ... } }`
- `400`: `{ error: string }` (e.g. validation message)
- `500`: `{ error: "Failed to create profile" }` or `{ error: "Internal server error" }`

---

## Wallet

### POST /api/wallet/add-coins

Credits the current user after server-side Paystack verification. Idempotent per `reference`.

**Request body**

```ts
{ reference: string }  // Paystack transaction reference from the payment
```

**Response**

- `200`: `{ newCredits: number }` or `{ newCredits: number, already_credited: true }`
- `400`: `{ error: string }` (e.g. "reference is required", "Could not verify payment", "Transaction not successful", "Transaction amount too low to credit")
- `403`: `{ error: "Payment was made with a different email" }`
- `404`: `{ error: "Profile not found" }`
- `500`: `{ error: "Failed to record credit" }` or `{ error: "Failed to update wallet" }`
- `503`: `{ error: "Payment verification not configured" }`

---

## Inventory

### POST /api/inventory/purchase

Purchases a travel mode with wallet credits. Deducts credits and adds/updates `player_inventory`. Idempotent when `idempotency_key` is sent and reused within the window.

**Request body**

```ts
{
  item_id: "bicycle" | "motorbike" | "car";
  idempotency_key?: string;  // optional; recommended to avoid double-purchase
}
```

**Response**

- `200`: `{ newCredits: number }`
- `400`: `{ error: string }` (e.g. "Invalid item_id", "Not enough credits. Load your wallet first.")
- `404`: `{ error: "Profile not found" }`
- `500`: `{ error: "Failed to update credits" }` or `{ error: "Failed to add to inventory" }`

---

## Hunt

### GET /api/hunt/get-question

Returns the question for the current player at the given step. User must be registered for the hunt. Does not return the correct answer (validation is server-side).

**Query**

- `hunt_id` (string, required)
- `step_index` (number, required)

**Response**

- `200`: `{ question, options?, category?, difficulty?, questionIndex }` (no `answer`)
- `400`: `{ error: string }`
- `403`: `{ error: "Not registered for this hunt" }`
- `500`: `{ error: "Failed to generate question" }` or generic error

---

### POST /api/hunt/validate-answer

Grades a quiz answer (OpenAI or fallback). User must be registered when using Mode A.

**Request body (Mode A – server loads answer)**

```ts
{ hunt_id: string; step_index: number; question_index: number; playerAnswer: string }
```

**Request body (Mode B – client sends all)**

```ts
{
  question: string;
  correctAnswer: string;
  playerAnswer: string;
  options?: string[];
}
```

**Response**

- `200`: `{ correct: boolean; reason?: string }`
- `400` / `403` / `500`: `{ error: string }`

---

### POST /api/hunt/deduct-credits

Deducts credits from the current user’s wallet. Optional `hunt_id` for in-hunt spend; user must be registered for that hunt if provided.

**Request body**

```ts
{ amount: number; hunt_id?: string }
```

**Response**

- `200`: `{ newCredits: number }`
- `400`: `{ error: string }` (e.g. "Invalid amount")
- `403`: `{ error: "You are not registered for this hunt" }`
- `404`: `{ error: "Profile not found" }`
- `500`: `{ error: string }`

---

### POST /api/hunt/credit-invite-reward

Credits the referrer (500 coins, once per referred user per hunt). Referrer is resolved from `pending_hunt_referrals`; no client-supplied referrer id.

**Request body**

- None required (session + hunt context).

**Response**

- `200`: `{ credited?: number }` or success payload
- `400`: `{ error: string }`
- `500`: `{ error: "Failed to credit reward" }`

---

### POST /api/hunt/record-referral

Records that the current user was referred (e.g. when landing on `/lobby?ref=<token>`). Body can include `ref` (UUID) and optional `hunt_id`.

**Request body**

```ts
{ ref?: string; hunt_id?: string }
```

**Response**

- `200`: success
- `400` / `500`: `{ error: string }`

---

### POST /api/hunt/create-referral-link

Returns a referral link for the current user for the active hunt.

**Response**

- `200`: `{ url: string }` (e.g. `/lobby?ref=<uuid>`)
- `400` / `500`: `{ error: string }`

---

## Mapbox (proxy; auth required)

- **GET /api/mapbox/geocode** – `?q=...` → geocode result.
- **GET /api/mapbox/reverse** – `?lng=...&lat=...` → reverse geocode.
- **GET /api/mapbox/directions** – `?from=...&to=...` (and options) → route geometry/distance/duration.

All return JSON; errors: `{ error: string }`. Rate limited and require auth.

---

## User

- **GET /api/user/my-ip** – Returns `{ ip: string }` (or similar). Rate limited.
- **GET /api/user/approximate-location** – Returns approximate location; auth required; rate limited.

---

## Admin (admin role required)

- **POST /api/admin/generate-hunt-config** – Body: prize, dates, etc. → hunt config (numberOfHunts, keysToWin, pricing, etc.).
- **POST /api/admin/generate-question** – Body: `{ topic, difficulty?, context? }` → single question.
- **POST /api/admin/generate-questions** – Body: `{ categories, numberOfHunts, difficultyDistribution, existingQuestions? }` → `{ questions: [...] }`.

---

## Webhooks

- **POST /api/webhooks/paystack** – Paystack `charge.success`; signature verified; credits user from verified amount. Not for client use.

---

## General

- **Errors:** API responses use `{ error: string }` with generic messages; no stack traces or internal details.
- **Auth:** Most routes use `requireUser()` (Supabase session). Admin routes use `requireAdmin()`.
- **Body size:** create-profile, add-coins, and purchase enforce a request body size limit (~50KB); `413` when exceeded.
