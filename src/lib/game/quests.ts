// Квесты и решения (§9.5–9.6, §4.2.7): список выборов, их доступность и последствия.
// Тексты и сцены — в Ink (контент). Ядро даёт: точки входа (quest-core.ts + триггеры ниже),
// список выборов с доступностью, применение выбора, таймеры этапов и переменные для Ink.
import { BALANCE as B } from './balance';
import { enlist, setLoyalty } from './agents';
import {
	addBudget,
	addExposure,
	addInfluence,
	addInvestigation,
	addKompromat,
	addKompromatOnPlayer,
	addReputation,
	addRivalInfluence,
	addUnrest,
	agentById,
	aliveRivals,
	dept,
	kompromatActive,
	log,
	markDirty,
	removeAgent,
	setIdle
} from './effects';
import { closeQuest, hasOpenQuest, openQuest } from './quest-core';
import { attemptRecruit, captureAbroad, crossBorder, defaultRecruitMethod, recruitMethodAvailable } from './networks';
import { addRivalPlan } from './rivals';
import { addLeaderInfluence, recomputeControl, rollbackRepression } from './society';
import { clamp } from './formulas';
import { pickOne, randInt, roll } from './rng';
import type { GameState, KompromatItem, QuestId, QuestSession, RecruitMethod, RivalId } from './types';
import { RECRUIT_METHODS } from './types';

export interface QuestChoice {
	id: string;
	available: boolean;
	/** Причина недоступности (ключ для UI). */
	reason: string | null;
	/** Выбору нужен агент: UI показывает выбор из agentIds и передаёт его как param. */
	needsAgent?: true;
	agentIds?: number[];
	/** Выбор тратит компромат: UI может дать выбрать предмет из kompromatIds (param). */
	needsKompromat?: true;
	kompromatIds?: number[];
}

/** Выборы, которым нужен свободный агент (param = agentId). */
export const QUEST_AGENT_CHOICES: Partial<Record<QuestId, readonly string[]>> = {
	hearings: ['scapegoat'],
	union_meeting: ['infiltrate']
};
/** Выборы, которые тратят 1 компромат (param = kompromatId). */
export const QUEST_KOMPROMAT_CHOICES: Partial<Record<QuestId, readonly string[]>> = {
	blogger_docs: ['discredit'],
	informant: ['kompromat'],
	journalist: ['discredit']
};

/** param < 0 (так передаёт Ink) или null — «выбор за ядром»: первый подходящий. */
function normParam(param: number | null | undefined): number | null {
	return param === null || param === undefined || param < 0 ? null : param;
}

const ch = (id: string, ok: boolean, reason: string | null = null): QuestChoice => ({ id, available: ok, reason: ok ? null : reason });

function firstIdle(s: GameState): number | null {
	return s.agents.find((a) => a.status === 'idle')?.id ?? null;
}

function anyKompromat(s: GameState): KompromatItem | null {
	return s.kompromat.find((k) => kompromatActive(s, k)) ?? null;
}

function consumeKompromat(s: GameState, id: number | null): KompromatItem | null {
	const k = id !== null ? s.kompromat.find((x) => x.id === id && kompromatActive(s, x)) : anyKompromat(s);
	if (!k) return null;
	s.kompromat = s.kompromat.filter((x) => x.id !== k.id);
	return k;
}

function leaderOf(s: GameState, q: QuestSession) {
	const id = q.params.leaderId;
	return typeof id === 'number' ? s.leaders.find((l) => l.id === id) ?? null : null;
}

/** «Козёл отпущения» (§6.3): грязное действие, агент удаляется. */
export function scapegoat(s: GameState, agentId: number): boolean {
	const a = agentById(s, agentId);
	if (!a || a.status !== 'idle') return false;
	removeAgent(s, agentId);
	addInvestigation(s, B.ACT_SCAPEGOAT.investigation, false);
	addExposure(s, B.ACT_SCAPEGOAT.exposure);
	for (const o of s.agents) setLoyalty(o, o.loyalty - B.SCAPEGOAT_LOYALTY_PENALTY);
	markDirty(s);
	log(s, 'scapegoat', { agentId });
	return true;
}

