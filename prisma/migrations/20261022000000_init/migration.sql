-- iLecture MFU initial schema (PRD §5) + session_attendances
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('INSTRUCTOR', 'ADVISOR', 'STUDENT', 'ADMIN');
CREATE TYPE "SessionStatus" AS ENUM ('LIVE', 'EXIT_TICKET', 'ENDED');
CREATE TYPE "PaceSignalType" AS ENUM ('TOO_FAST', 'CLEAR', 'CONFUSED');
CREATE TYPE "BoardItemType" AS ENUM ('STICKY_NOTE', 'DRAWING_PATH');
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MODERATE', 'CRITICAL');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(150) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "role" "Role" NOT NULL,
    "student_id" VARCHAR(20),
    "google_access_token" TEXT,
    "google_refresh_token" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "google_classroom_id" VARCHAR(100),
    "course_code" VARCHAR(20) NOT NULL,
    "course_name_en" VARCHAR(255) NOT NULL,
    "semester" VARCHAR(20) NOT NULL,
    "instructor_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "section_number" INTEGER NOT NULL,
    "instructor_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "course_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "section_id" UUID NOT NULL,
    "student_id" VARCHAR(20) NOT NULL,
    "student_user_id" UUID,
    "advisor_email" VARCHAR(150),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "slide_decks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "google_drive_file_id" VARCHAR(150) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "file_url" TEXT NOT NULL,
    "total_pages" INTEGER NOT NULL DEFAULT 1,
    "is_processed" BOOLEAN NOT NULL DEFAULT false,
    "synced_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "slide_decks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "slide_metadata" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slide_deck_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "summary" TEXT NOT NULL,
    "difficulty_level" INTEGER,
    "key_terms" TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "slide_metadata_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "slide_metadata_difficulty_check" CHECK ("difficulty_level" BETWEEN 1 AND 5)
);

CREATE TABLE "class_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "section_id" UUID NOT NULL,
    "slide_deck_id" UUID,
    "session_title" VARCHAR(200) NOT NULL,
    "session_code" VARCHAR(10) NOT NULL,
    "current_slide_page" INTEGER NOT NULL DEFAULT 1,
    "is_board_active" BOOLEAN NOT NULL DEFAULT false,
    "is_board_frozen" BOOLEAN NOT NULL DEFAULT false,
    "is_silent_mode" BOOLEAN NOT NULL DEFAULT true,
    "status" "SessionStatus" NOT NULL DEFAULT 'LIVE',
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,
    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "slide_deck_id" UUID,
    "slide_page" INTEGER NOT NULL DEFAULT 1,
    "student_id" VARCHAR(20) NOT NULL,
    "display_pseudonym" VARCHAR(60) NOT NULL,
    "raw_content" TEXT NOT NULL,
    "polished_content" TEXT NOT NULL,
    "embedding" vector(1536),
    "parent_cluster_id" UUID,
    "cluster_size" INTEGER NOT NULL DEFAULT 1,
    "upvote_count" INTEGER NOT NULL DEFAULT 1,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "is_answered" BOOLEAN NOT NULL DEFAULT false,
    "is_flagged_inappropriate" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "question_upvotes" (
    "question_id" UUID NOT NULL,
    "student_id" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "question_upvotes_pkey" PRIMARY KEY ("question_id","student_id")
);

CREATE TABLE "pace_signals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "slide_page" INTEGER NOT NULL,
    "student_id" VARCHAR(20) NOT NULL,
    "signal_type" "PaceSignalType" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pace_signals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "class_board_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "slide_page" INTEGER NOT NULL,
    "student_id" VARCHAR(20) NOT NULL,
    "display_pseudonym" VARCHAR(60) NOT NULL,
    "item_type" "BoardItemType" NOT NULL,
    "payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "class_board_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "muddiest_feedbacks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "student_id" VARCHAR(20) NOT NULL,
    "comprehension_rating" INTEGER NOT NULL,
    "muddiest_text" TEXT NOT NULL,
    "extracted_topic" VARCHAR(120),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "muddiest_feedbacks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "muddiest_feedbacks_rating_check" CHECK ("comprehension_rating" BETWEEN 1 AND 5)
);

