// Карточки шанса (§7): колода с весами, откат, требования, немедленное применение.
import { BALANCE as B } from './balance';
import { addBudget, addExposure, addInfluence, addInvestigation, addReputation, addRivalInfluence, addRivalRep, addUnrest, aliveRivals, autopause, dept, hasTech, log, month } from './effects';
import { triggerHearings } from './quest-core';
import { addRivalPlan } from './rivals';
import { spawnCase } from './ops';
import { pickOne, pickWeightedIndex, randInt } from './rng';
import type { CardEffect, CardRequirement, CardTarget, ContentCardDef, GameState, Rival } from './types';

export const BUILTIN_CARDS = [
	'defense_cut',
	'terror_attack',
	'document_leak',
	'congress_hearings',
	'blockbuster',
	'surveillance_program_leak',
	'budget_surplus',
	'police_brutality',
	'diplomatic_crisis',
	'cyber_attack',
	'president_demands'
] as const;
export type BuiltinCardId = (typeof BUILTIN_CARDS)[number];

function rivalAlive(s: GameState, id: string): boolean {
	return s.rivals.some((r) => r.id === id && r.alive);
}

function builtinWeight(s: GameState, id: BuiltinCardId): number {
	const w = (B.CARD_WEIGHTS as Record<string, number>)[id] ?? 0;
	switch (id) {
		case 'surveillance_program_leak':
			if (s.survLevel < B.CARD_SURV_LEAK.minSurv) return 0;
			return w * Math.max(0, 1 - B.CARD_SURV_LEAK.ciWeightReduction * dept(s, 'counterintel'));
		case 'police_brutality':
			// D-047: карточки для выбывшего ведомства имеют вес 0.
			return rivalAlive(s, 'police') ? w : 0;
		default:
			return w;
	}
}

export function requirementMet(s: GameState, r: CardRequirement): boolean {
	switch (r.kind) {
		case 'minSurv':
			return s.survLevel >= r.value;
		case 'minRepr':
			return s.reprLevel >= r.value;
		case 'minDept':
			return dept(s, r.dept) >= r.value;
		case 'minExposure':
			return s.exposure >= r.value;
		case 'maxExposure':
			return s.exposure <= r.value;
		case 'tech':
			return hasTech(s, r.tech);
		case 'rivalAlive':
			return rivalAlive(s, r.rival);
		case 'minMonth':
			return month(s) >= r.value;
	}
}

function contentWeight(s: GameState, c: ContentCardDef): number {
	return c.requires.every((r) => requirementMet(s, r)) ? c.weight : 0;
}

/** Колода: id и текущие веса (0 — на откате или не выполнены требования). */
export function deck(s: GameState): { ids: string[]; weights: number[] } {
	const ids: string[] = [];
	const weights: number[] = [];
	const cooldown = (id: string) => (s.cards.cooldowns[id] ?? 0) > s.day;
	for (const id of BUILTIN_CARDS) {
		ids.push(id);
		weights.push(cooldown(id) ? 0 : builtinWeight(s, id));
	}
	for (const c of s.config.extraCards) {
		ids.push(c.id);
		weights.push(cooldown(c.id) ? 0 : contentWeight(s, c));
	}
	return { ids, weights };
}

function activate(s: GameState, id: string, months: number, params: Record<string, number | string | boolean | null>): void {
	s.cards.active.push({ id, untilDay: s.day + months * B.DAYS_PER_MONTH, params });
}

/** Шаг 6 дня: тянем карточку, если пора. */
export function maybeDrawCard(s: GameState): string | null {
	if (s.day < s.cards.nextCardDay) return null;
	s.cards.nextCardDay = s.day + randInt(s, B.CARD_INTERVAL_MIN_DAYS, B.CARD_INTERVAL_MAX_DAYS);
	const { ids, weights } = deck(s);
	const i = pickWeightedIndex(s, weights);
	if (i < 0) return null;
	const id = ids[i];
	s.cards.cooldowns[id] = s.day + B.CARD_REPEAT_COOLDOWN_DAYS;
	applyCard(s, id);
	autopause(s, 'chanceCard');
	return id;
}

