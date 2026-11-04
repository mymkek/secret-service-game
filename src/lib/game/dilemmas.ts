// Дилеммы операций (§9.8), выборы с дилеммой «Материал на кандидата» (§9.7), отложенные последствия
// (шаг 4а дня), «Ценный источник» (шаг 7.7). Окна дилемм — обычные квест-сессии (quest-core.ts),
// выборы и их доступность отдаёт dilemmaChoices, применяет applyDilemmaChoice (через quests.ts).
// Все броски — seeded RNG партии; скрытые итоги лежат в state (dilemmas.signalReal, delayed[], history),
// но не в params сессии: params видит UI и Ink.
import { BALANCE as B } from './balance';
import { setLoyalty } from './agents';
import {
	addExposure,
	addInfluence,
	addInvestigation,
	addReputation,
	addUnrest,
	agentById,
	dept,
	dirtyExposureMult,
	log,
	markDirty,
	month,
	rival,
	autopause
} from './effects';
import { clamp, monthOfDay } from './formulas';
import { applyOperationResult, computeOpShownChance, opChanceArgs, rollOperation, signalMissed, spawnCase } from './ops';
import { closeQuest, hasOpenQuest, openQuest, triggerHearings } from './quest-core';
import { pickWeightedIndex, randInt, roll, shuffle } from './rng';
import { forgetSignal, riskLevel, scheduleDelayed, signalIsReal } from './dilemma-state';
import { US_STATES } from './geo';
import type {
	DilemmaPhase,
	DilemmaQuestId,
	GameState,
	OpDilemmaId,
	Operation,
	PendingDilemma,
	QuestSession,
	RiskLevel
} from './types';
import { DILEMMA_QUEST_IDS, OP_DILEMMA_IDS, RIVAL_IDS } from './types';

/** Выбор окна дилеммы или линейки (подмножество QuestChoice из quests.ts, без цикла импорта). */
export interface DilemmaChoice {
	id: string;
	available: boolean;
	reason: string | null;
	/** Вариант с пометкой «грязное» (§9.8): грязное действие, закрывает «Чистые руки». */
	dirty?: true;
	/** Скрытый риск — только метка (§9.8, DILEMMA_RISK_LABELS). */
	risk?: RiskLevel;
	/** Точный шанс, если ГДД велит его показывать (этапы линейки §9.9, §10.3). */
	chance?: number;
	needsAgent?: true;
	agentIds?: number[];
}

export const OP_DILEMMA_QUEST: Record<OpDilemmaId, DilemmaQuestId> = {
	valuable_source: 'dilemma_valuable_source',
	forced_confession: 'dilemma_forced_confession',
	sting: 'dilemma_sting',
	share_with_cia: 'dilemma_share_with_cia',
	fudged_warrant: 'dilemma_fudged_warrant',
	cover_life: 'dilemma_cover_life'
};

/** Точные id выборов каждой сессии в порядке вариантов (0 — по умолчанию, его берёт бот). */
export const DILEMMA_CHOICE_IDS: Record<DilemmaQuestId, readonly string[]> = {
	dilemma_valuable_source: ['arrest', 'recruit'],
	dilemma_source_crime: ['surrender', 'blind_eye'],
	dilemma_forced_confession: ['by_the_book', 'press', 'deal'],
	dilemma_sting: ['observe', 'provoke'],
	dilemma_quiet_signal: ['wait', 'legal', 'wiretap', 'detain'],
	dilemma_share_with_cia: ['keep', 'share'],
	dilemma_fudged_warrant: ['wait', 'fudge'],
	dilemma_cover_life: ['forbid', 'allow'],
	dilemma_election_dossier: ['silent', 'announce', 'leak'],
	vanguard_offer: ['decline', 'start', 'alone', 'partner'],
	vanguard_stage2: ['cautious', 'devoted', 'recall'],
	vanguard_stage3: ['evidence', 'provoke', 'quiet', 'recall'],
	vanguard_stage4: ['go', 'recall'],
	vanguard_result: ['ok']
};

export function isDilemmaQuest(id: string): id is DilemmaQuestId {
	return (DILEMMA_QUEST_IDS as readonly string[]).includes(id);
}

