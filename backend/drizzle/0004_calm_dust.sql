CREATE TABLE `web_auth_rate` (
	`subject` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`count` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `web_users` (
	`email` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_login_at` text,
	CONSTRAINT "web_users_role" CHECK("web_users"."role" IN ('viewer')),
	CONSTRAINT "web_users_status" CHECK("web_users"."status" IN ('active','disabled'))
);
