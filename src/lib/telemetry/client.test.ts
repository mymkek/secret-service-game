import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_QUEUE, _reset, endSession, flush, logAction, logEvents, logSnapshot, startSession } from './client';

type Body = { sessionId: string; session?: unknown; actions?: { seq: number }[]; events?: unknown[]; snapshots?: unknown[]; end?: { outcome: string } };
let sent: Body[];
let fail: boolean;
let store: Record<string, string>;

beforeEach(() => {
	sent = [];
	fail = false;
	store = {};
	vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store[k] ?? null }, addEventListener: () => {} });
	vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' });
	vi.stubGlobal('fetch', async (_u: string, init: { body: string }) => {
		if (fail) throw new Error('offline');
		sent.push(JSON.parse(init.body));
		return { ok: true, status: 200, json: async () => ({ ok: true }) };
	});
	_reset();
});
afterEach(() => {
	_reset();
	vi.unstubAllGlobals();
});

const meta = { seed: 's', schemaVersion: 5 };

describe('telemetry client', () => {
	it('выключатель localStorage.telemetry=off', () => {
		store.telemetry = 'off';
		expect(startSession(meta)).toBeNull();
	});

	it('первый батч несёт метаданные, seq идут подряд, end уходит последним', async () => {
		startSession(meta);
		logAction(1, { type: 'hire', candidateId: 1 }, true);
		logAction(2, { type: 'fire', agentId: 1 }, false, 'nope');
		logEvents([{ id: 1, day: 1, kind: 'case_new', data: {} }]);
		logSnapshot(1, 30, { budget: 1 });
		logSnapshot(1, 30, { budget: 2 }); // дубль месяца игнорируется
		await endSession({ outcome: 'won', score: 5 });
		const all = sent.flatMap((b) => b.actions ?? []);
		expect(all.map((a) => a.seq)).toEqual([0, 1]);
		expect(sent[0].session).toBeTruthy();
		expect(sent.flatMap((b) => b.snapshots ?? []).length).toBe(1);
		expect(sent.at(-1)!.end?.outcome).toBe('won');
		expect(sent.filter((b) => b.session).length).toBe(1);
	});

	it('при ошибке сети очередь сохраняется и уходит повтором', async () => {
		startSession(meta);
		await flush();
		fail = true;
		logAction(1, { type: 'buildSurv' }, true);
		await flush();
		expect(sent.flatMap((b) => b.actions ?? []).length).toBe(0);
		fail = false;
		await flush();
		expect(sent.flatMap((b) => b.actions ?? []).map((a) => a.seq)).toEqual([0]);
	});

	it('очередь ограничена', async () => {
		fail = true;
		startSession(meta);
		for (let i = 0; i < MAX_QUEUE.actions + 100; i++) logAction(i, { type: 'x' }, true);
		fail = false;
		await flush();
		const got = sent.flatMap((b) => b.actions ?? []);
		expect(got.length).toBe(MAX_QUEUE.actions);
		expect(got.at(-1)!.seq).toBe(MAX_QUEUE.actions + 99);
	});
});
