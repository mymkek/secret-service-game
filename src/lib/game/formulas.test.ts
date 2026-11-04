import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import * as F from './formulas';

describe('§0 время', () => {
	it('месяц/квартал/конец месяца', () => {
		expect(F.monthOfDay(1)).toBe(1);
		expect(F.monthOfDay(30)).toBe(1);
		expect(F.monthOfDay(31)).toBe(2);
		expect(F.monthOfDay(1800)).toBe(60);
		expect(F.quarterOfMonth(3)).toBe(1);
		expect(F.quarterIndexOfMonth(4)).toBe(1);
		expect(F.isMonthEnd(30)).toBe(true);
		expect(F.isMonthEnd(31)).toBe(false);
		expect(F.termDays()).toBe(1800);
		expect(F.scaledDays(30, 0.9)).toBe(27);
		expect(F.scaledDays(1, 0.1)).toBe(1);
	});
});

describe('§2.3 скандал', () => {
	it('примеры из ГДД: E=30/50/70/90 → 0.030/0.119/0.267/0.474', () => {
		expect(F.scandalChance(10)).toBe(0);
		expect(F.scandalChance(5)).toBe(0);
		expect(F.scandalChance(30)).toBeCloseTo(0.03, 3);
		expect(F.scandalChance(50)).toBeCloseTo(0.119, 3);
		expect(F.scandalChance(70)).toBeCloseTo(0.267, 3);
		expect(F.scandalChance(90)).toBeCloseTo(0.474, 3);
		expect(F.scandalChance(100)).toBeLessThanOrEqual(B.SCANDAL_P_MAX);
	});

	it('потеря репутации: база + E, смягчение пиаром и цензурой', () => {
		expect(F.scandalRepLoss(50, 0, 0)).toBeCloseTo(5 + 0.15 * 50);
		expect(F.scandalRepLoss(50, 2, 0)).toBeCloseTo((5 + 7.5) * 0.8);
		expect(F.scandalRepLoss(50, 0, 4)).toBeCloseTo(12.5 * 0.5);
		expect(F.scandalInvestigationRaw(49)).toBe(0);
		expect(F.scandalInvestigationRaw(60)).toBeCloseTo(6);
	});

	it('месячная засвеченность: слежка, репрессии, бунты, правозащитники, спад', () => {
		expect(F.exposureMonthlyDelta({ survLevel: 0, reprLevel: 0, unrest: 0, pr: 0, rightsLeaders: 0 })).toBe(-2);
		expect(F.exposureMonthlyDelta({ survLevel: 6, reprLevel: 3, unrest: 80, pr: 2, rightsLeaders: 1 })).toBeCloseTo(4 + 3 + 5 + 0.5 - 3);
	});
});

describe('§2 дрейфы и следствие', () => {
	it('репутация и влияние тянутся к якорям', () => {
		expect(F.reputationDriftDelta(80, 0)).toBeCloseTo(-0.9);
		expect(F.reputationDriftDelta(50, 2)).toBeCloseTo(0.6);
		expect(F.influenceDriftDelta(20, 5)).toBeCloseTo(1);
	});
	it('legal-множители и спад следствия', () => {
		expect(F.legalFailMult(2)).toBeCloseTo(0.84);
		expect(F.legalInvMult(3)).toBeCloseTo(0.7);
		expect(F.investigationDecay(2)).toBe(2);
	});
	it('сила компромата от слежки', () => {
		expect([0, 2, 3, 4, 5, 6].map(F.surveillanceKompromatStrength)).toEqual([1, 1, 2, 2, 3, 3]);
	});
});

