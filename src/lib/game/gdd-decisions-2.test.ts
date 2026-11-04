// Решения D-048…D-055 (Ф1–Ф7 из отчёта баланса). Все числа — через BALANCE.
import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import { advance, applyAction, createGame, selectActionCosts, selectCredit, selectResources, stepDay, validateAction } from './index';
import { canResearch } from './development';
import { addRivalRep } from './effects';
import { quarterEnd } from './economy';
import { absorbChance, applyReputationChange, legalInvMult, planTarget, reputationGainMult } from './formulas';
import { spawnCase } from './ops';
import { monthEndSociety } from './society';
import { cardinalHoldStrike } from './victory';
import type { GameState } from './types';

function fresh(seed: string): GameState {
	const s = createGame({ seed });
	s.cards.nextCardDay = 99999;
	return s;
}

/** Временная подмена константы баланса внутри теста (файл balance.ts не меняется). */
function withBalance<K extends keyof typeof B>(key: K, value: (typeof B)[K], fn: () => void): void {
	const old = B[key];
	(B as Record<string, unknown>)[key] = value;
	try {
		fn();
	} finally {
		(B as Record<string, unknown>)[key] = old;
	}
}

describe('D-048: константы из отчёта баланса используются кодом', () => {
	it('FAKE_CATCH_K, NET_PROGRESS_PER_AGENT, CLEAN_MIN_QUARTERS_MET — из BALANCE', () => {
		expect(B.FAKE_CATCH_K).toBeGreaterThan(0);
		expect(B.NET_PROGRESS_PER_AGENT).toBeGreaterThan(0);
		expect(B.CLEAN_MIN_QUARTERS_MET).toBeLessThanOrEqual(20);
	});
});

describe('D-049: годовой минимум цели плана', () => {
	it('max(PLAN_BASE_BY_YEAR[y−1], 0.27·N·3), y = ceil(Q/4)', () => {
		const small = { agentsTotal: 6, control: 0, reprLevel: 0, cardMult: 1 };
		const byStaff = B.PLAN_PER_AGENT * 6 * 3;
		expect(planTarget({ ...small, quarter: 1 })).toBe(Math.max(B.PLAN_MIN, Math.round(Math.max(B.PLAN_BASE_BY_YEAR[0], byStaff))));
		expect(planTarget({ ...small, quarter: 5 })).toBe(Math.round(Math.max(B.PLAN_BASE_BY_YEAR[1], byStaff)));
		expect(planTarget({ ...small, quarter: 20 })).toBe(B.PLAN_BASE_BY_YEAR[4]);
		const big = { ...small, agentsTotal: 30 };
		expect(planTarget({ ...big, quarter: 5 })).toBe(Math.round(B.PLAN_PER_AGENT * 30 * 3));
		// Модификаторы применяются к максимуму.
		expect(planTarget({ ...small, reprLevel: 2, quarter: 5 })).toBe(Math.round(B.PLAN_BASE_BY_YEAR[1] * B.REPR_L2_PLAN_MULT));
	});

	it('цель следующего квартала фиксируется с годовым минимумом', () => {
		const s = fresh('plan-floor');
		s.day = 89;
		stepDay(s);
		expect(s.plan.quarter).toBe(2);
		expect(s.plan.target).toBe(Math.max(B.PLAN_MIN, Math.round(Math.max(B.PLAN_BASE_BY_YEAR[0], B.PLAN_PER_AGENT * s.agents.length * 3))));
	});
});