/** Модальные окна (§3.4, §9.8): время не идёт, пока не сделан выбор. Итог линейки — не модальный. */
export function isModalQuest(id: string): boolean {
	return isDilemmaQuest(id) && id !== 'vanguard_result';
}

/** Открытое модальное окно, которое ждёт выбора (для advance и UI). */
export function blockingSession(s: GameState): QuestSession | null {
	return s.quests.find((q) => isModalQuest(q.questId) && q.waitUntilDay === null) ?? null;
}

function phaseOf(id: OpDilemmaId): DilemmaPhase {
	return (B.DILEMMA_PHASE as Record<OpDilemmaId, DilemmaPhase>)[id];
}

function stingCaseActive(s: GameState): boolean {
	return s.cases.some((c) => c.tag === 'sting');
}

function ciaAvailable(s: GameState): boolean {
	const cia = s.rivals.find((r) => r.id === 'cia');
	return !!cia && cia.alive && !cia.collapsing;
}

/** Уровень полномочий в штате дела операции (0 — «нет» или дела нет). */
function opCaseJurisdiction(s: GameState, op: Operation): number {
	const c = op.caseId !== null ? s.cases.find((x) => x.id === op.caseId) : undefined;
	return c ? s.stateJurisdiction[c.stateId]?.level ?? 0 : 0;
}

function warrantLength(op: Operation): number {
	return op.warrantEndDay - op.startDay;
}

/** Условие назначения (§9.8, D-069: при назначении у дилеммы с невыполненным условием вес 0). */
function startConditionOk(s: GameState, id: OpDilemmaId, op: Operation): boolean {
	switch (id) {
		case 'valuable_source':
			return op.difficulty >= B.DL_VALUABLE_SOURCE.minDifficulty && s.valuableSource === null;
		case 'forced_confession':
			// D-068, D-069: «дело буксует» — по p_shown (§5.2, без крота), иначе окно выдавало бы крота.
			// При назначении — по стартовой команде, в фазе (phaseConditionOk) — по текущей.
			return (
				op.difficulty >= B.DL_FORCED_CONFESSION.minDifficulty &&
				computeOpShownChance(s, opChanceArgs(s, op)) < B.DL_FORCED_CONFESSION.maxChance
			);
		case 'sting':
			// D-068: полномочия в штате дела не «нет» (§5.4) — иначе дело-провокация игроку недоступно.
			// Проверяется и при назначении, и на фазе mid (phaseConditionOk → startConditionOk).
			return op.difficulty <= B.DL_STING.maxDifficulty && !stingCaseActive(s) && opCaseJurisdiction(s, op) >= 1;
		case 'share_with_cia':
			return ciaAvailable(s);
		case 'fudged_warrant':
			return warrantLength(op) >= B.DL_FUDGED_WARRANT.minWarrantDays;
		case 'cover_life':
			return true;
	}
}

/** Условие на момент фазы (§9.8): условие назначения заново, у «Ценного источника» ещё успех; иначе сгорает. */
function phaseConditionOk(s: GameState, id: OpDilemmaId, op: Operation): boolean {
	if (id === 'valuable_source') return op.rolled === true && startConditionOk(s, id, op);
	return startConditionOk(s, id, op);
}

/** §9.8: повтор той же дилеммы. У «Тихого сигнала» свой DL_SIGNAL.repeatCooldownDays (0, D-068). */
function repeatCooldown(id: string): number {
	return id === 'quiet_signal' ? B.DL_SIGNAL.repeatCooldownDays : B.DILEMMA_REPEAT_COOLDOWN_DAYS;
}

function repeatOk(s: GameState, id: string): boolean {
	const last = s.dilemmas.lastDayById[id];
	return last === undefined || s.day - last >= repeatCooldown(id);
}

function markAssigned(s: GameState, id: string): void {
	s.dilemmas.nextDay = s.day + B.DILEMMA_COOLDOWN_DAYS;
	s.dilemmas.lastDayById[id] = s.day;
}