describe('§4 персонал и развитие', () => {
	it('лимит агентов на старте = 12', () => {
		expect(F.agentCap(60, 1)).toBe(12);
	});
	it('зарплата', () => {
		expect(F.salary('novice', 1, 1)).toBe(25);
		expect(F.salary('experienced', 2, 1)).toBe(53);
		expect(F.salary('veteran', 3, 1.5)).toBe(Math.round(90 * 1.1 * 1.5));
	});
	it('XP и уровни', () => {
		expect(F.opXp(true, 3)).toBe(50);
		expect(F.opXp(false, 3)).toBe(10);
		expect(F.levelForXp(0)).toBe(1);
		expect(F.levelForXp(99)).toBe(1);
		expect(F.levelForXp(100)).toBe(2);
		expect(F.levelForXp(10000)).toBe(5);
	});
	it('лояльность: дельта и шанс перехода', () => {
		expect(F.loyaltyDelta({ paid: true, salaryMult: 1.25, successes: 2, fails: 1, overworked: true, traitDelta: -2 })).toBe(1 + 2 + 6 - 5 - 3 - 2);
		expect(F.loyaltyDelta({ paid: false, salaryMult: 1, successes: 0, fails: 0, overworked: false, traitDelta: 0 })).toBe(-10);
		expect(F.defectChance(50, 0, 1)).toBe(0);
		expect(F.defectChance(30, 0, 1)).toBeCloseTo(0.03);
		expect(F.defectChance(10, 2, 2)).toBeCloseTo(0.1 * 0.76 * 2);
	});
	it('ордер', () => {
		expect(F.warrantDays(0)).toBe(10);
		expect(F.warrantDays(5)).toBe(2);
	});
	it('контроль: Σ уровней − избыток недовольства; 100 только на 7-м уровне', () => {
		expect(F.controlValue(6, 0, 0)).toBe(90);
		expect(F.controlValue(7, 0, 70)).toBe(100);
		expect(F.controlValue(7, 0, 80)).toBe(90);
		expect(F.controlValue(1, 5, 60)).toBe(0);
	});
	it('недовольство за месяц и правило Репрессий 7', () => {
		expect(F.unrestMonthly(20, 2, 100)).toBeCloseTo(20 + 1 + 2 - B.UNREST_DECAY);
		expect(F.unrestMonthly(70, 7, 0)).toBe(65);
		expect(F.unrestMonthly(32, 7, 300)).toBe(30);
		expect(F.unrestMonthly(25, 7, 300)).toBe(30);
		expect(F.unrestOneOff(25, 20, 7)).toBe(30);
		expect(F.unrestOneOff(40, 20, 7)).toBe(40);
		expect(F.unrestOneOff(40, 20, 6)).toBe(60);
	});
	it('протесты и переворот', () => {
		expect(F.protestCount(49, 0)).toBe(0);
		expect(F.protestCount(50, 0)).toBe(1);
		expect(F.protestCount(75, 2)).toBe(2);
		expect(F.protestCount(90, 7)).toBe(0);
		expect(F.coupChance(79)).toBe(0);
		expect(F.coupChance(80)).toBeCloseTo(0.02);
		expect(F.coupChance(100)).toBe(B.COUP_P_MAX);
	});
	it('лимит лидеров', () => {
		expect(F.leaderCap(41)).toBe(1);
		expect(F.leaderCap(60)).toBe(2);
		expect(F.leaderCap(100)).toBe(3);
	});
	it('технологии и сети', () => {
		expect(F.techCost('A3')).toBe(1000);
		expect(F.techDays('B2')).toBe(90);
		expect(F.networkCap([])).toBe(0);
		expect(F.networkCap(['B1'])).toBe(2);
		expect(F.networkCap(['B1', 'B2', 'B3'])).toBe(5);
	});
});