function article(s: GameState): void {
	addReputation(s, B.QUEST_JOURNALIST.articleRep);
	addExposure(s, B.QUEST_JOURNALIST.articleExposure);
	log(s, 'journalist_article', {});
}

/** Доступные выборы сессии. Пока сессия ждёт таймер — список пуст. */
export function questChoices(s: GameState, q: QuestSession): QuestChoice[] {
	const base = baseChoices(s, q);
	const ag = QUEST_AGENT_CHOICES[q.questId] ?? [];
	const km = QUEST_KOMPROMAT_CHOICES[q.questId] ?? [];
	return base.map((c) => {
		if (ag.includes(c.id))
			return { ...c, needsAgent: true as const, agentIds: s.agents.filter((a) => a.status === 'idle').map((a) => a.id) };
		if (km.includes(c.id))
			return { ...c, needsKompromat: true as const, kompromatIds: s.kompromat.filter((k) => kompromatActive(s, k)).map((k) => k.id) };
		return c;
	});
}

/** Ошибка выбора с учётом param (агент/компромат), null — можно. */
export function questChoiceError(s: GameState, q: QuestSession, choiceId: string, param: number | null = null): string | null {
	const c = questChoices(s, q).find((x) => x.id === choiceId);
	if (!c) return 'choice_not_found';
	if (!c.available) return c.reason ?? 'choice_unavailable';
	const p = normParam(param);
	if (p !== null && c.needsAgent && !c.agentIds?.includes(p)) return 'agent_busy';
	if (p !== null && c.needsKompromat && !c.kompromatIds?.includes(p)) return 'kompromat_not_found';
	return null;
}

function baseChoices(s: GameState, q: QuestSession): QuestChoice[] {
	if (q.waitUntilDay !== null) return [];
	const idle = firstIdle(s) !== null;
	const komp = anyKompromat(s) !== null;
	const money = (n: number) => s.budget >= n;
	switch (q.questId) {
		case 'hearings':
			return [ch('testify', true), ch('secrecy', true), ch('scapegoat', idle, 'no_idle_agent')];
		case 'raise_request':
			return [ch('accept', true), ch('refuse', true)];
		case 'union_meeting':
			return [ch('concede', true), ch('infiltrate', idle, 'no_idle_agent'), ch('refuse', true)];
		case 'blogger_docs':
			return [
				ch('discredit', komp, 'no_kompromat'),
				ch('deal', money(B.QUEST_BLOGGER.dealCost), 'no_money'),
				ch('detain', s.reprLevel >= 5, 'need_repr5')
			];
		case 'rally':
			return [ch('disperse', true), ch('allow', true), ch('provocateur', true)];
		case 'defector_contact':
			return [ch('return', true), ch('court', dept(s, 'legal') >= B.QUEST_DEFECTOR.courtLegal, 'need_legal3'), ch('ignore', true)];
		case 'informant':
			return [ch('pay', money(B.QUEST_INFORMANT.cost), 'no_money'), ch('kompromat', komp, 'no_kompromat'), ch('report', true)];
		case 'senator_secret': {
			const k = s.kompromat.find((x) => x.id === q.params.kompromatId);
			const usable = !!k && kompromatActive(s, k) && (k.usedCooldownUntil ?? 0) <= s.day;
			return [
				ch('blackmail', usable, 'kompromat_unavailable'),
				ch('hold', true),
				...aliveRivals(s).map((r) => ch(`give:${r.id}`, !!k, 'kompromat_unavailable'))
			];
		}
		case 'evacuation':
			return [ch('evacuate', money(B.EVAC.cost), 'no_money'), ch('stay', true), ...(q.params.checked ? [] : [ch('check', true)])];
		case 'journalist':
			return [
				ch('bribe', money(B.QUEST_JOURNALIST.bribeCost), 'no_money'),
				ch('discredit', komp, 'no_kompromat'),
				ch('detain', s.reprLevel >= 5, 'need_repr5'),
				ch('ignore', true)
			];
		case 'double_agent':
			return [ch('purge', money(B.NET_PURGE.cost), 'no_money'), ch('ignore', true)];
		case 'airport':
			return [ch('flee', true), ch('improvise', true)];
		case 'recruit_retry':
			// D-042: новый выбор способа; недоступные варианты неактивны.
			return RECRUIT_METHODS.map((m) => ch(m, recruitMethodAvailable(s, m), m === 'money' ? 'no_money' : 'no_kompromat'));
		case 'plan_warning':
		case 'director_questioning':
			return [ch('ok', true)];
	}
}