export function applyCard(s: GameState, id: string): void {
	const data: Record<string, number | string | boolean | null> = { cardId: id };
	switch (id) {
		case 'defense_cut':
			activate(s, id, B.CARD_DEFENSE_CUT.months, { incomeMult: B.CARD_DEFENSE_CUT.incomeMult });
			break;
		case 'budget_surplus':
			activate(s, id, B.CARD_BUDGET_SURPLUS.months, { incomeMult: B.CARD_BUDGET_SURPLUS.incomeMult });
			break;
		case 'terror_attack': {
			const t = B.CARD_TERROR_ATTACK;
			const c = spawnCase(s, 'terror', { difficulty: t.difficulty, timerDays: t.timerDays, source: 'card_terror' });
			if (c) {
				c.raceDay = s.day + randInt(s, t.raceDays[0], t.raceDays[1]);
				c.raceBonus = t.bonus;
				data.caseId = c.id;
			}
			break;
		}
		case 'document_leak': {
			// Цель случайная: вес игрока = засвеченность, у каждого ИИ — 20.
			const L = B.CARD_DOCUMENT_LEAK;
			const rivals = aliveRivals(s);
			const i = pickWeightedIndex(s, [s.exposure, ...rivals.map(() => L.aiTargetWeight)]);
			if (i === 0) {
				addReputation(s, L.rep * Math.max(0, 1 - B.PR_SCANDAL_REDUCTION * dept(s, 'pr')));
				addExposure(s, L.exposure);
				data.target = 'player';
			} else if (i > 0) {
				addRivalRep(rivals[i - 1], L.rep);
				data.target = rivals[i - 1].id;
			}
			break;
		}
		case 'congress_hearings': {
			// §7, D-047: игрок при E ≥ playerExposureThreshold, иначе случайный живой ИИ.
			const H = B.CARD_HEARINGS_AI;
			if (s.exposure >= H.playerExposureThreshold) {
				triggerHearings(s, 'card');
				data.target = 'player';
			} else {
				const r = pickOne(s, aliveRivals(s));
				if (r) {
					addRivalRep(r, H.rep);
					r.hearingMult = H.weightMult;
					data.target = r.id;
				}
			}
			break;
		}
		case 'blockbuster': {
			const r = randInt(s, 0, aliveRivals(s).length);
			if (r === 0) {
				addReputation(s, B.CARD_BLOCKBUSTER_REP);
				data.target = 'player';
			} else {
				const rv = aliveRivals(s)[r - 1];
				addRivalRep(rv, B.CARD_BLOCKBUSTER_REP);
				data.target = rv.id;
			}
			break;
		}
		case 'surveillance_program_leak':
			addExposure(s, B.CARD_SURV_LEAK.exposure);
			addReputation(s, B.CARD_SURV_LEAK.rep);
			triggerHearings(s, 'card');
			break;
		case 'police_brutality': {
			const p = s.rivals.find((r) => r.id === 'police');
			if (p?.alive) addRivalRep(p, B.CARD_POLICE_BRUTALITY_REP);
			break;
		}
		case 'diplomatic_crisis':
			activate(s, id, B.CARD_DIPLOMATIC_CRISIS.months, {});
			break;
		case 'cyber_attack': {
			const c = B.CARD_CYBER_ATTACK;
			const cs = spawnCase(s, 'regular', {
				difficulty: c.difficulty,
				timerDays: c.timerDays,
				rewardMult: c.rewardMult,
				source: 'card_cyber',
				minCyber: c.minCyber
			});
			if (cs) data.caseId = cs.id;
			break;
		}
		case 'president_demands':
			s.plan.nextTargetMult *= B.CARD_PRESIDENT_DEMANDS_PLAN_MULT;
			break;
		default: {
			const def = s.config.extraCards.find((c) => c.id === id);
			if (def) for (const e of def.effects) applyCardEffect(s, id, e);
		}
	}
	log(s, 'chance_card', data);
}

function cardTargets(s: GameState, t: CardTarget): ('player' | Rival)[] {
	const rivals = aliveRivals(s);
	switch (t) {
		case 'player':
			return ['player'];
		case 'all':
			return ['player', ...rivals];
		case 'random_rival': {
			const r = pickOne(s, rivals);
			return r ? [r] : [];
		}
		default: {
			const r = rivals.find((x) => x.id === t);
			return r ? [r] : [];
		}
	}
}

/** Интерпретатор эффектов контентных карточек (закрытый набор, content-schema.ts). */
export function applyCardEffect(s: GameState, cardId: string, e: CardEffect): void {
	switch (e.kind) {
		case 'reputation':
			for (const t of cardTargets(s, e.target)) t === 'player' ? addReputation(s, e.value) : addRivalRep(t, e.value);
			break;
		case 'influence':
			for (const t of cardTargets(s, e.target)) t === 'player' ? addInfluence(s, e.value) : addRivalInfluence(t, e.value);
			break;
		case 'exposure':
			addExposure(s, e.value);
			break;
		case 'investigation':
			addInvestigation(s, e.value);
			break;
		case 'unrest':
			addUnrest(s, e.value);
			break;
		case 'budget':
			addBudget(s, e.value);
			break;
		case 'incomeMult':
			activate(s, cardId, e.months, { incomeMult: e.value });
			break;
		case 'rivalPlan':
			for (const t of cardTargets(s, e.target)) if (t !== 'player') addRivalPlan(t, e.value);
			break;
		case 'hearings':
			triggerHearings(s, 'card');
			break;
		case 'spawnCase':
			spawnCase(s, e.caseKind, { difficulty: e.difficulty, timerDays: e.timerDays, rewardMult: e.rewardMult, source: 'random' });
			break;
		case 'planTargetMult':
			s.plan.nextTargetMult *= e.value;
			break;
	}
}

/** Снимает истёкшие активные карточки (вызывается в конце месяца). */
export function pruneActiveCards(s: GameState): void {
	s.cards.active = s.cards.active.filter((c) => c.untilDay > s.day);
}
