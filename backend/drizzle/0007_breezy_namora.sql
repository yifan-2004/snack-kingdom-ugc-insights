CREATE TABLE `web_collection_items` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`platform` text NOT NULL,
	`external_post_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'collected' NOT NULL,
	`raw_comment_count` integer DEFAULT 0 NOT NULL,
	`valid_comment_count` integer DEFAULT 0 NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `web_collection_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_web_collection_items_source` ON `web_collection_items` (`platform`,`external_post_id`);--> statement-breakpoint
CREATE INDEX `idx_web_collection_items_job` ON `web_collection_items` (`job_id`);--> statement-breakpoint
CREATE TABLE `web_collection_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`platform` text NOT NULL,
	`keyword` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`max_posts` integer NOT NULL,
	`page_cursor` text DEFAULT '{}' NOT NULL,
	`candidate_ids` text DEFAULT '[]' NOT NULL,
	`searched_pages` integer DEFAULT 0 NOT NULL,
	`processed_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_web_collection_jobs_created` ON `web_collection_jobs` (`created_at`);