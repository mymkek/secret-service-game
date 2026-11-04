// Решения D-037…D-047 (ответы gdd-designer на TODO(gdd) первой версии ядра).
import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import { SCHEMA_VERSION, advance, applyAction, autoChoice, createGame, deserialize, previewOperation, questChoices, serialize, stepDay, validateAction } from './index';
import { rivalActionChance } from './ai/actions';
import { applyCard } from './cards';
import { contentToConfig, ContentBundleSchema } from './content-schema';
import { canResearch, missingRequirement, survRequirement, techNode } from './development';
import { aiSuccessChance, coupChance, unrestMonthly } from './formulas';
import { captureAbroad, loyaltyBand } from './networks';
import { spawnCase, targetDifficulty } from './ops';
import { teamPerkTraitBonus } from './agents';
import { monthEndPersonnel } from './personnel';
import { next } from './rng';
import { monthEndSociety } from './society';
import type { Agent, GameState } from './types';

function rich(seed: string): GameState {
	const s = createGame({ seed });
	s.budget = 100000;
	s.cards.nextCardDay = 99999;
	return s;
}

function teamBonusForTest(traits: string[]): number {
	const s = createGame({ seed: 'traits' });
	const team = s.agents.slice(0, traits.length).map((a, i) => ({ ...a, traits: [traits[i]] }));
	return teamPerkTraitBonus(s, team, 'terror');
}

describe('D-038: отмена исследования', () => {
	it('возвращает round(0.5 × цена), прогресс теряется', () => {
		const s = rich('refund');
		expect(applyAction(s, 'player', { type: 'research', tech: 'B1' }).ok).toBe(true);
		const b = s.budget;
		expect(applyAction(s, 'player', { type: 'cancelResearch' }).ok).toBe(true);
		expect(s.budget).toBe(b + Math.round(B.RESEARCH_CANCEL_REFUND * B.TECH_COST_BY_TIER[0]));
		expect(s.research).toBeNull();
		expect(s.techs).not.toContain('B1');
	});
});

describe('D-039: бонусы по id — максимум, разные id складываются', () => {
	it('два «Героя» дают +0.05, герой + with_past — +0.10', () => {
		expect(teamBonusForTest(['hero', 'hero'])).toBeCloseTo(B.TRAIT_HERO_TERROR_BONUS);
		expect(teamBonusForTest(['hero', 'with_past'])).toBeCloseTo(B.TRAIT_HERO_TERROR_BONUS + B.TRAIT_WITH_PAST.opBonus);
	});
});

describe('D-040: крот — КР только в общей формуле', () => {
	it('шанс = clamp(общая формула) × corrupt, кламп AI_CHANCE_MAX; без ci_mult', () => {
		const s = createGame({ seed: 'mole' });
		s.departments.counterintel = 2;
		const a = s.agents[0];
		a.loyalty = 10;
		const cia = s.rivals.find((r) => r.id === 'cia')!;
		const base = aiSuccessChance({ base: B.AI_ACTION_BASE.PLANT_MOLE, shareAi: cia.share, counterintel: 2, hostile: true, police: false });
		expect(rivalActionChance(s, 'cia', 'PLANT_MOLE')).toMatchObject({ p: base, target: a });
		a.traits = ['corrupt'];
		expect(rivalActionChance(s, 'cia', 'PLANT_MOLE').p).toBeCloseTo(Math.min(B.AI_CHANCE_MAX, base * 2));
	});
});