/**
 * §9.8: назначение операционной дилеммы при старте операции игрока (из startOp).
 * day ≥ nextDay → roll(DILEMMA_OP_CHANCE); при успехе pickWeighted по DILEMMA_WEIGHTS среди подходящих.
 */
export function assignOpDilemma(s: GameState, op: Operation): void {
	if (s.day < s.dilemmas.nextDay) return;
	if (!roll(s, B.DILEMMA_OP_CHANCE)) return;
	const types = B.DILEMMA_OP_TYPE as Record<OpDilemmaId, string>;
	const weights = OP_DILEMMA_IDS.map((id) =>
		types[id] === op.type && repeatOk(s, id) && startConditionOk(s, id, op) ? (B.DILEMMA_WEIGHTS as Record<string, number>)[id] ?? 0 : 0
	);
	const i = pickWeightedIndex(s, weights);
	if (i < 0) return;
	const id = OP_DILEMMA_IDS[i];
	// D-069: запоминаем, что ставит назначение, чтобы сгоревшая дилемма вернула откаты.
	const p: PendingDilemma = {
		dilemmaId: id,
		opId: op.id,
		phase: phaseOf(id),
		assignedDay: s.day,
		prevLastDay: s.dilemmas.lastDayById[id] ?? null
	};
	markAssigned(s, id);
	op.dilemmaId = id;
	if (p.phase === 'start') openAtPhase(s, p, op);
	else s.dilemmas.pending.push(p);
}

/**
 * §9.8, D-069: дилемма сгорела (условие фазы, отмена, провал для end_success, фаза не достигнута).
 * Игрок окна не видел, поэтому откаты, которые поставила она, снимаются. RNG не вызывается.
 * Запись из старого сейва (assignedDay = null) откаты не возвращает.
 */
function burn(s: GameState, p: PendingDilemma, why: string): void {
	log(s, 'dilemma_burned', { dilemmaId: p.dilemmaId, opId: p.opId, why });
	if (p.assignedDay === null || p.assignedDay === undefined) return;
	const d = s.dilemmas;
	// После неё ничего не назначалось — глобальный откат снимается.
	if (d.nextDay === p.assignedDay + B.DILEMMA_COOLDOWN_DAYS) d.nextDay = s.day;
	if (d.lastDayById[p.dilemmaId] === p.assignedDay) {
		if (p.prevLastDay === null || p.prevLastDay === undefined) delete d.lastDayById[p.dilemmaId];
		else d.lastDayById[p.dilemmaId] = p.prevLastDay;
	}
}

/** Открыть окно в фазе; false — условие не выполнено, дилемма сгорела. */
function openAtPhase(s: GameState, p: PendingDilemma, op: Operation): boolean {
	s.dilemmas.pending = s.dilemmas.pending.filter((x) => x !== p);
	if (!phaseConditionOk(s, p.dilemmaId, op)) {
		burn(s, p, 'condition');
		return false;
	}
	const c = op.caseId !== null ? s.cases.find((x) => x.id === op.caseId) : undefined;
	const params: QuestSession['params'] = { opId: op.id, opType: op.type, difficulty: op.difficulty, phase: p.phase };
	if (c) {
		params.caseId = c.id;
		params.stateId = c.stateId;
	}
	if (p.dilemmaId === 'fudged_warrant') params.warrantDays = warrantLength(op);
	if (p.dilemmaId === 'cover_life' && op.agentIds.length > 0) params.agentId = op.agentIds[0];
	op.held = true;
	openQuest(s, OP_DILEMMA_QUEST[p.dilemmaId], params);
	return true;
}

/**
 * Закрыть всё, что связано с операцией (отмена, операция исчезла): ждущая дилемма сгорает и снимает
 * откаты (D-069); уже открытое окно игрок видел — его откаты остаются.
 */
export function dropOpDilemmas(s: GameState, opId: number): void {
	for (const p of s.dilemmas.pending.filter((x) => x.opId === opId)) burn(s, p, 'cancelled');
	s.dilemmas.pending = s.dilemmas.pending.filter((x) => x.opId !== opId);
	for (const q of s.quests.filter((x) => isDilemmaQuest(x.questId) && x.params.opId === opId)) closeQuest(s, q.id);
}