describe('§5.2 шанс операции', () => {
	// Примеры §5.2 (D-066), месяц 1, Аналитика 1 / Оперативный 1.
	const inv = { type: 'investigation' as const, difficulty: 3, teamSkill: 5, teamLevel: 2, reinforce: 0, deptLevel: 1, bonus: 0, hasMole: false };
	it('опытный один на d3 = 0.53; с новичком 0.59; втроём 0.63', () => {
		expect(F.opSuccessChance(inv)).toBeCloseTo(0.53, 10);
		expect(F.opSuccessChance({ ...inv, reinforce: F.reinforceBonus([false]) })).toBeCloseTo(0.59, 10);
		expect(F.opSuccessChance({ ...inv, reinforce: F.reinforceBonus([false, false]) })).toBeCloseTo(0.63, 10);
	});
	it('новичок один на d1 = 0.55', () => {
		expect(F.opSuccessChance({ ...inv, difficulty: 1, teamSkill: 3, teamLevel: 1 })).toBeCloseTo(0.55, 10);
	});
	it('теракт d4: опытный один 0.31, вдвоём 0.37, втроём 0.41', () => {
		const t = { type: 'terror' as const, difficulty: 4, teamSkill: 6, teamLevel: 2, reinforce: 0, deptLevel: 1, bonus: 0, hasMole: false };
		expect(F.opSuccessChance(t)).toBeCloseTo(0.31, 10);
		expect(F.opSuccessChance({ ...t, reinforce: F.reinforceBonus([false]) })).toBeCloseTo(0.37, 10);
		expect(F.opSuccessChance({ ...t, reinforce: F.reinforceBonus([false, false]) })).toBeCloseTo(0.41, 10);
	});
	it('слоты подкрепления: [0.06, 0.04], поздний ×0.5, сверх двух — ничего', () => {
		expect(F.reinforceBonus([])).toBe(0);
		expect(F.reinforceBonus([false, true])).toBeCloseTo(0.08, 10); // пример §5.2: третий пришёл на 60 %
		expect(F.reinforceBonus([true, true])).toBeCloseTo(0.05, 10);
		expect(F.reinforceBonus([false, false, false])).toBeCloseTo(0.1, 10);
	});
	it('крот только в p, не в p_shown; кламп', () => {
		const base = { type: 'terror' as const, difficulty: 3, teamSkill: 5, teamLevel: 1, reinforce: 0, deptLevel: 0, bonus: 0, hasMole: false };
		expect(F.opShownChance(base)).toBeCloseTo(0.28);
		expect(F.opSuccessChance({ ...base, hasMole: true })).toBeCloseTo(0.18);
		expect(F.opRollChance(F.opShownChance(base), true)).toBeCloseTo(0.18);
		expect(F.opRollChance(0.07, true)).toBe(B.OP_CHANCE_MIN);
		expect(F.opSuccessChance({ ...base, teamSkill: 1, difficulty: 5 })).toBe(B.OP_CHANCE_MIN);
		expect(F.opSuccessChance({ ...base, teamSkill: 10, deptLevel: 5, bonus: 0.5 })).toBe(B.OP_CHANCE_MAX);
	});
	it('гибель при провале теракта и «прикрытие» (D-066)', () => {
		expect(F.terrorDeathChance(5, false)).toBeCloseTo(0.15);
		expect(F.terrorDeathChance(10, true)).toBeCloseTo(0.03);
		expect(F.terrorDeathChance(1, false)).toBeCloseTo(0.23);
		// Примеры §5.2: опытный (бой 6) один 0.13; вдвоём с новичком (бой 2) 0.08 / 0.16; втроём 0.03 / 0.11.
		expect(F.terrorDeathChance(6, false, 1)).toBeCloseTo(0.13);
		expect(F.terrorDeathChance(6, false, 2)).toBeCloseTo(0.08);
		expect(F.terrorDeathChance(2, false, 2)).toBeCloseTo(0.16);
		expect(F.terrorDeathChance(6, false, 3)).toBeCloseTo(0.03);
		expect(F.terrorDeathChance(2, false, 3)).toBeCloseTo(0.11);
	});
	it('«Хороший/плохой коп» — только при ≥ 2 агентах', () => {
		expect(F.goodBadCopAvailable(1)).toBe(false);
		expect(F.goodBadCopAvailable(2)).toBe(true);
	});
	it('награды и длительности', () => {
		expect(F.opReward('investigation', 3, 1)).toBe(65);
		expect(F.opReward('terror', 4, 1)).toBe(270);
		expect(F.opReward('investigation', 4, 2)).toBe(160);
		expect(F.opDuration('investigation', 2)).toBe(27);
		expect(F.opDuration('investigation', 1)).toBe(30);
		expect(F.caseTimer('terror', 3)).toBe(15);
		expect(F.casesPerMonth(13, true)).toBe(8);
	});
});

