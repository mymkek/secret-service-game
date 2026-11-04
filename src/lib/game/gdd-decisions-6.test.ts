// D-067: дилеммы операций (§9.8), линейка «Народный авангард» (§9.9), эпилог (§9.10), выборы (§9.7), сейвы v5 → v6.
import { afterEach, describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import {
	SCHEMA_VERSION,
	advance,
	applyAction,
	createGame,
	deserialize,
	questChoices,
	selectBlockingQuest,
	selectEpilogue,
	selectLine,
	selectOperations,
	serialize,
	setPaused,
	stepDay
} from './index';
import { spawnCase } from './ops';
import { honestBotTurn } from './testing/honest-bot';
import type { GameState, QuestSession } from './types';

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

/** Только одна операционная дилемма с весом, остальные 0; бросок назначения всегда успешен. */
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

function investigation(s: GameState, d: number, agents = 1) {
	const c = spawnCase(s, 'regular', { difficulty: d, stateId: 'CA' })!;
	const ids = s.agents.filter((a) => a.status === 'idle').slice(0, agents).map((a) => a.id);
	expect(applyAction(s, 'player', { type: 'startOp', opType: 'investigation', caseId: c.id, agentIds: ids }).ok).toBe(true);
	return { c, op: s.operations[s.operations.length - 1] };
}

function session(s: GameState, questId: string): QuestSession {
	const q = s.quests.find((x) => x.questId === questId);
	expect(q, questId).toBeDefined();
	return q!;
}

function choose(s: GameState, questId: string, choice: string, param?: number): void {
	const q = session(s, questId);
	const r = applyAction(s, 'player', { type: 'questChoice', sessionId: q.id, choice, param });
	expect(r).toEqual({ ok: true });
}

function runUntil(s: GameState, cond: () => boolean, max = 400): void {
	for (let i = 0; i < max && !cond(); i++) stepDay(s);
	expect(cond()).toBe(true);
}

describe('D-067: назначение дилеммы — триггер и откаты', () => {
	it('бросок при старте, глобальный откат 30 дней и повтор той же дилеммы через 180', () => {
		const s = fresh('dl-cooldown');
		onlyDilemma('sting');
		const a = investigation(s, 2);
		expect(a.op.dilemmaId).toBe('sting');
		expect(s.dilemmas.nextDay).toBe(s.day + B.DILEMMA_COOLDOWN_DAYS);
		expect(s.dilemmas.pending).toEqual([{ dilemmaId: 'sting', opId: a.op.id, phase: 'mid', assignedDay: s.day, prevLastDay: null }]);
		// Откат: вторая операция дилеммы не получает.
		const b = investigation(s, 2);
		expect(b.op.dilemmaId).toBeNull();
		// После отката, но до повтора 180 — та же дилемма недоступна (вес 0).
		s.day += B.DILEMMA_COOLDOWN_DAYS;
		const c = investigation(s, 2);
		expect(c.op.dilemmaId).toBeNull();
		s.day += B.DILEMMA_REPEAT_COOLDOWN_DAYS;
		const d = investigation(s, 2);
		expect(d.op.dilemmaId).toBe('sting');
	});

	it('фаза mid открывает модальное окно в день 50 %; без ignorePause время стоит до выбора', () => {
		const s = fresh('dl-mid');
		onlyDilemma('sting');
		const { op } = investigation(s, 2);
		const mid = op.startDay + Math.ceil((op.endDay - op.startDay) / 2);
		setPaused(s, false);
		s.autopause.questChoice = false; // модальное окно не отключается флагом
		const r = advance(s, 60);
		expect(s.day).toBe(mid);
		expect(r.stoppedBy).toBe('autopause');
		expect(selectBlockingQuest(s)?.questId).toBe('dilemma_sting');
		setPaused(s, false);
		expect(advance(s, 5).daysAdvanced).toBe(0);
		choose(s, 'dilemma_sting', 'observe');
		setPaused(s, false);
		expect(advance(s, 5).daysAdvanced).toBe(5);
	});

	it('скрытые шансы — только метки риска; грязный вариант = грязное действие', () => {
		const s = fresh('dl-risk');
		onlyDilemma('sting');
		investigation(s, 2);
		runUntil(s, () => s.quests.some((q) => q.questId === 'dilemma_sting'));
		const ch = questChoices(s, session(s, 'dilemma_sting'));
		expect(ch.map((c) => c.id)).toEqual(['observe', 'provoke']);
		expect(ch[1]).toMatchObject({ dirty: true, risk: 'medium' });
		expect(ch[1].chance).toBeUndefined();
		const dirty0 = s.counters.dirtyActions;
		choose(s, 'dilemma_sting', 'provoke');
		expect(s.counters.dirtyActions).toBe(dirty0 + 1);
		expect(s.history.stings).toBe(1);
		const sting = s.cases.find((c) => c.tag === 'sting')!;
		expect(sting).toMatchObject({ kind: 'terror', difficulty: B.DL_STING.caseDifficulty, stateId: 'CA', rewardMult: B.DL_STING.rewardMult });
	});
});

describe('D-067: «Ценный источник» — фаза end_success и дела источника', () => {
	it('окно после успешного броска; «Завербовать» — без очка плана, источник даёт дела в начале месяца', () => {
		const s = fresh('dl-source');
		onlyDilemma('valuable_source');
		fixedChance(1);
		const { op, c } = investigation(s, 3);
		runUntil(s, () => op.held);
		expect(s.operations).toContain(op);
		expect(op.rolled).toBe(true);
		const plan0 = s.plan.points;
		const budget0 = s.budget;
		choose(s, 'dilemma_valuable_source', 'recruit', undefined);
		expect(s.operations).not.toContain(op);
		expect(s.plan.points).toBe(plan0);
		expect(s.budget).toBe(budget0 + B.OP_INVEST_REWARD_BASE + B.OP_INVEST_REWARD_PER_DIFF * c.difficulty);
		expect(s.valuableSource).toEqual({ sinceDay: s.day, crimes: 0 });
		runUntil(s, () => s.day % B.DAYS_PER_MONTH === 1);
		expect(s.cases.filter((x) => x.tag === 'source' && x.expiresDay === null)).toHaveLength(B.DL_VALUABLE_SOURCE.casesPerMonth);
	});
});

describe('D-067: отложенные последствия', () => {
	it('«Надавить»: успех без броска, ложное признание → через N дней дело настоящего преступника', () => {
		const s = fresh('dl-false');
		onlyDilemma('forced_confession');
		fixedChance(0.3); // «дело буксует»: p < maxChance
		setB('DL_FORCED_CONFESSION', { ...B.DL_FORCED_CONFESSION, falseChance: 1, reviewChance: 1, delayDays: [10, 10] });
		const { op } = investigation(s, 3);
		runUntil(s, () => op.held);
		expect(op.rolled).toBeNull(); // фаза end_before_roll — до броска
		const plan0 = s.plan.points;
		choose(s, 'dilemma_forced_confession', 'press');
		expect(s.plan.points).toBe(plan0 + B.OP_INVEST_PLAN_POINTS);
		expect(s.history).toMatchObject({ forcedConfessions: 1, falseConfessions: 1 });
		const due = s.delayed[0];
		expect(due).toMatchObject({ kind: 'false_confession', dueDay: s.day + 10 });
		const rep0 = s.reputation;
		while (s.day < due.dueDay - 1) stepDay(s);
		expect(s.cases.some((c) => c.tag === 'real_culprit')).toBe(false);
		stepDay(s);
		const culprit = s.cases.find((c) => c.tag === 'real_culprit')!;
		expect(culprit).toMatchObject({ stateId: 'CA', difficulty: 4 });
		expect(s.history.falseReviews).toBe(1);
		expect(s.reputation).toBeLessThan(rep0);
		expect(s.delayed).toHaveLength(0);
	});

	it('«Тихий сигнал»: «Отложить» при реальном сигнале → теракт через randInt дней, слушания', () => {
		const s = fresh('dl-signal');
		setB('DL_SIGNAL', { ...B.DL_SIGNAL, chancePerMonth: 1, realChance: 1, attackDelayDays: [7, 7] });
		runUntil(s, () => s.quests.some((q) => q.questId === 'dilemma_quiet_signal'), 200);
		expect(s.day).toBe((B.DL_SIGNAL.minMonth - 1) * B.DAYS_PER_MONTH + 1);
		expect(session(s, 'dilemma_quiet_signal').params).not.toHaveProperty('real');
		choose(s, 'dilemma_quiet_signal', 'wait');
		expect(s.delayed[0]).toMatchObject({ kind: 'signal_attack', dueDay: s.day + 7 });
		const infl0 = s.influence;
		for (let i = 0; i < 7; i++) stepDay(s);
		expect(s.history).toMatchObject({ signals: 1, signalsReal: 1, missedSignals: 1 });
		expect(s.influence).toBeLessThan(infl0);
		expect(s.quests.some((q) => q.questId === 'hearings')).toBe(true);
	});
});

describe('D-067: линейка «Народный авангард»', () => {
	it('предложение → ведущий с навыком ≥ 7 → 4 этапа с паузами → награда «Доказательства»', () => {
		const s = fresh('vanguard');
		setB('LINE_OFFER_CHANCE', 1);
		setB('LINE_CHANCE_MIN', 1);
		setB('LINE_CHANCE_MAX', 1);
		const lead = s.agents[0];
		lead.skills.interrogation = B.LINE_MIN_SKILL;
		runUntil(s, () => s.quests.some((q) => q.questId === 'vanguard_offer'), 400);
		expect(s.day).toBe((B.LINE_MIN_MONTH - 1) * B.DAYS_PER_MONTH + 1);
		const start = questChoices(s, session(s, 'vanguard_offer')).find((c) => c.id === 'start')!;
		expect(start.agentIds).toEqual(s.agents.filter((a) => a.status === 'idle' && Math.max(a.skills.surveillance, a.skills.interrogation) >= 7).map((a) => a.id));
		choose(s, 'vanguard_offer', 'start', lead.id);
		const budget0 = s.budget;
		choose(s, 'vanguard_offer', 'alone');
		expect(s.budget).toBe(budget0 - B.LINE_STAGE_COST[0]);
		expect(lead).toMatchObject({ status: 'embedded', location: { lineId: 'vanguard' } });
		expect(selectLine(s).line).toMatchObject({ stage: 1, phase: 'stage', daysLeft: B.LINE_STAGE_DAYS[0] });
		expect(applyAction(s, 'player', { type: 'recallEmbedded', agentId: lead.id })).toEqual({ ok: false, error: 'agent_on_line' });
		const plan0 = s.plan.points;
		for (const [q, c] of [
			['vanguard_stage2', 'cautious'],
			['vanguard_stage3', 'evidence'],
			['vanguard_stage4', 'go']
		] as const) {
			runUntil(s, () => s.quests.some((x) => x.questId === q), 200);
			expect(selectLine(s).line?.phase).toBe('window');
			choose(s, q, c);
		}
		const money0 = s.budget;
		runUntil(s, () => s.line === null, 100);
		expect(s.budget).toBe(money0 + B.LINE_REWARD_CLEAN.money);
		expect(s.plan.points).toBe(plan0 + B.LINE_REWARD_CLEAN.plan);
		expect(lead.status).toBe('idle');
		expect(s.history).toMatchObject({ linesStarted: 1, linesCompleted: 1, linesProvoked: 0 });
		expect(s.lineNextOfferDay).toBe(s.day + B.LINE_COOLDOWN_DAYS);
		expect(session(s, 'vanguard_result').params.outcome).toBe('success_clean');
	});

	it('провал этапа: засвеченность, судьба ведущего, линейка окончена', () => {
		const s = fresh('vanguard-fail');
		setB('LINE_OFFER_CHANCE', 1);
		setB('LINE_CHANCE_MIN', 0);
		setB('LINE_CHANCE_MAX', 0);
		setB('LINE_FAIL_OUTCOMES', { fled: 0, killed: 1, captured: 0, turned: 0 });
		setB('LINE_PARTNER_DEATH_CHANCE', 1);
		const [lead, partner] = s.agents;
		lead.skills.surveillance = 9;
		runUntil(s, () => s.quests.some((q) => q.questId === 'vanguard_offer'), 400);
		choose(s, 'vanguard_offer', 'start', lead.id);
		choose(s, 'vanguard_offer', 'partner', partner.id);
		const exp0 = s.exposure;
		runUntil(s, () => s.line === null, 60);
		expect(s.agents.some((a) => a.id === lead.id || a.id === partner.id)).toBe(false);
		expect(s.history.lineAgentsLost).toBe(2);
		expect(s.exposure).toBeGreaterThan(exp0);
	});
});

describe('D-067: прочие операционные дилеммы', () => {
	it('«Легенда требует личной жизни»: +0.08 к шансу, флаг у внедрённого, при отзыве — скандал', () => {
		const s = fresh('dl-cover');
		onlyDilemma('cover_life');
		fixedChance(1);
		setB('DL_COVER_LIFE', { ...B.DL_COVER_LIFE, scandalChance: 1 });
		const a = s.agents[0];
		applyAction(s, 'player', { type: 'startOp', opType: 'infiltration', target: { kind: 'rival', id: 'cia' }, agentIds: [a.id] });
		const op = s.operations[0];
		runUntil(s, () => op.held);
		choose(s, 'dilemma_cover_life', 'allow');
		expect(op.dilemmaBonus).toBeCloseTo(B.DL_COVER_LIFE.allowChance);
		runUntil(s, () => a.status === 'embedded');
		expect(a.coverLife).toBe(true);
		const rep0 = s.reputation;
		expect(applyAction(s, 'player', { type: 'recallEmbedded', agentId: a.id }).ok).toBe(true);
		expect(a.coverLife).toBe(false);
		expect(s.history).toMatchObject({ coverRomances: 1, coverScandals: 1 });
		expect(s.reputation).toBeLessThan(rep0);
	});

	it('«Подправить заявку» (фаза start): ордер 0 дней, +0.05, грязное, отложенная проверка', () => {
		const s = fresh('dl-warrant');
		onlyDilemma('fudged_warrant');
		const a = s.agents[0];
		applyAction(s, 'player', { type: 'startOp', opType: 'surveillance', target: { kind: 'rival', id: 'police' }, agentIds: [a.id] });
		const op = s.operations[0];
		expect(op.held).toBe(true);
		expect(selectBlockingQuest(s)?.questId).toBe('dilemma_fudged_warrant');
		const dirty0 = s.counters.dirtyActions;
		choose(s, 'dilemma_fudged_warrant', 'fudge');
		expect(op).toMatchObject({ warrantSkipped: true, warrantEndDay: s.day, endDay: s.day + B.OP_DURATION_DAYS.surveillance, held: false });
		expect(op.dilemmaBonus).toBeCloseTo(B.DL_FUDGED_WARRANT.chanceBonus);
		expect(s.counters.dirtyActions).toBe(dirty0 + 1);
		expect(s.delayed[0].kind).toBe('fudge_audit');
	});

	it('«Поделиться с ЦРУ»: +0.12 к шансу в превью и «услуга» ЦРУ', () => {
		const s = fresh('dl-cia');
		onlyDilemma('share_with_cia');
		const c = spawnCase(s, 'terror', { difficulty: 3, stateId: 'CA' })!;
		applyAction(s, 'player', { type: 'startOp', opType: 'terror', caseId: c.id, agentIds: [s.agents[0].id] });
		const op = s.operations[0];
		runUntil(s, () => op.held);
		const before = selectOperations(s)[0].chance;
		choose(s, 'dilemma_share_with_cia', 'share');
		expect(selectOperations(s)[0].chance).toBeCloseTo(Math.min(B.OP_CHANCE_MAX, before + B.DL_SHARE_CIA.chanceBonus), 10);
		expect(s.rivals.find((r) => r.id === 'cia')!.favorUntilDay).toBe(s.day + B.DL_SHARE_CIA.favorDays);
	});
});

describe('D-067: выборы и эпилог', () => {
	it('вмешательство «Объявить о проверке» → переизбрание даёт priorityMult 1.15', () => {
		const s = fresh('election');
		setB('ELECTION_NEW_ADMIN_CHANCE', 0.15); // 0.15 − 0.15 → кламп 0.05
		setB('ELECTION_CHANCE_MIN', 0);
		s.day = (B.ELECTION_MONTH + B.DL_ELECTION_DOSSIER.monthOffset - 1) * B.DAYS_PER_MONTH;
		stepDay(s);
		choose(s, 'dilemma_election_dossier', 'announce');
		expect(s.election.delta).toBeCloseTo(B.DL_ELECTION_DOSSIER.publicAdminDelta);
		s.day = (B.ELECTION_MONTH - 1) * B.DAYS_PER_MONTH - 1;
		stepDay(s);
		expect(s.election.result).toBe('reelected');
		expect(s.priorityMult).toBe(B.DL_ELECTION_DOSSIER.meddleWinPriority);
		const ep = selectEpilogue(s);
		expect(ep.election).toEqual({ result: 'reelected', meddling: 'public' });
		expect(ep.verdict).toBe('gray'); // вмешательство в выборы — 1 скрытый грех
	});

	it('эпилог собирает счётчики history: строки только ненулевые, вердикт по §9.10', () => {
		const s = fresh('epilogue');
		expect(selectEpilogue(s)).toMatchObject({ yearsLater: B.EPILOGUE_YEARS_LATER, lines: [], verdict: 'exemplary', election: null });
		s.history.missedSignals = 1;
		s.history.signals = 2;
		expect(selectEpilogue(s).verdict).toBe('heavy_memory');
		s.history.forcedConfessions = 2;
		s.history.falseConfessions = 1;
		s.history.stings = 1;
		expect(selectEpilogue(s)).toMatchObject({ verdict: 'reform', hiddenSins: 3, revealed: 0 });
		s.history.fudgeCaught = 1;
		s.history.sourceExposed = true;
		expect(selectEpilogue(s).verdict).toBe('church');
		expect(selectEpilogue(s).lines.map((l) => l.key)).toEqual(['forced_confessions', 'stings', 'informant', 'signals']);
	});
});

describe('D-067: детерминизм и боты', () => {
	it('честный бот с частыми дилеммами: одно зерно → одинаковый стейт, дилеммы закрываются вариантом 0', () => {
		setB('DILEMMA_OP_CHANCE', 1);
		setB('DL_SIGNAL', { ...B.DL_SIGNAL, chancePerMonth: 1 });
		const play = () => {
			const s = createGame({ seed: 'dl-det' });
			s.cards.nextCardDay = 99999;
			for (let i = 0; i < 120 && s.outcome.status === 'active'; i++) {
				honestBotTurn(s);
				advance(s, 3, { ignorePause: true });
			}
			return s;
		};
		const a = play();
		expect(serialize(a)).toBe(serialize(play()));
		expect(a.dilemmas.lastDayById).not.toEqual({});
		expect(a.counters.dirtyActions).toBe(0);
	});
});

describe('сейвы v5 → v6', () => {
	it('старый сейв получает поля D-067 по умолчанию и играет дальше', () => {
		const s = fresh('v5');
		const c = spawnCase(s, 'regular', { difficulty: 2 })!;
		s.stateJurisdiction[c.stateId].level = 2;
		applyAction(s, 'player', { type: 'startOp', opType: 'investigation', caseId: c.id, agentIds: [s.agents[0].id] });
		const raw = JSON.parse(serialize(s));
		raw.schemaVersion = 5;
		for (const k of ['dilemmas', 'delayed', 'valuableSource', 'line', 'lineNextOfferDay', 'election', 'history']) delete raw[k];
		for (const x of raw.cases) delete x.tag, delete x.signalRef;
		for (const x of raw.agents) delete x.coverLife;
		for (const op of raw.operations)
			for (const k of ['dilemmaId', 'dilemmaChoice', 'dilemmaBonus', 'warrantSkipped', 'held', 'rolled', 'rollChance', 'forcedSuccess', 'noPlanPoint', 'rewardMult'])
				delete op[k];
		const m = deserialize(raw);
		expect(m.schemaVersion).toBe(SCHEMA_VERSION);
		expect(SCHEMA_VERSION).toBe(7);
		expect(m.dilemmas).toEqual({ nextDay: 0, lastDayById: {}, pending: [], signalReal: {} });
		expect(m.delayed).toEqual([]);
		expect(m.valuableSource).toBeNull();
		expect(m.line).toBeNull();
		expect(m.election).toEqual({ delta: 0, result: null });
		expect(m.history.electionMeddling).toBe('none');
		expect(m.cases.every((x) => x.tag === null && x.signalRef === null)).toBe(true);
		expect(m.agents.every((a) => a.coverLife === false)).toBe(true);
		expect(m.operations[0]).toMatchObject({ dilemmaId: null, dilemmaBonus: 0, held: false, rolled: null, rewardMult: 1 });
		expect(m.rngState).toEqual(s.rngState);
		advance(m, 60, { ignorePause: true });
		expect(m.operations).toHaveLength(0);
	});
});