/** Шаг 2 дня (операции): уборка и открытие дилемм фазы mid в день 50 % прогресса. */
export function tickOpDilemmas(s: GameState): void {
	const alive = new Set(s.operations.map((o) => o.id));
	for (const p of s.dilemmas.pending.filter((x) => !alive.has(x.opId))) dropOpDilemmas(s, p.opId);
	for (const q of s.quests.filter((x) => isDilemmaQuest(x.questId) && typeof x.params.opId === 'number' && !alive.has(x.params.opId as number)))
		closeQuest(s, q.id);
	for (const op of [...s.operations].sort((a, b) => a.id - b.id)) {
		const p = s.dilemmas.pending.find((x) => x.opId === op.id && x.phase === 'mid');
		if (!p) continue;
		if (s.day >= op.startDay + Math.ceil((op.endDay - op.startDay) / 2)) openAtPhase(s, p, op);
	}
}

/**
 * Шаг 3 дня (§3.3): операции с истёкшим таймером в порядке id: дилемма end_before_roll, бросок,
 * дилемма end_success, последствия. Пока окно открыто, операция ждёт; следующие — после выбора.
 */
export function completeDueOperations(s: GameState): void {
	const due = s.operations.filter((o) => o.endDay <= s.day).sort((a, b) => a.id - b.id);
	for (const op of due) {
		if (!s.operations.includes(op)) continue;
		if (op.held) break;
		const pending = s.dilemmas.pending.find((x) => x.opId === op.id);
		if (op.rolled === null) {
			if (pending?.phase === 'end_before_roll' && openAtPhase(s, pending, op)) break;
			const r = rollOperation(s, op);
			op.rolled = r.success;
			op.rollChance = r.p;
		}
		const after = s.dilemmas.pending.find((x) => x.opId === op.id && x.phase === 'end_success');
		if (after) {
			if (op.rolled) {
				if (openAtPhase(s, after, op)) break;
			} else {
				s.dilemmas.pending = s.dilemmas.pending.filter((x) => x !== after);
				burn(s, after, 'failed');
			}
		}
		// Фаза, которую операция так и не достигла (например, mid у короткой операции), сгорает.
		for (const p of s.dilemmas.pending.filter((x) => x.opId === op.id)) burn(s, p, 'not_reached');
		applyOperationResult(s, op, op.rolled === true, op.rollChance ?? 0);
	}
}

// ------------------------------------------------------------ начало месяца: выборы, сигнал (§3.3 шаг 4)

/** Плановые события начала месяца после дел без таймера: «Материал на кандидата», «Тихий сигнал». */
export function monthStartDilemmas(s: GameState): void {
	const m = month(s);
	// §9.8 (8): плановое, один раз, без отката.
	if (m === B.ELECTION_MONTH + B.DL_ELECTION_DOSSIER.monthOffset && s.dilemmas.lastDayById.election_dossier === undefined) {
		s.dilemmas.lastDayById.election_dossier = s.day;
		openQuest(s, 'dilemma_election_dossier', { electionMonth: B.ELECTION_MONTH });
	}
	// §9.8 (4): «Тихий сигнал» — глобальный откат и свой повтор DL_SIGNAL.repeatCooldownDays (D-068).
	const S = B.DL_SIGNAL;
	if (m >= S.minMonth && s.day >= s.dilemmas.nextDay && repeatOk(s, 'quiet_signal') && roll(s, S.chancePerMonth)) {
		const si = pickWeightedIndex(s, US_STATES.map((id) => s.config.stateCaseWeights[id] ?? 1));
		const real = roll(s, S.realChance);
		markAssigned(s, 'quiet_signal');
		s.history.signals += 1;
		if (real) s.history.signalsReal += 1;
		const q = openQuest(s, 'dilemma_quiet_signal', { stateId: US_STATES[Math.max(0, si)] });
		q.params.signalId = q.id;
		s.dilemmas.signalReal[String(q.id)] = real;
	}
}

// ------------------------------------------------------------ конец месяца: «Ценный источник» (шаг 7.7)

