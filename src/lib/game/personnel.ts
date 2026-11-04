// Шаг 7.4 конца месяца: лояльность, просьбы о прибавке, переходы, кроты, перебежчики (§4.2.7, §6.4).
import { BALANCE as B } from './balance';
import { defectMult, isWorkaholic, setLoyalty, traitLoyaltyDelta, hasTrait } from './agents';
import { defectChance, loyaltyDelta } from './formulas';
import {
	addBudget,
	addExposure,
	addKompromatOnPlayer,
	aliveRivals,
	autopause,
	dept,
	log,
	newId,
	removeAgent
} from './effects';
import { hasOpenQuest, openQuest } from './quest-core';
import { spawnLeader } from './society';
import { pickOne, randInt, roll } from './rng';
import type { Agent, GameState } from './types';

/** Переход агента к врагу (§4.2.7). */
export function defect(s: GameState, a: Agent): void {
	const countryId = a.location && 'countryId' in a.location ? a.location.countryId : null;
	removeAgent(s, a.id);
	const r = pickOne(s, aliveRivals(s));
	if (r) addKompromatOnPlayer(s, r.id, B.DEFECTOR_KOMPROMAT);
	if (countryId && s.networks[countryId]) {
		const n = s.networks[countryId];
		n.level = Math.max(0, n.level - 1);
	}
	const [dmin, dmax] = B.DEFECTOR_RETURN_DELAY_DAYS;
	s.defectors.push({
		id: newId(s),
		agent: { ...a, status: 'idle', location: null, moleFor: null },
		defectedDay: s.day,
		returnDay: s.day + randInt(s, dmin, dmax),
		resolved: false
	});
	log(s, 'agent_defected', { agentId: a.id, to: r?.id ?? null });
	autopause(s, 'agentDefected');
}

export function monthEndPersonnel(s: GameState, paid: boolean): void {
	// 1) Лояльность всех агентов.
	for (const a of [...s.agents]) {
		const d = loyaltyDelta({
			paid,
			salaryMult: a.salaryMult,
			successes: a.successesThisMonth,
			fails: a.failsThisMonth,
			overworked: a.busyStreakDays >= B.OVERWORK_STREAK_DAYS && !isWorkaholic(s, a),
			traitDelta: traitLoyaltyDelta(s, a)
		});
		setLoyalty(a, a.loyalty + d);
		a.successesThisMonth = 0;
		a.failsThisMonth = 0;
		// Коррупционер: раз в месяц мелкая кража (§4.2.5).
		if (hasTrait(a, 'corrupt') && roll(s, B.TRAIT_CORRUPT.theftChance)) {
			addBudget(s, -B.TRAIT_CORRUPT.theftAmount);
			addExposure(s, B.TRAIT_CORRUPT.theftExposure);
			log(s, 'agent_theft', { agentId: a.id });
		}
	}
	s.counters.dirtyThisMonth = false;

	// 2) Броски по полосам лояльности: прибавка (40–69) и переход (< 40).
	const low = B.LOYALTY_BANDS[1];
	const reliable = B.LOYALTY_BANDS[2];
	for (const a of [...s.agents]) {
		if (a.loyalty >= reliable) continue;
		if (a.loyalty >= low) {
			if (roll(s, B.RAISE_REQUEST_CHANCE) && !hasOpenQuest(s, 'raise_request', (p) => p.agentId === a.id))
				openQuest(s, 'raise_request', { agentId: a.id });
			continue;
		}
		if (roll(s, defectChance(a.loyalty, dept(s, 'counterintel'), defectMult(s, a)))) defect(s, a);
	}

	// 3) Кроты: утечка компромата и пассивное раскрытие (§6.4).
	for (const a of [...s.agents]) {
		if (!a.moleFor) continue;
		if (roll(s, B.MOLE_MONTHLY_KOMPROMAT_CHANCE)) {
			const r = s.rivals.find((x) => x.id === a.moleFor);
			if (r?.alive) r.kompromatOnPlayer += 1;
		}
		if (roll(s, B.MOLE_PASSIVE_DETECT_PER_CI * dept(s, 'counterintel'))) {
			removeAgent(s, a.id);
			log(s, 'mole_found', { agentId: a.id, rivalId: a.moleFor });
			autopause(s, 'moleFound');
		}
	}

	// 4) Перебежчики выходят на связь (§4.2.7, D-035).
	for (const d of s.defectors) {
		if (d.resolved || d.returnDay > s.day) continue;
		d.resolved = true;
		if (!roll(s, B.DEFECTOR_RETURN_CHANCE)) continue;
		// §4.2.7: при недовольстве > DEFECTOR_LEADER_MIN_UNREST — бросок «лидер или квест», иначе всегда квест.
		if (s.unrest > B.DEFECTOR_LEADER_MIN_UNREST && roll(s, B.DEFECTOR_LEADER_CHANCE)) {
			spawnLeader(s, 'ex_agent', d.id);
		} else {
			openQuest(s, 'defector_contact', { defectorId: d.id, leaderId: null });
		}
	}
}