describe('D-050: «Серый кардинал» — удержание и ответный удар', () => {
	function holding(seed: string): GameState {
		const s = fresh(seed);
		const add = (target: GameState['kompromat'][number]['target']) =>
			s.kompromat.push({ id: s.nextId++, target, strength: 1, acquiredDay: 0, expiresDay: 360, usedCooldownUntil: null });
		add({ kind: 'president', id: s.presidentTerm });
		for (let i = 1; i <= 5; i++) add({ kind: 'senator', id: `senator_${i}` });
		return s;
	}

	it('во время удержания «Под следствием» +CARDINAL_HOLD_INVESTIGATION × legal_inv_mult в конце месяца', () => {
		const s = holding('hold-inv');
		s.departments.legal = 2;
		s.day = 28;
		stepDay(s); // день 29: удержание началось
		expect(s.counters.holdCardinalDays).toBe(1);
		stepDay(s); // день 30: конец месяца, спад 7.8, затем удар 7.9
		expect(s.investigation).toBeCloseTo(B.CARDINAL_HOLD_INVESTIGATION * legalInvMult(2));
	});

	it('с шансом CARDINAL_HOLD_BURN_CHANCE сгорает ровно один предмет на сенатора; удержание сбрасывается', () => {
		withBalance('CARDINAL_HOLD_BURN_CHANCE', 1, () => {
			const s = holding('hold-burn');
			s.counters.holdCardinalDays = 10;
			cardinalHoldStrike(s);
			expect(s.kompromat.filter((k) => k.target.kind === 'senator')).toHaveLength(4);
			expect(s.kompromat.some((k) => k.target.kind === 'president')).toBe(true);
			expect(s.log.some((e) => e.kind === 'kompromat_burned')).toBe(true);
			stepDay(s);
			expect(s.counters.holdCardinalDays).toBe(0);
		});
	});

	it('без удержания удара нет', () => {
		const s = fresh('no-hold');
		cardinalHoldStrike(s);
		expect(s.investigation).toBe(0);
	});

	it('C3 и цель «президент» требуют Слежку 6; попытка слежки за сенатором — ILLEGAL_TARGET_EXPOSURE', () => {
		const s = fresh('c3');
		s.budget = 100000;
		s.techs.push('C1', 'C2');
		s.survLevel = 5;
		expect(canResearch(s, 'C3')).toBe('requirements');
		s.survLevel = B.CARDINAL_PRESIDENT_MIN_SURV;
		expect(canResearch(s, 'C3')).toBeNull();
		s.techs.push('C3');
		s.survLevel = B.CARDINAL_PRESIDENT_MIN_SURV - 1;
		const a = s.agents[0].id;
		expect(validateAction(s, { type: 'startOp', opType: 'surveillance', target: { kind: 'president' }, agentIds: [a] })).toBe('requirements');
		s.survLevel = B.CARDINAL_PRESIDENT_MIN_SURV;
		expect(validateAction(s, { type: 'startOp', opType: 'surveillance', target: { kind: 'president' }, agentIds: [a] })).toBeNull();
		const e0 = s.exposure;
		expect(applyAction(s, 'player', { type: 'startOp', opType: 'surveillance', target: { kind: 'senator', id: 'senator_1' }, agentIds: [a] }).ok).toBe(true);
		expect(s.exposure).toBeCloseTo(Math.min(100, e0 + B.ILLEGAL_TARGET_EXPOSURE * B.TECH_C1_DIRTY_EXPOSURE_MULT));
	});
});