/** §9.8: бросок разоблачения источника, затем бросок «Источник замешан в убийстве». */
export function monthEndSource(s: GameState): void {
	const src = s.valuableSource;
	if (!src) return;
	const V = B.DL_VALUABLE_SOURCE;
	if (src.crimes >= 1 && roll(s, Math.min(V.exposeK * src.crimes, V.exposeMax))) {
		const n = src.crimes;
		s.valuableSource = null;
		s.history.sourceExposed = true;
		addReputation(s, V.exposeRepPerCrime * n);
		addExposure(s, V.exposeExposurePerCrime * n);
		addInvestigation(s, V.exposeInvestigationPerCrime * n);
		log(s, 'source_exposed', { crimes: n });
		for (const q of s.quests.filter((x) => x.questId === 'dilemma_source_crime')) closeQuest(s, q.id);
		triggerHearings(s, 'source_exposed');
		return;
	}
	if (roll(s, V.crimeChance) && !hasOpenQuest(s, 'dilemma_source_crime')) openQuest(s, 'dilemma_source_crime', { crimes: src.crimes });
}

// ------------------------------------------------------------ отложенные последствия (шаг 4а)

/** Шаг 4а дня: отложенные последствия с dueDay ≤ day в порядке id. */
export function processDelayed(s: GameState): void {
	const due = s.delayed.filter((d) => d.dueDay <= s.day).sort((a, b) => a.id - b.id);
	if (due.length === 0) return;
	s.delayed = s.delayed.filter((d) => d.dueDay > s.day);
	for (const d of due) {
		switch (d.kind) {
			case 'false_confession': {
				const F = B.DL_FORCED_CONFESSION;
				const c = spawnCase(s, 'regular', {
					difficulty: Math.min(5, Number(d.params.difficulty) + 1),
					stateId: String(d.params.stateId),
					source: 'dilemma',
					tag: 'real_culprit'
				});
				log(s, 'false_confession_culprit', { caseId: c?.id ?? null, stateId: String(d.params.stateId) });
				if (roll(s, F.reviewChance)) {
					addReputation(s, F.reviewRep);
					addInvestigation(s, F.reviewInvestigation);
					s.history.falseReviews += 1;
					log(s, 'false_confession_review', { stateId: String(d.params.stateId) });
				}
				break;
			}
			case 'sting_judge': {
				const T = B.DL_STING;
				if (roll(s, T.judgeChance)) {
					addReputation(s, T.judgeRep);
					addInvestigation(s, T.judgeInvestigation);
					s.history.stingsExposed += 1;
					log(s, 'sting_judge', { stateId: d.params.stateId ?? null });
				}
				break;
			}
			case 'signal_attack': {
				const S = B.DL_SIGNAL;
				addReputation(s, S.attackRep);
				addInfluence(s, S.attackInfluence);
				s.history.missedSignals += 1;
				log(s, 'signal_attack', { signalId: d.params.signalId ?? null });
				triggerHearings(s, 'signal_attack');
				break;
			}
			case 'fudge_audit': {
				const W = B.DL_FUDGED_WARRANT;
				if (roll(s, W.caughtChance)) {
					addInvestigation(s, W.caughtInvestigation);
					addReputation(s, W.caughtRep);
					s.history.fudgeCaught += 1;
					log(s, 'fudge_caught', {});
				}
				break;
			}
			case 'line_provoke': {
				const L = B.LINE_PROVOKE;
				if (roll(s, L.exposeChance)) {
					addReputation(s, L.rep);
					addInvestigation(s, L.investigation);
					addExposure(s, L.exposure);
					s.history.lineExposed += 1;
					log(s, 'line_exposed', {});
					triggerHearings(s, 'line_exposed');
				}
				break;
			}
			// Раскрытие слива на выборах в delayed[] не попадает: бросок — в runElection (§9.7, D-068).
		}
	}
}

// ------------------------------------------------------------ выборы (§9.7)

