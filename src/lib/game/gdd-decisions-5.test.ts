// D-066: один агент на задание, подкрепление по слотам, p_shown без крота, «прикрытие», старт 2 + 2.
import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import { generateAgent } from './agents';
import { applyAction, createGame, previewOperation, selectOperations, stepDay, validateAction } from './index';
import { computeOpChance, computeOpShownChance, spawnCase } from './ops';
import { seedRng } from './rng';
import type { Agent, GameState, OpTarget, OpType, PerkId, TraitId } from './types';
import { OP_TYPES, PERKS } from './types';

function fresh(seed: string): GameState {
	const s = createGame({ seed });
	s.cards.nextCardDay = 99999;
	s.budget = 100000;
	return s;
}

describe('D-066: состав и константы', () => {
	it('старт 2 новичка + 2 опытных; минимум 1 агент на любое задание', () => {
		const s = fresh('roster');
		expect(s.agents.map((a) => a.rank).sort()).toEqual(['experienced', 'experienced', 'novice', 'novice']);
		for (const t of OP_TYPES) expect(B.OP_AGENTS_REQUIRED[t]).toBe(1);
		expect(B.OP_REINFORCE_BONUS_BY_SLOT.length).toBe(B.OP_MAX_EXTRA_AGENTS);
	});

	it('каждый тип операции стартует с одним агентом; четвёртый лишний', () => {
		const s = fresh('one-agent');
		const ids = s.agents.map((a) => a.id);
		const reg = spawnCase(s, 'regular', { difficulty: 2 })!;
		s.stateJurisdiction[reg.stateId].level = 2;
		const ter = spawnCase(s, 'terror', { difficulty: 3 })!;
		s.stateJurisdiction[ter.stateId].level = 2;
		expect(validateAction(s, { type: 'startOp', opType: 'investigation', caseId: reg.id, agentIds: ids })).toBe('too_many_agents');
		expect(validateAction(s, { type: 'startOp', opType: 'investigation', caseId: reg.id, agentIds: [] })).toBe('not_enough_agents');
		expect(applyAction(s, 'player', { type: 'startOp', opType: 'investigation', caseId: reg.id, agentIds: [ids[0]] }).ok).toBe(true);
		expect(applyAction(s, 'player', { type: 'startOp', opType: 'terror', caseId: ter.id, agentIds: [ids[1]] }).ok).toBe(true);
		expect(applyAction(s, 'player', { type: 'startOp', opType: 'infiltration', target: { kind: 'rival', id: 'cia' }, agentIds: [ids[2]] }).ok).toBe(true);
		expect(applyAction(s, 'player', { type: 'startOp', opType: 'surveillance', target: { kind: 'rival', id: 'police' }, agentIds: [ids[3]] }).ok).toBe(true);
		expect(s.operations.map((o) => o.agentIds.length)).toEqual([1, 1, 1, 1]);
	});
});

/** Агенты с разными навыками, уровнями, перками и трейтами — для проверки монотонности. */
function agentPool(s: GameState, n: number, seed: string): Agent[] {
	const h = { rngState: seedRng(seed) };
	const out: Agent[] = [];
	const traits: TraitId[] = ['hero', 'with_past', 'corrupt', 'idealist'];
	for (let i = 0; i < n; i++) {
		const holder = { ...s, rngState: h.rngState } as GameState;
		const a = generateAgent(holder, { rank: (['novice', 'experienced', 'veteran'] as const)[i % 3], traits: false });
		h.rngState = holder.rngState;
		s.nextId = holder.nextId;
		a.level = 1 + (i % 5);
		if (i % 4 === 1) a.perks.push(PERKS[i % PERKS.length] as PerkId);
		if (i % 5 === 2) a.traits.push(traits[i % traits.length]);
		out.push(a);
	}
	return out;
}

describe('D-066: инвариант — добавление агента не снижает p_shown', () => {
	const targets: Record<OpType, OpTarget | null> = {
		investigation: null,
		terror: null,
		infiltration: { kind: 'rival', id: 'cia' },
		surveillance: { kind: 'senator', id: 'senator_1' }
	};

	it('для всех типов, сложностей, составов 1..2 и любого добавленного агента (рано и поздно)', () => {
		const s = fresh('mono');
		s.techs.push('A1', 'C2');
		s.survLevel = 4;
		const pool = agentPool(s, 24, 'mono-pool');
		let checks = 0;
		for (const type of OP_TYPES) {
			for (let d = 1; d <= 5; d++) {
				for (let i = 0; i < pool.length; i += 3) {
					for (let j = 0; j < pool.length; j += 5) {
						if (j === i) continue;
						const base = [pool[i]];
						const pair = [pool[i], pool[j]];
						for (let k = 0; k < pool.length; k += 7) {
							if (k === i || k === j) continue;
							for (const late of [false, true]) {
								const args = { type, difficulty: d, target: targets[type] };
								const p1 = computeOpShownChance(s, { ...args, team: base });
								const p2 = computeOpShownChance(s, { ...args, team: pair });
								const p3 = computeOpShownChance(s, { ...args, team: [...pair, pool[k]], lateIds: late ? [pool[k].id] : [] });
								expect(p2).toBeGreaterThanOrEqual(p1);
								expect(p3).toBeGreaterThanOrEqual(p2);
								checks++;
							}
						}
					}
				}
			}
		}
		expect(checks).toBeGreaterThan(1000);
	});

	it('новичок в паре с опытным не тянет шанс вниз (старое правило давало 0.52 < 0.53)', () => {
		const s = fresh('pair');
		const exp = s.agents.find((a) => a.rank === 'experienced')!;
		const nov = s.agents.find((a) => a.rank === 'novice')!;
		const args = { type: 'investigation' as const, difficulty: 3, target: null };
		const solo = computeOpShownChance(s, { ...args, team: [exp] });
		const duo = computeOpShownChance(s, { ...args, team: [exp, nov] });
		expect(duo).toBeCloseTo(solo + B.OP_REINFORCE_BONUS_BY_SLOT[0], 10);
	});
});

