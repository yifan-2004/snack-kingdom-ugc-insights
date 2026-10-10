CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`content` text NOT NULL,
	`sentiment` text DEFAULT 'neutral' NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`represented_count` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_comments_post_id` ON `comments` (`post_id`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text NOT NULL,
	`platform` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body_text` text DEFAULT '' NOT NULL,
	`label_document` text DEFAULT '' NOT NULL,
	`source_url` text,
	`sentiment` text DEFAULT 'neutral' NOT NULL,
	`media_json` text DEFAULT '[]' NOT NULL,
	`published_at` text,
	`synced_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_posts_external_id` ON `posts` (`external_id`);--> statement-breakpoint
CREATE INDEX `idx_posts_published_at` ON `posts` (`published_at`);--> statement-breakpoint
CREATE INDEX `idx_posts_platform` ON `posts` (`platform`);--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
