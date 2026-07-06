CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`link_id` text NOT NULL,
	`type` text NOT NULL,
	`page_index` integer,
	`zone_id` text,
	`value` real,
	`meta` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_session_idx` ON `events` (`session_id`);--> statement-breakpoint
CREATE INDEX `events_link_created_idx` ON `events` (`link_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`resume_id` text NOT NULL,
	`recipient_label` text NOT NULL,
	`note` text,
	`expires_at` integer,
	`password_hash` text,
	`max_views` integer,
	`one_time` integer DEFAULT false NOT NULL,
	`redacted` integer DEFAULT false NOT NULL,
	`auto_lock_on_forward` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`open_count` integer DEFAULT 0 NOT NULL,
	`first_opened_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `links_token_idx` ON `links` (`token`);--> statement-breakpoint
CREATE INDEX `links_resume_idx` ON `links` (`resume_id`);--> statement-breakpoint
CREATE TABLE `resume_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`resume_id` text NOT NULL,
	`page_index` integer NOT NULL,
	`lo_key` text NOT NULL,
	`hi_key` text NOT NULL,
	`lo_width` integer NOT NULL,
	`lo_height` integer NOT NULL,
	`hi_width` integer NOT NULL,
	`hi_height` integer NOT NULL,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resume_pages_resume_page_idx` ON `resume_pages` (`resume_id`,`page_index`);--> statement-breakpoint
CREATE TABLE `resumes` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`original_key` text NOT NULL,
	`page_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`error` text,
	`zones` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`link_id` text,
	`type` text NOT NULL,
	`meta` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `security_events_link_idx` ON `security_events` (`link_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`ended_at` integer,
	`ip_hash` text NOT NULL,
	`ua_hash` text NOT NULL,
	`fingerprint` text NOT NULL,
	`device_label` text,
	`suspected_bot` integer DEFAULT false NOT NULL,
	`revealed_zones` text NOT NULL,
	`engagement_score` real,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_link_idx` ON `sessions` (`link_id`);--> statement-breakpoint
CREATE INDEX `sessions_fp_idx` ON `sessions` (`link_id`,`fingerprint`);