/** Применяет выбор. Возвращает ошибку или null. */
export function resolveQuestChoice(s: GameState, sessionId: number, choiceId: string, param: number | null = null): string | null {
	const q = s.quests.find((x) => x.id === sessionId);
	if (!q) return 'quest_not_found';
	const err = questChoiceError(s, q, choiceId, param);
	if (err) return err;
	log(s, 'quest_choice', { questId: q.questId, choice: choiceId, sessionId });
	const done = applyChoice(s, q, choiceId, normParam(param));
	if (done) closeQuest(s, q.id);
	return null;
}

/** true — сессия закрыта. */
function applyChoice(s: GameState, q: QuestSession, choice: string, param: number | null): boolean {
	const leader = leaderOf(s, q);
	switch (q.questId) {
		case 'hearings': {
			if (choice === 'testify') {
				const t = B.HEARING_TESTIFY;
				addReputation(s, t.reputation);
				addInfluence(s, t.influence);
				addExposure(s, t.exposure);
			} else if (choice === 'secrecy') {
				addInfluence(s, B.HEARING_SECRECY.influence);
				addExposure(s, B.HEARING_SECRECY.exposure);
			} else scapegoat(s, param ?? firstIdle(s)!);
			return true;
		}
		case 'raise_request': {
			const a = agentById(s, Number(q.params.agentId));
			if (a) {
				if (choice === 'accept') {
					const max = B.SALARY_MULTS[B.SALARY_MULTS.length - 1];
					a.salaryMult = Math.min(max, a.salaryMult + B.RAISE_ACCEPT.salaryMultStep);
					setLoyalty(a, a.loyalty + B.RAISE_ACCEPT.loyalty);
				} else setLoyalty(a, a.loyalty + B.RAISE_REFUSE_LOYALTY);
			}
			return true;
		}
		case 'union_meeting': {
			const U = B.QUEST_UNION;
			if (choice === 'concede') {
				rollbackRepression(s);
				if (leader) addLeaderInfluence(s, leader, U.concedeInfl);
				addUnrest(s, U.concedeUnrest);
				return true;
			}
			if (choice === 'refuse') {
				if (leader) {
					addLeaderInfluence(s, leader, U.refuseInfl);
					s.strikes[leader.stateId] = s.day + U.strikeDays;
				}
				return true;
			}
			// infiltrate: агент занят QUEST_ACTION_DAYS, потом бросок.
			const agentId = param ?? firstIdle(s)!;
			const a = agentById(s, agentId);
			if (!a || !leader) return true;
			a.status = 'embedded';
			a.location = { leaderId: leader.id };
			q.params.agentId = agentId;
			q.stage = 'infiltrating';
			q.waitUntilDay = s.day + B.QUEST_ACTION_DAYS;
			return false;
		}
		case 'blogger_docs': {
			const Q = B.QUEST_BLOGGER;
			if (choice === 'discredit') {
				consumeKompromat(s, param);
				markDirty(s);
				if (roll(s, Q.discreditP)) {
					if (leader) addLeaderInfluence(s, leader, Q.discreditInfl);
				} else {
					if (leader) addLeaderInfluence(s, leader, Q.backfireInfl);
					addExposure(s, Q.backfireExposure);
				}
				return true;
			}
			if (choice === 'deal') {
				addBudget(s, -Q.dealCost);
				if (roll(s, Q.returnChance)) {
					q.stage = 'returning';
					q.waitUntilDay = s.day + randInt(s, Q.returnDays[0], Q.returnDays[1]);
					return false;
				}
				return true;
			}
			markDirty(s);
			if (leader) addLeaderInfluence(s, leader, Q.detainInfl);
			if (roll(s, Q.detainProtestP)) addUnrest(s, Q.protestUnrest);
			return true;
		}
		case 'rally': {
			const R = B.QUEST_RALLY;
			if (choice === 'disperse') {
				s.counters.controlBonus += R.disperseControl;
				addUnrest(s, R.disperseUnrest);
				addExposure(s, R.disperseExposure);
				recomputeControl(s);
			} else if (choice === 'allow') {
				if (leader) addLeaderInfluence(s, leader, R.allowInfluence);
				addUnrest(s, R.allowUnrest);
			} else {
				markDirty(s);
				if (roll(s, R.provocateurP)) {
					if (leader) addLeaderInfluence(s, leader, R.provocateurInfl);
				} else {
					addReputation(s, R.failRep);
					addExposure(s, R.failExposure);
				}
			}
			return true;
		}
		case 'defector_contact': {
			const d = s.defectors.find((x) => x.id === q.params.defectorId);
			if (choice === 'return') {
				if (d) {
					const a = { ...d.agent };
					a.loyalty = B.DEFECTOR_RETURN_LOYALTY;
					enlist(s, a);
					s.defectors = s.defectors.filter((x) => x.id !== d.id);
				}
				if (leader) s.leaders = s.leaders.filter((l) => l.id !== leader.id);
			} else if (choice === 'court') {
				if (leader) addLeaderInfluence(s, leader, B.QUEST_DEFECTOR.courtInfl);
			} else {
				const c = pickOne(s, Object.keys(s.networks));
				if (c) s.networks[c].level = Math.max(0, s.networks[c].level + B.QUEST_DEFECTOR.ignoreNet);
			}
			return true;
		}
		case 'informant': {
			const I = B.QUEST_INFORMANT;
			if (choice === 'pay') {
				addBudget(s, -I.cost);
				if (roll(s, I.honestP)) s.counters.informantCasesUntilDay = s.day + I.months * B.DAYS_PER_MONTH;
				else {
					const r = pickOne(s, aliveRivals(s));
					if (r) addKompromatOnPlayer(s, r.id, I.doubleKompromat);
				}
			} else if (choice === 'kompromat') {
				// D-047: вариант «через компромат» — без броска честности.
				consumeKompromat(s, param);
				s.counters.informantCasesUntilDay = s.day + I.kompromatMonths * B.DAYS_PER_MONTH;
			} else {
				addReputation(s, I.policeRep);
				const p = s.rivals.find((r) => r.id === 'police');
				if (p?.alive) addRivalPlan(p, I.policePlan);
			}
			return true;
		}
		case 'senator_secret': {
			const S = B.QUEST_SENATOR;
			const k = s.kompromat.find((x) => x.id === q.params.kompromatId);
			if (choice === 'blackmail' && k) {
				blackmail(s, k);
			} else if (choice.startsWith('give:') && k) {
				const rid = choice.slice(5) as RivalId;
				const r = s.rivals.find((x) => x.id === rid && x.alive);
				if (r) {
					addRivalInfluence(r, S.giveRivalInfl);
					r.favorUntilDay = s.day + S.favorDays;
				}
				s.kompromat = s.kompromat.filter((x) => x.id !== k.id);
			}
			return true;
		}
		case 'evacuation': {
			const a = agentById(s, Number(q.params.agentId));
			const countryId = a?.location && 'countryId' in a.location ? a.location.countryId : null;
			const n = countryId ? s.networks[countryId] : null;
			if (choice === 'evacuate') {
				addBudget(s, -B.EVAC.cost);
				if (n) {
					n.level = Math.max(0, n.level - 1);
					n.agentIds = n.agentIds.filter((x) => x !== a?.id);
				}
				if (a) {
					setIdle(a);
					a.legend = null;
				}
				return true;
			}
			if (choice === 'stay') {
				if (q.params.real && roll(s, B.EVAC.stayCollapse)) {
					if (n) n.level = 0;
					if (a) {
						removeAgent(s, a.id);
						log(s, 'agent_captured', { agentId: a.id });
					}
				}
				return true;
			}
			q.stage = 'checking';
			q.waitUntilDay = s.day + B.EVAC.checkDays;
			return false;
		}
		case 'journalist': {
			const J = B.QUEST_JOURNALIST;
			if (choice === 'bribe') {
				addBudget(s, -J.bribeCost);
				if (!roll(s, J.bribeP)) article(s);
			} else if (choice === 'discredit') {
				consumeKompromat(s, param);
				markDirty(s);
				if (roll(s, J.discreditP)) addExposure(s, J.discreditExposure);
				else article(s);
			} else if (choice === 'detain') {
				markDirty(s);
				addUnrest(s, J.detainUnrest);
				addReputation(s, J.abroadRep);
			} else if (roll(s, J.ignoreP)) article(s);
			return true;
		}
		case 'double_agent': {
			const n = s.networks[String(q.params.countryId)];
			if (choice === 'purge' && n) {
				addBudget(s, -B.NET_PURGE.cost);
				n.purgeUntilDay = s.day + B.NET_PURGE.days;
				n.doubleAgentActive = false;
			}
			return true;
		}
		case 'airport': {
			const m = s.missions.find((x) => x.id === q.params.missionId);
			const a = agentById(s, Number(q.params.agentId));
			if (!m || !a) return true;
			if (choice === 'flee') {
				setIdle(a);
				s.missions = s.missions.filter((x) => x.id !== m.id);
			} else {
				m.borderMult = 2;
				crossBorder(s, m, a);
			}
			return true;
		}
		case 'recruit_retry': {
			const m = s.missions.find((x) => x.id === q.params.missionId);
			const a = agentById(s, Number(q.params.agentId));
			if (m && a) attemptRecruit(s, m, a, choice as RecruitMethod);
			return true;
		}
		case 'plan_warning':
		case 'director_questioning':
			return true;
	}
}

