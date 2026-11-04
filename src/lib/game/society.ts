// Засвеченность и скандалы (§2.3), недовольство, лидеры, контроль, протесты, переворот (§4.4).
import { BALANCE as B } from './balance';
import {
	controlValue,
	coupChance,
	exposureMonthlyDelta,
	leaderCap,
	protestCount,
	scandalChance,
	scandalInvestigationRaw,
	scandalRepLoss,
	unrestMonthly
} from './formulas';
import {
	addExposure,
	addInvestigation,
	addReputation,
	addRivalInfluence,
	addUnrest,
	aliveRivals,
	autopause,
	defeat,
	dept,
	log,
	newId,
	setIdle
} from './effects';
import { openQuest } from './quest-core';
import { triggerHearings } from './quest-core';
import { US_STATES } from './geo';
import { pickOne, pickWeightedIndex, roll } from './rng';
import type { GameState, Leader, LeaderArchetype, QuestId } from './types';
import { LEADER_ARCHETYPES } from './types';

export function recomputeControl(s: GameState): void {
	s.control = controlValue(s.reprLevel, s.counters.controlBonus, s.unrest);
}

// ------------------------------------------------------------ §2.3

/** Шаг 7.5: засвеченность и бросок скандала. */
export function monthEndExposure(s: GameState): void {
	const rights = s.leaders.filter((l) => l.archetype === 'rights').length;
	addExposure(
		s,
		exposureMonthlyDelta({ survLevel: s.survLevel, reprLevel: s.reprLevel, unrest: s.unrest, pr: dept(s, 'pr'), rightsLeaders: rights })
	);
	if (roll(s, scandalChance(s.exposure))) scandal(s);
}

export function scandal(s: GameState): void {
	const e = s.exposure;
	const loss = scandalRepLoss(e, dept(s, 'pr'), s.reprLevel);
	log(s, 'scandal', { exposure: e, repLoss: loss });
	addReputation(s, -loss);
	const inv = scandalInvestigationRaw(e);
	if (inv > 0) addInvestigation(s, inv);
	if (e >= B.HEARINGS_EXPOSURE_THRESHOLD) triggerHearings(s, 'scandal');
	addExposure(s, -B.SCANDAL_EXPOSURE_RELEASE);
}

// ------------------------------------------------------------ лидеры (§4.4.5)

export const LEADER_QUEST: Record<LeaderArchetype, QuestId> = {
	union: 'union_meeting',
	blogger: 'blogger_docs',
	rights: 'rally',
	ex_agent: 'defector_contact'
};

function leaderStart(a: LeaderArchetype): number {
	return a === 'blogger' ? B.LEADER_START_INFLUENCE.blogger : B.LEADER_START_INFLUENCE.default;
}
function leaderGrowth(a: LeaderArchetype): number {
	return a === 'blogger' ? B.LEADER_GROWTH.blogger : B.LEADER_GROWTH.default;
}

export function openLeaderQuest(s: GameState, l: Leader): void {
	const q = LEADER_QUEST[l.archetype];
	if (s.quests.some((x) => x.questId === q && x.params.leaderId === l.id)) return;
	openQuest(s, q, { leaderId: l.id, defectorId: l.defectorId });
}

/** Новый лидер в случайном штате (штат — один вызов RNG). */
export function spawnLeader(s: GameState, archetype: LeaderArchetype, defectorId: number | null = null): Leader {
	const stateId = pickOne(s, US_STATES) ?? US_STATES[0];
	const l: Leader = {
		id: newId(s),
		archetype,
		stateId,
		influence: leaderStart(archetype),
		crossed60: false,
		underWatch: false,
		defectorId
	};
	s.leaders.push(l);
	log(s, 'leader_new', { leaderId: l.id, archetype, stateId });
	if (archetype === 'ex_agent') {
		// При появлении: сеть в случайной стране −1.
		const c = pickOne(s, Object.keys(s.networks));
		if (c) s.networks[c].level = Math.max(0, s.networks[c].level - 1);
	}
	openLeaderQuest(s, l);
	return l;
}

export function removeLeader(s: GameState, leaderId: number): void {
	s.leaders = s.leaders.filter((l) => l.id !== leaderId);
	for (const a of s.agents)
		if (a.status === 'embedded' && a.location && 'leaderId' in a.location && a.location.leaderId === leaderId) setIdle(a);
}

export function addLeaderInfluence(s: GameState, l: Leader, delta: number): void {
	l.influence = Math.min(100, Math.max(0, l.influence + delta));
	if (!l.crossed60 && l.influence >= B.LEADER_QUEST_INFLUENCE) {
		l.crossed60 = true;
		openLeaderQuest(s, l);
	}
	if (l.influence <= 0) removeLeader(s, l.id);
}