/** Выборы «в начале месяца ELECTION_MONTH» (= конец предыдущего, шаг 7.12). */
export function runElection(s: GameState): void {
	// Окно «Материал на кандидата», так и не решённое к выборам, считается «Молчать».
	for (const q of s.quests.filter((x) => x.questId === 'dilemma_election_dossier')) closeQuest(s, q.id);
	const D = B.DL_ELECTION_DOSSIER;
	const meddling = s.history.electionMeddling;
	const p = clamp(B.ELECTION_NEW_ADMIN_CHANCE + s.election.delta, B.ELECTION_CHANCE_MIN, B.ELECTION_CHANCE_MAX);
	if (roll(s, p)) {
		if (meddling === 'none') {
			const mults = shuffle(s, B.ELECTION_PRIORITY_MULTS);
			s.priorityMult = mults[0];
			RIVAL_IDS.forEach((id, i) => (rival(s, id).priorityMult = mults[i + 1]));
		} else {
			// Новая власть помнит вмешательство: игроку meddleLosePriority, остальные три — соперникам.
			const rest = [...B.ELECTION_PRIORITY_MULTS];
			rest.splice(rest.indexOf(D.meddleLosePriority), 1);
			const mults = shuffle(s, rest);
			s.priorityMult = D.meddleLosePriority;
			RIVAL_IDS.forEach((id, i) => (rival(s, id).priorityMult = mults[i]));
		}
		addInfluence(s, s.influence * (B.ELECTION_INFLUENCE_MULT - 1));
		s.presidentTerm += 1;
		s.kompromat = s.kompromat.filter((k) => k.target.kind !== 'president');
		s.election.result = 'new_admin';
	} else {
		if (meddling !== 'none') s.priorityMult = D.meddleWinPriority;
		s.election.result = 'reelected';
	}
	log(s, 'election', { newAdmin: s.election.result === 'new_admin', priorityMult: s.priorityMult, meddling });
	if (meddling === 'leak' && roll(s, D.leakRevealChance)) {
		addInvestigation(s, D.leakRevealInvestigation);
		addReputation(s, D.leakRevealRep);
		s.history.leakRevealed = true;
		log(s, 'election_leak_revealed', {});
	}
	autopause(s, 'election');
}

// ------------------------------------------------------------ выборы в окнах дилемм

const ch = (id: string, ok: boolean, reason: string | null = null, extra: Partial<DilemmaChoice> = {}): DilemmaChoice => ({
	id,
	available: ok,
	reason: ok ? null : reason,
	...extra
});

function opOf(s: GameState, q: QuestSession): Operation | null {
	const id = q.params.opId;
	return typeof id === 'number' ? s.operations.find((o) => o.id === id) ?? null : null;
}

/** Выборы окон дилемм §9.8 (без линейки). */
export function dilemmaChoices(s: GameState, q: QuestSession): DilemmaChoice[] {
	switch (q.questId) {
		case 'dilemma_valuable_source':
			return [ch('arrest', true), ch('recruit', true, null, { risk: riskLevel(B.DL_VALUABLE_SOURCE.crimeChance) })];
		case 'dilemma_source_crime': {
			const V = B.DL_VALUABLE_SOURCE;
			const crimes = (s.valuableSource?.crimes ?? 0) + 1;
			return [ch('surrender', true), ch('blind_eye', true, null, { dirty: true, risk: riskLevel(Math.min(V.exposeK * crimes, V.exposeMax)) })];
		}
		case 'dilemma_forced_confession':
			return [ch('by_the_book', true), ch('press', true, null, { dirty: true, risk: riskLevel(B.DL_FORCED_CONFESSION.falseChance) }), ch('deal', true)];
		case 'dilemma_sting':
			return [ch('observe', true), ch('provoke', !stingCaseActive(s), 'sting_active', { dirty: true, risk: riskLevel(B.DL_STING.judgeChance) })];
		case 'dilemma_quiet_signal': {
			const S = B.DL_SIGNAL;
			// Метка — по вероятности скрытого плохого исхода варианта (теракт; у «Задержать» — невиновный).
			return [
				ch('wait', true, null, { risk: riskLevel(S.realChance) }),
				ch('legal', true, null, { risk: riskLevel(S.realChance * (1 - S.legalCatch)) }),
				ch('wiretap', dept(s, 'cyber') >= S.dirtyMinCyber, 'need_cyber1', { dirty: true, risk: riskLevel(S.realChance * (1 - S.dirtyCatch)) }),
				ch('detain', s.reprLevel >= S.detainMinRepr, 'need_repr5', { dirty: true, risk: riskLevel(1 - S.realChance) })
			];
		}
		case 'dilemma_share_with_cia':
			return [ch('keep', true), ch('share', ciaAvailable(s), 'rival_dead')];
		case 'dilemma_fudged_warrant':
			return [ch('wait', true), ch('fudge', true, null, { dirty: true, risk: riskLevel(B.DL_FUDGED_WARRANT.caughtChance) })];
		case 'dilemma_cover_life':
			return [ch('forbid', true), ch('allow', true, null, { risk: riskLevel(B.DL_COVER_LIFE.scandalChance) })];
		case 'dilemma_election_dossier':
			return [ch('silent', true), ch('announce', true), ch('leak', true, null, { dirty: true, risk: riskLevel(B.DL_ELECTION_DOSSIER.leakRevealChance) })];
		default:
			return [];
	}
}