describe('D-041: поимка за рубежом', () => {
	it('полосы лояльности и потери уровня сети', () => {
		expect([0, 19, 20, 39, 40, 69, 70, 100].map(loyaltyBand)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
		const cases: [number, number][] = [
			[10, 0],
			[30, 3],
			[50, 4],
			[90, 4]
		];
		for (const [loyalty, left] of cases) {
			const s = createGame({ seed: `cap-${loyalty}` });
			const a = s.agents[0];
			a.loyalty = loyalty;
			a.status = 'abroad';
			a.location = { countryId: 'cuba' };
			s.networks.cuba.level = 4;
			s.networks.cuba.agentIds = [a.id];
			captureAbroad(s, a);
			expect(s.networks.cuba.level).toBe(left);
			expect(s.agents.find((x) => x.id === a.id)).toBeUndefined();
		}
	});
});

describe('D-042: повторная вербовка — выбор способа', () => {
	function failedMission(seed: string, recruit: 'money' | 'ideology' | 'kompromat') {
		const s = rich(seed);
		const a = s.agents[0];
		a.status = 'abroad';
		a.location = { countryId: 'mexico' };
		s.missions.push({ id: s.nextId++, agentId: a.id, countryId: 'mexico', legend: 'student', recruit, prepared: false, stage: 'recruit', stageEndDay: s.day + 1, borderMult: 1 });
		return s;
	}

	it('по таймеру открывается шаг квеста; недоступные способы неактивны', () => {
		const s = failedMission('rr', 'kompromat');
		stepDay(s);
		const q = s.quests.find((x) => x.questId === 'recruit_retry')!;
		expect(q).toBeDefined();
		expect(questChoices(s, q)).toEqual([
			{ id: 'money', available: true, reason: null },
			{ id: 'ideology', available: true, reason: null },
			{ id: 'kompromat', available: false, reason: 'no_kompromat' }
		]);
		// Без выбора: прежний способ недоступен → первый доступный из RECRUIT_FALLBACK_ORDER.
		expect(autoChoice(s, q)).toBe('money');
		s.budget = 0;
		expect(autoChoice(s, q)).toBe('ideology');
		expect(applyAction(s, 'player', { type: 'questChoice', sessionId: q.id, choice: 'ideology' }).ok).toBe(true);
		const m = s.missions[0];
		expect(m === undefined || (m.recruit === 'ideology' && m.stageEndDay === s.day + B.RECRUIT_RETRY_DAYS)).toBe(true);
	});

	it('прежний способ берётся, если доступен', () => {
		const s = failedMission('rr2', 'ideology');
		stepDay(s);
		const q = s.quests.find((x) => x.questId === 'recruit_retry')!;
		expect(autoChoice(s, q)).toBe('ideology');
	});
});

describe('D-044: правозащитник ×0.5 к росту недовольства', () => {
	it('вклад лидеров в месячное недовольство', () => {
		const s = createGame({ seed: 'rights' });
		s.unrest = 30;
		s.leaders.push({ id: s.nextId++, archetype: 'rights', stateId: 'CA', influence: 100, crossed60: true, underWatch: false, defectorId: null });
		s.leaders.push({ id: s.nextId++, archetype: 'union', stateId: 'TX', influence: 50, crossed60: false, underWatch: false, defectorId: null });
		monthEndSociety(s);
		expect(s.unrest).toBeCloseTo(unrestMonthly(30, 0, 100 * B.LEADER_RIGHTS_UNREST_MULT + 50));
	});
});

describe('D-045: сила улики', () => {
	it('у каждого дела 1..3, включая теракты и дела карточек', () => {
		const s = rich('evidence');
		for (let i = 0; i < 50; i++) spawnCase(s, i % 2 ? 'terror' : 'regular');
		applyCard(s, 'cyber_attack');
		applyCard(s, 'terror_attack');
		for (const c of s.cases) expect(c.evidenceStrength >= 1 && c.evidenceStrength <= 3).toBe(true);
		expect(new Set(s.cases.map((c) => c.evidenceStrength)).size).toBe(3);
	});

	it('один вызов RNG сразу после броска сложности', () => {
		const a = rich('ev-order');
		const b = rich('ev-order');
		const c = spawnCase(a, 'regular', { difficulty: 2 })!;
		// Сложность задана → ровно 2 вызова: сила улики, затем штат.
		const ev = 1 + Math.floor(next(b) * 3);
		next(b);
		expect(b.rngState).toEqual(a.rngState);
		expect(c.evidenceStrength).toBe(ev);
	});
});

describe('D-046: сопротивление сенатора', () => {
	it('randInt 1..3 на старте, сложность слежки 3..5', () => {
		const s = rich('senators');
		for (const sen of s.senators) {
			expect(sen.resistance >= 1 && sen.resistance <= 3).toBe(true);
			expect(targetDifficulty(s, { kind: 'senator', id: sen.id })).toBe(4 + sen.resistance - 2);
		}
		s.survLevel = 5;
		const sen = s.senators[0];
		const p = previewOperation(s, { opType: 'surveillance', target: { kind: 'senator', id: sen.id }, agentIds: [s.agents[0].id] });
		expect(p.difficulty).toBe(2 + sen.resistance);
	});

	it('значение из контента имеет приоритет и попадает в config', () => {
		const bundle = ContentBundleSchema.parse({
			version: 1,
			agentNames: { firstNames: ['A'], lastNames: ['B'] },
			senators: [{ id: 'senator_1', name: 'X', resistance: 3 }, { id: 'senator_2', name: 'Y' }]
		});
		const cfg = contentToConfig(bundle);
		expect(cfg.senatorResistance).toEqual({ senator_1: 3 });
		const s = createGame({ seed: 'sen-content', config: cfg });
		expect(s.senators[0].resistance).toBe(3);
	});
});

describe('D-047 и прочее', () => {
	it('cyber_attack: таймер из CARD_CYBER_ATTACK.timerDays', () => {
		const s = rich('cyber');
		applyCard(s, 'cyber_attack');
		const c = s.cases.find((x) => x.source === 'card_cyber')!;
		expect(c.expiresDay! - c.createdDay).toBe(B.CARD_CYBER_ATTACK.timerDays);
	});

	it('перехват без держателя: никому не режется план и нет обиды', () => {
		const s = rich('intercept');
		const c = spawnCase(s, 'regular', { difficulty: 5 })!;
		c.stateId = 'AL';
		const plans = s.rivals.map((r) => r.planBonusThisQuarter);
		expect(applyAction(s, 'player', { type: 'intercept', caseId: c.id }).ok).toBe(true);
		expect(s.rivals.map((r) => r.planBonusThisQuarter)).toEqual(plans);
		expect(s.rivals.every((r) => r.grudgeUntilDay === 0)).toBe(true);
	});

	it('перебежчик при недовольстве ≤ 40 — всегда квест', () => {
		for (let i = 0; i < 10; i++) {
			const s = createGame({ seed: `def-${i}` });
			s.unrest = B.DEFECTOR_LEADER_MIN_UNREST;
			s.defectors.push({ id: s.nextId++, agent: { ...s.agents[0] } as Agent, defectedDay: 0, returnDay: 0, resolved: false });
			s.agents.forEach((a) => (a.loyalty = 80));
			monthEndPersonnel(s, true);
			expect(s.leaders).toHaveLength(0);
		}
	});

	it('требования из TECH_TREE и REPR_REQUIREMENTS', () => {
		const s = rich('reqs');
		s.departments.analytics = 1;
		expect(canResearch(s, 'A1')).toBe('requirements'); // нужна Слежка 2
		expect(missingRequirement(s, techNode('A1').req)).toEqual({ surv: 2 });
		s.survLevel = 2;
		expect(canResearch(s, 'A1')).toBeNull();
		s.techs.push('B1');
		expect(canResearch(s, 'B2')).toBe('requirements'); // нужна Контрразведка 1
		s.departments.counterintel = 1;
		expect(canResearch(s, 'B2')).toBeNull();
		s.survLevel = 1;
		expect(validateAction(s, { type: 'buildRepr' })).toBe('requirements');
		s.survLevel = 5;
		s.departments.cyber = 5;
		expect(validateAction(s, { type: 'buildSurv' })).toBe('requirements'); // 6-й уровень требует A2
		expect(missingRequirement(s, survRequirement(6))).toEqual({ tech: ['A2'] });
		s.techs.push('A1', 'A2');
		expect(validateAction(s, { type: 'buildSurv' })).toBeNull();
	});

	it('константы формул вместо чисел', () => {
		expect(coupChance(B.COUP_UNREST_PIVOT + B.COUP_UNREST_STEP + 5)).toBeCloseTo((B.COUP_COEF * 10) / B.COUP_UNREST_STEP);
		expect(aiSuccessChance({ base: 0.5, shareAi: B.AI_SHARE_PIVOT, counterintel: 0, hostile: false, police: false })).toBe(0.5);
	});
});

describe('сейвы v1 → v2', () => {
	it('миграция заполняет силу улики, сопротивление сенаторов и config', () => {
		const s = rich('v1');
		advance(s, 40, { ignorePause: true });
		const raw = JSON.parse(serialize(s));
		raw.schemaVersion = 1;
		for (const c of raw.cases) c.evidenceStrength = null;
		for (const sen of raw.senators) sen.resistance = 0;
		delete raw.config.senatorResistance;
		const m = deserialize(raw);
		expect(m.schemaVersion).toBe(SCHEMA_VERSION);
		expect(m.cases.every((c) => c.evidenceStrength === 2)).toBe(true);
		expect(m.senators.every((x) => x.resistance === B.SENATOR_RESISTANCE_PIVOT)).toBe(true);
		expect(m.config.senatorResistance).toEqual({});
		// Сенатор v1 сохраняет прежнюю сложность 4.
		expect(targetDifficulty(m, { kind: 'senator', id: 'senator_1' })).toBe(B.OP_TARGET_DIFFICULTY.senator);
	});
});
