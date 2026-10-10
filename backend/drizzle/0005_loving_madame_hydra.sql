CREATE TABLE `dataset_archives` (
	`snapshot_id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`sha256` text NOT NULL,
	`byte_count` integer NOT NULL,
	`post_count` integer NOT NULL,
	`uploaded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_dataset_archives_uploaded` ON `dataset_archives` (`uploaded_at`);