describe('D-051: кредит на операции', () => {
	it('лимит = round(CREDIT_LIMIT_MONTHS × доход последнего месяца); до первого дохода — доход месяца 1', () => {
		const s = fresh('credit');
		expect(selectCredit(s).limit).toBe(Math.round(B.CREDIT_LIMIT_MONTHS * selectResources(s).creditLimit / B.CREDIT_LIMIT_MONTHS));
		expect(s.lastIncome).toBe(715);
		expect(selectCredit(s).limit).toBe(Math.round(B.CREDIT_LIMIT_MONTHS * 715));
	});

	it('операцию можно запустить в минус до лимита; найм и стройка — только наличными', () => {
		const s = fresh('credit-op');
		const c = spawnCase(s, 'regular', { difficulty: 1 })!;
		c.stateId = 'CA';
		s.budget = 10;
		const ids = s.agents.slice(0, 2).map((a) => a.id);
		expect(applyAction(s, 'player', { type: 'startOp', opType: 'investigation', caseId: c.id, agentIds: ids }).ok).toBe(true);
		expect(s.budget).toBe(10 - B.OP_COST.investigation);
		expect(selectCredit(s)).toMatchObject({ debt: B.OP_COST.investigation - 10 });
		expect(validateAction(s, { type: 'hire', candidateId: s.hirePool[0].id })).toBe('no_money');
		expect(validateAction(s, { type: 'buildDept', dept: 'pr' })).toBe('no_money');
		s.budget = -selectCredit(s).limit + B.OP_COST.investigation - 1;
		const c2 = spawnCase(s, 'regular', { difficulty: 1 })!;
		c2.stateId = 'TX';
		expect(validateAction(s, { type: 'startOp', opType: 'investigation', caseId: c2.id, agentIds: s.agents.slice(2, 4).map((a) => a.id) })).toBe('credit_limit');
	});

	it('после расходов конца месяца на долг начисляется CREDIT_INTEREST_RATE; банкротство — как раньше', () => {
		const s = fresh('interest');
		s.budget = -5000;
		s.day = 29;
		stepDay(s);
		const m = s.log.filter((e) => e.kind === 'month_money').at(-1)!;
		const interest = Number(m.data.interest);
		expect(interest).toBeGreaterThan(0);
		expect(interest).toBe(Math.round(B.CREDIT_INTEREST_RATE * -(s.budget + interest)));
		expect(s.counters.bankruptStreak).toBe(1);
	});
});

describe('D-052: выбытие ИИ и поглощение', () => {
	it('у ИИ свой порог RIVAL_DISBAND_SHARE, у игрока — DISBAND_SHARE', () => {
		withBalance('RIVAL_DISBAND_SHARE', 0.99, () => {
			const s = fresh('rds');
			s.plan.points = s.plan.target;
			s.day = 90;
			quarterEnd(s);
			expect(s.rivals.every((r) => r.lowShareQuarters === 1)).toBe(true);
			expect(s.counters.lowShareStreak).toBe(0);
		});
	});

	it('шанс поглощения фиксируется при запуске по влиянию до оплаты и показывается в selectActionCosts', () => {
		const s = fresh('absorb');
		s.budget = 100000;
		s.influence = 70;
		const police = s.rivals.find((r) => r.id === 'police')!;
		police.reputation = 10;
		const expected = absorbChance(70, 10);
		expect(selectActionCosts(s).rivals.police.absorb.chance).toBeCloseTo(expected);
		expect(applyAction(s, 'player', { type: 'absorb', rivalId: 'police' }).ok).toBe(true);
		expect(s.influence).toBe(70 - B.ACT_ABSORB.influence);
		police.reputation = 15;
		expect(s.tasks[0].chance).toBeCloseTo(expected);
		expect(selectActionCosts(s).rivals.police.absorb.chance).toBeCloseTo(expected);
		expect(selectActionCosts(s).rivals.police.absorb.readyInDays).toBe(B.ACT_ABSORB.days);
	});

	it('новые требования поглощения из ACT_ABSORB', () => {
		const s = fresh('absorb-req');
		s.budget = 100000;
		const r = s.rivals[0];
		r.reputation = B.ACT_ABSORB.maxTargetRep;
		s.influence = 100;
		expect(validateAction(s, { type: 'absorb', rivalId: r.id })).toBe('requirements');
		r.reputation = B.ACT_ABSORB.maxTargetRep - 1;
		s.influence = B.ACT_ABSORB.minInfluence - 1;
		expect(validateAction(s, { type: 'absorb', rivalId: r.id })).toBe('no_influence');
		s.influence = B.ACT_ABSORB.minInfluence;
		s.budget = B.ACT_ABSORB.cost - 1;
		expect(validateAction(s, { type: 'absorb', rivalId: r.id })).toBe('no_money');
	});
});

