-- Add question_text to question_responses for broadcast (show question + answer + result).
-- Run this after main schema so question_responses exists.
ALTER TABLE question_responses
  ADD COLUMN IF NOT EXISTS question_text TEXT;

COMMENT ON COLUMN question_responses.question_text IS 'Question prompt at time of answer; used for broadcast feed.';
