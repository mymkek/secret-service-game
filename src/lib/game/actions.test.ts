import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import { advance, applyAction, createGame, previewOperation, questChoices, serialize, validateAction } from './index';
import { aiActionWeights, AI_ACTIONS, buildRivalView } from './ai/strategy';
import { applyCard, deck } from './cards';
import { incomeCardMult } from './economy';
import { spawnCase } from './ops';
import { triggerHearings } from './quest-core';
import type { Case, GameState } from './types';

function rich(seed = 'act'): GameState {
	const s = createGame({ seed });
	s.budget = 100000;
	return s;
}

function caseIn(s: GameState, stateId: string, kind: 'regular' | 'terror', difficulty: number): Case {
	const c = spawnCase(s, kind, { difficulty })!;
	c.stateId = stateId;
	return c;
}

describe('найм и персонал', () => {
	it('найм списывает цену, лимит и деньги проверяются', () => {
		const s = createGame({ seed: 'hire' });
		const c = s.hirePool[0];
		const cost = B[`HIRE_COST_${c.rank.toUpperCase()}` as 'HIRE_COST_NOVICE'];
		expect(applyAction(s, 'player', { type: 'hire', candidateId: c.id })).toEqual({ ok: true });
		expect(s.budget).toBe(B.START_BUDGET - cost);
		expect(s.agents.some((a) => a.id === c.id)).toBe(true);
		expect(applyAction(s, 'player', { type: 'hire', candidateId: c.id })).toEqual({ ok: false, error: 'candidate_not_found' });
		s.budget = 0;
		expect(validateAction(s, { type: 'hire', candidateId: s.hirePool[0].id })).toBe('no_money');
		s.budget = 1e6;
		while (s.agents.length < 12) s.agents.push({ ...s.agents[0], id: s.nextId++ });
		expect(validateAction(s, { type: 'hire', candidateId: s.hirePool[0].id })).toBe('agent_cap');
	});

	it('validateAction не меняет состояние', () => {
		const s = createGame({ seed: 'pure' });
		const before = serialize(s);
		validateAction(s, { type: 'hire', candidateId: s.hirePool[0].id });
		validateAction(s, { type: 'buildDept', dept: 'cyber' });
		validateAction(s, { type: 'prCampaign' });
		expect(serialize(s)).toBe(before);
	});

	it('медаль: +лояльность и откат', () => {
		const s = rich('medal');
		const a = s.agents[0];
		a.loyalty = 50;
		expect(applyAction(s, 'player', { type: 'medal', agentId: a.id }).ok).toBe(true);
		expect(a.loyalty).toBe(60);
		expect(validateAction(s, { type: 'medal', agentId: a.id })).toBe('cooldown');
	});
});

