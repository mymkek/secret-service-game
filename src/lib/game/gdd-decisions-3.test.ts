// Решения D-056…D-060 (Ф8–Ф11). Все числа — через BALANCE.
import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import {
	SCHEMA_VERSION,
	advance,
	applyAction,
	cloneState,
	createGame,
	deserialize,
	selectActionCosts,
	selectCredit,
	selectRivals,
	serialize,
	stepDay,
	validateAction
} from './index';
import { distributionWeights, quarterEnd } from './economy';
import { absorbChance, legalInvMult } from './formulas';
import { monthEndNetworks } from './networks';
import { smoothedPlanRatio } from './rivals';
import { tickTasks } from './actions';
import type { GameState } from './types';

function fresh(seed: string): GameState {
	const s = createGame({ seed });
	s.cards.nextCardDay = 99999;
	return s;
}

function withBalance<K extends keyof typeof B>(key: K, value: (typeof B)[K], fn: () => void): void {
	const old = B[key];
	(B as Record<string, unknown>)[key] = value;
	try {
		fn();
	} finally {
		(B as Record<string, unknown>)[key] = old;
	}
}

function addRivalK(s: GameState, id: 'police' | 'cia' | 'secret_service'): number {
	const k = { id: s.nextId++, target: { kind: 'rival' as const, id }, strength: 1, acquiredDay: 0, expiresDay: 360, usedCooldownUntil: null };
	s.kompromat.push(k);
	return k.id;
}

describe('D-056: провал сети снимает NET_FAIL_EFFECT.levels', () => {
	it('уровень после провала = уровень + levels (поимка надёжного агента ничего не добавляет)', () => {
		const s = fresh('netfail');
		const a = s.agents[0];
		a.loyalty = 90;
		a.status = 'abroad';
		a.location = { countryId: 'cuba' };
		s.techs.push('B1', 'B2', 'B3');
		s.networks.cuba = { ...s.networks.cuba, level: 4, agentIds: [a.id], progress: 0 };
		withBalance('NET_FAIL_MIN', 1, () =>
			withBalance('NET_FAIL_MAX', 1, () => {
				s.day = 30;
				monthEndNetworks(s);
			})
		);
		expect(s.networks.cuba.level).toBe(Math.max(0, 4 + B.NET_FAIL_EFFECT.levels));
	});
});

describe('D-057: «Под следствием» от грязи и откат встречного компромата', () => {
	it('встречный компромат: откат ACT_COUNTER_KOMPROMAT.cooldownDays, виден в selectActionCosts', () => {
		const s = fresh('counter');
		s.investigation = 50;
		const k1 = addRivalK(s, 'cia');
		const k2 = addRivalK(s, 'cia');
		expect(selectActionCosts(s).counterKompromat).toMatchObject({ readyInDays: 0, error: null });
		expect(applyAction(s, 'player', { type: 'counterKompromat', kompromatId: k1 }).ok).toBe(true);
		expect(s.counters.counterKompromatReadyDay).toBe(s.day + B.ACT_COUNTER_KOMPROMAT.cooldownDays);
		expect(validateAction(s, { type: 'counterKompromat', kompromatId: k2 })).toBe('cooldown');
		expect(selectActionCosts(s).counterKompromat).toMatchObject({ readyInDays: B.ACT_COUNTER_KOMPROMAT.cooldownDays, error: 'cooldown' });
		advance(s, B.ACT_COUNTER_KOMPROMAT.cooldownDays, { ignorePause: true });
		expect(validateAction(s, { type: 'counterKompromat', kompromatId: k2 })).toBeNull();
	});

	it('каждое грязное действие: «Под следствием» +DIRTY_INVESTIGATION_PER_ACTION × legal_inv_mult', () => {
		const s = fresh('dirty-inv');
		s.departments.legal = 2;
		const before = s.investigation;
		expect(applyAction(s, 'player', { type: 'fakeStats', points: 1 }).ok).toBe(true);
		expect(s.investigation).toBeCloseTo(before + B.DIRTY_INVESTIGATION_PER_ACTION * legalInvMult(2));
		expect(s.counters.dirtyActions).toBe(1);
	});

	it('включение уровня репрессий — одно грязное действие', () => {
		const s = fresh('repr-dirty');
		s.budget = 100000;
		s.survLevel = 2;
		expect(applyAction(s, 'player', { type: 'buildRepr' }).ok).toBe(true);
		s.investigation = 10;
		advance(s, B.REPR_BUILD_DAYS, { ignorePause: true });
		expect(s.reprLevel).toBe(1);
		expect(s.counters.dirtyActions).toBe(1);
		expect(s.investigation).toBeCloseTo(10 + B.DIRTY_INVESTIGATION_PER_ACTION);
	});
});

