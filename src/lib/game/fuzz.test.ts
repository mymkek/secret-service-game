// Fuzz: случайные действия всех типов (собственный RNG теста, не игровой) — без исключений и с инвариантами.
import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import { advance, applyAction, createGame, questChoices, serialize, deserialize, validateAction, type PlayerAction } from './index';
import { autoPickPerk } from './agents';
import { honestBotTurn } from './testing/honest-bot';
import { US_STATES } from './geo';
import { DEPT_KEYS, LEGENDS, RECRUIT_METHODS, RIVAL_IDS, SKILLS, TECH_IDS, type GameState, type OpTarget } from './types';

function mulberry(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function candidates(s: GameState, r: () => number): PlayerAction[] {
	const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
	const idle = s.agents.filter((a) => a.status === 'idle').map((a) => a.id);
	const team = (n: number) => [...idle].sort(() => r() - 0.5).slice(0, n);
	const out: PlayerAction[] = [];
	for (const c of s.hirePool) out.push({ type: 'hire', candidateId: c.id });
	for (const a of s.agents) {
		out.push({ type: 'fire', agentId: a.id }, { type: 'medal', agentId: a.id }, { type: 'setSalary', agentId: a.id, mult: pick(B.SALARY_MULTS) });
		out.push({ type: 'train', agentId: a.id, course: pick(['skill', 'language', 'legend'] as const), skill: pick(SKILLS), countryId: pick(['canada', 'mexico', 'cuba']) });
		if (a.pendingPerks > 0) out.push({ type: 'choosePerk', agentId: a.id, perk: autoPickPerk(a)! });
		out.push({ type: 'deployAgent', agentId: a.id, countryId: pick(['canada', 'mexico', 'cuba']), legend: pick(LEGENDS), prep: r() < 0.5, recruit: pick(RECRUIT_METHODS) });
		out.push({ type: 'recallAgent', agentId: a.id }, { type: 'recallEmbedded', agentId: a.id }, { type: 'scapegoat', agentId: a.id });
	}
	for (const d of DEPT_KEYS) out.push({ type: 'buildDept', dept: d });
	for (const t of TECH_IDS) out.push({ type: 'research', tech: t });
	out.push({ type: 'buildSurv' }, { type: 'buildRepr' }, { type: 'rollbackSurv' }, { type: 'rollbackRepr' }, { type: 'cancelResearch' });
	for (const c of s.cases) {
		const type = c.kind === 'terror' ? 'terror' : 'investigation';
		out.push({ type: 'startOp', opType: type, caseId: c.id, agentIds: team(B.OP_AGENTS_REQUIRED[type] + Math.floor(r() * 3)) });
		out.push({ type: 'intercept', caseId: c.id });
	}
	const targets: OpTarget[] = [
		...RIVAL_IDS.map((id) => ({ kind: 'rival' as const, id })),
		...s.leaders.map((l) => ({ kind: 'leader' as const, id: l.id })),
		{ kind: 'senator', id: pick(s.senators).id },
		{ kind: 'president' }
	];
	for (const t of targets) for (const opType of ['surveillance', 'infiltration'] as const) out.push({ type: 'startOp', opType, target: t, agentIds: team(1 + Math.floor(r() * 2)) });
	for (const op of s.operations) {
		if (idle.length) out.push({ type: 'reinforceOp', opId: op.id, agentId: pick(idle) });
		out.push({ type: 'cancelOp', opId: op.id });
	}
	for (const k of s.kompromat) out.push({ type: 'leak', kompromatId: k.id }, { type: 'counterKompromat', kompromatId: k.id }, { type: 'blackmail', kompromatId: k.id });
	for (const id of RIVAL_IDS) out.push({ type: 'sabotage', rivalId: id }, { type: 'lobby', rivalId: id }, { type: 'poach', rivalId: id }, { type: 'absorb', rivalId: id });
	for (const l of s.leaders) out.push({ type: 'removeLeader', leaderId: l.id });
	out.push({ type: 'fakeStats', points: 1 + Math.floor(r() * 2) }, { type: 'congressWork' }, { type: 'prCampaign' }, { type: 'loyaltyCheck' });
	out.push({ type: 'restoreState', stateId: pick(US_STATES) });
	for (const q of s.quests) for (const c of questChoices(s, q)) out.push({ type: 'questChoice', sessionId: q.id, choice: c.id });
	return out;
}

function invariants(s: GameState): void {
	for (const k of ['reputation', 'influence', 'exposure', 'investigation', 'control', 'unrest'] as const) {
		expect(Number.isFinite(s[k])).toBe(true);
		expect(s[k] >= 0 && s[k] <= 100).toBe(true);
	}
	expect(Number.isInteger(s.budget)).toBe(true);
	for (const a of s.agents) {
		expect(a.loyalty >= 0 && a.loyalty <= 100).toBe(true);
		for (const v of Object.values(a.skills)) expect(v >= 1 && v <= B.SKILL_MAX).toBe(true);
	}
	for (const n of Object.values(s.networks)) {
		expect(n.level >= 0 && n.level <= B.NET_MAX_LEVEL).toBe(true);
		for (const id of n.agentIds) expect(s.agents.some((a) => a.id === id)).toBe(true);
	}
	for (const op of s.operations) expect(op.agentIds.length).toBeGreaterThan(0);
	for (const j of Object.values(s.stateJurisdiction)) expect(j.level >= 0 && j.level <= 2).toBe(true);
	expect(s.kompromat.every((k) => k.strength >= 1 && k.strength <= 3)).toBe(true);
}

describe('fuzz: случайные действия всех типов', () => {
	it('25 партий × до 1800 дней: без исключений, инварианты, допустимые действия всегда применимы', () => {
		const used = new Set<string>();
		const outcomes: Record<string, number> = {};
		for (let g = 0; g < 25; g++) {
			const r = mulberry(1000 + g);
			let s = createGame({ seed: `fuzz-${g}` });
			let turn = 0;
			while (s.outcome.status === 'active') {
				turn++;
				if (turn % 10 === 0) s.budget += 1500; // подпитка, чтобы дойти до дорогих веток
				const cand = candidates(s, r);
				for (let i = 0; i < 6; i++) {
					const a = cand[Math.floor(r() * cand.length)];
					if (!a) break;
					const err = validateAction(s, a);
					const res = applyAction(s, 'player', a);
					if (err === null) {
						expect({ a: a.type, res }).toEqual({ a: a.type, res: { ok: true } });
						used.add(a.type);
					} else expect(res.ok).toBe(false);
					if (s.outcome.status !== 'active') break;
				}
				advance(s, 1 + Math.floor(r() * 6), { ignorePause: true });
				invariants(s);
				if (turn % 97 === 0) s = deserialize(serialize(s));
			}
			const k = s.outcome.victoryPath ?? s.outcome.defeatReason!;
			outcomes[k] = (outcomes[k] ?? 0) + 1;
		}
		// Должны реально сработать почти все типы действий.
		expect(used.size).toBeGreaterThan(25);
	});

	it('поздняя партия: прокачанное ведомство + честный бот + случайные действия до конца срока', () => {
		const reached = { leaders: 0, recruited: 0, election: 0, quests: 0, net3: 0, repr7: 0, absorbed: 0 };
		for (let g = 0; g < 20; g++) {
			const r = mulberry(5000 + g);
			let s = createGame({ seed: `late-${g}` });
			for (const d of DEPT_KEYS) s.departments[d] = 5;
			s.survLevel = s.survMaxEver = 5;
			s.reprLevel = s.reprMaxEver = 5;
			s.techs.push('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
			s.unrest = 65;
			s.influence = 60;
			s.budget = 20000;
			let turn = 0;
			while (s.outcome.status === 'active') {
				turn++;
				if (turn % 10 === 0) s.budget += 3000;
				honestBotTurn(s);
				const cand = candidates(s, r);
				for (let i = 0; i < 4 && s.outcome.status === 'active'; i++) {
					const a = cand[Math.floor(r() * cand.length)];
					if (!a || a.type === 'fire' || a.type === 'scapegoat') continue;
					const err = validateAction(s, a);
					const res = applyAction(s, 'player', a);
					expect(res.ok).toBe(err === null);
				}
				advance(s, 1 + Math.floor(r() * 5), { ignorePause: true });
				invariants(s);
				if (turn % 131 === 0) s = deserialize(serialize(s));
			}
			reached.leaders += s.log.filter((e) => e.kind === 'leader_new').length > 0 || s.leaders.length > 0 ? 1 : 0;
			reached.recruited += Object.values(s.networks).some((n) => n.level > 0) ? 1 : 0;
			reached.net3 += Object.values(s.networks).some((n) => n.level >= 3) ? 1 : 0;
			reached.election += s.day >= 1380 ? 1 : 0;
			reached.quests += s.log.some((e) => e.kind === 'quest_choice') ? 1 : 0;
			reached.repr7 += s.reprMaxEver >= 7 ? 1 : 0;
			reached.absorbed += s.rivals.some((x) => x.absorbed) ? 1 : 0;
		}
		expect(reached.quests).toBeGreaterThan(0);
		expect(reached.recruited).toBeGreaterThan(0);
	});
});
