// Исполнение действий ИИ (§6.4). Вызывается через applyAction(state, rivalId, { type: 'ai', action }).
import { BALANCE as B } from '../balance';
import { defectMult } from '../agents';
import { aiDetectChance, aiSuccessChance } from '../formulas';
import {
	addExposure,
	addInvestigation,
	addReputation,
	addRivalInfluence,
	addRivalRep,
	autopause,
	dept,
	log,
	removeAgent,
	rival
} from '../effects';
import { addRivalPlan } from '../rivals';
import { pickOne, roll } from '../rng';
import { US_STATES } from '../geo';
import type { Agent, GameState, RivalId } from '../types';
import { AI_ACTIONS, HOSTILE_AI_ACTIONS, type AiActionType } from './strategy';

export interface AiActionRecord {
	rivalId: RivalId;
	action: AiActionType;
	success: boolean;
	detected: boolean;
}

function minLoyaltyAgent(s: GameState, maxLoyalty: number, needNoMole: boolean): Agent | null {
	let best: Agent | null = null;
	for (const a of s.agents) {
		if (a.loyalty >= maxLoyalty) continue;
		if (needNoMole && a.moleFor !== null) continue;
		if (!best || a.loyalty < best.loyalty) best = a;
	}
	return best;
}

export function isAiAction(x: string): x is AiActionType {
	return (AI_ACTIONS as readonly string[]).includes(x);
}

/** Шанс успеха действия ИИ и его цель-агент (без бросков, только чтение). */
export function rivalActionChance(s: GameState, id: RivalId, action: AiActionType): { p: number; target: Agent | null } {
	const r = rival(s, id);
	const hostile = HOSTILE_AI_ACTIONS.includes(action);
	const ci = dept(s, 'counterintel');
	let base: number = B.AI_ACTION_BASE[action];
	if (action === 'SURVEIL_PLAYER') base += B.AI_SURVEIL_PER_EXPOSURE * s.exposure;
	let target: Agent | null = null;
	if (action === 'POACH_AGENT') {
		target = minLoyaltyAgent(s, B.AI_EFFECTS.POACH_AGENT.maxLoyalty, false);
		if (target) base += B.AI_POACH_PER_LOYALTY * (B.AI_EFFECTS.POACH_AGENT.maxLoyalty - target.loyalty);
	}
	if (action === 'PLANT_MOLE') target = minLoyaltyAgent(s, B.AI_EFFECTS.PLANT_MOLE.maxLoyalty, true);
	let p = aiSuccessChance({ base, shareAi: r.share, counterintel: ci, hostile, police: id === 'police' });
	if (action === 'PLANT_MOLE' && target) {
		// D-040: КР учтена только в общей формуле ИИ; corrupt ×2, затем кламп AI_CHANCE_MAX.
		p = Math.min(B.AI_CHANCE_MAX, p * defectMult(s, target));
	}
	return { p, target };
}

/** Применяет действие ИИ: бросок успеха, бросок обнаружения (враждебные), эффект. */
export function performRivalAction(s: GameState, id: RivalId, action: AiActionType): AiActionRecord {
	const r = rival(s, id);
	const hostile = HOSTILE_AI_ACTIONS.includes(action);
	const ci = dept(s, 'counterintel');
	const { p, target } = rivalActionChance(s, id, action);
	const success = roll(s, p);
	let detected = false;
	if (hostile) detected = roll(s, aiDetectChance(ci));
	const E = B.AI_EFFECTS;
	let attacked: RivalId | null = null;

	if (success) {
		switch (action) {
			case 'WORK_PLAN':
				addRivalPlan(r, E.WORK_PLAN.plan);
				break;
			case 'PR':
				addRivalRep(r, E.PR.rep);
				break;
			case 'LOBBY_SELF':
				addRivalInfluence(r, E.LOBBY_SELF.infl);
				break;
			case 'ATTACK_RIVAL': {
				const others = s.rivals.filter((x) => x.alive && !x.collapsing && x.id !== id);
				const t = pickOne(s, others);
				if (t) addRivalRep(t, E.ATTACK_RIVAL.rep);
				attacked = t?.id ?? null;
				break;
			}
			case 'SURVEIL_PLAYER':
				r.kompromatOnPlayer += E.SURVEIL_PLAYER.kompromat;
				break;
			case 'DIG_DIRECTOR':
				r.kompromatOnPlayer = Math.max(0, r.kompromatOnPlayer - E.DIG_DIRECTOR.kompromatCost);
				addInvestigation(s, E.DIG_DIRECTOR.investigation);
				break;
			case 'LEAK_FAILURES':
				addReputation(s, E.LEAK_FAILURES.rep * Math.max(0, 1 - B.PR_SCANDAL_REDUCTION * dept(s, 'pr')));
				addExposure(s, E.LEAK_FAILURES.exposure);
				break;
			case 'CUT_JURISDICTION': {
				const states = US_STATES.filter((st) => (s.stateJurisdiction[st]?.level ?? 0) >= 1);
				const st = pickOne(s, states);
				if (st) {
					const j = s.stateJurisdiction[st];
					j.level = Math.max(0, j.level - E.CUT_JURISDICTION.levels);
					j.holder = id;
				}
				break;
			}
			case 'PLANT_MOLE':
				if (target) target.moleFor = id;
				break;
			case 'POACH_AGENT':
				if (target) {
					const countryId = target.location && 'countryId' in target.location ? target.location.countryId : null;
					removeAgent(s, target.id);
					if (countryId && s.networks[countryId]) s.networks[countryId].level = Math.max(0, s.networks[countryId].level - 1);
					r.kompromatOnPlayer += E.POACH_AGENT.kompromat;
				}
				break;
		}
	}
	// Лента: открытые действия видны всегда, враждебные — только с установленным источником (§6.4).
	if (!hostile || detected) {
		s.rivalFeed.push({ day: s.day, rivalId: id, action, success, hostile, targetRivalId: attacked });
		const extra = s.rivalFeed.length - B.RIVAL_FEED_MAX_ENTRIES;
		if (extra > 0) s.rivalFeed.splice(0, extra);
	}
	// Журнал разведки: видны только удачные действия и обнаруженные неудачи (§6.4).
	if (hostile && (success || detected)) {
		log(s, 'rival_action', { action, success, targetAgentId: action === 'PLANT_MOLE' ? null : target?.id ?? null }, detected ? id : 'unknown');
		if (success && action === 'POACH_AGENT') autopause(s, 'agentDefected');
	}
	return { rivalId: id, action, success, detected };
}
