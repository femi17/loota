# Where OpenAI Is Used

OpenAI is the **brain** of the quiz (grading) and powers **admin hunt creation** (config + question generation). Below is where it’s used and how we ensure **no question is ever repeated** in a hunt. See **`docs/QUIZ_QUESTIONS.md`** for street-quiz research, category list, and full prompt/no-repeat logic.

---

## 1. Admin: Hunt creation (one-time generation)

| Location | Purpose |
|----------|--------|
| **`/api/admin/generate-hunt-config`** | Generates hunt config from prize, prize pool, target spend, dates: `numberOfHunts`, `keysToWin`, pricing, question categories, difficulty distribution, briefing. |
| **`/api/admin/generate-questions`** | Generates all questions for a hunt (one per step). Uses `existingQuestions` to reduce repeats. |
| **`/api/admin/generate-question`** | Single-question generation (uses `@/lib/openai` `generateQuestion`). |

Used only when an admin clicks **“Generate Hunt Configuration”** and **“Create Hunt”**. Questions are stored in `hunts.questions` (JSONB).

---

## 2. Player: Quiz grading (OpenAI as the brain)

| Location | Purpose |
|----------|--------|
| **`/api/hunt/validate-answer`** | Grades a player’s answer using OpenAI: accepts synonyms, different phrasing, minor typos. |
| **`@/lib/openai`** `validateQuizAnswer()` | Called by the validate-answer API. |

When a player submits an answer:

1. The app calls **`POST /api/hunt/validate-answer`** with `question`, `correctAnswer`, `playerAnswer`, and optional `options`.
2. If `OPENAI_API_KEY` is set, the server uses **OpenAI** to decide if the answer is correct.
3. If the key is missing or the request fails, the API falls back to a simple normalized (trim + lowercase) match.

So **OpenAI is the brain of the quiz** for grading; the client only sends the text and gets back `{ correct: true/false }`.

---

## 3. Different questions per player (anti-cheat)

To avoid everyone seeing the same question at the same step:

| Location | Purpose |
|----------|--------|
| **`/api/hunt/get-question`** | Returns **one** question for `(hunt_id, player_id, step_index)`. Assigns a random question from that step’s pool and stores it in **`player_question_assignments`** so the same player always gets the same question for that step. |
| **`player_question_assignments`** table | Stores `(hunt_id, player_id, step_index, question_index)`. Created by `database_player_question_assignments.sql`. |

- **Step pool**: For step `s`, the pool is question indices `s`, `s + keys_to_win`, `s + 2*keys_to_win`, … (so different steps use different subsets of `hunts.questions`).
- **Random assignment**: First time a player requests a question for a step, the server picks a random index from that step’s pool and saves it. Later requests for that step return the same question.

**Optional client wiring**: The hunt page can call **`GET /api/hunt/get-question?hunt_id=...&step_index=0`** (and step_index 1, 2, … for unlock steps) when the player clicks **“Start”** on a task, and use the returned `question` / `options` / `questionIndex` instead of the shared list. Then submit with **`POST /api/hunt/validate-answer`** using **Mode A**: `{ hunt_id, step_index, question_index, playerAnswer }` so the server loads the correct answer and never sends it to the client.

---

## Environment

- **`OPENAI_API_KEY`** (env): Required for:
  - Admin generate-hunt-config and generate-questions (and generate-question).
  - Server-side quiz grading in validate-answer (otherwise fallback to exact match).

---

## Summary

| Goal | How it’s done |
|------|----------------|
| **OpenAI as the brain of the quiz** | **`/api/hunt/validate-answer`** uses OpenAI to grade answers (synonyms, phrasing, typos). Client always submits to this API when `validateAnswer` is used. |
| **Avoid same questions for everyone** | **`/api/hunt/get-question`** + **`player_question_assignments`**: each player gets a random question from the step’s pool, stored per (hunt, player, step). Wire the client to use get-question when starting a task for full anti-cheat. |
| **Where OpenAI is used** | Admin: generate-hunt-config, generate-questions, generate-question. Player: validate-answer (grading). All use `OPENAI_API_KEY`. |