function dirtyExp(s: GameState, v: number): void {
	addExposure(s, v * dirtyExposureMult(s));
}

/**
 * Применяет выбор окна дилеммы. Возвращает true — сессия закрыта.
 * Операционные дилеммы в фазах завершения после выбора доводят операцию до конца (и следующие за ней).
 */
export function applyDilemmaChoice(s: GameState, q: QuestSession, choice: string): boolean {
	const op = opOf(s, q);
	if (op) {
		op.dilemmaChoice = choice;
		op.held = false;
	}
	switch (q.questId) {
		case 'dilemma_valuable_source':
			if (choice === 'recruit' && op) {
				op.noPlanPoint = true;
				s.valuableSource = { sinceDay: s.day, crimes: 0 };
			}
			break;
		case 'dilemma_source_crime': {
			const V = B.DL_VALUABLE_SOURCE;
			if (!s.valuableSource) break;
			if (choice === 'surrender') {
				s.valuableSource = null;
				addReputation(s, V.surrenderRep);
				log(s, 'source_lost', {});
			} else {
				markDirty(s);
				dirtyExp(s, V.blindEyeExposure);
				s.valuableSource.crimes += 1;
				s.history.informantCrimes += 1;
			}
			break;
		}
		case 'dilemma_forced_confession': {
			const F = B.DL_FORCED_CONFESSION;
			if (!op) break;
			if (choice === 'press') {
				markDirty(s);
				op.forcedSuccess = true;
				s.history.forcedConfessions += 1;
				if (roll(s, F.falseChance)) {
					s.history.falseConfessions += 1;
					const c = s.cases.find((x) => x.id === op.caseId);
					const [a, b] = F.delayDays;
					scheduleDelayed(s, 'false_confession', s.day + randInt(s, a, b), { stateId: c?.stateId ?? null, difficulty: op.difficulty });
				}
			} else if (choice === 'deal') {
				op.forcedSuccess = true;
				op.noPlanPoint = true;
				op.rewardMult = F.dealRewardMult;
			}
			break;
		}
		case 'dilemma_sting': {
			const T = B.DL_STING;
			const c = op ? s.cases.find((x) => x.id === op.caseId) : undefined;
			if (choice === 'provoke' && c) {
				// D-068: дело-провокация доступно и при частичных полномочиях (caseAccessible, §5.4).
				markDirty(s);
				const sc = spawnCase(s, 'terror', {
					difficulty: T.caseDifficulty,
					timerDays: T.timerDays,
					rewardMult: T.rewardMult,
					stateId: c.stateId,
					source: 'dilemma',
					tag: 'sting'
				});
				s.history.stings += 1;
				if (roll(s, T.wouldntActChance)) s.history.stingsWouldntAct += 1;
				log(s, 'sting_case', { caseId: sc?.id ?? null, stateId: c.stateId });
			}
			break;
		}
		case 'dilemma_quiet_signal':
			applySignalChoice(s, q, choice);
			break;
		case 'dilemma_share_with_cia': {
			const C = B.DL_SHARE_CIA;
			if (choice === 'share' && op) {
				op.dilemmaBonus += C.chanceBonus;
				const cia = rival(s, 'cia');
				cia.favorUntilDay = Math.max(cia.favorUntilDay, s.day + C.favorDays);
				s.history.sharedWithCia += 1;
			}
			break;
		}
		case 'dilemma_fudged_warrant': {
			const W = B.DL_FUDGED_WARRANT;
			if (choice === 'fudge' && op) {
				markDirty(s);
				const duration = op.endDay - op.warrantEndDay;
				op.warrantEndDay = s.day;
				op.endDay = s.day + duration;
				op.warrantSkipped = true;
				op.dilemmaBonus += W.chanceBonus;
				s.history.warrantsFudged += 1;
				const [a, b] = W.delayDays;
				scheduleDelayed(s, 'fudge_audit', s.day + randInt(s, a, b));
			}
			break;
		}
		case 'dilemma_cover_life': {
			const C = B.DL_COVER_LIFE;
			const a = op ? agentById(s, op.agentIds[0]) : undefined;
			if (!op) break;
			if (choice === 'forbid') {
				op.dilemmaBonus += C.forbidChance;
				if (a) setLoyalty(a, a.loyalty + C.forbidLoyalty);
			} else {
				op.dilemmaBonus += C.allowChance;
				if (a) setLoyalty(a, a.loyalty + C.allowLoyalty);
				s.history.coverRomances += 1;
			}
			break;
		}
		case 'dilemma_election_dossier': {
			const D = B.DL_ELECTION_DOSSIER;
			if (choice === 'announce') {
				addReputation(s, D.publicRep);
				addInfluence(s, D.publicInfluence);
				s.election.delta += D.publicAdminDelta;
				s.history.electionMeddling = 'public';
			} else if (choice === 'leak') {
				markDirty(s);
				dirtyExp(s, D.leakExposure);
				s.election.delta += D.leakAdminDelta;
				s.history.electionMeddling = 'leak';
			} else s.history.electionMeddling = 'none';
			break;
		}
	}
	closeQuest(s, q.id);
	// Операция, ждавшая выбора в фазе завершения, завершается сейчас; за ней — остальные просроченные.
	if (op && op.endDay <= s.day) completeDueOperations(s);
	return true;
}

