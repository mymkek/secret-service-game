// Стратегия ИИ соперника (§6.4): чистая функция от видимого ему состояния + RNG.
// Ядро вызывает её, а выбранное действие проводит через общий applyAction (D-027).
import { BALANCE as B } from '../balance';
import { hostility } from '../formulas';
import { pickWeightedIndex, type RngHolder } from '../rng';
import type { GameState, RivalId } from '../types';

export const AI_ACTIONS = [
	'WORK_PLAN',
	'PR',
	'LOBBY_SELF',
	'ATTACK_RIVAL',
	'SURVEIL_PLAYER',
	'DIG_DIRECTOR',
	'LEAK_FAILURES',
	'CUT_JURISDICTION',
	'PLANT_MOLE',
	'POACH_AGENT'
] as const;
export type AiActionType = (typeof AI_ACTIONS)[number];

export const HOSTILE_AI_ACTIONS: readonly AiActionType[] = [
	'SURVEIL_PLAYER',
	'DIG_DIRECTOR',
	'LEAK_FAILURES',
	'CUT_JURISDICTION',
	'PLANT_MOLE',
	'POACH_AGENT'
];

export type AiStyle = 'mass' | 'intriguer' | 'courtier';

/** То, что ИИ «видит». Никаких скрытых от него полей игрока. */
export interface RivalView {
	id: RivalId;
	style: AiStyle;
	day: number;
	influence: number;
	kompromatOnPlayer: number;
	digBlocked: boolean;
	grudge: boolean;
	favor: boolean;
	coalition: boolean;
	nAlive: number;
	otherAliveRivals: RivalId[];
	player: {
		share: number;
		exposure: number;
		failedRecently: boolean;
		statesWithJurisdiction: number;
		/** Есть агент с лояльностью < порога PLANT_MOLE и без крота. */
		moleCandidate: boolean;
		/** Есть агент с лояльностью < порога POACH_AGENT. */
		poachCandidate: boolean;
		maxNetworkLevel: number;
	};
}

export function buildRivalView(s: GameState, id: RivalId): RivalView {
	const r = s.rivals.find((x) => x.id === id)!;
	// «На грани» (D-059) не входит в N_alive и не цель ATTACK_RIVAL.
	const alive = s.rivals.filter((x) => x.alive && !x.collapsing);
	const lastFail = s.counters.lastPlayerFailDay;
	let maxNet = 0;
	for (const n of Object.values(s.networks)) maxNet = Math.max(maxNet, n.level);
	return {
		id,
		style: B.RIVAL_STYLE[id] as AiStyle,
		day: s.day,
		influence: r.influence,
		kompromatOnPlayer: r.kompromatOnPlayer,
		digBlocked: s.day < r.digBlockedUntilDay,
		grudge: s.day < r.grudgeUntilDay,
		favor: s.day < r.favorUntilDay,
		coalition: s.coalition,
		nAlive: alive.length + 1,
		otherAliveRivals: alive.filter((x) => x.id !== id).map((x) => x.id),
		player: {
			share: s.share,
			exposure: s.exposure,
			failedRecently: lastFail !== null && s.day - lastFail <= B.AI_EFFECTS.LEAK_FAILURES.windowDays,
			statesWithJurisdiction: Object.values(s.stateJurisdiction).filter((j) => j.level >= 1).length,
			moleCandidate: s.agents.some((a) => a.loyalty < B.AI_EFFECTS.PLANT_MOLE.maxLoyalty && a.moleFor === null),
			poachCandidate: s.agents.some((a) => a.loyalty < B.AI_EFFECTS.POACH_AGENT.maxLoyalty),
			maxNetworkLevel: maxNet
		}
	};
}

export function rivalHostility(v: RivalView): number {
	return hostility({
		sharePlayer: v.player.share,
		nAlive: v.nAlive,
		grudge: v.grudge,
		coalition: v.coalition,
		ciaNetwork: v.id === 'cia' && v.player.maxNetworkLevel >= B.AI_HOSTILITY_CIA_NETWORK_LEVEL,
		favor: v.favor
	});
}

/** Допустимо ли действие сейчас (§6.4, колонка «Условие»). */
export function aiActionValid(v: RivalView, a: AiActionType): boolean {
	switch (a) {
		case 'ATTACK_RIVAL':
			return v.otherAliveRivals.length > 0;
		case 'DIG_DIRECTOR':
			return v.kompromatOnPlayer >= B.AI_EFFECTS.DIG_DIRECTOR.kompromatCost && !v.digBlocked;
		case 'LEAK_FAILURES':
			return v.player.failedRecently;
		case 'CUT_JURISDICTION': {
			const min = v.id === 'secret_service' ? B.AI_EFFECTS.CUT_JURISDICTION.minInflSS : B.AI_EFFECTS.CUT_JURISDICTION.minInfl;
			return v.influence >= min && v.player.statesWithJurisdiction > 0;
		}
		case 'PLANT_MOLE':
			return v.player.moleCandidate;
		case 'POACH_AGENT':
			return v.player.poachCandidate;
		default:
			return true;
	}
}

/** Веса действий: AI_WEIGHTS[style], враждебные × H, недопустимые — 0. */
export function aiActionWeights(v: RivalView): number[] {
	const h = rivalHostility(v);
	const table = B.AI_WEIGHTS[v.style] as Record<AiActionType, number>;
	return AI_ACTIONS.map((a) => {
		if (!aiActionValid(v, a)) return 0;
		const w = table[a];
		return HOSTILE_AI_ACTIONS.includes(a) ? w * h : w;
	});
}

/** Стратегия по умолчанию: один вызов RNG (pickWeighted). */
export function chooseRivalAction(v: RivalView, rng: RngHolder): AiActionType | null {
	const i = pickWeightedIndex(rng, aiActionWeights(v));
	return i < 0 ? null : AI_ACTIONS[i];
}