/** Шантаж сенатора (§9.5): компромат не расходуется, откат по сенатору. Грязное. */
export function blackmail(s: GameState, k: KompromatItem): void {
	const S = B.QUEST_SENATOR;
	addInfluence(s, S.blackmailInflBase + S.blackmailInflPerStrength * k.strength);
	k.usedCooldownUntil = s.day + S.cooldownDays;
	markDirty(s);
	if (roll(s, S.scandalP)) {
		addReputation(s, S.scandalRep);
		addExposure(s, S.scandalExposure);
		addInvestigation(s, S.scandalInvestigation);
		log(s, 'blackmail_scandal', { kompromatId: k.id });
	}
}

/** Шаг 2 дня: этапы квестов с таймером. */
export function tickQuests(s: GameState): void {
	for (const q of [...s.quests].sort((a, b) => a.id - b.id)) {
		if (q.waitUntilDay === null || q.waitUntilDay > s.day) continue;
		q.waitUntilDay = null;
		const leader = leaderOf(s, q);
		if (q.questId === 'union_meeting' && q.stage === 'infiltrating') {
			const a = agentById(s, Number(q.params.agentId));
			if (roll(s, B.QUEST_UNION.infiltrateP)) {
				if (leader) leader.underWatch = true;
			} else {
				addExposure(s, B.QUEST_UNION.infiltrateFailExposure);
			}
			if (a && a.status === 'embedded') setIdle(a);
			closeQuest(s, q.id);
		} else if (q.questId === 'blogger_docs' && q.stage === 'returning') {
			if (leader) q.stage = 'choice';
			else closeQuest(s, q.id);
		} else if (q.questId === 'evacuation' && q.stage === 'checking') {
			const a = agentById(s, Number(q.params.agentId));
			if (q.params.real && roll(s, B.EVAC.checkCapture)) {
				// D-041: поимка за рубежом снимает уровни сети по полосе лояльности.
				if (a) captureAbroad(s, a);
				closeQuest(s, q.id);
			} else {
				q.params.checked = true;
				q.stage = 'choice';
			}
		} else q.stage = 'choice';
	}
}