function applySignalChoice(s: GameState, q: QuestSession, choice: string): void {
	const S = B.DL_SIGNAL;
	const id = Number(q.params.signalId);
	const real = signalIsReal(s, id);
	const stateId = String(q.params.stateId);
	switch (choice) {
		case 'wait':
			signalMissed(s, id);
			break;
		case 'legal': {
			const c = spawnCase(s, 'regular', { difficulty: S.caseDifficulty, stateId, source: 'dilemma', tag: 'signal', signalRef: id });
			log(s, 'signal_case', { caseId: c?.id ?? null, stateId });
			if (!c) signalMissed(s, id);
			break;
		}
		case 'wiretap':
			markDirty(s);
			dirtyExp(s, S.dirtyExposure);
			if (real) {
				if (roll(s, S.dirtyCatch)) {
					s.plan.points += S.dirtyPlanPoints;
					addReputation(s, S.dirtyRep);
					s.history.signalsPreventedDirty += 1;
					forgetSignal(s, id);
					log(s, 'signal_prevented', { signalId: id, method: 'wiretap', stateId });
				} else signalMissed(s, id);
			} else {
				s.history.innocentsSurveilled += 1;
				forgetSignal(s, id);
			}
			break;
		case 'detain':
			markDirty(s);
			addUnrest(s, S.detainUnrest);
			dirtyExp(s, S.detainExposure);
			if (real) {
				s.history.signalsPreventedDirty += 1;
				log(s, 'signal_prevented', { signalId: id, method: 'detain', stateId });
			} else {
				addReputation(s, S.detainInnocentRep);
				s.history.innocentsDetained += 1;
				log(s, 'signal_false_alarm', { signalId: id, stateId });
			}
			forgetSignal(s, id);
			break;
	}
}

/** Месяц партии по дню (для тестов и селекторов). */
export function electionMonthReached(s: GameState): boolean {
	return monthOfDay(s.day) >= B.ELECTION_MONTH;
}