CREATE TABLE "session_ai_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "top_muddiest_topics" JSONB NOT NULL,
    "most_confusing_slide_page" INTEGER,
    "avg_comprehension" DECIMAL(3,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_ai_summaries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_risk_metrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "section_id" UUID NOT NULL,
    "student_id" VARCHAR(20) NOT NULL,
    "attendance_rate" DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    "engagement_rate" DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    "avg_comprehension_rating" DECIMAL(3,2) NOT NULL DEFAULT 5.00,
    "consecutive_low_ratings" INTEGER NOT NULL DEFAULT 0,
    "confusion_signal_count" INTEGER NOT NULL DEFAULT 0,
    "risk_score" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    "risk_level" "RiskLevel" NOT NULL,
    "intervention_sent_at" TIMESTAMPTZ,
    "last_evaluated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_risk_metrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "teaching_evaluation_metrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "section_id" UUID NOT NULL,
    "instructor_email" VARCHAR(150) NOT NULL,
    "total_sessions_held" INTEGER NOT NULL DEFAULT 0,
    "clarity_index" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "responsiveness_index" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    "emi_delivery_score" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "top_strengths" JSONB NOT NULL DEFAULT '[]',
    "actionable_improvements" JSONB NOT NULL DEFAULT '[]',
    "synced_to_central_eval" BOOLEAN NOT NULL DEFAULT false,
    "synced_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "teaching_evaluation_metrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "session_attendances" (
    "session_id" UUID NOT NULL,
    "student_id" VARCHAR(20) NOT NULL,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_attendances_pkey" PRIMARY KEY ("session_id","student_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_student_id_key" ON "users"("student_id");
CREATE UNIQUE INDEX "courses_google_classroom_id_key" ON "courses"("google_classroom_id");
CREATE UNIQUE INDEX "course_sections_course_id_section_number_key" ON "course_sections"("course_id", "section_number");
CREATE UNIQUE INDEX "enrollments_section_id_student_id_key" ON "enrollments"("section_id", "student_id");
CREATE UNIQUE INDEX "slide_decks_google_drive_file_id_key" ON "slide_decks"("google_drive_file_id");
CREATE UNIQUE INDEX "slide_metadata_slide_deck_id_page_number_key" ON "slide_metadata"("slide_deck_id", "page_number");
CREATE UNIQUE INDEX "class_sessions_session_code_key" ON "class_sessions"("session_code");
CREATE INDEX "questions_session_id_parent_cluster_id_idx" ON "questions"("session_id", "parent_cluster_id");
CREATE UNIQUE INDEX "pace_signals_session_id_slide_page_student_id_key" ON "pace_signals"("session_id", "slide_page", "student_id");
CREATE INDEX "class_board_items_session_id_slide_page_idx" ON "class_board_items"("session_id", "slide_page");
CREATE UNIQUE INDEX "muddiest_feedbacks_session_id_student_id_key" ON "muddiest_feedbacks"("session_id", "student_id");
CREATE UNIQUE INDEX "session_ai_summaries_session_id_key" ON "session_ai_summaries"("session_id");
CREATE UNIQUE INDEX "student_risk_metrics_section_id_student_id_key" ON "student_risk_metrics"("section_id", "student_id");
CREATE UNIQUE INDEX "teaching_evaluation_metrics_section_id_key" ON "teaching_evaluation_metrics"("section_id");

-- HNSW index for cosine-distance search on question embeddings
CREATE INDEX "questions_embedding_hnsw_idx" ON "questions" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "course_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "slide_decks" ADD CONSTRAINT "slide_decks_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "slide_metadata" ADD CONSTRAINT "slide_metadata_slide_deck_id_fkey" FOREIGN KEY ("slide_deck_id") REFERENCES "slide_decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "course_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_slide_deck_id_fkey" FOREIGN KEY ("slide_deck_id") REFERENCES "slide_decks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_slide_deck_id_fkey" FOREIGN KEY ("slide_deck_id") REFERENCES "slide_decks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_parent_cluster_id_fkey" FOREIGN KEY ("parent_cluster_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "question_upvotes" ADD CONSTRAINT "question_upvotes_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pace_signals" ADD CONSTRAINT "pace_signals_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_board_items" ADD CONSTRAINT "class_board_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "muddiest_feedbacks" ADD CONSTRAINT "muddiest_feedbacks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "session_ai_summaries" ADD CONSTRAINT "session_ai_summaries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_risk_metrics" ADD CONSTRAINT "student_risk_metrics_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "course_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teaching_evaluation_metrics" ADD CONSTRAINT "teaching_evaluation_metrics_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "course_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "session_attendances" ADD CONSTRAINT "session_attendances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
