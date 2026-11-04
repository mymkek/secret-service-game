// Персонал (§4.2): генерация кандидатов, опыт и уровни, перки, трейты, зарплаты, лимит.
import { BALANCE as B } from './balance';
import { agentCap, levelForXp, salary } from './formulas';
import { addKompromatOnPlayer, aliveRivals, log, newId } from './effects';
import { hash32, pickOne, pickWeightedIndex, randInt, roll } from './rng';
import type { Agent, ContentTraitDef, GameState, OpType, PerkId, Rank, SkillKey, TraitId, TraitModifier } from './types';
import { BUILTIN_TRAITS, PERKS, RANKS, SKILLS } from './types';

/** JP = Σ уровней полномочий по штатам (§4.2.1). */
export function jurisdictionPoints(s: GameState): number {
	let jp = 0;
	for (const j of Object.values(s.stateJurisdiction)) jp += j.level;
	return jp;
}

export function currentAgentCap(s: GameState): number {
	return agentCap(jurisdictionPoints(s), s.departments.operations);
}

export function agentSalary(a: Agent): number {
	return salary(a.rank, a.level, a.salaryMult);
}

export function totalSalaries(s: GameState): number {
	return s.agents.reduce((sum, a) => sum + agentSalary(a), 0);
}

// ------------------------------------------------------------ трейты

export function hasTrait(a: Agent, t: TraitId): boolean {
	return a.traits.includes(t);
}
export function hasPerk(a: Agent, p: PerkId): boolean {
	return a.perks.includes(p);
}

function contentTrait(s: GameState, id: TraitId): ContentTraitDef | undefined {
	return s.config.extraTraits.find((t) => t.id === id);
}

/** Модификаторы контентных трейтов агента (встроенные обрабатываются кодом). */
export function traitModifiers(s: GameState, a: Agent): TraitModifier[] {
	const out: TraitModifier[] = [];
	for (const t of a.traits) {
		const def = contentTrait(s, t);
		if (def) out.push(...def.modifiers);
	}
	return out;
}

/** Агенту нельзя поручать грязное (hero или контентный forbidDirty). */
export function forbidsDirty(s: GameState, a: Agent): boolean {
	return hasTrait(a, 'hero') || traitModifiers(s, a).some((m) => m.kind === 'forbidDirty');
}

export function isWorkaholic(s: GameState, a: Agent): boolean {
	return hasTrait(a, 'workaholic') || traitModifiers(s, a).some((m) => m.kind === 'noOverwork');
}

/** Месячная дельта лояльности от трейтов (§4.2.5). */
export function traitLoyaltyDelta(s: GameState, a: Agent): number {
	let d = 0;
	if (hasTrait(a, 'corrupt')) d += B.TRAIT_CORRUPT.loyaltyPerMonth;
	if (hasTrait(a, 'idealist')) {
		d += B.TRAIT_IDEALIST.loyaltyPerMonth;
		if (s.counters.dirtyThisMonth) d += B.TRAIT_IDEALIST.dirtyPenalty;
	}
	for (const m of traitModifiers(s, a)) if (m.kind === 'loyaltyPerMonth') d += m.value;
	return d;
}

/** Множитель шанса перехода и вербовки кротом (corrupt ×2 и контент). */
export function defectMult(s: GameState, a: Agent): number {
	let m = hasTrait(a, 'corrupt') ? B.TRAIT_CORRUPT.moleMult : 1;
	for (const x of traitModifiers(s, a)) if (x.kind === 'defectMult') m *= x.value;
	return m;
}

/** Засвеченность за операцию от трейтов агента (Болтун и контент). */
export function traitExposurePerOp(s: GameState, a: Agent): number {
	let e = hasTrait(a, 'blabbermouth') ? B.TRAIT_BLABBERMOUTH_EXPOSURE : 0;
	for (const m of traitModifiers(s, a)) if (m.kind === 'exposurePerOp') e += m.value;
	return e;
}

/**
 * Бонус трейтов и перков команды к шансу операции (§5.2, D-039): по каждому id перка
 * или трейта берётся максимум в команде, разные id складываются.
 */
export function teamPerkTraitBonus(s: GameState, team: Agent[], type: OpType): number {
	const best = new Map<string, number>();
	const put = (k: string, v: number) => best.set(k, Math.max(best.get(k) ?? -Infinity, v));
	for (const a of team) {
		if (type === 'investigation' && hasPerk(a, 'analyst')) put('perk:analyst', B.PERK_EFFECTS.analyst.investigation);
		if (type === 'terror' && hasPerk(a, 'marksman')) put('perk:marksman', B.PERK_EFFECTS.marksman.terror);
		if (type === 'surveillance' && hasPerk(a, 'netrunner')) put('perk:netrunner', B.PERK_EFFECTS.netrunner.surveillance);
		if (type === 'terror' && hasTrait(a, 'hero')) put('trait:hero', B.TRAIT_HERO_TERROR_BONUS);
		if (hasTrait(a, 'with_past')) put('trait:with_past', B.TRAIT_WITH_PAST.opBonus);
		for (const t of a.traits) {
			const def = contentTrait(s, t);
			if (!def) continue;
			for (const m of def.modifiers)
				if (m.kind === 'opChance' && (m.opType === 'all' || m.opType === type)) put(`trait:${t}`, m.value);
		}
	}
	let sum = 0;
	for (const v of best.values()) sum += v;
	return sum;
}

// ------------------------------------------------------------ генерация (§4.2.2)

