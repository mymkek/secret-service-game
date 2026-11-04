// Регрессия: записи op_success / op_fail несут подробности итога (дело, цель, разница ресурсов, судьба команды).
import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import { applyAction, createGame, serialize } from './index';
import { completeOperation, spawnCase } from './ops';
import type { Case, GameState, LogEntry, OpResultLogData, OpType, OpTarget } from './types';

function rich(seed: string): GameState {
	const s = createGame({ seed });
	s.budget = 100000;
	s.reputation = 50;
	s.cards.nextCardDay = 99999;
	return s;
}

function caseIn(s: GameState, stateId: string, kind: 'regular' | 'terror', difficulty: number): Case {
	const c = spawnCase(s, kind, { difficulty })!;
	c.stateId = stateId;
	return c;
}

/** Шанс операции зажат в [OP_CHANCE_MIN, OP_CHANCE_MAX]; 1 — гарантированный успех, 0 — провал. */
function withChance(p: number, fn: () => void): void {
	const [min, max] = [B.OP_CHANCE_MIN, B.OP_CHANCE_MAX];
	(B as Record<string, unknown>).OP_CHANCE_MIN = p;
	(B as Record<string, unknown>).OP_CHANCE_MAX = p;
	try {
		fn();
	} finally {
		(B as Record<string, unknown>).OP_CHANCE_MIN = min;
		(B as Record<string, unknown>).OP_CHANCE_MAX = max;
	}
}

function runOp(
	s: GameState,
	p: number,
	opType: OpType,
	opts: { caseId?: number; target?: OpTarget; agentIds: number[] }
): LogEntry {
	expect(applyAction(s, 'player', { type: 'startOp', opType, ...opts }).ok).toBe(true);
	const op = s.operations[s.operations.length - 1];
	withChance(p, () => completeOperation(s, op));
	const e = [...s.log].reverse().find((x) => x.kind === 'op_success' || x.kind === 'op_fail')!;
	expect(e.data.opId).toBe(op.id);
	return e;
}

describe('журнал итога операции (op_success / op_fail)', () => {
	it('успешное расследование: stateId, вид и сложность дела, плюс бюджет и очки плана', () => {
		const s = rich('oplog-inv-ok');
		const c = caseIn(s, 'CA', 'regular', 2);
		const e = runOp(s, 1, 'investigation', { caseId: c.id, agentIds: s.agents.slice(0, 2).map((a) => a.id) });
		const d = e.data as unknown as OpResultLogData;
		expect(e.kind).toBe('op_success');
		expect(d).toMatchObject({ type: 'investigation', caseId: c.id, stateId: 'CA', caseKind: 'regular', difficulty: 2 });
		expect(d.planPointsDelta).toBe(B.OP_INVEST_PLAN_POINTS);
		expect(d.budgetDelta).toBeGreaterThan(0);
		expect(d.reputationDelta).toBeGreaterThan(0);
		expect(d.targetKind).toBeUndefined();
		expect(d.killedAgentIds).toBeUndefined();
		expect('caseTag' in e.data).toBe(false); // дело без метки
		// Нулевые разницы не пишутся.
		expect('influenceDelta' in e.data).toBe(false);
		expect('investigationDelta' in e.data).toBe(false);
	});

	it('проваленное расследование: отрицательная репутация, без награды и очков плана', () => {
		const s = rich('oplog-inv-fail');
		const c = caseIn(s, 'CA', 'regular', 2);
		const e = runOp(s, 0, 'investigation', { caseId: c.id, agentIds: s.agents.slice(0, 2).map((a) => a.id) });
		const d = e.data as unknown as OpResultLogData;
		expect(e.kind).toBe('op_fail');
		expect(d).toMatchObject({ stateId: 'CA', caseKind: 'regular', difficulty: 2 });
		expect(d.reputationDelta).toBeLessThan(0);
		expect(d.budgetDelta).toBeUndefined();
		expect(d.planPointsDelta).toBeUndefined();
	});

	it('проваленная операция против теракта: потери репутации, засвеченность, погибшие совпадают с agent_killed', () => {
		const s = rich('oplog-terror-fail-0');
		const c = caseIn(s, 'TX', 'terror', 3);
		const ids = s.agents.slice(0, 3).map((a) => a.id);
		for (const a of s.agents) if (ids.includes(a.id)) a.skills.combat = 0; // повышает шанс гибели
		const logFrom = s.log.length;
		const e = runOp(s, 0, 'terror', { caseId: c.id, agentIds: ids });
		const d = e.data as unknown as OpResultLogData;
		expect(e.kind).toBe('op_fail');
		expect(d).toMatchObject({ stateId: 'TX', caseKind: 'terror', difficulty: 3 });
		expect(d.reputationDelta).toBeLessThan(0);
		expect(d.exposureDelta).toBeGreaterThan(0);
		const killedLogged = s.log.slice(logFrom).filter((x) => x.kind === 'agent_killed').map((x) => x.data.agentId);
		const killed = d.killedAgentIds ? d.killedAgentIds.split(',').map(Number) : [];
		expect(killed).toEqual(killedLogged);
		expect(killed.length).toBeGreaterThan(0); // зерно подобрано так, что гибель есть
		for (const id of killed) expect(s.agents.some((a) => a.id === id)).toBe(false);
	});

	it('операция по делу с меткой: caseTag (дело-провокация §9.8, D-068)', () => {
		const s = rich('oplog-sting');
		const c = caseIn(s, 'CA', 'terror', 2);
		c.tag = 'sting';
		s.stateJurisdiction.CA.level = 1; // провокация доступна и при частичных полномочиях
		const e = runOp(s, 0, 'terror', { caseId: c.id, agentIds: [s.agents[0].id] });
		const d = e.data as unknown as OpResultLogData;
		expect(e.kind).toBe('op_fail');
		expect(d).toMatchObject({ stateId: 'CA', caseKind: 'terror', caseTag: 'sting' });
		expect(d.reputationDelta).toBeCloseTo(B.DL_STING.failRep, 10);
	});

	it('успешная слежка за соперником: цель, новый компромат и засвеченность', () => {
		const s = rich('oplog-surv-ok');
		const e = runOp(s, 1, 'surveillance', { target: { kind: 'rival', id: 'cia' }, agentIds: [s.agents[0].id] });
		const d = e.data as unknown as OpResultLogData;
		expect(e.kind).toBe('op_success');
		expect(d).toMatchObject({ targetKind: 'rival', targetId: 'cia', caseId: null });
		expect(d.stateId).toBeUndefined();
		expect(d.kompromatGained).toBeGreaterThanOrEqual(1);
		expect(d.exposureDelta).toBeGreaterThan(0);
	});

	it('запись итога не меняет детерминизм: два прогона с одним зерном дают одинаковый стейт', () => {
		const run = () => {
			const s = rich('oplog-det');
			const c = caseIn(s, 'CA', 'terror', 3);
			runOp(s, 0.5, 'terror', { caseId: c.id, agentIds: s.agents.slice(0, 3).map((a) => a.id) });
			return serialize(s);
		};
		expect(run()).toEqual(run());
	});
});