describe('§5.5 план', () => {
	it('цель плана', () => {
		expect(F.planTarget({ agentsTotal: 6, control: 0, reprLevel: 0, cardMult: 1 })).toBe(5);
		expect(F.planTarget({ agentsTotal: 12, control: 0, reprLevel: 0, cardMult: 1 })).toBe(10);
		expect(F.planTarget({ agentsTotal: 10, control: 100, reprLevel: 2, cardMult: 1.2 })).toBe(Math.round(8.1 * 0.7 * 0.95 * 1.2));
		expect(F.planTarget({ agentsTotal: 1, control: 0, reprLevel: 0, cardMult: 1 })).toBe(B.PLAN_MIN);
	});
	it('фальшивки', () => {
		expect(F.fakeMax(10)).toBe(3);
		expect(F.fakeCatchChance(5)).toBeCloseTo(Math.min(B.FAKE_CATCH_MAX, B.FAKE_CATCH_K * 25));
		expect(F.fakeCatchChance(100)).toBe(B.FAKE_CATCH_MAX);
	});
});

describe('§6.2 доля бюджета', () => {
	it('начальная доля игрока 0.2233 и доход месяца 1 = 715', () => {
		const w = [
			F.agencyWeight({ planRatio: 1, reputation: 50, influence: 20, mult: 1 }),
			F.agencyWeight({ planRatio: 1, reputation: 45, influence: 25, mult: 1 }),
			F.agencyWeight({ planRatio: 1, reputation: 50, influence: 35, mult: 1 }),
			F.agencyWeight({ planRatio: 1, reputation: 60, influence: 30, mult: B.SS_PRESIDENT_FAVOR })
		];
		expect(w[0]).toBeCloseTo(1.05);
		expect(w.slice(1).reduce((a, b) => a + b, 0)).toBeCloseTo(3.796, 3);
		const sh = F.shares(w);
		expect(sh[0]).toBeCloseTo(0.2233, 4);
		expect(sh.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
		expect(F.monthlyIncome(F.poolMonthly(0), sh[0], 1, 0)).toBe(715);
	});
	it('пол доли и единственное ведомство = 100 %', () => {
		const sh = F.shares([0, 0, 10]);
		expect(sh[0]).toBeCloseTo(B.SHARE_FLOOR);
		expect(F.shares([3])).toEqual([1]);
	});
	it('вес клампит план, пул растёт, заморозка дохода', () => {
		expect(F.agencyWeight({ planRatio: 3, reputation: 50, influence: 50, mult: 1 })).toBeCloseTo(2 * 1 * 1);
		expect(F.poolMonthly(7)).toBe(3676);
		expect(F.poolMonthly(15)).toBe(4307);
		expect(F.monthlyIncome(1000, 0.5, 1, 50)).toBe(400);
		expect(F.monthlyIncome(1000, 0.5, 0.85, 0)).toBe(425);
	});
	it('изъятие остатка', () => {
		expect(F.clawback(1000, 3200, 0.25)).toBe(0);
		expect(F.clawback(4200, 3200, 0.25)).toBe(500);
	});
	it('план соперника клампится в [0, 1.5]', () => {
		expect(F.rivalPlanRatio(0.95, 0.1, -2)).toBe(0);
		expect(F.rivalPlanRatio(1, 0.05, 1)).toBe(1.5);
	});
});

describe('§6.3–6.4 ИИ и действия', () => {
	it('враждебность', () => {
		const h = { sharePlayer: 0.25, nAlive: 4, grudge: false, coalition: false, ciaNetwork: false, favor: false };
		expect(F.hostility(h)).toBeCloseTo(0.5);
		expect(F.hostility({ ...h, grudge: true, coalition: true })).toBeCloseTo(2);
		expect(F.hostility({ ...h, sharePlayer: 0, favor: true })).toBe(B.AI_HOSTILITY_MIN);
		expect(F.hostility({ ...h, sharePlayer: 1, coalition: true, grudge: true, ciaNetwork: true })).toBe(B.AI_HOSTILITY_MAX);
	});
	it('успех и обнаружение', () => {
		expect(F.aiSuccessChance({ base: 0.5, shareAi: 0.25, counterintel: 0, hostile: true, police: false })).toBeCloseTo(0.5);
		expect(F.aiSuccessChance({ base: 0.5, shareAi: 0.25, counterintel: 2, hostile: true, police: true })).toBeCloseTo(0.33);
		expect(F.aiSuccessChance({ base: 1, shareAi: 0.5, counterintel: 0, hostile: false, police: false })).toBe(B.AI_CHANCE_MAX);
		expect(F.aiDetectChance(0)).toBeCloseTo(0.2);
		expect(F.aiDetectChance(10)).toBe(B.AI_DETECT_MAX);
		expect(F.aiInterval(10, true)).toBe(7);
		expect(F.aiInterval(8, true)).toBe(6);
	});
	it('шансы действий игрока', () => {
		expect(F.leakRevealChance(0)).toBeCloseTo(0.2);
		expect(F.leakRevealChance(5)).toBeCloseTo(0.05);
		expect(F.sabotageRevealChance(20)).toBe(0.8);
		expect(F.poachMoleChance(10)).toBeCloseTo(0.02);
		expect(F.absorbChance(B.ACT_ABSORB.minInfluence, B.ACT_ABSORB.maxTargetRep)).toBeCloseTo(B.ACT_ABSORB.base);
		expect(F.absorbChance(100, 0)).toBe(0.9);
		expect(F.restoreStateChance(50, 2)).toBeCloseTo(0.7);
		expect(F.loyaltyCheckChance(3)).toBeCloseTo(0.7);
	});
});

describe('§9.1 сети', () => {
	it('граница, внедрение, прогресс, провал', () => {
		expect(F.borderFailChance(0.05, true, true)).toBe(0.01);
		expect(F.borderFailChance(0.2, true, false)).toBeCloseTo(0.17);
		expect(F.zabroskaInfiltrateChance(5, 0.1)).toBeCloseTo(0.6);
		expect(F.netAgentProgress(5, 1, false, false)).toBeCloseTo(B.NET_PROGRESS_PER_AGENT);
		expect(F.netAgentProgress(7, 1.2, true, true)).toBeCloseTo(
			B.NET_PROGRESS_PER_AGENT * (1 + 2 * B.NET_SKILL_COEF) * 1.2 * B.TRAINING_LANGUAGE_NET_MULT * B.TECH_B2_NET_MULT
		);
		expect(F.netFailChance({ level: 4, countryCi: 0.03, reprLevel: 0, counterintel: 0, diplomaticCrisis: false })).toBeCloseTo(0.05);
		expect(F.netFailChance({ level: 0, countryCi: 0, reprLevel: 0, counterintel: 5, diplomaticCrisis: false })).toBe(B.NET_FAIL_MIN);
	});
});

describe('§8.7 счёт', () => {
	it('победа и поражение', () => {
		expect(F.score({ victory: true, monthsPlayed: 50, reputation: 80, influence: 40, budget: 1000, exposure: 20 })).toBe(10000 + 1000 + 1600 + 400 + 100 - 200);
		expect(F.score({ victory: false, monthsPlayed: 60, reputation: 0, influence: 0, budget: -5000, exposure: 100 })).toBe(0);
	});
});