describe('операции (§5)', () => {
	it('шанс до старта совпадает с примером ГДД (D-066: один 0.53, с новичком 0.59)', () => {
		const s = createGame({ seed: 'ex' });
		const [exp, nov] = [s.agents.find((a) => a.rank === 'experienced')!, s.agents.find((a) => a.rank === 'novice')!];
		exp.skills = { surveillance: 5, combat: 5, interrogation: 5, hacking: 5 };
		exp.level = 2;
		nov.skills = { surveillance: 2, combat: 2, interrogation: 2, hacking: 2 };
		nov.level = 1;
		const c = caseIn(s, 'CA', 'regular', 3);
		expect(previewOperation(s, { opType: 'investigation', caseId: c.id, agentIds: [exp.id] }).chance).toBeCloseTo(0.53, 10);
		const p = previewOperation(s, { opType: 'investigation', caseId: c.id, agentIds: [exp.id, nov.id] });
		expect(p.chance).toBeCloseTo(0.59, 10);
		expect(p.cost).toBe(30);
		expect(p.days).toBe(30);
		expect(p.error).toBeNull();
	});

	it('жизненный цикл расследования: старт → 30 дней → исход, агенты свободны', () => {
		const s = rich('cycle');
		const c = caseIn(s, 'CA', 'regular', 2);
		const ids = s.agents.slice(0, 2).map((a) => a.id);
		expect(applyAction(s, 'player', { type: 'startOp', opType: 'investigation', caseId: c.id, agentIds: ids }).ok).toBe(true);
		expect(c.takenByOpId).not.toBeNull();
		expect(s.agents.filter((a) => ids.includes(a.id)).every((a) => a.status === 'on_op')).toBe(true);
		advance(s, 29, { ignorePause: true });
		expect(s.operations).toHaveLength(1);
		advance(s, 1, { ignorePause: true });
		expect(s.operations).toHaveLength(0);
		expect(s.cases.find((x) => x.id === c.id)).toBeUndefined();
		expect(s.log.some((e) => e.kind === 'op_success' || e.kind === 'op_fail')).toBe(true);
		for (const id of ids) expect(s.agents.find((a) => a.id === id)?.status).not.toBe('on_op');
	});

	it('полномочия: частичный штат не даёт d4, перехват открывает дело', () => {
		const s = rich('jur');
		const c = caseIn(s, 'AL', 'regular', 4);
		const ids = s.agents.slice(0, 2).map((a) => a.id);
		expect(validateAction(s, { type: 'startOp', opType: 'investigation', caseId: c.id, agentIds: ids })).toBe('no_jurisdiction');
		expect(applyAction(s, 'player', { type: 'intercept', caseId: c.id }).ok).toBe(true);
		expect(validateAction(s, { type: 'startOp', opType: 'investigation', caseId: c.id, agentIds: ids })).toBeNull();
	});

	it('отмена возвращает 50 % цены', () => {
		const s = rich('cancel');
		const c = caseIn(s, 'TX', 'terror', 3);
		const ids = s.agents.slice(0, 3).map((a) => a.id);
		const b0 = s.budget;
		expect(applyAction(s, 'player', { type: 'startOp', opType: 'terror', caseId: c.id, agentIds: ids }).ok).toBe(true);
		const opId = s.operations[0].id;
		expect(applyAction(s, 'player', { type: 'cancelOp', opId }).ok).toBe(true);
		expect(s.budget).toBe(b0 - 100 + 50);
		expect(c.takenByOpId).toBeNull();
	});

	it('слежка за соперником: ордер, грязное действие, герой не допускается', () => {
		const s = rich('surv');
		const a = s.agents[0];
		expect(applyAction(s, 'player', { type: 'startOp', opType: 'surveillance', target: { kind: 'rival', id: 'cia' }, agentIds: [a.id] }).ok).toBe(true);
		const op = s.operations[0];
		expect(op.warrantEndDay - op.startDay).toBe(B.WARRANT_BASE_DAYS);
		expect(op.endDay - op.startDay).toBe(B.WARRANT_BASE_DAYS + B.OP_DURATION_DAYS.surveillance);
		expect(s.counters.dirtyActions).toBe(1);
		const hero = s.agents[1];
		hero.traits = ['hero'];
		expect(validateAction(s, { type: 'startOp', opType: 'surveillance', target: { kind: 'rival', id: 'police' }, agentIds: [hero.id] })).toBe('agent_forbids_dirty');
		expect(validateAction(s, { type: 'startOp', opType: 'surveillance', target: { kind: 'president' }, agentIds: [s.agents[2].id] })).toBe('requirements');
	});
});

