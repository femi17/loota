# Quiz Questions: Research, Categories & No-Repeat Logic

This doc summarizes research on street-quiz style content, how we use OpenAI for questions, which categories work best, and how we ensure **no question is ever repeated** in a hunt.

---

## 1. Research: Street Quiz & General Knowledge Content

### Popular formats

- **Street interview quizzes**: Creators ask pedestrians quick general-knowledge questions; viral formats favor one-sentence, quick-answer questions (e.g. “What does WWW stand for?”, “How many states in the US?”).
- **“Are You Smarter Than a Fifth Grader?” style**: Simple but satisfying—acronyms (CEO, WWW), basic science (H2O), geography (largest country, capitals), number facts (US states, African countries). These get high engagement because they’re easy to understand and satisfying to get right.
- **Pub quiz / trivia night**: 30-question challenges, no multiple choice or hints; scoring tiers (e.g. 25+ = “elite”, 30/30 = “trivia god”). Topics: history, pop culture, science, geography, entertainment.

### Categories that perform well

From street interviews, viral clips, and trivia lists:

| Category | Examples |
|----------|----------|
| **Geography** | Capitals, largest country, “where is this?” |
| **Science** | H2O, basic concepts, “what is this?” |
| **Acronyms & abbreviations** | CEO, WWW, ASAP, etc. |
| **Pop culture** | Celebrities, quotes, Nollywood, music |
| **Sports** | Football, Olympics, fun facts |
| **Food & drink** | Dishes, ingredients |
| **Music & lyrics** | Song lines, artist names, Afrobeats |
| **Number games** | Sequences, “what comes next?”, mental math |
| **Nigeria culture** | Slang, places, food, celebrities, local expressions |
| **Riddles** | Short “what am I?” style |
| **Word play** | Puns, fill-in-the-blank |

We use these (and a few more) as **street-quiz style category hints** in both hunt config and question generation so questions feel like viral street quizzes—punchy, shareable, and fun.

---

## 2. OpenAI Usage

| Where | What it does |
|-------|----------------|
| **`/api/hunt/get-question`** | Generates one question per (hunt, player, step) via `generateQuestion()` in `@/lib/openai`. Passes **full exclude list** (all questions already served/assigned in the hunt) so the model never repeats. |
| **`/api/hunt/validate-answer`** | Grades the player’s answer with `validateQuizAnswer()` (synonyms, typos, phrasing). |
| **`/api/admin/generate-hunt-config`** | Generates hunt config including **question categories** (one per location) from the street-quiz category list. |
| **`/api/admin/generate-questions`** | Batch question generation for admin; uses **same** `generateQuestion()` and a **growing exclude list** so no question is repeated in the batch. |

All question generation goes through **`generateQuestion()`** in `src/lib/openai.ts`, so prompts and uniqueness logic stay in one place.

---

## 3. Prompt Structure for Best Results

### System message (question generator)

- Role: “street-quiz question generator”
- Scope: general world knowledge only (facts, geography, culture, history, science, acronyms, pop culture)
- Constraints: no game/app-specific content; answer must be 1–2 words; do not repeat the same fact in different words; respond with valid JSON only.

### User prompt (per question)

1. **Category + difficulty**  
   e.g. `Category: "Geography". Generate a simple and straightforward—the kind people answer in one breath street-quiz style question...`

2. **Uniqueness block**  
   - If `excludeQuestions.length > 0`: “CRITICAL - No question may ever be repeated… Do NOT ask the SAME FACT in different words…” plus the list of already-used questions (up to 800).
   - Else: “Generate a fresh, original question. Vary the specific sub-topic… Do not ask the same fact in different wording.”

3. **Style**  
   One clear sentence, quick to read, satisfying to get right. Examples: “What does WWW stand for?”, “What is the largest country by area?”, “How many states are in the US?”

4. **Requirements**  
   One clear question; answer 1–2 words; 4 options if multiple choice; engaging and shareable.

5. **JSON format**  
   `{ "question": "...", "answer": "...", "options": ["...", ...] }`

Temperature: higher when exclude list is non-empty (e.g. 0.95) to encourage variety; otherwise 0.85.

---

## 4. No-Question-Repeated Logic

We guarantee that **no question is ever repeated** in a hunt through:

### 4.1 Data sources for “already asked”

- **`player_question_serves`**: Append-only log of every question text ever served to any player for this hunt (any step). Prevents re-serving the same question even after wrong answer or timeout.
- **`player_question_assignments`**: Current assignment per (hunt, player, step)—question_text, correct_answer, options.

For **get-question**, we build a single **exclude list** from:

- All `question_text` from `player_question_serves` for this `hunt_id`
- All `question_text` from `player_question_assignments` for this `hunt_id`

So “already used” is **hunt-wide**, not per player or per step.

### 4.2 Normalization and duplicate check

- **Normalize**: trim, lowercase, collapse spaces.
- **Exact duplicate**: normalized new question is in the set of normalized existing questions → reject.
- **Same-fact / rephrase**: if the normalized new question **contains** an existing normalized question (or the other way around), and the shorter string is at least 15 characters, we treat it as a duplicate (e.g. “what is the capital of france?” vs “what is france’s capital?”). Implemented in **get-question** in `isDuplicate()`.

### 4.3 OpenAI-side instructions

- We pass the **full exclude list** (up to 800 questions) into the prompt and instruct the model: do not repeat or rephrase any of these; do not ask the same fact in different words; pick a different sub-topic/fact/example.

### 4.4 Retries

- If the model returns a question that still fails our duplicate check, we add it to the exclude list and retry (up to **MAX_DUPLICATE_RETRIES = 3**). If we still don’t get a unique question, we return 500 “Failed to generate a unique question”.

### 4.5 Admin batch generation

- **generate-questions** uses the same `generateQuestion()` with a **growing** `usedQuestions` array passed as `excludeQuestions`, so within the batch no question is repeated and the style matches player-facing generation.

---

## 5. Category List (Street-Quiz Style)

The following list is used to steer both **generate-hunt-config** (category choices per location) and **question generation** (via prompt style). It’s also exported as **`STREET_QUIZ_CATEGORY_HINTS`** in `@/lib/openai.ts` for reuse:

- Simple math (mental sums, quick puzzles)
- General knowledge (facts, geography, culture, history, science)
- Viral & internet trends (memes, acronyms like CEO/WWW)
- Nigeria culture (music, slang, places, food, celebrities, Afrobeats)
- Riddles (short “what am I?”)
- Quick trivia (one-line facts, pop culture)
- Word play (puns, fill-in-the-blank)
- Music & lyrics (song lines, artist names)
- Sports (football, Olympics, fun facts)
- Food & drink (dishes, ingredients)
- Movies & TV (quotes, characters, Nollywood)
- Logic puzzles (simple deductive)
- Number games (sequences, what comes next)
- Nature & animals (fun facts)
- Geography (cities, landmarks, capitals)
- Acronyms & abbreviations (CEO, WWW, H2O, etc.)
- Celebrities & names (who said it, who’s this?)
- Slang & phrases (street talk, local expressions)
- Fill in the blank (complete the phrase/song)
- This or that (quick which-one choices)

These categories are **intriguing** because they match what performs well in street interviews and viral quizzes: quick, shareable, and satisfying to answer correctly.
