// Хранилище телеметрии партий: схемы входа (zod), лимиты, идемпотентный приём батча.
// Игровой логики здесь нет: действия и события хранятся как непрозрачный JSON.
import { desc, eq, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { z } from 'zod';
import * as schema from './db/schema';
import { gameActions, gameEvents, gameSessions, gameSnapshots } from './db/schema';

export type Db = LibSQLDatabase<typeof schema>;

export const LIMITS = {
	bodyBytes: 512 * 1024,
	actions: 500,
	events: 1000,
	snapshots: 100,
	configBytes: 200 * 1024,
	actionBytes: 8 * 1024,
	eventDataBytes: 8 * 1024,
	metricsBytes: 8 * 1024,
	/** Сколько записей одного вида можно набрать в одной сессии (защита от мусора). */
	actionsPerSession: 50_000,
	eventsPerSession: 200_000,
	userAgent: 200
} as const;

/** Включена ли телеметрия: TELEMETRY_ENABLED=1|true|on|0|false|off; без переменной - включена только в dev. */
export function telemetryEnabled(env: string | undefined, dev: boolean): boolean {
	if (env === undefined || env === '') return dev;
	return ['1', 'true', 'on', 'yes'].includes(env.toLowerCase());
}

const jsonSize = (v: unknown) => JSON.stringify(v)?.length ?? 0;
const scalar = z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]);

const sessionMeta = z.object({
	seed: z.string().min(1).max(200),
	schemaVersion: z.number().int().min(0),
	configHash: z.string().max(100).nullish(),
	config: z.unknown().optional(),
	appVersion: z.string().max(100).nullish(),
	startDay: z.number().int().min(0).max(1800).default(0),
	startedAt: z.number().int().nonnegative().optional(),
	saveId: z.string().max(100).nullish()
});

const actionRec = z.object({
	seq: z.number().int().min(0),
	day: z.number().int().min(0).max(1800),
	action: z
		.object({ type: z.string().min(1).max(50) })
		.passthrough()
		.refine((a) => jsonSize(a) <= LIMITS.actionBytes, 'action too large'),
	ok: z.boolean(),
	error: z.string().max(100).nullish(),
	at: z.number().int().nonnegative().optional()
});

const eventRec = z.object({
	id: z.number().int().min(0),
	day: z.number().int().min(0).max(1800),
	kind: z.string().min(1).max(60),
	data: z.record(z.string().max(100), scalar).refine((d) => jsonSize(d) <= LIMITS.eventDataBytes, 'event data too large'),
	source: z.string().max(40).nullish()
});

const snapshotRec = z.object({
	month: z.number().int().min(0).max(60),
	day: z.number().int().min(0).max(1800),
	metrics: z.record(z.string().max(100), z.unknown()).refine((m) => jsonSize(m) <= LIMITS.metricsBytes, 'metrics too large')
});

const endRec = z.object({
	outcome: z.enum(['won', 'lost', 'abandoned']),
	victoryPath: z.string().max(50).nullish(),
	defeatReason: z.string().max(50).nullish(),
	finalDay: z.number().int().min(0).max(1800).nullish(),
	finalMonth: z.number().int().min(0).max(60).nullish(),
	score: z.number().int().nullish()
});

export const batchSchema = z.object({
	sessionId: z.uuid(),
	session: sessionMeta.optional(),
	/** Связать сессию с сейвом (после сохранения/загрузки). */
	saveId: z.string().max(100).nullish(),
	actions: z.array(actionRec).max(LIMITS.actions).optional(),
	events: z.array(eventRec).max(LIMITS.events).optional(),
	snapshots: z.array(snapshotRec).max(LIMITS.snapshots).optional(),
	end: endRec.optional()
});

export type TelemetryBatch = z.infer<typeof batchSchema>;

export class TelemetryError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

export interface IngestResult {
	sessionCreated: boolean;
	actions: number;
	events: number;
	snapshots: number;
	ended: boolean;
}

/**
 * Принять батч. Идемпотентно: повтор не дублирует записи (unique + on conflict do nothing).
 * Возвращает число реально вставленных строк.
 */
