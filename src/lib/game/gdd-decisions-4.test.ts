// Решения D-062…D-065 (третий замер баланса). Все числа — через BALANCE.
import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import { SCHEMA_VERSION, applyAction, createGame, deserialize, selectActionCosts, selectCredit, serialize, stepDay, validateAction } from './index';
import { bankruptHardFloor } from './economy';
import type { GameState } from './types';

function fresh(seed: string): GameState {
	const s = createGame({ seed });
	s.cards.nextCardDay = 99999;
	return s;
}

describe('D-063: жёсткий порог долга не сжимается вместе с доходом', () => {
	it('firstIncome фиксируется на старте; порог = −FLOOR × max(lastIncome, firstIncome)', () => {
		const s = fresh('floor-first');
		expect(s.firstIncome).toBe(s.lastIncome);
		expect(s.firstIncome).toBeGreaterThan(0);
		s.lastIncome = Math.round(s.firstIncome / 2);
		expect(bankruptHardFloor(s)).toBe(-B.BANKRUPT_HARD_FLOOR_MONTHS * s.firstIncome);
		expect(selectCredit(s).hardFloor).toBe(bankruptHardFloor(s));
		// Кредитный лимит по-прежнему от lastIncome.
		expect(selectCredit(s).limit).toBe(Math.round(B.CREDIT_LIMIT_MONTHS * s.lastIncome));
		s.lastIncome = s.firstIncome * 2;
		expect(bankruptHardFloor(s)).toBe(-B.BANKRUPT_HARD_FLOOR_MONTHS * s.lastIncome);
	});

	it('долг между −FLOOR×lastIncome и −FLOOR×firstIncome не банкротит сразу', () => {
		const s = fresh('floor-shrink');
		s.share = s.share / 3; // доход месяца падает втрое
		s.budget = -Math.round((B.BANKRUPT_HARD_FLOOR_MONTHS - 1) * s.firstIncome);
		s.day = 29;
		stepDay(s);
		expect(s.lastIncome).toBeLessThan(s.firstIncome);
		expect(s.budget).toBeLessThan(-B.BANKRUPT_HARD_FLOOR_MONTHS * s.lastIncome);
		expect(s.budget).toBeGreaterThanOrEqual(bankruptHardFloor(s));
		expect(s.outcome.status).toBe('active');
	});
});

describe('D-065: поглощение «на грани» — collapseCost и collapseMinInfluence', () => {
	it('цена и порог влияния для цели «на грани»; selectActionCosts показывает collapseCost', () => {
		const s = fresh('collapse-cost');
		const p = s.rivals.find((r) => r.id === 'police')!;
		p.reputation = 0;
		stepDay(s);
		expect(p.collapsing).toBe(true);
		s.influence = B.ACT_ABSORB.collapseMinInfluence;
		s.budget = B.ACT_ABSORB.collapseCost - 1;
		expect(selectActionCosts(s).rivals.police.absorb.cost).toBe(B.ACT_ABSORB.collapseCost);
		expect(validateAction(s, { type: 'absorb', rivalId: 'police' })).toBe('no_money');
		s.budget = B.ACT_ABSORB.collapseCost;
		expect(applyAction(s, 'player', { type: 'absorb', rivalId: 'police' }).ok).toBe(true);
		expect(s.budget).toBe(0);
		// Обычная цель — по-прежнему полная цена.
		expect(selectActionCosts(s).rivals.cia.absorb.cost).toBe(B.ACT_ABSORB.cost);
	});
});

describe('сейвы v4 → v5', () => {
	it('firstIncome пересчитывается по seed и config — как в новой партии', () => {
		const s = fresh('v4');
		const raw = JSON.parse(serialize(s));
		raw.schemaVersion = 4;
		delete raw.firstIncome;
		const m = deserialize(raw);
		expect(m.schemaVersion).toBe(SCHEMA_VERSION);
		expect(m.firstIncome).toBe(createGame({ seed: 'v4' }).firstIncome);
		expect(m.rngState).toEqual(s.rngState);
	});
});