interface GenOptions {
	rank: Rank | null;
	traits: boolean;
}

/** Генерирует агента. Порядок вызовов RNG фиксирован: ранг?, 4 навыка, профиль, лояльность, трейт?, прошлое?. */
export function generateAgent(s: GameState, opt: GenOptions): Agent {
	const rank: Rank =
		opt.rank ??
		RANKS[Math.max(0, pickWeightedIndex(s, RANKS.map((r) => B.HIRE_RANK_WEIGHTS[r])))];
	const [smin, smax] = B.SKILL_RANGE_BY_RANK[rank];
	const skills = { surveillance: 0, combat: 0, interrogation: 0, hacking: 0 };
	for (const k of SKILLS) skills[k] = randInt(s, smin, smax);
	const profile = SKILLS[randInt(s, 0, SKILLS.length - 1)];
	skills[profile] = Math.min(B.SKILL_MAX, skills[profile] + 1);
	const [lmin, lmax] = B.LOYALTY_RANGE_BY_RANK[rank];
	const loyalty = randInt(s, lmin, lmax);
	const traits: TraitId[] = [];
	if (opt.traits) {
		if (roll(s, B.HIRE_TRAIT_CHANCE)) {
			const ids: string[] = [];
			const ws: number[] = [];
			for (const t of BUILTIN_TRAITS) {
				if (t === 'with_past') continue;
				ids.push(t);
				ws.push((B.TRAIT_WEIGHTS as Record<string, number>)[t] ?? 0);
			}
			for (const t of s.config.extraTraits) {
				ids.push(t.id);
				ws.push(t.weight);
			}
			const i = pickWeightedIndex(s, ws);
			if (i >= 0) traits.push(ids[i]);
		}
		if (rank === 'veteran' && roll(s, B.VETERAN_PAST_CHANCE) && !traits.includes('with_past')) traits.push('with_past');
	}
	const level = B.START_LEVEL_BY_RANK[rank];
	const id = newId(s);
	return {
		id,
		nameSeed: hash32(`${s.seed}:agent:${id}`),
		rank,
		level,
		xp: B.XP_LEVEL_THRESHOLDS[level - 1],
		skills,
		profileSkill: profile,
		lastOpSkill: null,
		loyalty,
		salaryMult: B.SALARY_MULTS[0],
		traits,
		perks: [],
		pendingPerks: 0,
		status: 'idle',
		moleFor: null,
		busyStreakDays: 0,
		idleStreakDays: 0,
		successesThisMonth: 0,
		failsThisMonth: 0,
		location: null,
		languages: [],
		legend: null,
		legendBonus: false,
		lastMedalDay: null,
		hiredDay: s.day,
		coverLife: false
	};
}

/** Обновление пула кандидатов (конец месяца, §4.2.2). */
export function refreshHirePool(s: GameState): void {
	s.hirePool = [];
	for (let i = 0; i < B.HIRE_POOL_SIZE; i++) s.hirePool.push(generateAgent(s, { rank: null, traits: true }));
}

/** Принять агента на службу (из пула, переманивания, поглощения). */
export function enlist(s: GameState, a: Agent): void {
	a.hiredDay = s.day;
	a.status = 'idle';
	s.agents.push(a);
	s.agents.sort((x, y) => x.id - y.id);
	if (hasTrait(a, 'with_past')) {
		// При найме случайный соперник получает +1 компромат на игрока (§4.2.5).
		const r = pickOne(s, aliveRivals(s));
		if (r) addKompromatOnPlayer(s, r.id, B.TRAIT_WITH_PAST.rivalKompromat);
	}
}

// ------------------------------------------------------------ опыт и перки (§4.2.3)

export function grantXp(s: GameState, a: Agent, xp: number): void {
	a.xp += xp;
	const newLevel = levelForXp(a.xp);
	while (a.level < newLevel) {
		a.level += 1;
		const sk: SkillKey = a.lastOpSkill ?? a.profileSkill;
		a.skills[sk] = Math.min(B.SKILL_MAX, a.skills[sk] + 1);
		if (a.perks.length + a.pendingPerks < PERKS.length) a.pendingPerks += 1;
		log(s, 'agent_level_up', { agentId: a.id, level: a.level });
	}
}

/** Автовыбор перка: первый ещё не взятый по порядку таблицы (§4.2.3). */
export function autoPickPerk(a: Agent): PerkId | null {
	return PERKS.find((p) => !a.perks.includes(p)) ?? null;
}

export function applyPerk(a: Agent, p: PerkId): void {
	a.perks.push(p);
	a.pendingPerks = Math.max(0, a.pendingPerks - 1);
	if (p === 'iron_will') a.loyalty = Math.max(a.loyalty, B.PERK_EFFECTS.iron_will.loyaltyFloor);
}

export function loyaltyFloor(a: Agent): number {
	return hasPerk(a, 'iron_will') ? B.PERK_EFFECTS.iron_will.loyaltyFloor : 0;
}

export function setLoyalty(a: Agent, v: number): void {
	a.loyalty = Math.min(100, Math.max(loyaltyFloor(a), v));
}

/** Ежедневное обновление счётчиков занятости (§4.2.7). */
export function tickAgentStreaks(s: GameState): void {
	for (const a of s.agents) {
		if (a.status === 'idle') {
			a.idleStreakDays += 1;
			if (a.idleStreakDays >= B.OVERWORK_REST_DAYS) a.busyStreakDays = 0;
		} else {
			a.idleStreakDays = 0;
			a.busyStreakDays += 1;
		}
	}
}