describe('D-066: превью не выдаёт крота', () => {
	it('previewOperation и selectOperations показывают p_shown; бросок идёт по p с OP_MOLE_PENALTY', () => {
		const s = fresh('mole-preview');
		const c = spawnCase(s, 'regular', { difficulty: 2 })!;
		s.stateJurisdiction[c.stateId].level = 2;
		const [a, b] = s.agents;
		const input = { opType: 'investigation' as const, agentIds: [a.id, b.id], caseId: c.id };
		const clean = previewOperation(s, input).chance;
		b.moleFor = 'cia';
		expect(previewOperation(s, input).chance).toBe(clean);
		const team = [a, b];
		const args = { type: 'investigation' as const, difficulty: 2, target: null, team };
		expect(computeOpShownChance(s, args)).toBe(clean);
		expect(computeOpChance(s, args)).toBeCloseTo(Math.max(B.OP_CHANCE_MIN, clean - B.OP_MOLE_PENALTY), 10);
		expect(applyAction(s, 'player', { type: 'startOp', ...input }).ok).toBe(true);
		expect(selectOperations(s)[0].chance).toBe(clean);
	});

	it('nextAgentBonus: +6 %, затем +4 %, после 50 % срока — вдвое меньше; полная команда — null', () => {
		const s = fresh('next-bonus');
		const c = spawnCase(s, 'regular', { difficulty: 2 })!;
		s.stateJurisdiction[c.stateId].level = 2;
		const ids = s.agents.map((a) => a.id);
		expect(previewOperation(s, { opType: 'investigation', agentIds: [ids[0]], caseId: c.id }).nextAgentBonus).toBeCloseTo(0.06);
		expect(previewOperation(s, { opType: 'investigation', agentIds: [ids[0]], caseId: c.id }).nextAgentSpecial).toBeNull(); // D-068: «Хороший/плохой коп» — после v1
		expect(previewOperation(s, { opType: 'investigation', agentIds: ids.slice(0, 2), caseId: c.id }).nextAgentBonus).toBeCloseTo(0.04);
		expect(previewOperation(s, { opType: 'investigation', agentIds: ids.slice(0, 3), caseId: c.id }).nextAgentBonus).toBeNull();
		expect(applyAction(s, 'player', { type: 'startOp', opType: 'investigation', agentIds: [ids[0]], caseId: c.id }).ok).toBe(true);
		const op = s.operations[0];
		while (s.day < op.startDay + Math.ceil((op.endDay - op.startDay) / 2)) stepDay(s);
		expect(selectOperations(s)[0].nextAgentBonus).toBeCloseTo(0.03);
		expect(applyAction(s, 'player', { type: 'reinforceOp', opId: op.id, agentId: ids[1] }).ok).toBe(true);
		expect(op.extraJoinedLate).toEqual([ids[1]]);
		expect(selectOperations(s)[0].nextAgentBonus).toBeCloseTo(0.02);
	});
});

describe('D-066: внедрение — внедряется только team[0]', () => {
	it('успех: первый агент embedded, подкрепление возвращается', () => {
		const s = fresh('infil');
		const [a, b] = s.agents;
		const [min, max] = [B.OP_CHANCE_MIN, B.OP_CHANCE_MAX];
		(B as Record<string, unknown>).OP_CHANCE_MIN = 1;
		(B as Record<string, unknown>).OP_CHANCE_MAX = 1;
		try {
			expect(applyAction(s, 'player', { type: 'startOp', opType: 'infiltration', target: { kind: 'rival', id: 'cia' }, agentIds: [a.id, b.id] }).ok).toBe(true);
			const end = s.operations[0].endDay;
			while (s.day < end) stepDay(s);
		} finally {
			(B as Record<string, unknown>).OP_CHANCE_MIN = min;
			(B as Record<string, unknown>).OP_CHANCE_MAX = max;
		}
		expect(a.status).toBe('embedded');
		expect(a.location).toEqual({ rivalId: 'cia' });
		expect(b.status).toBe('idle');
	});
});