export async function ingestBatch(db: Db, batch: TelemetryBatch, ctx: { userAgent?: string | null; now?: number; maxActions?: number; maxEvents?: number } = {}): Promise<IngestResult> {
	const now = ctx.now ?? Date.now();
	const id = batch.sessionId;
	const result: IngestResult = { sessionCreated: false, actions: 0, events: 0, snapshots: 0, ended: false };

	if (batch.session) {
		const m = batch.session;
		const cfg = m.config === undefined ? null : JSON.stringify(m.config);
		const res = await db
			.insert(gameSessions)
			.values({
				id,
				seed: m.seed,
				schemaVersion: m.schemaVersion,
				configHash: m.configHash ?? null,
				config: cfg !== null && cfg.length <= LIMITS.configBytes ? cfg : null,
				appVersion: m.appVersion ?? null,
				startDay: m.startDay,
				startedAt: m.startedAt ?? now,
				updatedAt: now,
				userAgent: ctx.userAgent ? ctx.userAgent.slice(0, LIMITS.userAgent) : null,
				saveId: m.saveId ?? null
			})
			.onConflictDoNothing()
			.returning({ id: gameSessions.id });
		result.sessionCreated = res.length > 0;
	}

	const [row] = await db.select({ id: gameSessions.id }).from(gameSessions).where(eq(gameSessions.id, id));
	if (!row) throw new TelemetryError(404, 'unknown session: send "session" metadata first');

	if (batch.actions?.length || batch.events?.length) {
		const [cnt] = await db
			.select({
				a: sql<number>`(select count(*) from ${gameActions} where ${gameActions.sessionId} = ${id})`,
				e: sql<number>`(select count(*) from ${gameEvents} where ${gameEvents.sessionId} = ${id})`
			})
			.from(gameSessions)
			.where(eq(gameSessions.id, id));
		if (batch.actions?.length && Number(cnt.a) + batch.actions.length > (ctx.maxActions ?? LIMITS.actionsPerSession)) throw new TelemetryError(413, 'session action limit exceeded');
		if (batch.events?.length && Number(cnt.e) + batch.events.length > (ctx.maxEvents ?? LIMITS.eventsPerSession)) throw new TelemetryError(413, 'session event limit exceeded');
	}

	if (batch.actions?.length) {
		const res = await db
			.insert(gameActions)
			.values(
				batch.actions.map((a) => ({
					sessionId: id,
					seq: a.seq,
					day: a.day,
					action: JSON.stringify(a.action),
					ok: a.ok,
					error: a.error ?? null,
					createdAt: a.at ?? now
				}))
			)
			.onConflictDoNothing()
			.returning({ id: gameActions.id });
		result.actions = res.length;
	}
	if (batch.events?.length) {
		const res = await db
			.insert(gameEvents)
			.values(batch.events.map((e) => ({ sessionId: id, logId: e.id, day: e.day, kind: e.kind, data: JSON.stringify(e.data), source: e.source ?? null })))
			.onConflictDoNothing()
			.returning({ id: gameEvents.id });
		result.events = res.length;
	}
	if (batch.snapshots?.length) {
		const res = await db
			.insert(gameSnapshots)
			.values(batch.snapshots.map((s) => ({ sessionId: id, month: s.month, day: s.day, metrics: JSON.stringify(s.metrics) })))
			.onConflictDoNothing()
			.returning({ id: gameSnapshots.id });
		result.snapshots = res.length;
	}

	const patch: Partial<typeof gameSessions.$inferInsert> = { updatedAt: now };
	if (batch.saveId) patch.saveId = batch.saveId;
	if (batch.end) {
		const e = batch.end;
		Object.assign(patch, {
			endedAt: now,
			outcome: e.outcome,
			victoryPath: e.victoryPath ?? null,
			defeatReason: e.defeatReason ?? null,
			finalDay: e.finalDay ?? null,
			finalMonth: e.finalMonth ?? null,
			score: e.score ?? null
		});
		result.ended = true;
	}
	await db.update(gameSessions).set(patch).where(eq(gameSessions.id, id));
	return result;
}

export async function listSessions(db: Db, opts: { limit?: number; offset?: number } = {}) {
	const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
	return db
		.select({
			id: gameSessions.id,
			seed: gameSessions.seed,
			schemaVersion: gameSessions.schemaVersion,
			configHash: gameSessions.configHash,
			appVersion: gameSessions.appVersion,
			startDay: gameSessions.startDay,
			startedAt: gameSessions.startedAt,
			updatedAt: gameSessions.updatedAt,
			endedAt: gameSessions.endedAt,
			outcome: gameSessions.outcome,
			victoryPath: gameSessions.victoryPath,
			defeatReason: gameSessions.defeatReason,
			finalDay: gameSessions.finalDay,
			finalMonth: gameSessions.finalMonth,
			score: gameSessions.score,
			saveId: gameSessions.saveId,
			actionCount: sql<number>`(select count(*) from ${gameActions} where ${gameActions.sessionId} = ${gameSessions.id})`
		})
		.from(gameSessions)
		.orderBy(desc(gameSessions.startedAt))
		.limit(limit)
		.offset(Math.max(opts.offset ?? 0, 0));
}

/** Всё по сессии (для replay и анализа). null, если сессии нет. */
export async function getSessionFull(db: Db, id: string) {
	const [session] = await db.select().from(gameSessions).where(eq(gameSessions.id, id));
	if (!session) return null;
	const [actions, events, snapshots] = await Promise.all([
		db.select().from(gameActions).where(eq(gameActions.sessionId, id)).orderBy(gameActions.seq),
		db.select().from(gameEvents).where(eq(gameEvents.sessionId, id)).orderBy(gameEvents.logId),
		db.select().from(gameSnapshots).where(eq(gameSnapshots.sessionId, id)).orderBy(gameSnapshots.month)
	]);
	return {
		session: { ...session, config: session.config ? JSON.parse(session.config) : null },
		actions: actions.map((a) => ({ seq: a.seq, day: a.day, action: JSON.parse(a.action), ok: a.ok, error: a.error, createdAt: a.createdAt })),
		events: events.map((e) => ({ id: e.logId, day: e.day, kind: e.kind, data: JSON.parse(e.data), source: e.source })),
		snapshots: snapshots.map((s) => ({ month: s.month, day: s.day, metrics: JSON.parse(s.metrics) }))
	};
}

export async function deleteSession(db: Db, id: string): Promise<boolean> {
	const res = await db.delete(gameSessions).where(eq(gameSessions.id, id)).returning({ id: gameSessions.id });
	return res.length > 0;
}
