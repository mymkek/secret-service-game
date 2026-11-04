import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import { createGame, stepDay } from './index';
import type { GameState } from './types';

function fresh(seed: string): GameState {
	const s = createGame({ seed });
	s.cards.nextCardDay = 99999; // без случайных карточек в этих сценариях
	return s;
}

function addK(s: GameState, target: GameState['kompromat'][number]['target']): void {
	s.kompromat.push({ id: s.nextId++, target, strength: 1, acquiredDay: s.day, expiresDay: s.day + 360, usedCooldownUntil: null });
}

describe('победы (§8)', () => {
	it('monopoly: все соперники выбыли', () => {
		const s = fresh('mono');
		for (const r of s.rivals) r.alive = false;
		stepDay(s);
		expect(s.outcome).toMatchObject({ status: 'won', victoryPath: 'monopoly', month: 1 });
	});

	it('cardinal: президент + 5 из 9 сенаторов непрерывно CARDINAL_HOLD_DAYS (D-050)', () => {
		const s = fresh('card');
		addK(s, { kind: 'president', id: s.presidentTerm });
		for (let i = 1; i <= 4; i++) addK(s, { kind: 'senator', id: `senator_${i}` });
		stepDay(s);
		expect(s.counters.holdCardinalDays).toBe(0);
		addK(s, { kind: 'senator', id: 'senator_5' });
		stepDay(s);
		expect(s.counters.holdCardinalDays).toBe(1);
		expect(s.outcome.status).toBe('active');
		s.counters.holdCardinalDays = B.CARDINAL_HOLD_DAYS - 1;
		stepDay(s);
		expect(s.outcome.victoryPath).toBe('cardinal');
	});

	it('компромат на президента прошлой администрации не считается', () => {
		const s = fresh('term');
		addK(s, { kind: 'president', id: s.presidentTerm });
		for (let i = 1; i <= 5; i++) addK(s, { kind: 'senator', id: `senator_${i}` });
		s.presidentTerm += 1;
		stepDay(s);
		expect(s.outcome.status).toBe('active');
	});

	it('shadow: сети ≥ 4 во всех странах 180 дней подряд', () => {
		const s = fresh('shadow');
		for (const n of Object.values(s.networks)) n.level = 4;
		s.counters.holdShadowDays = B.SHADOW_HOLD_DAYS - 2;
		stepDay(s);
		expect(s.outcome.status).toBe('active');
		stepDay(s);
		expect(s.outcome.victoryPath).toBe('shadow');
	});

	it('1984: Репрессии 7 и контроль 100 непрерывно 360 дней; сброс при нарушении', () => {
		const s = fresh('1984');
		s.reprLevel = 7;
		s.survLevel = 6;
		s.unrest = 10;
		s.counters.hold1984Days = B.VICTORY_1984_HOLD_DAYS - 2;
		stepDay(s);
		expect(s.counters.hold1984Days).toBe(B.VICTORY_1984_HOLD_DAYS - 1);
		s.reprLevel = 6;
		stepDay(s);
		expect(s.counters.hold1984Days).toBe(0);
		s.reprLevel = 7;
		s.counters.hold1984Days = B.VICTORY_1984_HOLD_DAYS - 1;
		stepDay(s);
		expect(s.outcome.victoryPath).toBe('1984');
	});

	it('приоритет: monopoly раньше cardinal', () => {
		const s = fresh('prio');
		addK(s, { kind: 'president', id: s.presidentTerm });
		for (let i = 1; i <= 5; i++) addK(s, { kind: 'senator', id: `senator_${i}` });
		for (const r of s.rivals) r.alive = false;
		stepDay(s);
		expect(s.outcome.victoryPath).toBe('monopoly');
	});

	it('clean проверяется только в конце месяца 60, иначе timeout', () => {
		const mk = (clean: boolean) => {
			const s = fresh(clean ? 'clean' : 'timeout');
			s.day = 1799;
			s.plan.metCount = clean ? B.CLEAN_MIN_QUARTERS_MET - 1 : 3; // +1 за последний квартал (план выполнен)
			s.plan.points = s.plan.target;
			s.reputation = 100;
			s.exposure = 5;
			stepDay(s);
			return s;
		};
		expect(mk(true).outcome).toMatchObject({ status: 'won', victoryPath: 'clean', month: 60 });
		expect(mk(false).outcome).toMatchObject({ status: 'lost', defeatReason: 'timeout', month: 60 });
		const early = fresh('early');
		early.plan.metCount = B.CLEAN_MIN_QUARTERS_MET;
		early.reputation = 100;
		early.exposure = 0;
		stepDay(early);
		expect(early.outcome.status).toBe('active');
	});

	it('грязное действие закрывает «Чистые руки»', () => {
		const s = fresh('dirty');
		s.day = 1799;
		s.plan.metCount = B.CLEAN_MIN_QUARTERS_MET - 1;
		s.plan.points = s.plan.target;
		s.reputation = 100;
		s.exposure = 5;
		s.counters.dirtyActions = 1;
		stepDay(s);
		expect(s.outcome.defeatReason).toBe('timeout');
	});
});

describe('поражения (§8.6)', () => {
	it('reputation и arrested — мгновенные', () => {
		const a = fresh('rep');
		a.reputation = 0;
		stepDay(a);
		expect(a.outcome.defeatReason).toBe('reputation');
		const b = fresh('arr');
		b.investigation = 100;
		stepDay(b);
		expect(b.outcome.defeatReason).toBe('arrested');
	});

	it('bankrupt: бюджет < 0 три месяца подряд', () => {
		const s = fresh('bank');
		s.budget = -100000;
		for (let i = 0; i < 89; i++) stepDay(s);
		expect(s.outcome.status).toBe('active');
		expect(s.counters.bankruptStreak).toBe(2);
		stepDay(s);
		expect(s.outcome.defeatReason).toBe('bankrupt');
		expect(s.outcome.month).toBe(3);
	});

	it('dismissed: план < 0.5 три квартала подряд (без расформирования)', () => {
		const s = fresh('dism');
		s.reputation = 100;
		s.influence = 100;
		s.plan.criticalStreak = 2;
		s.day = 89;
		stepDay(s);
		expect(s.outcome.defeatReason).toBe('dismissed');
	});

	it('счёт посчитан в исходе', () => {
		const s = fresh('score');
		s.reputation = 0;
		stepDay(s);
		expect(typeof s.outcome.score).toBe('number');
	});
});