function monthEndLeaders(s: GameState): void {
	// Рост/спад существующих лидеров.
	for (const l of [...s.leaders]) {
		if (s.unrest >= B.LEADER_SPAWN_THRESHOLD) {
			// «Под колпаком» — влияние растёт вдвое медленнее (§9.5).
			addLeaderInfluence(s, l, leaderGrowth(l.archetype) * (l.underWatch ? 0.5 : 1));
		} else if (s.unrest < B.LEADER_DECLINE_BELOW_UNREST) addLeaderInfluence(s, l, -B.LEADER_DECLINE);
		if (!s.leaders.includes(l)) continue;
		if (l.influence >= 100) {
			const pk = B.LEADER_PEAK_EFFECT;
			if (roll(s, B.LEADER_PEAK_PROTEST_CHANCE)) {
				addUnrest(s, pk.protestUnrest);
				addExposure(s, pk.protestExposure);
				log(s, 'national_protest', { leaderId: l.id });
			} else {
				const r = pickOne(s, aliveRivals(s));
				if (r) addRivalInfluence(r, pk.rivalInfluence);
				log(s, 'leader_backs_rival', { leaderId: l.id, rivalId: r?.id ?? null });
			}
			l.influence = pk.resetTo;
		}
	}
	// Появление.
	if (s.unrest > B.LEADER_SPAWN_THRESHOLD && s.leaders.length < leaderCap(s.unrest)) {
		if (roll(s, B.LEADER_SPAWN_CHANCE)) {
			const weights = LEADER_ARCHETYPES.map((a) => (a === 'ex_agent' && s.defectors.length === 0 ? 0 : 1));
			const i = pickWeightedIndex(s, weights);
			if (i >= 0) {
				const arch = LEADER_ARCHETYPES[i];
				const d = arch === 'ex_agent' ? s.defectors[s.defectors.length - 1] : null;
				spawnLeader(s, arch, d ? d.id : null);
			}
		}
	}
}

// ------------------------------------------------------------ §4.4.3–4.4.4

/** Шаг 7.6: недовольство, лидеры, контроль, протесты, бросок переворота. */
export function monthEndSociety(s: GameState): void {
	// §4.4.3, D-044: вклад правозащитника ×LEADER_RIGHTS_UNREST_MULT.
	const leaderSum = s.leaders.reduce(
		(sum, l) => sum + l.influence * (l.archetype === 'rights' ? B.LEADER_RIGHTS_UNREST_MULT : 1),
		0
	);
	s.unrest = unrestMonthly(s.unrest, s.reprLevel, leaderSum);
	monthEndLeaders(s);
	recomputeControl(s);

	// Протесты: прошлые дежурные возвращаются, новые назначаются на месяц.
	for (const a of s.agents) if (a.status === 'protest_duty') setIdle(a);
	const n = protestCount(s.unrest, s.reprLevel);
	if (n > 0) {
		const idle = s.agents.filter((a) => a.status === 'idle');
		const take = idle.slice(0, n);
		for (const a of take) a.status = 'protest_duty';
		const missing = n - take.length;
		if (missing > 0) addReputation(s, B.PROTEST_MISSING_AGENT_REP * missing);
		log(s, 'protests', { agents: take.length, missing });
	}
	if (s.unrest >= B.RIOT_THRESHOLD) {
		if (roll(s, coupChance(s.unrest))) defeat(s, 'riot');
	}
}

/** Пороговые автопаузы недовольства (§3.4): первый переход 50 и 80. */
export function checkUnrestThresholds(s: GameState): void {
	if (!s.counters.unrest50Seen && s.unrest >= B.PROTEST_THRESHOLD) {
		s.counters.unrest50Seen = true;
		log(s, 'unrest_threshold', { level: B.PROTEST_THRESHOLD });
		autopause(s, 'unrestThreshold');
	}
	if (!s.counters.unrest80Seen && s.unrest >= B.RIOT_THRESHOLD) {
		s.counters.unrest80Seen = true;
		log(s, 'unrest_threshold', { level: B.RIOT_THRESHOLD });
		autopause(s, 'unrestThreshold');
	}
}

/** Откат репрессий (§4.4.3): мгновенно, бесплатно; «Оттепель» при ≥ 2 откатах за 30 дней. */
export function rollbackRepression(s: GameState): void {
	if (s.reprLevel <= 0) return;
	s.reprLevel -= 1;
	recomputeControl(s);
	s.reprRollbacks = s.reprRollbacks.filter((d) => s.day - d < B.THAW_WINDOW_DAYS);
	s.reprRollbacks.push(s.day);
	log(s, 'repr_rollback', { level: s.reprLevel });
	if (s.reprRollbacks.length >= B.THAW_MIN_LEVELS) {
		s.reprRollbacks = [];
		addUnrest(s, B.THAW_EFFECT.unrest);
		addExposure(s, B.THAW_EFFECT.exposure);
		addInvestigation(s, B.THAW_EFFECT.investigation);
		recomputeControl(s);
		log(s, 'thaw', {});
	}
}
