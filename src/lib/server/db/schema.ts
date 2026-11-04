import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

// ---------------------------------------------------------------- телеметрия партий
// Протокол действий и журнал событий реальных партий в браузере - для сверки баланса с ботами sim/
// и для replay (seed + config + действия по дням). Персональных данных нет (user agent обрезан).

export const gameSessions = sqliteTable(
	'game_sessions',
	{
		/** uuid, генерирует клиент. */
		id: text('id').primaryKey(),
		seed: text('seed').notNull(),
		schemaVersion: integer('schema_version').notNull(),
		/** Хеш конфига партии (contentToConfig); сам конфиг - в config, если он небольшой. */
		configHash: text('config_hash'),
		config: text('config'),
		appVersion: text('app_version'),
		/** День начала записи: 0 - новая партия; >0 - загруженный сейв (replay с seed невозможен). */
		startDay: integer('start_day').notNull().default(0),
		startedAt: integer('started_at').notNull(),
		/** Время последнего принятого батча. */
		updatedAt: integer('updated_at').notNull(),
		endedAt: integer('ended_at'),
		/** won | lost | abandoned | null (идёт). */
		outcome: text('outcome'),
		victoryPath: text('victory_path'),
		defeatReason: text('defeat_reason'),
		finalDay: integer('final_day'),
		finalMonth: integer('final_month'),
		score: integer('score'),
		userAgent: text('user_agent'),
		/** Сейв, связанный с партией (без FK: сейв можно удалить, телеметрия остаётся). */
		saveId: text('save_id')
	},
	(t) => [index('idx_game_sessions_started').on(t.startedAt), index('idx_game_sessions_outcome').on(t.outcome)]
);

export const gameActions = sqliteTable(
	'game_actions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		sessionId: text('session_id')
			.notNull()
			.references(() => gameSessions.id, { onDelete: 'cascade' }),
		/** Порядковый номер в сессии (с 0), задаёт клиент. */
		seq: integer('seq').notNull(),
		day: integer('day').notNull(),
		/** PlayerAction целиком (JSON-текст). */
		action: text('action').notNull(),
		ok: integer('ok', { mode: 'boolean' }).notNull(),
		error: text('error'),
		createdAt: integer('created_at').notNull()
	},
	(t) => [uniqueIndex('uq_game_actions_session_seq').on(t.sessionId, t.seq)]
);

export const gameEvents = sqliteTable(
	'game_events',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		sessionId: text('session_id')
			.notNull()
			.references(() => gameSessions.id, { onDelete: 'cascade' }),
		/** LogEntry.id. */
		logId: integer('log_id').notNull(),
		day: integer('day').notNull(),
		kind: text('kind').notNull(),
		data: text('data').notNull(),
		source: text('source')
	},
	(t) => [
		uniqueIndex('uq_game_events_session_log').on(t.sessionId, t.logId),
		index('idx_game_events_session_kind').on(t.sessionId, t.kind),
		index('idx_game_events_kind').on(t.kind)
	]
);

export const gameSnapshots = sqliteTable(
	'game_snapshots',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		sessionId: text('session_id')
			.notNull()
			.references(() => gameSessions.id, { onDelete: 'cascade' }),
		month: integer('month').notNull(),
		day: integer('day').notNull(),
		/** Метрики на конец месяца (JSON-текст). */
		metrics: text('metrics').notNull()
	},
	(t) => [uniqueIndex('uq_game_snapshots_session_month').on(t.sessionId, t.month)]
);

export type GameSession = typeof gameSessions.$inferSelect;
