import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import { advance, createGame, deserialize, serialize, selectForecast, selectResources, SCHEMA_VERSION } from './index';
import { honestBotTurn } from './testing/honest-bot';
import { MIGRATIONS } from './state';
import type { GameState } from './types';

/** Нет undefined/NaN/Infinity/функций — JSON без потерь. */
function assertJsonSafe(x: unknown, path = '$'): void {
	if (x === null || typeof x === 'string' || typeof x === 'boolean') return;
	if (typeof x === 'number') {
		expect({ path, finite: Number.isFinite(x) }).toEqual({ path, finite: true });
		return;
	}
	if (Array.isArray(x)) return x.forEach((v, i) => assertJsonSafe(v, `${path}[${i}]`));
	if (typeof x === 'object') {
		expect(Object.getPrototypeOf(x)).toBe(Object.prototype);
		for (const [k, v] of Object.entries(x as object)) {
			expect({ path: `${path}.${k}`, undef: v === undefined }).toEqual({ path: `${path}.${k}`, undef: false });
			assertJsonSafe(v, `${path}.${k}`);
		}
		return;
	}
	throw new Error(`not JSON-safe at ${path}: ${typeof x}`);
}

describe('createGame (§2.1, §4, §6, §11.3)', () => {
	const s = createGame({ seed: 'start' });

	it('стартовые значения из Приложения A', () => {
		expect(s.schemaVersion).toBe(SCHEMA_VERSION);
		expect(s.day).toBe(0);
		expect(s.budget).toBe(B.START_BUDGET);
		expect(s.reputation).toBe(50);
		expect(s.influence).toBe(20);
		expect(s.exposure).toBe(10);
		expect(s.unrest).toBe(15);
		expect(s.departments).toEqual(B.START_DEPARTMENTS);
		expect(s.agents.filter((a) => a.rank === 'novice')).toHaveLength(B.START_ROSTER.novice);
		expect(s.agents.filter((a) => a.rank === 'experienced')).toHaveLength(2);
		expect(s.agents.every((a) => a.traits.length === 0)).toBe(true);
		expect(s.hirePool).toHaveLength(B.HIRE_POOL_SIZE);
		expect(Object.keys(s.stateJurisdiction)).toHaveLength(50);
		expect(selectResources(s).agentCap).toBe(12);
		expect(s.plan.target).toBe(B.PLAN_FIRST_QUARTER);
		expect(s.cards.nextCardDay).toBeGreaterThanOrEqual(60);
		expect(s.cards.nextCardDay).toBeLessThanOrEqual(120);
		expect(Object.keys(s.networks)).toEqual(['canada', 'mexico', 'cuba']);
		expect(s.senators).toHaveLength(9);
	});

	it('начальная доля 0.2233 → доход месяца 1 = 715 k$ (§6.2)', () => {
		expect(s.share).toBeCloseTo(0.2233, 4);
		expect(selectForecast(s).income).toBe(715);
		expect(s.share + s.rivals.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 12);
	});

	it('агенты сгенерированы по таблицам рангов', () => {
		for (const a of s.agents) {
			const [lo, hi] = B.SKILL_RANGE_BY_RANK[a.rank];
			for (const v of Object.values(a.skills)) expect(v >= lo && v <= hi + 1).toBe(true);
			const [llo, lhi] = B.LOYALTY_RANGE_BY_RANK[a.rank];
			expect(a.loyalty >= llo && a.loyalty <= lhi).toBe(true);
			expect(a.xp).toBe(B.XP_LEVEL_THRESHOLDS[a.level - 1]);
		}
	});

	it('состояние JSON-безопасно', () => assertJsonSafe(s));
});

describe('сериализация (§11.3)', () => {
	it('round-trip: serialize → deserialize даёт тот же state', () => {
		const s = createGame({ seed: 'rt' });
		for (let i = 0; i < 40; i++) {
			honestBotTurn(s);
			advance(s, 9, { ignorePause: true });
		}
		assertJsonSafe(s);
		const json = serialize(s);
		const back = deserialize(json);
		expect(back).toEqual(s);
		expect(serialize(back)).toBe(json);
	});

	it('загрузка из сейва продолжает партию точно так же, как без сохранения', () => {
		const run = (withReload: boolean): GameState => {
			let s = createGame({ seed: 'resume' });
			for (let i = 0; i < 120; i++) {
				honestBotTurn(s);
				advance(s, 5, { ignorePause: true });
				if (withReload && i % 17 === 0) s = deserialize(serialize(s));
				if (s.outcome.status !== 'active') break;
			}
			return s;
		};
		expect(serialize(run(true))).toBe(serialize(run(false)));
	});

	it('отказ на чужом JSON и на сейве из будущего', () => {
		expect(() => deserialize('{"a":1}')).toThrow();
		const s = createGame({ seed: 'v' });
		expect(() => deserialize({ ...JSON.parse(serialize(s)), schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/newer/);
	});

	it('миграции применяются по цепочке', () => {
		const s = JSON.parse(serialize(createGame({ seed: 'mig' })));
		s.schemaVersion = 0;
		delete s.priorityMult;
		MIGRATIONS[0] = (raw) => ({ ...raw, priorityMult: 1 });
		try {
			const m = deserialize(s);
			expect(m.schemaVersion).toBe(SCHEMA_VERSION);
			expect(m.priorityMult).toBe(1);
		} finally {
			delete MIGRATIONS[0];
		}
	});
});