describe('D-058: сглаживание plan_ratio в весе', () => {
	it('среднее за PLAN_RATIO_SMOOTHING_QUARTERS; у ИИ planRatioPrev', () => {
		expect(smoothedPlanRatio(1.4, 0.2)).toBeCloseTo(B.PLAN_RATIO_SMOOTHING_QUARTERS >= 2 ? 0.8 : 1.4);
		const s = fresh('smooth');
		const cia = s.rivals.find((r) => r.id === 'cia')!;
		const w = (cur: number, prev: number) => {
			cia.planRatio = cur;
			cia.planRatioPrev = prev;
			const d = distributionWeights(s, 1);
			return d.weights[d.ids.indexOf('cia')];
		};
		expect(w(1.4, 0.2)).toBeCloseTo(w(smoothedPlanRatio(1.4, 0.2), smoothedPlanRatio(1.4, 0.2)));
	});

	it('для первого распределения предыдущий = 1.0; игрок с прошлым провалом получает меньшую долю', () => {
		const base = fresh('smooth-q');
		expect(base.plan.planRatioPrev).toBe(1);
		expect(base.rivals.every((r) => r.planRatioPrev === 1)).toBe(true);
		base.day = 90;
		base.plan.points = base.plan.target;
		const good = cloneState(base);
		const bad = cloneState(base);
		bad.plan.planRatioPrev = 0;
		quarterEnd(good);
		quarterEnd(bad);
		expect(bad.share).toBeLessThan(good.share);
		expect(good.plan.planRatioPrev).toBe(1);
		// Награды и штрафы плана — по текущему кварталу: перевыполнение засчитано в обоих случаях.
		expect(bad.plan.metCount).toBe(good.plan.metCount);
	});
});

describe('D-059: ИИ «на грани» и поглощение', () => {
	function collapsingPolice(seed: string): GameState {
		const s = fresh(seed);
		s.budget = 100000;
		const p = s.rivals.find((r) => r.id === 'police')!;
		p.reputation = 0;
		stepDay(s);
		expect(p.collapsing).toBe(true);
		return s;
	}

	it('поглощение «на грани» при влиянии ≥ collapseMinInfluence, шанс +collapseBonus, зафиксирован при запуске', () => {
		const s = collapsingPolice('col-absorb');
		s.influence = B.ACT_ABSORB.collapseMinInfluence - 1;
		expect(validateAction(s, { type: 'absorb', rivalId: 'police' })).toBe('no_influence');
		s.influence = B.ACT_ABSORB.collapseMinInfluence;
		const expected = absorbChance(s.influence, 0, true);
		expect(expected).toBeCloseTo(Math.min(B.ACT_ABSORB.max, Math.max(B.ACT_ABSORB.min, absorbChance(s.influence, 0) + B.ACT_ABSORB.collapseBonus)));
		expect(selectActionCosts(s).rivals.police.absorb.chance).toBeCloseTo(expected);
		expect(applyAction(s, 'player', { type: 'absorb', rivalId: 'police' }).ok).toBe(true);
		expect(s.tasks.find((t) => t.kind === 'absorb')!.chance).toBeCloseTo(expected);
	});

	it('конец квартала ждёт исхода поглощения; провал — расформирование сразу', () => {
		const s = collapsingPolice('col-wait');
		s.influence = 60;
		applyAction(s, 'player', { type: 'absorb', rivalId: 'police' });
		const task = s.tasks.find((t) => t.kind === 'absorb')!;
		task.doneDay = 95; // поглощение идёт через конец квартала
		advance(s, 90 - s.day, { ignorePause: true }); // конец квартала
		const p = s.rivals.find((r) => r.id === 'police')!;
		expect(p.alive).toBe(true);
		expect(task.disbandOnFail).toBe(true);
		task.chance = 0;
		task.doneDay = s.day + 1;
		advance(s, 1, { ignorePause: true });
		expect(p.alive).toBe(false);
		expect(p.absorbed).toBe(false);
	});

	it('поглощение: +1 уровень во всех штатах цели; расформирование: только ≥ 1 → 2; компромат на игрока исчезает', () => {
		const prep = (seed: string) => {
			const s = collapsingPolice(seed);
			s.stateJurisdiction.AL = { level: 0, holder: 'police' };
			s.stateJurisdiction.AK = { level: 1, holder: 'police' };
			const p = s.rivals.find((r) => r.id === 'police')!;
			p.kompromatOnPlayer = 5;
			s.tasks.push({ id: s.nextId++, kind: 'absorb', doneDay: s.day, rivalId: 'police', questSessionId: null, chance: 1, disbandOnFail: false });
			return s;
		};
		const a = prep('states-absorb');
		tickTasks(a);
		expect(a.rivals[0]).toMatchObject({ alive: false, absorbed: true, kompromatOnPlayer: 0 });
		expect(a.stateJurisdiction.AL).toEqual({ level: 1, holder: null });
		expect(a.stateJurisdiction.AK).toEqual({ level: 2, holder: null });
		const d = prep('states-disband');
		d.tasks = [];
		d.day = 89;
		stepDay(d);
		expect(d.rivals[0]).toMatchObject({ alive: false, absorbed: false, kompromatOnPlayer: 0 });
		expect(d.stateJurisdiction.AL).toEqual({ level: 0, holder: null });
		expect(d.stateJurisdiction.AK).toEqual({ level: 2, holder: null });
	});

	it('«на грани» не участвует в распределении и виден в selectRivals', () => {
		const s = collapsingPolice('col-share');
		expect(distributionWeights(s, 1).ids).not.toContain('police');
		expect(selectRivals(s).find((r) => r.id === 'police')).toMatchObject({ collapsing: true });
	});
});

