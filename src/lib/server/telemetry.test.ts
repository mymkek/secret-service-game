import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import * as schema from './db/schema';
import { gameActions, gameEvents, gameSessions, gameSnapshots } from './db/schema';
import { LIMITS, TelemetryError, batchSchema, getSessionFull, ingestBatch, listSessions, deleteSession, telemetryEnabled, type Db } from './telemetry';

const SID = '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b';
let db: Db;

beforeEach(async () => {
	const client = createClient({ url: ':memory:' });
	db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: 'drizzle' });
});

const meta = { seed: 'abc', schemaVersion: 5, configHash: 'h', startDay: 0 };
const act = (seq: number) => ({ seq, day: seq, action: { type: 'hire', candidateId: seq }, ok: true });
const ev = (id: number) => ({ id, day: id, kind: 'case_new', data: { n: id, ok: true, s: 'x', z: null }, source: null });
const parse = (o: unknown) => batchSchema.parse(o);

describe('telemetryEnabled', () => {
	it('по умолчанию только в dev', () => {
		expect(telemetryEnabled(undefined, true)).toBe(true);
		expect(telemetryEnabled(undefined, false)).toBe(false);
	});
	it('переменная перекрывает dev', () => {
		expect(telemetryEnabled('1', false)).toBe(true);
		expect(telemetryEnabled('false', true)).toBe(false);
	});
});

describe('batchSchema', () => {
	it('отклоняет не-uuid, лишние размеры и неверные типы', () => {
		expect(batchSchema.safeParse({ sessionId: 'x' }).success).toBe(false);
		expect(batchSchema.safeParse({ sessionId: SID, actions: Array.from({ length: LIMITS.actions + 1 }, (_, i) => act(i)) }).success).toBe(false);
		expect(batchSchema.safeParse({ sessionId: SID, events: Array.from({ length: LIMITS.events + 1 }, (_, i) => ev(i)) }).success).toBe(false);
		expect(batchSchema.safeParse({ sessionId: SID, actions: [{ ...act(0), action: { nope: 1 } }] }).success).toBe(false);
		expect(batchSchema.safeParse({ sessionId: SID, events: [{ ...ev(0), data: { a: { nested: 1 } } }] }).success).toBe(false);
		expect(batchSchema.safeParse({ sessionId: SID, end: { outcome: 'draw' } }).success).toBe(false);
	});
	it('отклоняет слишком большое действие', () => {
		const big = { ...act(0), action: { type: 'x', blob: 'a'.repeat(LIMITS.actionBytes) } };
		expect(batchSchema.safeParse({ sessionId: SID, actions: [big] }).success).toBe(false);
	});
	it('принимает полный батч', () => {
		expect(
			batchSchema.safeParse({ sessionId: SID, session: meta, actions: [act(0)], events: [ev(1)], snapshots: [{ month: 1, day: 30, metrics: { budget: 5 } }], end: { outcome: 'won', score: 10 } }).success
		).toBe(true);
	});
});

describe('ingestBatch', () => {
	it('требует метаданные сессии при первом батче', async () => {
		await expect(ingestBatch(db, parse({ sessionId: SID, actions: [act(0)] }))).rejects.toBeInstanceOf(TelemetryError);
	});

	it('идемпотентен: повтор батча не дублирует', async () => {
		const batch = parse({
			sessionId: SID,
			session: meta,
			actions: [act(0), act(1), act(2)],
			events: [ev(1), ev(2)],
			snapshots: [{ month: 1, day: 30, metrics: { budget: 5 } }]
		});
		const r1 = await ingestBatch(db, batch);
		expect(r1).toMatchObject({ sessionCreated: true, actions: 3, events: 2, snapshots: 1 });
		const r2 = await ingestBatch(db, batch);
		expect(r2).toMatchObject({ sessionCreated: false, actions: 0, events: 0, snapshots: 0 });
		expect((await db.select().from(gameActions)).length).toBe(3);
		expect((await db.select().from(gameEvents)).length).toBe(2);
		expect((await db.select().from(gameSnapshots)).length).toBe(1);
		expect((await db.select().from(gameSessions)).length).toBe(1);
	});

	it('частично пересекающиеся батчи добавляют только новое', async () => {
		await ingestBatch(db, parse({ sessionId: SID, session: meta, actions: [act(0), act(1)] }));
		const r = await ingestBatch(db, parse({ sessionId: SID, actions: [act(1), act(2)] }));
		expect(r.actions).toBe(1);
	});

	it('end проставляет итоги и обрезает user agent', async () => {
		await ingestBatch(db, parse({ sessionId: SID, session: meta }), { userAgent: 'U'.repeat(500) });
		await ingestBatch(db, parse({ sessionId: SID, saveId: 'save-1', end: { outcome: 'lost', defeatReason: 'bankrupt', finalDay: 400, finalMonth: 14, score: 77 } }), { now: 123 });
		const [s] = await listSessions(db);
		expect(s).toMatchObject({ outcome: 'lost', defeatReason: 'bankrupt', finalDay: 400, finalMonth: 14, score: 77, endedAt: 123, saveId: 'save-1' });
		const [row] = await db.select().from(gameSessions);
		expect(row.userAgent!.length).toBe(LIMITS.userAgent);
	});

	it('лимит записей на сессию', async () => {
		await ingestBatch(db, parse({ sessionId: SID, session: meta, actions: [act(0), act(1)], events: [ev(1)] }));
		await expect(ingestBatch(db, parse({ sessionId: SID, actions: [act(2), act(3)] }), { maxActions: 3 })).rejects.toMatchObject({ status: 413 });
		await expect(ingestBatch(db, parse({ sessionId: SID, events: [ev(2)] }), { maxEvents: 1 })).rejects.toMatchObject({ status: 413 });
		expect((await db.select().from(gameActions)).length).toBe(2);
	});

	it('getSessionFull отдаёт всё по порядку, каскадное удаление работает', async () => {
		await ingestBatch(db, parse({ sessionId: SID, session: { ...meta, config: { agency: 'fbi' } }, actions: [act(1), act(0)], events: [ev(2), ev(1)], snapshots: [{ month: 2, day: 60, metrics: { a: 1 } }, { month: 1, day: 30, metrics: { a: 0 } }] }));
		const full = await getSessionFull(db, SID);
		expect(full!.actions.map((a) => a.seq)).toEqual([0, 1]);
		expect(full!.actions[0].action).toEqual({ type: 'hire', candidateId: 0 });
		expect(full!.events.map((e) => e.id)).toEqual([1, 2]);
		expect(full!.snapshots.map((s) => s.month)).toEqual([1, 2]);
		expect(full!.session.config).toEqual({ agency: 'fbi' });
		expect(await getSessionFull(db, 'nope')).toBeNull();
		expect(await deleteSession(db, SID)).toBe(true);
		expect((await db.select().from(gameActions)).length).toBe(0);
		expect((await db.select().from(gameEvents)).length).toBe(0);
		expect((await db.select().from(gameSnapshots)).length).toBe(0);
	});
});
