# Go Live Checklist

## 1. Environment Variables Setup

Create a `.env.local` file in the project root with all required API keys:

```bash
# Copy from .env.example and fill in your actual keys
cp .env.example .env.local
```

### Required APIs:
- ✅ **Mapbox** - Already configured (you have the token)
- ⚠️ **Supabase** - Need to set up
- ⚠️ **OpenAI** - Need to set up

---

## 2. Supabase Setup

### Step 1: Create Supabase Project
1. Go to https://supabase.com
2. Create a new project
3. Get your project URL and anon key from Settings > API

### Step 2: Run Database Schema
1. Go to SQL Editor in Supabase dashboard
2. Run all SQL from `SUPABASE_SETUP.md`:
   - Create `admin_profiles` table
   - Create `hunts` table
   - Create `player_positions` table
   - Create indexes
   - Set up Row Level Security (RLS) policies

### Step 3: Enable Realtime
1. Go to Database > Replication in Supabase dashboard
2. Enable replication for `player_positions` table
3. This allows live player tracking in broadcast view

### Step 4: Create First Admin User
1. Sign up a user in Supabase Auth (Authentication > Users)
2. Get the user's UUID
3. Run this SQL:
```sql
INSERT INTO admin_profiles (user_id)
VALUES ('your-user-uuid-here');
```

---

## 3. OpenAI Setup

### Step 1: Get API Key
1. Go to https://platform.openai.com
2. Create an account or sign in
3. Go to API Keys section
4. Create a new secret key
5. Copy the key (starts with `sk-`)

### Step 2: Add to Environment
Add to `.env.local`:
```
OPENAI_API_KEY=sk-your_key_here
```

### Step 3: Test
- Try creating a hunt in admin panel
- AI should generate configuration and questions

---

## 4. Connect Player Actions to Supabase

### What Needs to Be Done:
The hunts page (`src/app/hunts/page.tsx`) needs to write player data to Supabase:

1. **Player Position Updates**
   - When player moves, update `player_positions` table
   - Include: `hunt_id`, `player_id`, `lng`, `lat`, `keys`

2. **Question Tracking**
   - When player answers a question, update `current_question` field
   - Track `answering_question` status

3. **Player Authentication**
   - Connect player login/signup to Supabase Auth
   - Store player profile in database

### Files to Update:
- `src/app/hunts/page.tsx` - Add Supabase writes for player positions
- Create player authentication flow
- Connect question answering to database

---

## 5. Database Schema Updates

Based on the new create hunt form, update the `hunts` table schema:

```sql
-- Add new columns to hunts table
ALTER TABLE hunts ADD COLUMN IF NOT EXISTS prize TEXT;
ALTER TABLE hunts ADD COLUMN IF NOT EXISTS entry_requirement INTEGER DEFAULT 0;
ALTER TABLE hunts ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE hunts ADD COLUMN IF NOT EXISTS number_of_hunts INTEGER;
ALTER TABLE hunts ADD COLUMN IF NOT EXISTS keys_to_win INTEGER;
ALTER TABLE hunts ADD COLUMN IF NOT EXISTS question_categories JSONB;
ALTER TABLE hunts ADD COLUMN IF NOT EXISTS difficulty_distribution JSONB;
ALTER TABLE hunts ADD COLUMN IF NOT EXISTS briefing TEXT;
ALTER TABLE hunts ADD COLUMN IF NOT EXISTS questions JSONB;
```

---

## 6. Testing Checklist

### Admin Side:
- [ ] Can sign in to admin panel
- [ ] Can create a hunt with AI generation
- [ ] Generated pricing looks reasonable
- [ ] Questions are generated correctly
- [ ] Can view hunts list
- [ ] Can activate/complete hunts
- [ ] Broadcast view shows players (when players are active)

### Player Side:
- [ ] Can see hunts in lobby
- [ ] Can join a hunt
- [ ] Player position updates in real-time
- [ ] Questions appear correctly
- [ ] Travel mechanics work
- [ ] Constraints (refuel, rest) work
- [ ] Vehicle maintenance works

### Broadcast:
- [ ] Shows all active players on map
- [ ] Updates in real-time
- [ ] Shows player questions when available
- [ ] Can select different hunts

---

## 7. Production Considerations

### Security:
- [ ] Review RLS policies in Supabase
- [ ] Ensure admin routes are protected
- [ ] Validate all user inputs
- [ ] Rate limit OpenAI API calls

### Performance:
- [ ] Enable Supabase connection pooling
- [ ] Add caching for hunt data
- [ ] Optimize map rendering for many players
- [ ] Monitor OpenAI API usage/costs

### Monitoring:
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Monitor Supabase usage
- [ ] Track OpenAI API costs
- [ ] Monitor player activity

---

## 8. Deployment

### Build & Test:
```bash
npm run build
npm start
```

### Deploy to:
- Vercel (recommended for Next.js)
- Or your preferred hosting

### Environment Variables:
- Add all `.env.local` variables to your hosting platform
- Mark sensitive keys as "Secret" or "Environment Variables"

---

## Summary

**Critical Path to Go Live:**
1. ✅ Mapbox - Already done
2. ⚠️ Set up Supabase project + run schema
3. ⚠️ Get OpenAI API key
4. ⚠️ Connect hunts page to write player data to Supabase
5. ⚠️ Test end-to-end flow
6. ⚠️ Deploy

**Estimated Time:**
- Supabase setup: 30 minutes
- OpenAI setup: 10 minutes
- Connect player actions: 2-3 hours
- Testing & deployment: 1-2 hours

**Total: ~4-5 hours of work**
