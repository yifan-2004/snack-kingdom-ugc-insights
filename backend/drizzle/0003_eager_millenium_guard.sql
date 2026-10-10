CREATE TABLE `ent_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`object_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `ent_organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ent_audit_tenant_time` ON `ent_audit` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ent_batches` (
	`tenant_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`batch_index` integer NOT NULL,
	`digest` text NOT NULL,
	PRIMARY KEY(`tenant_id`, `snapshot_id`, `batch_index`),
	FOREIGN KEY (`tenant_id`,`snapshot_id`) REFERENCES `ent_snapshots`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ent_documents` (
	`tenant_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`entity_key` text NOT NULL,
	`payload` text NOT NULL,
	`comment_count` integer NOT NULL,
	`published_at` text,
	PRIMARY KEY(`tenant_id`, `snapshot_id`, `entity_key`),
	FOREIGN KEY (`tenant_id`,`snapshot_id`) REFERENCES `ent_snapshots`(`tenant_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ent_guard` (
	`id` integer PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "ent_precondition" CHECK("ent_guard"."valid" = 1)
);
--> statement-breakpoint
CREATE TABLE `ent_invites` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_by` text,
	FOREIGN KEY (`tenant_id`) REFERENCES `ent_organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ent_invite_role" CHECK("ent_invites"."role" IN ('analyst','viewer'))
);
--> statement-breakpoint
CREATE TABLE `ent_keys` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`created_by` text NOT NULL,
	`label` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`tenant_id`) REFERENCES `ent_organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ent_rate` (
	`subject` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ent_snapshots` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`expected_posts` integer NOT NULL,
	`expected_batches` integer NOT NULL,
	`received_posts` integer DEFAULT 0 NOT NULL,
	`received_batches` integer DEFAULT 0 NOT NULL,
	`byte_count` integer DEFAULT 0 NOT NULL,
	`base_revision` integer NOT NULL,
	`data_cutoff_at` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`published_at` text,
	`pipeline_version` text NOT NULL,
	PRIMARY KEY(`tenant_id`, `id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `ent_organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ent_snapshot_status" CHECK("ent_snapshots"."status" IN ('uploading','published','archived','aborted'))
);
--> statement-breakpoint
CREATE INDEX `idx_ent_snapshots_tenant_status` ON `ent_snapshots` (`tenant_id`,`status`);--> statement-breakpoint
CREATE TABLE `ent_memberships` (
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`tenant_id`, `user_id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `ent_organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ent_member_role" CHECK("ent_memberships"."role" IN ('owner','admin','analyst','viewer'))
);
--> statement-breakpoint
CREATE INDEX `idx_ent_members_user` ON `ent_memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `ent_organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL,
	`active_snapshot_id` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
