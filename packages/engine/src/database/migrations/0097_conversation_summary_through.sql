-- How many exchanges (user-message ordinals) the conversation summary covers.
-- The history window starts here, so a failed summary refresh keeps the exchanges
-- it did not fold in the window instead of dropping them. NULL on summaries
-- written before it was recorded.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "summary_through" integer;