/** Шаг 7.12: ежемесячные триггеры квестов «Прочие» (§9.5). */
export function monthEndQuestTriggers(s: GameState): void {
	const I = B.QUEST_INFORMANT;
	if (s.counters.informantReadyDay <= s.day && roll(s, I.triggerChance)) {
		s.counters.informantReadyDay = s.day + I.cooldownDays;
		openQuest(s, 'informant');
	}
	const S = B.QUEST_SENATOR;
	if (s.survLevel >= S.minSurv && s.counters.senatorQuestReadyDay <= s.day && roll(s, S.triggerChance)) {
		s.counters.senatorQuestReadyDay = s.day + S.cooldownDays;
		const sen = pickOne(s, s.senators);
		if (sen) {
			const id = addKompromat(s, { kind: 'senator', id: sen.id }, 1);
			openQuest(s, 'senator_secret', { kompromatId: id });
		}
	}
	const J = B.QUEST_JOURNALIST;
	const pj = clamp((s.exposure - J.triggerExposure) / J.triggerDiv, 0, J.triggerMax);
	if (roll(s, pj) && !hasOpenQuest(s, 'journalist')) openQuest(s, 'journalist');
}

/** Автоматический выбор (симулятор, тесты): первый доступный вариант. */
export function autoChoice(s: GameState, q: QuestSession): string | null {
	// D-042: без выбора — прежний способ вербовки, иначе RECRUIT_FALLBACK_ORDER.
	if (q.questId === 'recruit_retry' && q.waitUntilDay === null)
		return defaultRecruitMethod(s, String(q.params.previous) as RecruitMethod);
	return questChoices(s, q).find((c) => c.available)?.id ?? null;
}

