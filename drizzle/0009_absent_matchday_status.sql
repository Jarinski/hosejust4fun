ALTER TABLE "matchday_participants"
ADD COLUMN IF NOT EXISTS "is_canceled" boolean NOT NULL DEFAULT false;