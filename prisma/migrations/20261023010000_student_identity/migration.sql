-- Students appear with their real name by default and can choose to hide it (anonymous) per class.
ALTER TABLE "users" ADD COLUMN "prefers_anonymous" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "session_attendances" ADD COLUMN "is_anonymous" BOOLEAN NOT NULL DEFAULT false;
