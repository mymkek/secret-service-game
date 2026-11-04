// Сети за рубежом и заброска (§9.1), внедрённые агенты (§5.3), сеть информаторов (§4.4.1).
import { BALANCE as B } from './balance';
import { hasPerk } from './agents';
import { borderFailChance, netAgentProgress, netFailChance, networkCap, zabroskaInfiltrateChance } from './formulas';
import {
	addBudget,
	addExposure,
	addKompromat,
	addKompromatOnPlayer,
	addReputation,
	agentById,
	aliveRivals,
	autopause,
	dept,
	hasTech,
	kompromatActive,
	log,
	removeAgent,
	setIdle
} from './effects';
import { hasOpenQuest, openQuest } from './quest-core';
import { pickOne, roll } from './rng';
import type { Agent, CountryId, GameState, KompromatTarget, Mission, Network, RecruitMethod } from './types';

export function shadowCountries(s: GameState): CountryId[] {
	return B.SHADOW_COUNTRIES[s.config.agency];
}

export function emptyNetwork(): Network {
	return { level: 0, progress: 0, agentIds: [], doubleAgentActive: false, kompromatSource: false, purgeUntilDay: 0 };
}

function countryCi(c: CountryId): number {
	return (B.COUNTRY_CI as Record<string, number>)[c] ?? 0;
}

function cardActive(s: GameState, id: string): boolean {
	return s.cards.active.some((c) => c.id === id && s.day < c.untilDay);
}

/** Полоса лояльности по LOYALTY_BANDS: 0 — 0–19, 1 — 20–39, 2 — 40–69, 3 — 70–100. */
export function loyaltyBand(loyalty: number): number {
	let band = 0;
	for (const edge of B.LOYALTY_BANDS) if (loyalty >= edge) band += 1;
	return band;
}

/**
 * Поимка агента за рубежом (§9.1, D-041): сеть страны −CAPTURE_NET_LEVEL_LOSS[полоса],
 * не ниже 0; агент теряется. Применяется к любой поимке агента, работающего в стране.
 */
export function captureAbroad(s: GameState, a: Agent): void {
	const countryId = a.location && 'countryId' in a.location ? a.location.countryId : null;
	const n = countryId ? s.networks[countryId] : undefined;
	if (n) n.level = Math.max(0, n.level - B.CAPTURE_NET_LEVEL_LOSS[loyaltyBand(a.loyalty)]);
	removeAgent(s, a.id);
	log(s, 'agent_captured', { agentId: a.id, countryId });
}

