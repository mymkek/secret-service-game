import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Общая таблица сохранений. Не зависит от игровых механик: state — непрозрачный JSON. */
export const saves = sqliteTable(
	'saves',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		seed: text('seed').notNull(),
		schemaVersion: integer('schema_version').notNull(),
		state: text('state').notNull(),
		createdAt: integer('created_at').notNull(),
		updatedAt: integer('updated_at').notNull()
	},
	(t) => [index('idx_saves_updated_at').on(t.updatedAt)]
);

export type Save = typeof saves.$inferSelect;
