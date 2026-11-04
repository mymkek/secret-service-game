// Простой детерминированный бот для тестов и как пример для симулятора (sim/**).
// Играет «честно»: расследования, теракты, пиар, отделы. Не использует RNG партии.
import { BALANCE as B } from '../balance';
import { applyAction, validateAction, type PlayerAction } from '../actions';
import { agentSalary, autoPickPerk } from '../agents';
import { autoChoice, questChoices } from '../quests';
import { selectCases, selectForecast } from '../selectors';
import { computeOpChance, primarySkill } from '../ops';
import type { DeptKey, GameState, QuestId, QuestSession } from '../types';

function tryDo(s: GameState, a: PlayerAction): boolean {
	if (validateAction(s, a) !== null) return false;
	return applyAction(s, 'player', a).ok;
}

/** Минимальный шанс, при котором бот идёт на «Поимку террористов». */
export const HONEST_TERROR_MIN_CHANCE = 0.4;

/** Предпочтения честного бота в квестах: первый доступный из списка. */
const HONEST_PREFS: Partial<Record<QuestId, string[]>> = {
	hearings: ['testify', 'secrecy'],
	rally: ['allow'],
	senator_secret: ['hold'],
	blogger_docs: ['deal'],
	journalist: ['bribe', 'ignore'],
	union_meeting: ['concede', 'refuse'],
	informant: ['report'],
	defector_contact: ['return', 'court', 'ignore']
};

/** Грязные варианты (§6.3), которые честный бот не выбирает никогда. */
const DIRTY_CHOICES: Partial<Record<QuestId, string[]>> = {
	hearings: ['scapegoat'],
	blogger_docs: ['discredit', 'detain'],
	rally: ['provocateur'],
	journalist: ['discredit', 'detain'],
	senator_secret: ['blackmail']
};

/** Честный выбор: по предпочтениям, иначе первый доступный не грязный. null — оставить открытым. */
export function honestChoice(s: GameState, q: QuestSession): string | null {
	const avail = questChoices(s, q).filter((c) => c.available).map((c) => c.id);
	for (const id of HONEST_PREFS[q.questId] ?? []) if (avail.includes(id)) return id;
	const dirty = DIRTY_CHOICES[q.questId] ?? [];
	return avail.find((id) => !dirty.includes(id) && !id.startsWith('give:')) ?? null;
}

const DEPT_ORDER: DeptKey[] = ['analytics', 'operations', 'pr', 'legal', 'counterintel', 'analytics', 'operations', 'pr', 'legal'];

/** Один «ход» бота: вызывать между вызовами advance(). */
export function honestBotTurn(s: GameState): void {
	// Решения и перки.
	for (const q of [...s.quests]) {
		const c = q.questId === 'recruit_retry' ? autoChoice(s, q) : honestChoice(s, q); // D-042 — правило ядра
		if (c) applyAction(s, 'player', { type: 'questChoice', sessionId: q.id, choice: c });
	}
	for (const a of s.agents) {
		while (a.pendingPerks > 0) {
			const p = autoPickPerk(a);
			if (!p) break;
			applyAction(s, 'player', { type: 'choosePerk', agentId: a.id, perk: p });
		}
	}
	const reserve = 400;
	// Дела: сначала теракты, потом сложные.
	const cases = selectCases(s)
		.filter((c) => c.accessible && c.takenByOpId === null)
		.sort((x, y) => (y.kind === 'terror' ? 10 : 0) + y.difficulty - ((x.kind === 'terror' ? 10 : 0) + x.difficulty));
	for (const c of cases) {
		const type = c.kind === 'terror' ? 'terror' : 'investigation';
		const need = B.OP_AGENTS_REQUIRED[type];
		const idle = s.agents
			.filter((a) => a.status === 'idle')
			.sort((x, y) => primarySkill(y, type) - primarySkill(x, type) || x.id - y.id);
		if (idle.length < need || s.budget < B.OP_COST[type] + reserve) continue;
		const team = idle.slice(0, need);
		if (type === 'terror' && computeOpChance(s, { type, difficulty: c.difficulty, target: null, team }) < HONEST_TERROR_MIN_CHANCE) continue;
		tryDo(s, { type: 'startOp', opType: type, caseId: c.id, agentIds: team.map((a) => a.id) });
	}
	// Найм — с оглядкой на план (§5.5: каждый агент поднимает цель плана на PLAN_PER_AGENT·3 за квартал):
	// только если прошлый квартал выполнен реально, свободных рук не хватает и месяц остаётся в плюсе.
	const lastRatio = s.plan.ratioHistory.at(-1) ?? 1;
	const idleNow = s.agents.filter((a) => a.status === 'idle').length;
	if (s.budget > 1200 && lastRatio >= 1 && idleNow < B.OP_AGENTS_REQUIRED.investigation) {
		const cand = s.hirePool.find((c) => c.rank !== 'veteran');
		if (cand && selectForecast(s).net - agentSalary(cand) > 0) tryDo(s, { type: 'hire', candidateId: cand.id });
	}
	// Отделы.
	if (s.budget > 1500) {
		for (const d of DEPT_ORDER) if (tryDo(s, { type: 'buildDept', dept: d })) break;
	}
	if (s.budget > 800) tryDo(s, { type: 'prCampaign' });
	if (s.budget > 900 && s.influence < 40) tryDo(s, { type: 'congressWork' });
}