/** Шаг 7.7: сети по странам в фиксированном порядке, затем внедрённые, затем Репрессии 3. */
export function monthEndNetworks(s: GameState): void {
	const cap = networkCap(s.techs);
	const hasB2 = hasTech(s, 'B2');
	for (const c of shadowCountries(s)) {
		const n = s.networks[c];
		if (!n) continue;
		// 1. Прогресс.
		if (n.purgeUntilDay <= s.day) {
			for (const id of n.agentIds) {
				const a = agentById(s, id);
				if (!a) continue;
				const legend = a.legend ? B.LEGEND_NET_GROWTH[a.legend] : 1;
				n.progress += netAgentProgress(a.skills.surveillance, legend, a.languages.includes(c), hasB2);
			}
		}
		while (n.level < cap && n.progress >= B.NET_PROGRESS_TO_NEXT * (n.level + 1)) {
			n.progress -= B.NET_PROGRESS_TO_NEXT * (n.level + 1);
			n.level += 1;
			log(s, 'network_up', { countryId: c, level: n.level });
		}
		if (n.level >= cap) n.progress = Math.min(n.progress, B.NET_PROGRESS_TO_NEXT * (n.level + 1));
		if (n.level < 1) continue;
		// 2. Добыча компромата.
		if (roll(s, B.NET_KOMPROMAT_PER_LEVEL * n.level)) {
			if (roll(s, B.NET_KOMPROMAT_RIVAL_SHARE)) {
				const r = pickOne(s, aliveRivals(s));
				if (r) addKompromat(s, { kind: 'rival', id: r.id }, 2);
			} else {
				const sen = pickOne(s, s.senators);
				if (sen) {
					const kid = addKompromat(s, { kind: 'senator', id: sen.id }, 2);
					// Компромат на сенатора от сети сразу открывает квест «Сенатор с секретом» (§9.5).
					if (!hasOpenQuest(s, 'senator_secret')) openQuest(s, 'senator_secret', { kompromatId: kid });
				}
			}
		}
		// 3. Провал сети.
		const p = netFailChance({
			level: n.level,
			countryCi: countryCi(c),
			reprLevel: s.reprLevel,
			counterintel: dept(s, 'counterintel'),
			diplomaticCrisis: cardActive(s, 'diplomatic_crisis')
		});
		if (roll(s, p)) {
			const eff = B.NET_FAIL_EFFECT;
			n.level = Math.max(0, n.level + eff.levels);
			const victimId = pickOne(s, n.agentIds);
			const victim = victimId !== null ? agentById(s, victimId) : undefined;
			if (victim) captureAbroad(s, victim);
			addReputation(s, eff.rep);
			const mult = (B.ALLY_COUNTRIES_FAIL_EXPOSURE_MULT as Record<string, number>)[c] ?? 1;
			addExposure(s, eff.exposure * mult);
			log(s, 'network_failed', { countryId: c, level: n.level });
			autopause(s, 'networkFailed');
		}
		// 4. Двойной агент.
		if (n.level >= B.DOUBLE_AGENT_MIN_LEVEL && !n.doubleAgentActive) {
			const mult = n.kompromatSource ? B.RECRUIT_METHODS.kompromat.doubleAgentMult : 1;
			if (roll(s, B.DOUBLE_AGENT_CHANCE * mult)) {
				n.doubleAgentActive = true;
				openQuest(s, 'double_agent', { countryId: c });
			}
		}
		if (n.doubleAgentActive) {
			const cia = s.rivals.find((r) => r.id === 'cia');
			if (cia?.alive) addKompromatOnPlayer(s, 'cia', 1);
		}
	}
	// 5. Просьбы об эвакуации (§9.5) — по агенту за рубежом.
	for (const a of [...s.agents]) {
		if (a.status !== 'abroad' || !a.location || !('countryId' in a.location)) continue;
		if (s.missions.some((m) => m.agentId === a.id)) continue;
		if (roll(s, B.EVAC_REQUEST_CHANCE) && !hasOpenQuest(s, 'evacuation', (p) => p.agentId === a.id)) {
			const real = roll(s, B.EVAC.realThreat);
			openQuest(s, 'evacuation', { agentId: a.id, real, checked: false });
		}
	}
	monthEndEmbedded(s);
	// Сеть информаторов (Репрессии 3).
	if (s.reprLevel >= 3 && roll(s, B.REPR_L3_KOMPROMAT_CHANCE)) {
		const targets: KompromatTarget[] = [
			...s.leaders.map((l): KompromatTarget => ({ kind: 'leader', id: l.id })),
			...aliveRivals(s).map((r): KompromatTarget => ({ kind: 'rival', id: r.id }))
		];
		const t = pickOne(s, targets);
		if (t) addKompromat(s, t, B.REPR_L3_KOMPROMAT_STRENGTH);
	}
}

/** Внедрённые агенты: добыча и раскрытие (§5.3). */
function monthEndEmbedded(s: GameState): void {
	for (const a of [...s.agents]) {
		if (a.status !== 'embedded' || !a.location) continue;
		if ('rivalId' in a.location) {
			const rid = a.location.rivalId;
			if (roll(s, B.EMBED_KOMPROMAT_CHANCE)) addKompromat(s, { kind: 'rival', id: rid }, B.EMBED_KOMPROMAT_STRENGTH);
			if (roll(s, B.EMBED_DETECT_CHANCE)) {
				setIdle(a);
				a.loyalty = Math.max(0, a.loyalty + B.OP_INFILTRATION_FAIL.loyalty);
				addExposure(s, B.OP_INFILTRATION_FAIL.exposure);
				addKompromatOnPlayer(s, rid, B.OP_INFILTRATION_FAIL.rivalKompromat);
				log(s, 'embedded_exposed', { agentId: a.id, rivalId: rid });
			}
		} else if ('leaderId' in a.location) {
			if (roll(s, B.EMBED_DETECT_CHANCE)) {
				const lid = a.location.leaderId;
				setIdle(a);
				a.loyalty = Math.max(0, a.loyalty + B.OP_INFILTRATION_FAIL.loyalty);
				addExposure(s, B.OP_INFILTRATION_FAIL.exposure);
				const l = s.leaders.find((x) => x.id === lid);
				if (l) l.underWatch = false;
				log(s, 'embedded_exposed', { agentId: a.id, leaderId: lid });
			}
		}
	}
}

// ------------------------------------------------------------ заброска (таймеры, шаг 2 дня)

function legendInfiltrateBonus(m: Mission, a: Agent): number {
	let b = B.LEGEND_INFILTRATE_BONUS[m.legend];
	if (m.prepared) b += B.ZABROSKA_PREP_BONUS;
	if (a.legendBonus) b += B.TRAINING_LEGEND_BONUS;
	if (hasPerk(a, 'cold_blooded')) b += B.PERK_EFFECTS.cold_blooded.infiltrate;
	return b;
}