describe('развитие (§4)', () => {
	it('требования отделов и стройка', () => {
		const s = rich('dept');
		expect(validateAction(s, { type: 'buildDept', dept: 'counterintel' })).toBeNull();
		s.departments.analytics = 0;
		expect(validateAction(s, { type: 'buildDept', dept: 'cyber' })).toBe('requirements');
		s.departments.analytics = 1;
		expect(applyAction(s, 'player', { type: 'buildDept', dept: 'pr' }).ok).toBe(true);
		expect(validateAction(s, { type: 'buildDept', dept: 'pr' })).toBe('already_building');
		advance(s, 10, { ignorePause: true });
		expect(s.departments.pr).toBe(1);
	});

	it('технологии: порядок яруса и правило одной вершины', () => {
		const s = rich('tech');
		expect(validateAction(s, { type: 'research', tech: 'B2' })).toBe('previous_tier');
		s.techs.push('A1', 'A2', 'B1', 'B2');
		s.reprLevel = 6;
		s.departments.counterintel = 1;
		expect(applyAction(s, 'player', { type: 'research', tech: 'A3' }).ok).toBe(true);
		s.research = null; // имитируем «другое исследование можно начать» для проверки блока
		expect(validateAction(s, { type: 'research', tech: 'B3' })).toBe('apex_locked');
		s.research = { techId: 'A3', startDay: 0, doneDay: 999 };
		expect(applyAction(s, 'player', { type: 'cancelResearch' }).ok).toBe(true);
		expect(s.apexChosen).toBeNull();
		expect(validateAction(s, { type: 'research', tech: 'B3' })).toBeNull();
	});

	it('репрессии: включение поднимает недовольство и контроль; два отката за 30 дней — «Оттепель»', () => {
		const s = rich('repr');
		s.survLevel = 2;
		expect(applyAction(s, 'player', { type: 'buildRepr' }).ok).toBe(true);
		advance(s, B.REPR_BUILD_DAYS, { ignorePause: true });
		expect(s.reprLevel).toBe(1);
		expect(s.control).toBeGreaterThanOrEqual(5);
		expect(s.counters.dirtyActions).toBeGreaterThanOrEqual(1);
		s.reprLevel = 3;
		const u = s.unrest;
		const e = s.exposure;
		applyAction(s, 'player', { type: 'rollbackRepr' });
		applyAction(s, 'player', { type: 'rollbackRepr' });
		expect(s.reprLevel).toBe(1);
		expect(s.unrest).toBeCloseTo(Math.max(0, u + B.THAW_EFFECT.unrest));
		expect(s.exposure).toBeCloseTo(Math.min(100, e + B.THAW_EFFECT.exposure));
		expect(s.log.some((x) => x.kind === 'thaw')).toBe(true);
	});
});

describe('действия против конкурентов (§6.3)', () => {
	it('лоббирование режет lobbyMult цели и тратит влияние', () => {
		const s = rich('lobby');
		s.influence = 40;
		expect(applyAction(s, 'player', { type: 'lobby', rivalId: 'secret_service' }).ok).toBe(true);
		expect(s.rivals.find((r) => r.id === 'secret_service')!.lobbyMult).toBeCloseTo(0.8);
		expect(s.influence).toBeLessThanOrEqual(25);
		s.influence = 10;
		expect(validateAction(s, { type: 'lobby', rivalId: 'police' })).toBe('no_influence');
	});

	it('слив компромата: расход предмета, урон репутации цели, грязное действие', () => {
		const s = rich('leak');
		s.kompromat.push({ id: s.nextId++, target: { kind: 'rival', id: 'police' }, strength: 2, acquiredDay: 0, expiresDay: 360, usedCooldownUntil: null });
		const k = s.kompromat[0];
		const rep0 = s.rivals[0].reputation;
		expect(applyAction(s, 'player', { type: 'leak', kompromatId: k.id }).ok).toBe(true);
		expect(s.rivals[0].reputation).toBeCloseTo(Math.max(0, rep0 + B.ACT_LEAK.repPerStrength * 2));
		expect(s.kompromat).toHaveLength(0);
		expect(s.counters.dirtyActions).toBe(1);
	});

	it('козёл отпущения снижает «Под следствием»', () => {
		const s = rich('goat');
		s.investigation = 40;
		const n = s.agents.length;
		expect(applyAction(s, 'player', { type: 'scapegoat', agentId: s.agents[0].id }).ok).toBe(true);
		// −20 от козла отпущения, затем +DIRTY_INVESTIGATION_PER_ACTION (грязное действие, D-057; Юр 0).
		expect(s.investigation).toBeCloseTo(40 + B.ACT_SCAPEGOAT.investigation + B.DIRTY_INVESTIGATION_PER_ACTION);
		expect(s.agents).toHaveLength(n - 1);
	});
});