describe('D-053: недовольство и лидеры', () => {
	it('лидер теряет влияние при недовольстве < LEADER_DECLINE_BELOW_UNREST и растёт при ≥ порога появления', () => {
		const mk = (unrest: number) => {
			const s = fresh(`lead-${unrest}`);
			s.unrest = unrest;
			s.leaders.push({ id: s.nextId++, archetype: 'union', stateId: 'CA', influence: 50, crossed60: true, underWatch: false, defectorId: null });
			monthEndSociety(s);
			return s.leaders[0]?.influence;
		};
		// Рост/спад считаются по недовольству ПОСЛЕ месячного пересчёта (§4.4.3), поэтому берём запас 5.
		expect(mk(B.LEADER_DECLINE_BELOW_UNREST - 5)).toBe(50 - B.LEADER_DECLINE);
		expect(mk(B.LEADER_SPAWN_THRESHOLD + 5)).toBe(50 + B.LEADER_GROWTH.default);
		// Мёртвой зоны нет: спад начинается там, где кончается рост.
		expect(B.LEADER_DECLINE_BELOW_UNREST).toBeGreaterThanOrEqual(B.LEADER_SPAWN_THRESHOLD);
	});
});

describe('D-054: откат слежки и постоянные требования', () => {
	it('нельзя откатить слежку ниже требования активных репрессий — repr_requires_surv', () => {
		const s = fresh('rb');
		s.reprLevel = 3;
		const need = Math.max(...B.REPR_REQUIREMENTS.slice(0, 3).map((r) => (r as { surv?: number }).surv ?? 0));
		s.survLevel = need;
		expect(validateAction(s, { type: 'rollbackSurv' })).toBe('repr_requires_surv');
		s.survLevel = need + 1;
		expect(applyAction(s, 'player', { type: 'rollbackSurv' }).ok).toBe(true);
		expect(s.survLevel).toBe(need);
	});

	it('технологии остаются при откате слежки', () => {
		const s = fresh('tech-stays');
		s.survLevel = 2;
		s.techs.push('A1');
		applyAction(s, 'player', { type: 'rollbackSurv' });
		applyAction(s, 'player', { type: 'rollbackSurv' });
		expect(s.survLevel).toBe(0);
		expect(s.techs).toContain('A1');
	});

	it('«1984» требует Слежку 6 весь период удержания', () => {
		const s = fresh('1984-surv');
		s.reprLevel = 7;
		s.unrest = 10;
		s.survLevel = 6;
		stepDay(s);
		expect(s.counters.hold1984Days).toBe(1);
		s.survLevel = 5;
		stepDay(s);
		expect(s.counters.hold1984Days).toBe(0);
	});
});

describe('D-055: мягкий потолок репутации', () => {
	it('прирост выше REP_SOFTCAP_START масштабируется, потери — нет', () => {
		const span = 100 - B.REP_SOFTCAP_START;
		expect(reputationGainMult(B.REP_SOFTCAP_START)).toBe(1);
		expect(applyReputationChange(B.REP_SOFTCAP_START, 3)).toBe(B.REP_SOFTCAP_START + 3);
		expect(applyReputationChange(80, 3)).toBeCloseTo(80 + 3 * (20 / span));
		expect(applyReputationChange(99, 10)).toBeCloseTo(Math.min(100, 99 + 10 * B.REP_GAIN_MIN_MULT));
		expect(applyReputationChange(90, -5)).toBe(85);
		expect(applyReputationChange(2, -5)).toBe(0);
	});

	it('одно правило для игрока и ИИ', () => {
		const s = fresh('softcap');
		s.budget = 10000;
		s.reputation = 85;
		applyAction(s, 'player', { type: 'prCampaign' });
		expect(s.reputation).toBeCloseTo(applyReputationChange(85, B.PR_CAMPAIGN.repBase));
		const r = s.rivals[0];
		r.reputation = 85;
		addRivalRep(r, 6);
		expect(r.reputation).toBeCloseTo(applyReputationChange(85, 6));
	});

	it('за срок честный бот не упирается в 100 из-за пассивного пиара', () => {
		const s = fresh('softcap-pr');
		s.departments.pr = 5;
		s.reputation = 95;
		advance(s, 360, { ignorePause: true });
		expect(s.reputation).toBeLessThan(100);
	});
});
