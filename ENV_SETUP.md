# Environment Variables Setup

Create a `.env.local` file in your project root with the following variables:

```env
# Mapbox (for maps and routing)
# Get from: https://account.mapbox.com/access-tokens/
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_mapbox_public_token_here

# Optional: canonical app URL (used for email confirmation redirect when set; otherwise uses current origin)
# NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Supabase (for database, authentication, and realtime)
# Get from: https://supabase.com/dashboard/project/_/settings/api
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# OpenAI (for question generation and hunt configuration)
# Get from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your_openai_api_key_here

# Paystack (for wallet top-up)
# Get from: https://dashboard.paystack.com/#/settings/developer
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_your_paystack_public_key_here
PAYSTACK_SECRET_KEY=sk_test_your_paystack_secret_key_here
# Optional: kobo per coin (default 50 = 0.5 NGN per coin: N1000→2000, N2500→5000, N5000→10000).
# PAYSTACK_KOBOS_PER_COIN=50

# Supabase service role (server-only: for Paystack webhook to credit users)
# Same dashboard: Settings > API > service_role (secret). Never expose in client.
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Upstash Redis (optional but recommended for distributed rate limiting)
# Get from: https://console.upstash.com/redis
UPSTASH_REDIS_REST_URL=https://your-redis-endpoint.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token_here
```

## How to Get Each API Key:

### 1. Mapbox Token
- ✅ **Already configured** - You have this token
- Location: `next.config.ts` or get new one from https://account.mapbox.com/access-tokens/

### 2. Supabase Credentials & Auth redirect (email confirmation)
1. Go to https://supabase.com
2. Create a new project (or use existing)
3. Go to **Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Go to **Authentication → URL Configuration** and set:
   - **Site URL:** your app URL (e.g. `https://yourdomain.com` or `http://localhost:3000` for dev)
   - **Redirect URLs:** add `https://yourdomain.com/auth/callback` (and `http://localhost:3000/auth/callback` for local dev). The confirmation email link will redirect users here after they verify; the callback exchanges the code for a session and sends them to the app (e.g. lobby).

### 3. OpenAI API Key
1. Go to https://platform.openai.com
2. Sign up or log in
3. Go to API Keys section
4. Click "Create new secret key"
5. Copy the key (starts with `sk-`)
6. ⚠️ **Important**: Save it immediately - you won't see it again!

### 4. Paystack (wallet top-up)
1. Go to https://dashboard.paystack.com
2. Settings → API Keys & Webhooks
3. Copy **Public Key** → `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`
4. Copy **Secret Key** → `PAYSTACK_SECRET_KEY` (server-only; never expose)
5. Set **Webhook URL** to: `https://your-domain.com/api/webhooks/paystack`  
   (Paystack will send `charge.success` here; we verify signature and credit the user.)

### 5. Supabase service role (for webhook)
1. Supabase dashboard → Settings → API
2. Copy **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`
3. Used only by the Paystack webhook route to insert into `payment_credits` and update `player_profiles` (no user session in webhooks).

### 6. Upstash Redis (for global rate limiting)
1. Go to https://console.upstash.com and create a Redis database
2. Open the database details page
3. Copy **REST URL** → `UPSTASH_REDIS_REST_URL`
4. Copy **REST TOKEN** → `UPSTASH_REDIS_REST_TOKEN`
5. Add both to your environment (local + production) for distributed rate limiting across instances

## Notes:
- Never commit `.env.local` to git (it's in `.gitignore`)
- Use `.env.example` as a template (without real keys)
- For production, add these to your hosting platform's environment variables
- Run `database_paystack_credits.sql` in Supabase SQL Editor once to create the `payment_credits` table
- Run `database_idempotency.sql` once to create the `idempotency_requests` table (used by inventory purchase to prevent double-purchase on double-click/retry)