// ------------------------------------------------------------ интерфейс для Ink (§9)

/** Переменные, которые адаптер Ink выставляет сценарию перед показом (только чтение). */
export function inkVariables(s: GameState, q: QuestSession): Record<string, number | string | boolean | null> {
	return {
		quest_id: q.questId,
		session_id: q.id,
		stage: q.stage,
		day: s.day,
		budget: s.budget,
		reputation: Math.floor(s.reputation),
		influence: Math.floor(s.influence),
		exposure: Math.floor(s.exposure),
		investigation: Math.floor(s.investigation),
		unrest: Math.floor(s.unrest),
		repr_level: s.reprLevel,
		surv_level: s.survLevel,
		legal_level: dept(s, 'legal'),
		...Object.fromEntries(Object.entries(q.params).map(([k, v]) => [`p_${k}`, v]))
	};
}

/** Сохранить непрозрачное состояние Ink в сессии. */
export function setInkState(s: GameState, sessionId: number, json: string | null): void {
	const q = s.quests.find((x) => x.id === sessionId);
	if (q) q.inkStateJson = json;
}

export const QUEST_IDS: readonly QuestId[] = [
	'hearings',
	'raise_request',
	'union_meeting',
	'blogger_docs',
	'rally',
	'defector_contact',
	'informant',
	'senator_secret',
	'evacuation',
	'journalist',
	'double_agent',
	'airport',
	'recruit_retry',
	'plan_warning',
	'director_questioning'
];