describe('ИИ через общий applyAction (D-027)', () => {
	it('соперник действует тем же API, игрок не может выполнить действие ИИ', () => {
		const s = createGame({ seed: 'ai' });
		const r = applyAction(s, 'cia', { type: 'ai', action: 'SURVEIL_PLAYER' });
		expect(r.ok).toBe(true);
		expect(r.ok && r.ai?.action).toBe('SURVEIL_PLAYER');
		expect(applyAction(s, 'player', { type: 'ai', action: 'PR' })).toEqual({ ok: false, error: 'bad_actor' });
		s.rivals[0].alive = false;
		expect(applyAction(s, 'police', { type: 'ai', action: 'PR' })).toEqual({ ok: false, error: 'rival_dead' });
	});

	it('недопустимые действия получают вес 0, враждебные умножаются на H', () => {
		const s = createGame({ seed: 'w' });
		const v = buildRivalView(s, 'cia');
		const w = aiActionWeights(v);
		const idx = (a: string) => AI_ACTIONS.indexOf(a as (typeof AI_ACTIONS)[number]);
		expect(w[idx('DIG_DIRECTOR')]).toBe(0);
		expect(w[idx('LEAK_FAILURES')]).toBe(0);
		expect(w[idx('WORK_PLAN')]).toBe(B.AI_WEIGHTS.intriguer.WORK_PLAN);
		s.rivals[1].kompromatOnPlayer = 3;
		s.coalition = true;
		const w2 = aiActionWeights(buildRivalView(s, 'cia'));
		expect(w2[idx('DIG_DIRECTOR')]).toBeGreaterThan(B.AI_WEIGHTS.intriguer.DIG_DIRECTOR);
	});

	it('в партии соперники ходят по расписанию', () => {
		const s = createGame({ seed: 'sched' });
		advance(s, 40, { ignorePause: true });
		expect(s.rivals[0].nextActionDay).toBeGreaterThan(40);
		expect(s.rivals[0].nextActionDay % B.AI_ACTION_INTERVAL_DAYS.police).toBe(0);
	});
});

describe('квесты и решения (§9)', () => {
	it('слушания: автоматический hearingMult, выбор, откат 90 дней', () => {
		const s = createGame({ seed: 'hear' });
		expect(triggerHearings(s, 'test')).toBe(true);
		expect(s.hearingMult).toBe(B.HEARING_WEIGHT_MULT);
		const q = s.quests.find((x) => x.questId === 'hearings')!;
		expect(questChoices(s, q).map((c) => c.id)).toEqual(['testify', 'secrecy', 'scapegoat']);
		const rep = s.reputation;
		expect(applyAction(s, 'player', { type: 'questChoice', sessionId: q.id, choice: 'testify' }).ok).toBe(true);
		expect(s.reputation).toBe(rep + B.HEARING_TESTIFY.reputation);
		expect(s.quests).toHaveLength(0);
		expect(triggerHearings(s, 'again')).toBe(false);
	});

	it('недоступный выбор отклоняется', () => {
		const s = createGame({ seed: 'qc' });
		s.quests.push({ id: s.nextId++, questId: 'blogger_docs', createdDay: 0, stage: 'choice', params: { leaderId: null }, waitUntilDay: null, inkStateJson: null });
		const q = s.quests[0];
		expect(validateAction(s, { type: 'questChoice', sessionId: q.id, choice: 'detain' })).toBe('need_repr5');
		expect(applyAction(s, 'player', { type: 'questChoice', sessionId: q.id, choice: 'discredit' })).toEqual({ ok: false, error: 'no_kompromat' });
	});
});

describe('карточки шанса (§7)', () => {
	it('условные карточки имеют вес 0, откат после вытягивания', () => {
		const s = createGame({ seed: 'deck' });
		const d = deck(s);
		expect(d.weights[d.ids.indexOf('surveillance_program_leak')]).toBe(0);
		s.survLevel = 5;
		expect(deck(s).weights[d.ids.indexOf('surveillance_program_leak')]).toBe(6);
		s.cards.cooldowns.blockbuster = 999;
		expect(deck(s).weights[d.ids.indexOf('blockbuster')]).toBe(0);
	});

	it('defense_cut режет доход на 6 месяцев', () => {
		const s = createGame({ seed: 'cut' });
		applyCard(s, 'defense_cut');
		expect(incomeCardMult(s)).toBeCloseTo(0.85);
		s.day += 6 * 30;
		expect(incomeCardMult(s)).toBe(1);
	});

	it('контентная карточка попадает в колоду и исполняется', () => {
		const s = createGame({
			seed: 'content',
			config: { extraCards: [{ id: 'gala', weight: 5, effects: [{ kind: 'budget', value: 77 }], requires: [{ kind: 'minMonth', value: 2 }] }] }
		});
		const i = deck(s).ids.indexOf('gala');
		expect(deck(s).weights[i]).toBe(0);
		s.day = 31;
		expect(deck(s).weights[i]).toBe(5);
		const b = s.budget;
		applyCard(s, 'gala');
		expect(s.budget).toBe(b + 77);
	});
});
