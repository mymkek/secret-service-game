// D-069: пакет констант C3 (Прил. A), условие назначения «Признания под давлением» и возврат откатов
// сгоревшей дилеммой (§9.8), сейвы v6 → v7 (§11.3).
import { afterEach, describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import { SCHEMA_VERSION, applyAction, createGame, deserialize, serialize, stepDay } from './index';
import { spawnCase } from './ops';
import type { GameState } from './types';

const saved = new Map<string, unknown>();
/** Временная правка BALANCE на один тест (восстанавливается в afterEach). */
function setB(key: string, value: unknown): void {
	if (!saved.has(key)) saved.set(key, structuredClone((B as Record<string, unknown>)[key]));
	(B as Record<string, unknown>)[key] = value;
}
afterEach(() => {
	for (const [k, v] of saved) (B as Record<string, unknown>)[k] = v;
	saved.clear();
});

function fresh(seed: string): GameState {
	const s = createGame({ seed });
	s.cards.nextCardDay = 99999;
	s.budget = 100000;
	return s;
}

/** Только одна операционная дилемма с весом, остальные 0; бросок назначения всегда успешен. */
function onlyDilemma(id: string): void {
	setB('DILEMMA_OP_CHANCE', 1);
	const w: Record<string, number> = {};
	for (const k of Object.keys(B.DILEMMA_WEIGHTS)) w[k] = k === id ? 10 : 0;
	setB('DILEMMA_WEIGHTS', w);
}

function fixedChance(p: number): void {
	setB('OP_CHANCE_MIN', p);
	setB('OP_CHANCE_MAX', p);
}

function investigation(s: GameState, d: number) {
	const c = spawnCase(s, 'regular', { difficulty: d, stateId: 'CA' })!;
	s.stateJurisdiction.CA.level = 2;
	const id = s.agents.find((a) => a.status === 'idle')!.id;
	expect(applyAction(s, 'player', { type: 'startOp', opType: 'investigation', caseId: c.id, agentIds: [id] }).ok).toBe(true);
	return s.operations[s.operations.length - 1];
}

function cancel(s: GameState, opId: number): void {
	expect(applyAction(s, 'player', { type: 'cancelOp', opId })).toEqual({ ok: true });
}

describe('D-069: пакет констант C3', () => {
	it('значения из Прил. A', () => {
		expect(B.ACT_LEAK.repPerStrength).toBe(-3);
		expect(B.ILLEGAL_TARGET_EXPOSURE).toBe(15);
		expect(B.SHADOW_HOLD_DAYS).toBe(270);
		expect(B.NET_PROGRESS_PER_AGENT).toBe(0.18);
		expect(B.VICTORY_1984_HOLD_DAYS).toBe(540);
		expect(B.REPR_COST_BY_LEVEL).toEqual([180, 360, 540, 720, 900, 1080, 1260]);
		expect((B.REPR_COST_BY_LEVEL as number[]).reduce((a, b) => a + b, 0)).toBe(5040);
		// Не меняются (D-069, решение 3 п. 4).
		expect(B.DILEMMA_OP_CHANCE).toBe(0.2); // поднят по перемеру r6 (sim/REPORT-6.md)
		expect(B.DILEMMA_COOLDOWN_DAYS).toBe(30);
		expect(B.DILEMMA_REPEAT_COOLDOWN_DAYS).toBe(180);
	});
});

describe('D-069: условие назначения «Признания под давлением»', () => {
	it('p_shown ≥ maxChance (0.6) по стартовой команде — вес 0, ничего не назначается и откат не ставится', () => {
		const s = fresh('fc-high');
		onlyDilemma('forced_confession');
		fixedChance(B.DL_FORCED_CONFESSION.maxChance);
		const op = investigation(s, 3);
		expect(op.dilemmaId).toBeNull();
		expect(s.dilemmas.pending).toEqual([]);
		expect(s.dilemmas.nextDay).toBe(0);
		expect(s.dilemmas.lastDayById).toEqual({});
	});

	it('p_shown < maxChance — назначается и ждёт фазы end_before_roll', () => {
		const s = fresh('fc-low');
		onlyDilemma('forced_confession');
		fixedChance(B.DL_FORCED_CONFESSION.maxChance - 0.01);
		const op = investigation(s, 3);
		expect(op.dilemmaId).toBe('forced_confession');
		expect(s.dilemmas.pending).toEqual([
			{ dilemmaId: 'forced_confession', opId: op.id, phase: 'end_before_roll', assignedDay: s.day, prevLastDay: null }
		]);
	});
});

describe('D-069: сгоревшая дилемма возвращает откаты', () => {
	it('отмена операции: nextDay = day, повтор снят, RNG не тронут; в тот же день возможно новое назначение', () => {
		const s = fresh('burn-cancel');
		onlyDilemma('sting');
		s.day = 100;
		const a = investigation(s, 2);
		expect(a.dilemmaId).toBe('sting');
		expect(s.dilemmas.nextDay).toBe(s.day + B.DILEMMA_COOLDOWN_DAYS);
		expect(s.dilemmas.lastDayById.sting).toBe(s.day);
		const rng0 = [...s.rngState];
		cancel(s, a.id);
		expect(s.rngState).toEqual(rng0);
		expect(s.dilemmas.pending).toEqual([]);
		expect(s.dilemmas.nextDay).toBe(s.day);
		expect(s.dilemmas.lastDayById).not.toHaveProperty('sting');
		expect(s.log.some((e) => e.kind === 'dilemma_burned' && e.data.why === 'cancelled')).toBe(true);
		const b = investigation(s, 2);
		expect(b.dilemmaId).toBe('sting');
	});

	it('провал для end_success: в день сгорания nextDay = day, следующий старт снова бросает', () => {
		const s = fresh('burn-failed');
		onlyDilemma('valuable_source');
		fixedChance(0);
		const op = investigation(s, 3);
		expect(op.dilemmaId).toBe('valuable_source');
		for (let i = 0; i < 400 && s.operations.includes(op); i++) stepDay(s);
		expect(s.operations).not.toContain(op);
		expect(s.dilemmas.nextDay).toBe(s.day);
		expect(s.dilemmas.lastDayById).not.toHaveProperty('valuable_source');
		expect(s.log.some((e) => e.kind === 'dilemma_burned' && e.data.why === 'failed')).toBe(true);
		const next = investigation(s, 3);
		expect(next.dilemmaId).toBe('valuable_source');
		expect(s.dilemmas.nextDay).toBe(s.day + B.DILEMMA_COOLDOWN_DAYS);
	});

	it('prevLastDay: повтор возвращается к прежнему значению, а не удаляется', () => {
		const s = fresh('burn-prev');
		onlyDilemma('sting');
		s.day = 400;
		s.dilemmas.lastDayById.sting = 400 - B.DILEMMA_REPEAT_COOLDOWN_DAYS;
		const a = investigation(s, 2);
		expect(s.dilemmas.pending[0]).toMatchObject({ assignedDay: 400, prevLastDay: 400 - B.DILEMMA_REPEAT_COOLDOWN_DAYS });
		cancel(s, a.id);
		expect(s.dilemmas.lastDayById.sting).toBe(400 - B.DILEMMA_REPEAT_COOLDOWN_DAYS);
	});

	it('если после неё назначено другое, глобальный откат не снимается (снимается только свой повтор)', () => {
		const s = fresh('burn-later');
		onlyDilemma('sting');
		const a = investigation(s, 2);
		expect(a.dilemmaId).toBe('sting');
		// Без шага дня: через 30 дней стартует проникновение с другой дилеммой, sting ещё ждёт фазы mid.
		s.day += B.DILEMMA_COOLDOWN_DAYS;
		onlyDilemma('cover_life');
		const ag = s.agents.find((x) => x.status === 'idle')!;
		expect(applyAction(s, 'player', { type: 'startOp', opType: 'infiltration', target: { kind: 'rival', id: 'cia' }, agentIds: [ag.id] }).ok).toBe(true);
		const nextDay = s.day + B.DILEMMA_COOLDOWN_DAYS;
		expect(s.dilemmas.nextDay).toBe(nextDay);
		cancel(s, a.id);
		expect(s.dilemmas.nextDay).toBe(nextDay);
		expect(s.dilemmas.lastDayById).not.toHaveProperty('sting');
		expect(s.dilemmas.lastDayById.cover_life).toBe(s.day);
	});
});

describe('сейвы v6 → v7', () => {
	it('ждущая дилемма получает assignedDay = null и при сгорании откаты не возвращает', () => {
		const s = fresh('v6');
		onlyDilemma('sting');
		const a = investigation(s, 2);
		const raw = JSON.parse(serialize(s));
		raw.schemaVersion = 6;
		for (const p of raw.dilemmas.pending) delete p.assignedDay, delete p.prevLastDay;
		const m = deserialize(raw);
		expect(m.schemaVersion).toBe(SCHEMA_VERSION);
		expect(SCHEMA_VERSION).toBe(7);
		expect(m.dilemmas.pending).toEqual([{ dilemmaId: 'sting', opId: a.id, phase: 'mid', assignedDay: null, prevLastDay: null }]);
		cancel(m, a.id);
		expect(m.dilemmas.nextDay).toBe(m.day + B.DILEMMA_COOLDOWN_DAYS);
		expect(m.dilemmas.lastDayById.sting).toBe(m.day);
	});
});
