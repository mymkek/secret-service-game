CREATE TABLE `game_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`seq` integer NOT NULL,
	`day` integer NOT NULL,
	`action` text NOT NULL,
	`ok` integer NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `game_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_game_actions_session_seq` ON `game_actions` (`session_id`,`seq`);--> statement-breakpoint
CREATE TABLE `game_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`log_id` integer NOT NULL,
	`day` integer NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`source` text,
	FOREIGN KEY (`session_id`) REFERENCES `game_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_game_events_session_log` ON `game_events` (`session_id`,`log_id`);--> statement-breakpoint
CREATE INDEX `idx_game_events_session_kind` ON `game_events` (`session_id`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_game_events_kind` ON `game_events` (`kind`);--> statement-breakpoint
CREATE TABLE `game_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`seed` text NOT NULL,
	`schema_version` integer NOT NULL,
	`config_hash` text,
	`config` text,
	`app_version` text,
	`start_day` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ended_at` integer,
	`outcome` text,
	`victory_path` text,
	`defeat_reason` text,
	`final_day` integer,
	`final_month` integer,
	`score` integer,
	`user_agent` text,
	`save_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_game_sessions_started` ON `game_sessions` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_game_sessions_outcome` ON `game_sessions` (`outcome`);--> statement-breakpoint
CREATE TABLE `game_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`month` integer NOT NULL,
	`day` integer NOT NULL,
	`metrics` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `game_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_game_snapshots_session_month` ON `game_snapshots` (`session_id`,`month`);