/** Бросок на границе и «узнали в аэропорту». Возвращает false, если миссия окончена. */
export function crossBorder(s: GameState, m: Mission, a: Agent): boolean {
	const p =
		borderFailChance(B.LEGEND_BORDER_FAIL[m.legend], a.languages.includes(m.countryId), hasPerk(a, 'cold_blooded')) *
		m.borderMult;
	if (roll(s, Math.min(1, p))) {
		removeAgent(s, a.id);
		log(s, 'agent_captured', { agentId: a.id, countryId: m.countryId, stage: 'border' });
		return false;
	}
	a.status = 'abroad';
	a.location = { countryId: m.countryId };
	if (m.borderMult === 1 && roll(s, B.AIRPORT_RECOGNIZED_CHANCE)) {
		m.stage = 'infiltrate';
		m.stageEndDay = Number.MAX_SAFE_INTEGER; // ждём выбора в квесте «аэропорт»
		openQuest(s, 'airport', { missionId: m.id, agentId: a.id });
		return true;
	}
	m.stage = 'infiltrate';
	m.stageEndDay = s.day + B.ZABROSKA_INFILTRATE_DAYS;
	return true;
}

/** Доступен ли способ вербовки сейчас (D-037: деньги — только при budget ≥ цены). */
export function recruitMethodAvailable(s: GameState, method: RecruitMethod): boolean {
	if (method === 'money') return s.budget >= B.RECRUIT_METHODS.money.cost;
	if (method === 'kompromat') return s.kompromat.some((x) => kompromatActive(s, x));
	return true;
}

/** Способ без выбора игрока (D-042): прежний, иначе первый доступный из RECRUIT_FALLBACK_ORDER. */
export function defaultRecruitMethod(s: GameState, preferred: RecruitMethod): RecruitMethod {
	if (recruitMethodAvailable(s, preferred)) return preferred;
	for (const m of B.RECRUIT_FALLBACK_ORDER as RecruitMethod[]) if (recruitMethodAvailable(s, m)) return m;
	return 'ideology';
}

/** Попытка вербовки источника выбранным способом (§9.1, шаг 4). */
export function attemptRecruit(s: GameState, m: Mission, a: Agent, method: RecruitMethod): void {
	m.recruit = method;
	if (method === 'kompromat') {
		const k = s.kompromat.find((x) => kompromatActive(s, x));
		if (k) s.kompromat = s.kompromat.filter((x) => x.id !== k.id);
	} else if (method === 'money') addBudget(s, -B.RECRUIT_METHODS.money.cost);
	if (roll(s, B.RECRUIT_METHODS[method].p)) {
		const n = s.networks[m.countryId];
		if (n.level === 0) n.level = 1;
		if (method === 'kompromat') n.kompromatSource = true;
		n.agentIds.push(a.id);
		a.status = 'abroad';
		a.location = { countryId: m.countryId };
		a.legend = m.legend;
		s.missions = s.missions.filter((x) => x.id !== m.id);
		log(s, 'source_recruited', { agentId: a.id, countryId: m.countryId, method });
	} else {
		// Через RECRUIT_RETRY_DAYS — новый выбор способа (D-042), см. tickMissions.
		m.stageEndDay = s.day + B.RECRUIT_RETRY_DAYS;
		log(s, 'recruit_failed', { agentId: a.id, countryId: m.countryId });
	}
}

/** Шаг 2 дня: этапы заброски в порядке id. */
export function tickMissions(s: GameState): void {
	for (const m of [...s.missions].sort((x, y) => x.id - y.id)) {
		if (m.stageEndDay > s.day) continue;
		const a = agentById(s, m.agentId);
		if (!a) {
			s.missions = s.missions.filter((x) => x.id !== m.id);
			continue;
		}
		switch (m.stage) {
			case 'prep':
				crossBorder(s, m, a);
				break;
			case 'infiltrate': {
				const p = zabroskaInfiltrateChance(a.skills.surveillance, legendInfiltrateBonus(m, a));
				a.legendBonus = false;
				if (roll(s, p)) {
					m.stage = 'recruit';
					attemptRecruit(s, m, a, defaultRecruitMethod(s, m.recruit));
				} else {
					setIdle(a);
					addExposure(s, B.ZABROSKA_FAIL_EXPOSURE);
					s.missions = s.missions.filter((x) => x.id !== m.id);
					log(s, 'zabroska_failed', { agentId: a.id, countryId: m.countryId });
				}
				break;
			}
			case 'recruit':
				// Повтор: шаг квеста с выбором способа; миссия ждёт решения.
				m.stageEndDay = Number.MAX_SAFE_INTEGER;
				openQuest(s, 'recruit_retry', { missionId: m.id, agentId: a.id, previous: m.recruit });
				break;
			case 'recall':
				setIdle(a);
				a.legend = null;
				s.missions = s.missions.filter((x) => x.id !== m.id);
				log(s, 'agent_returned', { agentId: a.id });
				break;
		}
	}
}
