-- Idea Board: multiple pages per session (items of page n use slide_page = -(n-1)), one question per page
ALTER TABLE "class_sessions" ADD COLUMN "idea_page" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "class_sessions" ADD COLUMN "idea_page_count" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "class_sessions" ADD COLUMN "idea_prompts" JSONB NOT NULL DEFAULT '{}';
