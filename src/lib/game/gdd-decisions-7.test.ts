// D-068: уточнения D-067 — регрессионные тесты на каждый пункт правки ядра.
import { afterEach, describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import { applyAction, createGame, previewOperation, questChoices, selectDeployOptions, stepDay } from './index';
import { recruitChance } from './formulas';
import { caseAccessible, spawnCase } from './ops';
import { attemptRecruit } from './networks';
import { defect } from './personnel';
import { tickLine } from './line';
import { removeAgent } from './effects';
import type { GameState, Mission, QuestSession } from './types';

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

function investigation(s: GameState, d: number, stateId = 'CA') {
	const c = spawnCase(s, 'regular', { difficulty: d, stateId })!;
	const ids = [s.agents.find((a) => a.status === 'idle')!.id];
	expect(applyAction(s, 'player', { type: 'startOp', opType: 'investigation', caseId: c.id, agentIds: ids })).toEqual({ ok: true });
	return { c, op: s.operations[s.operations.length - 1] };
}

function session(s: GameState, questId: string): QuestSession {
	const q = s.quests.find((x) => x.questId === questId);
	expect(q, questId).toBeDefined();
	return q!;
}

function choose(s: GameState, questId: string, choice: string, param?: number): void {
	const q = session(s, questId);
	expect(applyAction(s, 'player', { type: 'questChoice', sessionId: q.id, choice, param })).toEqual({ ok: true });
}

function runUntil(s: GameState, cond: () => boolean, max = 400): void {
	for (let i = 0; i < max && !cond(); i++) stepDay(s);
	expect(cond()).toBe(true);
}

const burned = (s: GameState, why: string) => s.log.some((e) => e.kind === 'dilemma_burned' && e.data.why === why);

describe('D-068 п. 1: «Признание под давлением» — условие по p_shown', () => {
	it('крот снижает p ниже 0.6, но p_shown ≥ 0.6 — не назначается при старте (D-069) и не выдаёт крота', () => {
		const s = fresh('fc-mole');
		onlyDilemma('forced_confession');
		setB('OP_BASE_CHANCE', { ...B.OP_BASE_CHANCE, investigation: 2 });
		setB('OP_CHANCE_MAX', 0.65); // p_shown = 0.65
		setB('OP_MOLE_PENALTY', 0.5); // p = 0.15
		s.agents.find((a) => a.status === 'idle')!.moleFor = 'cia';
		const { op } = investigation(s, 3);
		expect(op.dilemmaId).toBeNull();
		expect(s.dilemmas.nextDay).toBe(0);
	});

	it('p_shown поднялся до ≥ 0.6 после назначения (крот в команде) — в фазе сгорает, окно не открывается', () => {
		const s = fresh('fc-mole');
		onlyDilemma('forced_confession');
		setB('OP_BASE_CHANCE', { ...B.OP_BASE_CHANCE, investigation: 2 });
		setB('OP_CHANCE_MAX', 0.5); // при старте p_shown = 0.5 — «дело буксует»
		setB('OP_MOLE_PENALTY', 0.5);
		const { op } = investigation(s, 3);
		expect(op.dilemmaId).toBe('forced_confession');
		s.agents.find((a) => a.id === op.agentIds[0])!.moleFor = 'cia';
		setB('OP_CHANCE_MAX', 0.65); // как после подкрепления: p_shown = 0.65, p = 0.15
		runUntil(s, () => !s.operations.includes(op));
		expect(s.quests.some((q) => q.questId === 'dilemma_forced_confession')).toBe(false);
		expect(burned(s, 'condition')).toBe(true);
		// D-069: сгоревшая дилемма вернула откаты.
		expect(s.dilemmas.nextDay).toBe(s.log.find((e) => e.kind === 'dilemma_burned')!.day);
		expect(s.dilemmas.lastDayById).not.toHaveProperty('forced_confession');
	});

	it('p_shown < 0.6 — окно открывается (и без крота)', () => {
		const s = fresh('fc-low');
		onlyDilemma('forced_confession');
		fixedChance(0.5);
		const { op } = investigation(s, 3);
		runUntil(s, () => op.held);
		expect(session(s, 'dilemma_forced_confession').params.opId).toBe(op.id);
	});
});

describe('D-068 п. 2: «Провокация» и полномочия', () => {
	it('дело-провокация доступно при частичных полномочиях; обычный теракт — нет; при «нет» — тоже нет', () => {
		const s = fresh('sting-access');
		s.stateJurisdiction.CA.level = 1;
		const sting = spawnCase(s, 'terror', { difficulty: 2, stateId: 'CA', tag: 'sting', timerDays: 30 })!;
		const terror = spawnCase(s, 'terror', { difficulty: 2, stateId: 'CA' })!;
		expect(caseAccessible(s, sting)).toBe(true);
		expect(caseAccessible(s, terror)).toBe(false);
		expect(applyAction(s, 'player', { type: 'startOp', opType: 'terror', caseId: sting.id, agentIds: [s.agents[0].id] })).toEqual({ ok: true });
		s.stateJurisdiction.CA.level = 0;
		const sting2 = spawnCase(s, 'terror', { difficulty: 2, stateId: 'CA', tag: 'sting', timerDays: 30 })!;
		expect(caseAccessible(s, sting2)).toBe(false);
	});

	it('частичные полномочия: «Довести до дела» создаёт дело, которое игрок может взять', () => {
		const s = fresh('sting-partial');
		onlyDilemma('sting');
		s.stateJurisdiction.CA.level = 1;
		const { op } = investigation(s, 2);
		expect(op.dilemmaId).toBe('sting');
		runUntil(s, () => op.held);
		choose(s, 'dilemma_sting', 'provoke');
		const sc = s.cases.find((c) => c.tag === 'sting')!;
		expect(sc.kind).toBe('terror');
		const free = s.agents.find((a) => a.status === 'idle')!;
		expect(applyAction(s, 'player', { type: 'startOp', opType: 'terror', caseId: sc.id, agentIds: [free.id] })).toEqual({ ok: true });
	});

	it('полномочия «нет» при старте (перехваченное дело) — дилемма не назначается', () => {
		const s = fresh('sting-none');
		onlyDilemma('sting');
		s.stateJurisdiction.CA.level = 0;
		const c = spawnCase(s, 'regular', { difficulty: 2, stateId: 'CA' })!;
		c.intercepted = true;
		expect(applyAction(s, 'player', { type: 'startOp', opType: 'investigation', caseId: c.id, agentIds: [s.agents[0].id] })).toEqual({ ok: true });
		expect(s.operations[0].dilemmaId).toBeNull();
	});

	it('полномочия упали до «нет» к фазе mid — дилемма сгорает', () => {
		const s = fresh('sting-mid');
		onlyDilemma('sting');
		s.stateJurisdiction.CA.level = 1;
		const { op } = investigation(s, 2);
		expect(op.dilemmaId).toBe('sting');
		s.stateJurisdiction.CA.level = 0;
		runUntil(s, () => !s.operations.includes(op));
		expect(s.quests.some((q) => q.questId === 'dilemma_sting')).toBe(false);
		expect(burned(s, 'condition')).toBe(true);
	});
});

describe('D-068 п. 3: «Легенда требует личной жизни» — скандал при провале внедрения', () => {
	function infiltrationWithChoice(seed: string, choice: 'allow' | 'forbid', lossChance: number) {
		const s = fresh(seed);
		onlyDilemma('cover_life');
		fixedChance(0);
		setB('DL_COVER_LIFE', { ...B.DL_COVER_LIFE, scandalChance: 1 });
		setB('OP_INFILTRATION_FAIL', { ...B.OP_INFILTRATION_FAIL, lossChance });
		const a = s.agents[0];
		expect(applyAction(s, 'player', { type: 'startOp', opType: 'infiltration', target: { kind: 'rival', id: 'cia' }, agentIds: [a.id] })).toEqual({ ok: true });
		const op = s.operations[0];
		runUntil(s, () => op.held);
		choose(s, 'dilemma_cover_life', choice);
		runUntil(s, () => !s.operations.includes(op));
		return { s, a, op };
	}

	it('«Разрешить» + провал (агент раскрыт, вернулся) — бросок скандала, флага нет', () => {
		const { s, a } = infiltrationWithChoice('cover-fail', 'allow', 0);
		expect(s.log.some((e) => e.kind === 'op_fail')).toBe(true);
		expect(s.history.coverScandals).toBe(1);
		expect(s.log.some((e) => e.kind === 'cover_scandal' && e.data.agentId === a.id)).toBe(true);
		expect(a.coverLife).toBe(false);
		expect(a.status).toBe('idle');
	});

	it('«Разрешить» + провал с поимкой — бросок тоже делается', () => {
		const { s, a } = infiltrationWithChoice('cover-captured', 'allow', 1);
		expect(s.agents.some((x) => x.id === a.id)).toBe(false);
		expect(s.history.coverScandals).toBe(1);
	});

	it('«Запретить» + провал — без броска', () => {
		const { s } = infiltrationWithChoice('cover-forbid', 'forbid', 0);
		expect(s.history.coverScandals).toBe(0);
	});

	it('отмена операции после «Разрешить» — без броска', () => {
		const s = fresh('cover-cancel');
		onlyDilemma('cover_life');
		setB('DL_COVER_LIFE', { ...B.DL_COVER_LIFE, scandalChance: 1 });
		const a = s.agents[0];
		applyAction(s, 'player', { type: 'startOp', opType: 'infiltration', target: { kind: 'rival', id: 'cia' }, agentIds: [a.id] });
		const op = s.operations[0];
		runUntil(s, () => op.held);
		choose(s, 'dilemma_cover_life', 'allow');
		expect(applyAction(s, 'player', { type: 'cancelOp', opId: op.id })).toEqual({ ok: true });
		expect(s.history.coverScandals).toBe(0);
		expect(a.coverLife).toBe(false);
	});

	it('внедрённый с флагом перешёл к врагу — бросок (§9.8 (а))', () => {
		const s = fresh('cover-defect');
		setB('DL_COVER_LIFE', { ...B.DL_COVER_LIFE, scandalChance: 1 });
		const a = s.agents[0];
		a.status = 'embedded';
		a.location = { rivalId: 'cia' };
		a.coverLife = true;
		defect(s, a);
		expect(s.history.coverScandals).toBe(1);
		expect(s.defectors[0].agent.coverLife).toBe(false);
	});
});

describe('D-068 п. 4–5: линейка — срыв при выбытии ведущего, напарник, перевербовка', () => {
	function startLine(seed: string, withPartner: boolean): { s: GameState; leadId: number; partnerId: number } {
		const s = fresh(seed);
		setB('LINE_OFFER_CHANCE', 1);
		setB('LINE_CHANCE_MIN', 1);
		setB('LINE_CHANCE_MAX', 1);
		const [lead, partner] = s.agents;
		lead.skills.interrogation = 9;
		lead.perks = [];
		partner.perks = [];
		runUntil(s, () => s.quests.some((q) => q.questId === 'vanguard_offer'), 400);
		choose(s, 'vanguard_offer', 'start', lead.id);
		if (withPartner) choose(s, 'vanguard_offer', 'partner', partner.id);
		else choose(s, 'vanguard_offer', 'alone');
		expect(s.line).not.toBeNull();
		return { s, leadId: lead.id, partnerId: partner.id };
	}

	it('ведущий выбыл — срыв: засвеченность +5, напарник −10 лояльности, без награды, без броска этапа, откат 360', () => {
		const { s, leadId, partnerId } = startLine('line-broken', true);
		const partner = s.agents.find((a) => a.id === partnerId)!;
		partner.loyalty = 70;
		removeAgent(s, leadId);
		s.line!.stageEndDay = s.day; // этап как раз заканчивается — бросок всё равно не делается
		const exp0 = s.exposure;
		const budget0 = s.budget;
		const plan0 = s.plan.points;
		tickLine(s);
		expect(s.line).toBeNull();
		expect(s.exposure).toBeCloseTo(exp0 + B.LINE_FAIL_EXPOSURE, 10);
		expect(partner).toMatchObject({ status: 'idle', location: null, loyalty: 70 + B.LINE_FLED_LOYALTY });
		expect(s.budget).toBe(budget0);
		expect(s.plan.points).toBe(plan0);
		expect(s.lineNextOfferDay).toBe(s.day + B.LINE_COOLDOWN_DAYS);
		expect(s.history.linesCompleted).toBe(0);
		expect(s.log.some((e) => e.kind === 'line_stage_done')).toBe(false);
		expect(s.log.some((e) => e.kind === 'line_recalled')).toBe(false);
		expect(s.log.find((e) => e.kind === 'line_failed')?.data).toMatchObject({ outcome: 'broken' });
		expect(session(s, 'vanguard_result').params.outcome).toBe('fail_broken');
	});

	it('ведущий-крот раскрыт — тоже срыв (засвеченность растёт)', () => {
		const { s, leadId } = startLine('line-mole', false);
		const lead = s.agents.find((a) => a.id === leadId)!;
		lead.moleFor = 'police';
		setB('MOLE_PASSIVE_DETECT_PER_CI', 1);
		s.departments.counterintel = Math.max(1, s.departments.counterintel);
		const exp0 = s.exposure;
		runUntil(s, () => s.line === null, 60);
		expect(s.agents.some((a) => a.id === leadId)).toBe(false);
		expect(session(s, 'vanguard_result').params.outcome).toBe('fail_broken');
		expect(s.exposure).toBeGreaterThan(exp0);
	});

	it('напарник выбыл — линейка идёт без его бонуса и без штрафа', () => {
		const { s, leadId, partnerId } = startLine('line-partner-lost', true);
		setB('LINE_CHANCE_MAX', 0.95);
		setB('LINE_CHANCE_MIN', 0.05);
		const lead = s.agents.find((a) => a.id === leadId)!;
		const exp0 = s.exposure;
		removeAgent(s, partnerId);
		tickLine(s);
		expect(s.line).not.toBeNull();
		expect(s.line!.partnerId).toBeNull();
		expect(s.exposure).toBe(exp0);
		expect(lead.status).toBe('embedded');
		// Окно следующего этапа показывает шанс без бонуса напарника.
		setB('LINE_CHANCE_MIN', 1);
		setB('LINE_CHANCE_MAX', 1);
		runUntil(s, () => s.quests.some((q) => q.questId === 'vanguard_stage2'), 200);
		setB('LINE_CHANCE_MIN', 0.05);
		setB('LINE_CHANCE_MAX', 0.95);
		const cautious = questChoices(s, session(s, 'vanguard_stage2')).find((c) => c.id === 'cautious')!;
		const expected = Math.min(0.95, B.LINE_STAGE_BASE.s2_cautious + B.LINE_SKILL_COEF * (9 - B.LINE_MIN_SKILL));
		expect(cautious.chance).toBeCloseTo(expected, 10);
	});

	it('перевербован (turned) — лояльность −10, как у fled; журнал и развязка — fled', () => {
		const { s, leadId } = startLine('line-turned', false);
		setB('LINE_CHANCE_MIN', 0);
		setB('LINE_CHANCE_MAX', 0);
		setB('LINE_FAIL_OUTCOMES', { fled: 0, killed: 0, captured: 0, turned: 1 });
		const lead = s.agents.find((a) => a.id === leadId)!;
		lead.loyalty = 70;
		s.line!.stageEndDay = s.day;
		tickLine(s);
		expect(s.line).toBeNull();
		expect(lead.loyalty).toBe(70 + B.LINE_FLED_LOYALTY);
		expect(lead.moleFor).not.toBeNull();
		expect(lead.status).toBe('idle');
		expect(s.log.find((e) => e.kind === 'line_failed')?.data).toMatchObject({ outcome: 'fled' });
		expect(session(s, 'vanguard_result').params.outcome).toBe('fail_fled');
	});
});

describe('D-068 п. 6: «Тихий сигнал» — свой повтор DL_SIGNAL.repeatCooldownDays', () => {
	function signalMonths(repeat: number): number[] {
		const s = fresh('signal-repeat');
		setB('DL_SIGNAL', { ...B.DL_SIGNAL, chancePerMonth: 1, realChance: 0, repeatCooldownDays: repeat });
		const months: number[] = [];
		for (let i = 0; i < 150; i++) {
			stepDay(s);
			const q = s.quests.find((x) => x.questId === 'dilemma_quiet_signal');
			if (q) {
				months.push(Math.ceil(s.day / B.DAYS_PER_MONTH));
				choose(s, 'dilemma_quiet_signal', 'wait');
			}
		}
		return months;
	}

	it('repeatCooldownDays = 0: сигнал каждый месяц (держит только глобальный откат 30)', () => {
		expect(B.DL_SIGNAL.repeatCooldownDays).toBe(0);
		expect(signalMonths(0)).toEqual([3, 4, 5]);
	});

	it('repeatCooldownDays = 60: через месяц', () => {
		expect(signalMonths(60)).toEqual([3, 5]);
	});
});

describe('D-068 п. 7: «Переговорщик» — +0.10 к вербовке источника (§9.1 шаг 4)', () => {
	it('формула: +0.10 и кламп 0.05..0.95', () => {
		expect(recruitChance(0.4, false)).toBeCloseTo(0.4, 10);
		expect(recruitChance(0.4, true)).toBeCloseTo(0.5, 10);
		expect(recruitChance(0.7, true)).toBeCloseTo(0.8, 10);
		expect(recruitChance(0.85, true)).toBeCloseTo(0.95, 10);
		expect(recruitChance(0.9, true)).toBe(0.95);
		expect(recruitChance(0, false)).toBe(0.05);
		expect(B.PERK_EFFECTS.negotiator).toEqual({ recruit: 0.1, interrogation: 0.1 });
	});

	function recruit(negotiator: boolean): boolean {
		const s = fresh('negotiator');
		setB('ZABROSKA_CHANCE_MIN', 0);
		setB('ZABROSKA_CHANCE_MAX', 1);
		setB('RECRUIT_METHODS', { ...B.RECRUIT_METHODS, ideology: { cost: 0, p: 0 } });
		setB('PERK_EFFECTS', { ...B.PERK_EFFECTS, negotiator: { recruit: 1, interrogation: 0.1 } });
		const a = s.agents[0];
		a.perks = negotiator ? ['negotiator'] : [];
		const countryId = Object.keys(s.networks)[0] as Mission['countryId'];
		const m: Mission = { id: 9999, agentId: a.id, countryId, legend: 'businessman', recruit: 'ideology', prepared: false, stage: 'recruit', stageEndDay: s.day, borderMult: 1 };
		s.missions.push(m);
		attemptRecruit(s, m, a, 'ideology');
		expect(selectDeployOptions(s, a.id).recruit.find((r) => r.method === 'ideology')!.chance).toBe(negotiator ? 1 : 0);
		return s.log.some((e) => e.kind === 'source_recruited');
	}

	it('перк учитывается в броске вербовки и в превью заброски', () => {
		expect(recruit(false)).toBe(false);
		expect(recruit(true)).toBe(true);
		const s = fresh('negotiator-view');
		expect(selectDeployOptions(s).recruit.find((r) => r.method === 'ideology')!.chance).toBe(B.RECRUIT_METHODS.ideology.p);
	});
});

describe('D-068 п. 8: «Хороший/плохой коп» — после v1', () => {
	it('nextAgentSpecial не возвращает goodbad; у теракта — cover', () => {
		const s = fresh('no-goodbad');
		const c = spawnCase(s, 'regular', { difficulty: 3 })!;
		s.stateJurisdiction[c.stateId].level = 2;
		const ids = s.agents.map((a) => a.id);
		for (const n of [0, 1, 2]) expect(previewOperation(s, { opType: 'investigation', agentIds: ids.slice(0, n), caseId: c.id }).nextAgentSpecial).toBeNull();
		const t = spawnCase(s, 'terror', { difficulty: 3 })!;
		s.stateJurisdiction[t.stateId].level = 2;
		expect(previewOperation(s, { opType: 'terror', agentIds: [ids[0]], caseId: t.id }).nextAgentSpecial).toBe('cover');
	});

	it('сила улики по-прежнему генерируется (поток RNG не сдвинут); резервные ключи на месте', () => {
		const s = fresh('evidence');
		const c = spawnCase(s, 'regular')!;
		const [lo, hi] = B.EVIDENCE_STRENGTH_RANGE;
		expect(c.evidenceStrength).toBeGreaterThanOrEqual(lo);
		expect(c.evidenceStrength).toBeLessThanOrEqual(hi);
		for (const k of ['DETECTIVE_MIN_DIFFICULTY', 'INTERROGATION_TACTICS', 'PRISONER_EXCHANGE', 'EVIDENCE_SURV_BONUS_MIN_LEVEL']) expect(B).toHaveProperty(k);
	});
});
