-- Idea Board: a blank class-wide board where every student can post ideas (board items with slide_page = 0)
ALTER TABLE "class_sessions" ADD COLUMN "board_mode" VARCHAR(10) NOT NULL DEFAULT 'SLIDE';
ALTER TABLE "class_sessions" ADD COLUMN "board_prompt" VARCHAR(200);
