// Детерминизм и длинные прогоны: ядро должно выдерживать 1000 партий в Node.
import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import { advance, applyAction, createGame, realtimeToDays, serialize, setPaused, stepDay } from './index';
import { honestBotTurn } from './testing/honest-bot';
import { monthOfDay } from './formulas';
import type { GameState } from './types';

const DEFEATS = ['timeout', 'arrested', 'bankrupt', 'riot', 'reputation', 'dismissed', 'disbanded'];
const VICTORIES = ['1984', 'shadow', 'monopoly', 'clean', 'cardinal'];

function invariants(s: GameState): void {
	for (const k of ['reputation', 'influence', 'exposure', 'investigation', 'control', 'unrest'] as const)
		expect({ k, ok: s[k] >= 0 && s[k] <= 100 }).toEqual({ k, ok: true });
	expect(Number.isInteger(s.budget)).toBe(true);
	const ids = [...s.agents.map((a) => a.id), ...s.cases.map((c) => c.id), ...s.operations.map((o) => o.id), ...s.kompromat.map((k) => k.id)];
	expect(new Set(ids).size).toBe(ids.length);
	for (const a of s.agents) expect(a.loyalty >= 0 && a.loyalty <= 100).toBe(true);
	for (const op of s.operations) for (const id of op.agentIds) expect(s.agents.find((a) => a.id === id)?.status).toBe('on_op');
	expect(s.log.length).toBeLessThanOrEqual(B.LOG_MAX_ENTRIES);
	// Доли меняются только при распределении; выбывший между распределениями соперник обнуляет свою (§6.2, §6.6).
	const shareSum = s.share + s.rivals.reduce((a, r) => a + (r.alive ? r.share : 0), 0);
	expect(shareSum).toBeLessThanOrEqual(1 + 1e-9);
	if (s.rivals.every((r) => r.alive)) expect(shareSum).toBeCloseTo(1, 9);
}

function checkOutcome(s: GameState): void {
	const o = s.outcome;
	expect(o.status).not.toBe('active');
	expect(o.day).toBe(s.day);
	expect(o.month).toBe(monthOfDay(s.day));
	expect(s.day).toBeLessThanOrEqual(1800);
	if (o.status === 'won') expect(VICTORIES).toContain(o.victoryPath);
	else expect(DEFEATS).toContain(o.defeatReason);
	if (o.defeatReason === 'timeout') expect(s.day).toBe(1800);
	expect(Number.isInteger(o.score)).toBe(true);
}

describe('детерминизм', () => {
	it('одно зерно + одни действия → идентичный state', () => {
		const play = () => {
			const s = createGame({ seed: 'det-42' });
			for (let i = 0; i < 300 && s.outcome.status === 'active'; i++) {
				honestBotTurn(s);
				advance(s, 3, { ignorePause: true });
			}
			return serialize(s);
		};
		const a = play();
		expect(play()).toBe(a);
		expect(a.length).toBeGreaterThan(1000);
	});

	it('разные зёрна → разные партии', () => {
		const a = createGame({ seed: 'one' });
		const b = createGame({ seed: 'two' });
		advance(a, 200, { ignorePause: true });
		advance(b, 200, { ignorePause: true });
		expect(serialize(a)).not.toBe(serialize(b));
	});

	it('шаг по дню и advance(n) эквивалентны', () => {
		const a = createGame({ seed: 'eq' });
		const b = createGame({ seed: 'eq' });
		advance(a, 150, { ignorePause: true });
		for (let i = 0; i < 150; i++) stepDay(b);
		expect(serialize(b)).toBe(serialize(a));
	});
});

describe('1800 дней без действий игрока', () => {
	it('без исключений и с корректным исходом', () => {
		for (const seed of ['idle-1', 'idle-2', 'idle-3', 'idle-4', 'idle-5']) {
			const s = createGame({ seed });
			let days = 0;
			while (s.outcome.status === 'active' && days < 1800) {
				const r = advance(s, 30, { ignorePause: true });
				days += r.daysAdvanced;
				invariants(s);
			}
			checkOutcome(s);
			// План 0 каждый квартал → доля < DISBAND_SHARE два распределения подряд (§6.6):
			// бездействующее ведомство расформировывают в конце месяца 6.
			expect(s.outcome.defeatReason).toBe('disbanded');
			expect(s.outcome.month).toBe(6);
			expect(s.plan.ratioHistory).toEqual([0, 0]);
		}
	});
});

describe('полные партии ботом', () => {
	it('30 партий до конца: инварианты, корректные исходы, есть доживающие до срока', () => {
		const tally: Record<string, number> = {};
		for (let i = 0; i < 30; i++) {
			const s = createGame({ seed: `bot-${i}` });
			let turns = 0;
			while (s.outcome.status === 'active') {
				honestBotTurn(s);
				advance(s, 3, { ignorePause: true });
				if (++turns % 20 === 0) invariants(s);
			}
			checkOutcome(s);
			const k = s.outcome.victoryPath ?? s.outcome.defeatReason!;
			tally[k] = (tally[k] ?? 0) + 1;
		}
		const fullTerm = (tally.timeout ?? 0) + (tally.clean ?? 0);
		expect(fullTerm).toBeGreaterThan(0);
	});
});

describe('пауза, автопауза, скорости', () => {
	it('новая партия на паузе; advance на паузе не двигает время', () => {
		const s = createGame({ seed: 'p' });
		expect(s.paused).toBe(true);
		expect(advance(s, 10).daysAdvanced).toBe(0);
		setPaused(s, false);
		expect(advance(s, 10).daysAdvanced).toBe(10);
	});

	it('автопауза останавливает advance на событии (квартальный отчёт)', () => {
		const s = createGame({ seed: 'ap', autopause: { chanceCard: false, firstNegativeBudget: false, raiseRequest: false, questChoice: false } });
		setPaused(s, false);
		const r = advance(s, 200);
		expect(r.stoppedBy).toBe('autopause');
		expect(s.paused).toBe(true);
		expect(s.pauseReasons.length).toBeGreaterThan(0);
		expect(r.events.length).toBeGreaterThan(0);
	});

	it('приказы на паузе принимаются', () => {
		const s = createGame({ seed: 'orders' });
		const c = s.hirePool[0];
		expect(applyAction(s, 'player', { type: 'hire', candidateId: c.id }).ok).toBe(true);
	});

	it('реальное время → дни по DAY_MS_BY_SPEED', () => {
		expect(realtimeToDays(1, 2999)).toEqual({ days: 0, carryMs: 2999 });
		expect(realtimeToDays(1, 1, 2999)).toEqual({ days: 1, carryMs: 0 });
		expect(realtimeToDays(3, 3500)).toEqual({ days: 3, carryMs: 500 });
		expect(realtimeToDays(2, 1500 * 1800).days).toBe(1800);
	});
});
