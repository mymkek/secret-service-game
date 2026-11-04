CREATE TABLE `saves` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`seed` text NOT NULL,
	`schema_version` integer NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_saves_updated_at` ON `saves` (`updated_at`);