describe('D-060: грейс и жёсткий порог', () => {
	it('месяцы 1..BANKRUPT_GRACE_MONTHS не идут в счётчик банкротства', () => {
		const s = fresh('grace');
		s.budget = -Math.round(0.5 * B.BANKRUPT_HARD_FLOOR_MONTHS * s.lastIncome);
		expect(selectCredit(s).bankruptGraceMonthsLeft).toBe(B.BANKRUPT_GRACE_MONTHS);
		s.day = 29;
		stepDay(s);
		expect(s.counters.bankruptStreak).toBe(0);
		expect(selectCredit(s).bankruptGraceMonthsLeft).toBe(B.BANKRUPT_GRACE_MONTHS - 1);
		expect(s.outcome.status).toBe('active');
	});

	it('долг больше BANKRUPT_HARD_FLOOR_MONTHS доходов — банкротство сразу, даже в грейс', () => {
		const s = fresh('floor');
		s.budget = -B.BANKRUPT_HARD_FLOOR_MONTHS * s.lastIncome * 3;
		expect(selectCredit(s).hardFloor).toBe(-B.BANKRUPT_HARD_FLOOR_MONTHS * s.lastIncome);
		s.day = 29;
		stepDay(s);
		expect(s.outcome).toMatchObject({ status: 'lost', defeatReason: 'bankrupt', month: 1 });
	});

	it('первые DISBAND_GRACE_QUARTERS распределений не идут в счётчик расформирования', () => {
		const s = fresh('dgrace');
		expect(selectCredit(s).disbandGraceQuartersLeft).toBe(B.DISBAND_GRACE_QUARTERS);
		advance(s, B.DISBAND_GRACE_QUARTERS * 90, { ignorePause: true });
		expect(s.share).toBeLessThan(B.DISBAND_SHARE);
		expect(s.counters.lowShareStreak).toBe(0);
		expect(selectCredit(s).disbandGraceQuartersLeft).toBe(0);
	});
});

describe('сейвы v3 → v4', () => {
	it('миграция добавляет collapsing, planRatioPrev, counterKompromatReadyDay, disbandOnFail', () => {
		const s = fresh('v3');
		s.influence = 70;
		s.budget = 100000;
		s.rivals[0].reputation = 5;
		applyAction(s, 'player', { type: 'absorb', rivalId: 'police' });
		const raw = JSON.parse(serialize(s));
		raw.schemaVersion = 3;
		delete raw.counters.counterKompromatReadyDay;
		delete raw.plan.planRatioPrev;
		for (const r of raw.rivals) {
			delete r.collapsing;
			delete r.planRatioPrev;
		}
		for (const t of raw.tasks) delete t.disbandOnFail;
		const m = deserialize(raw);
		expect(m.schemaVersion).toBe(SCHEMA_VERSION);
		expect(m.counters.counterKompromatReadyDay).toBe(0);
		expect(m.rivals.every((r) => r.collapsing === false && r.planRatioPrev === r.planRatio)).toBe(true);
		expect(m.plan.planRatioPrev).toBe(1);
		expect(m.tasks.every((t) => t.disbandOnFail === false)).toBe(true);
	});
});

describe('D-061: грейс для dismissed', () => {
	it('кварталы ≤ DISMISS_GRACE_QUARTERS не в счётчике, штраф за слабый план действует', () => {
		const s = fresh('dismiss-grace');
		s.day = B.DISMISS_GRACE_QUARTERS * 90 - 1;
		s.plan.quarter = B.DISMISS_GRACE_QUARTERS;
		const rep = s.reputation;
		stepDay(s);
		expect(s.plan.criticalStreak).toBe(0);
		expect(s.reputation).toBeLessThan(rep); // PLAN_FAIL_REP в грейс действует
		expect(s.quests.some((q) => q.questId === 'hearings')).toBe(true);
	});

	it('предупреждение сдвигается: после (PLAN_CRITICAL_QUARTERS − 1) засчитанных кварталов', () => {
		const s = fresh('dismiss-warn');
		const warnQ = B.DISMISS_GRACE_QUARTERS + B.PLAN_CRITICAL_QUARTERS - 1;
		advance(s, warnQ * 90 - 1, { ignorePause: true });
		expect(s.log.some((e) => e.kind === 'plan_warning')).toBe(false);
		advance(s, 1, { ignorePause: true });
		expect(s.log.some((e) => e.kind === 'plan_warning')).toBe(true);
		expect(s.outcome.status).toBe('active');
	});
});

describe('rival_collapsing: запись журнала', () => {
	it('в день конца квартала до его обработки disbandDay — сегодня', () => {
		const s = fresh('collapse-q');
		s.day = 89;
		s.rivals[1].reputation = 0;
		stepDay(s);
		const e = s.log.find((x) => x.kind === 'rival_collapsing')!;
		expect(e.data).toEqual({ rivalId: 'cia', disbandDay: 90 });
		expect(s.rivals[1].alive).toBe(false);
	});
});
