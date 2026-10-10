CREATE TABLE `comment_review_decisions` (
	`post_id` text NOT NULL,
	`comment_id` text NOT NULL,
	`packet_hash` text NOT NULL,
	`attributes_json` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`reviewer_id` text NOT NULL,
	`reviewed_at` text NOT NULL,
	PRIMARY KEY(`post_id`, `comment_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_review_post` ON `comment_review_decisions` (`post_id`);--> statement-breakpoint
CREATE TABLE `evaluation_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`category` text NOT NULL,
	`reference_answer` text DEFAULT '' NOT NULL,
	`rubric` text DEFAULT '' NOT NULL,
	`signals_json` text DEFAULT '[]' NOT NULL,
	`minimum_evidence` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evaluation_results` (
	`run_id` text NOT NULL,
	`question_id` text NOT NULL,
	`result_json` text NOT NULL,
	`human_correct` integer,
	`human_note` text,
	`graded_at` text,
	PRIMARY KEY(`run_id`, `question_id`),
	FOREIGN KEY (`run_id`) REFERENCES `evaluation_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `evaluation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`status` text NOT NULL,
	`config_json` text NOT NULL,
	`questions_json` text NOT NULL,
	`metrics_json` text DEFAULT '{}' NOT NULL,
	`source_signature` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_eval_runs_created` ON `evaluation_runs` (`created_at`);