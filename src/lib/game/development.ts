// Развитие ведомства (§4.1, §4.3, §4.4.1, §4.5): требования, стройки, исследования, обучение.
import { BALANCE as B } from './balance';
import { grantXp } from './agents';
import { deptBuildDays, deptCost, scaledDays, techCost, techDays } from './formulas';
import { addUnrest, agentById, dept, hasTech, log, markDirty, setIdle } from './effects';
import { recomputeControl } from './society';
import type { DeptKey, GameState, TechId } from './types';

// ------------------------------------------------------------ требования

/** Формат req (Приложение A.0): все поля — минимумы, выполняются одновременно. */
export interface Requirement {
	surv?: number;
	repr?: number;
	dept?: Partial<Record<DeptKey, number>>;
	tech?: TechId[];
}

/** Требования уровня репрессий (A.8 REPR_REQUIREMENTS, индекс = уровень − 1). */
export function reprRequirement(level: number): Requirement {
	return (B.REPR_REQUIREMENTS as Requirement[])[level - 1] ?? {};
}

export interface TechNode {
	branch: string;
	tier: number;
	req: Requirement;
}

/** Узел дерева технологий (A.9 TECH_TREE). */
export function techNode(t: TechId): TechNode {
	return (B.TECH_TREE as Record<TechId, TechNode>)[t];
}

export function meetsRequirement(s: GameState, r: Requirement): boolean {
	if (r.surv !== undefined && s.survLevel < r.surv) return false;
	if (r.repr !== undefined && s.reprLevel < r.repr) return false;
	if (!meetsDepts(s, r.dept)) return false;
	return (r.tech ?? []).every((t) => hasTech(s, t));
}

function deptReqs(d: DeptKey, level: number): Partial<Record<DeptKey, number>> {
	const table = (B.DEPT_REQUIREMENTS as Record<string, Record<string, Partial<Record<DeptKey, number>>>>)[d] ?? {};
	const out: Partial<Record<DeptKey, number>> = {};
	for (const [lv, req] of Object.entries(table)) {
		if (Number(lv) > level) continue;
		for (const [k, v] of Object.entries(req)) out[k as DeptKey] = Math.max(out[k as DeptKey] ?? 0, v ?? 0);
	}
	return out;
}

function meetsDepts(s: GameState, req: Partial<Record<DeptKey, number>> | undefined): boolean {
	if (!req) return true;
	return Object.entries(req).every(([k, v]) => dept(s, k as DeptKey) >= (v ?? 0));
}

export function canBuildDept(s: GameState, d: DeptKey): string | null {
	const next = s.departments[d] + 1;
	if (next > B.DEPT_MAX_LEVEL) return 'max_level';
	if (s.builds.some((b) => b.kind === 'dept' && b.dept === d)) return 'already_building';
	if (!meetsDepts(s, deptReqs(d, next))) return 'requirements';
	if (s.budget < deptCost(next)) return 'no_money';
	return null;
}

export function canBuildSurv(s: GameState): string | null {
	const next = s.survLevel + 1;
	if (next > B.SURV_COST_BY_LEVEL.length) return 'max_level';
	if (s.builds.some((b) => b.kind === 'surv')) return 'already_building';
	if (dept(s, 'cyber') < B.SURV_REQ_CYBER[next - 1]) return 'requirements';
	if (next === 6 && !hasTech(s, B.SURV_L6_REQ_TECH as TechId)) return 'requirements';
	if (s.budget < B.SURV_COST_BY_LEVEL[next - 1]) return 'no_money';
	return null;
}

export function canBuildRepr(s: GameState): string | null {
	const next = s.reprLevel + 1;
	if (next > B.REPR_COST_BY_LEVEL.length) return 'max_level';
	if (s.builds.some((b) => b.kind === 'repr')) return 'already_building';
	if (!meetsRequirement(s, reprRequirement(next))) return 'requirements';
	if (s.budget < B.REPR_COST_BY_LEVEL[next - 1]) return 'no_money';
	return null;
}

export function canResearch(s: GameState, t: TechId): string | null {
	if (s.research) return 'research_busy';
	if (hasTech(s, t)) return 'already_known';
	const node = techNode(t);
	// Технологии своей ветки в req — это порядок ярусов (для UI отдельный код previous_tier).
	const sameBranch = (node.req.tech ?? []).filter((x) => techNode(x).branch === node.branch);
	if (sameBranch.some((x) => !hasTech(s, x))) return 'previous_tier';
	if (node.tier === 3 && s.apexChosen !== null && s.apexChosen !== t) return 'apex_locked';
	if (!meetsRequirement(s, node.req)) return 'requirements';
	if (s.budget < techCost(t)) return 'no_money';
	return null;
}

// ------------------------------------------------------------ запуск

export function startDeptBuild(s: GameState, d: DeptKey): void {
	const L = s.departments[d] + 1;
	s.budget -= deptCost(L);
	s.builds.push({ id: s.nextId++, kind: 'dept', dept: d, targetLevel: L, doneDay: s.day + deptBuildDays(L) });
}

export function startSurvBuild(s: GameState): void {
	const L = s.survLevel + 1;
	s.budget -= B.SURV_COST_BY_LEVEL[L - 1];
	s.builds.push({ id: s.nextId++, kind: 'surv', dept: null, targetLevel: L, doneDay: s.day + B.SURV_BUILD_DAYS_PER_LEVEL * L });
}

export function startReprBuild(s: GameState): void {
	const L = s.reprLevel + 1;
	s.budget -= B.REPR_COST_BY_LEVEL[L - 1];
	s.builds.push({ id: s.nextId++, kind: 'repr', dept: null, targetLevel: L, doneDay: s.day + B.REPR_BUILD_DAYS });
}

export function startResearch(s: GameState, t: TechId): void {
	s.budget -= techCost(t);
	s.research = { techId: t, startDay: s.day, doneDay: s.day + scaledDays(techDays(t), 1) };
	if (techNode(t).tier === 3) s.apexChosen = t;
}

// ------------------------------------------------------------ шаг 2 дня: таймеры

export function tickTrainings(s: GameState): void {
	for (const t of [...s.trainings].sort((a, b) => a.id - b.id)) {
		if (t.doneDay > s.day) continue;
		s.trainings = s.trainings.filter((x) => x.id !== t.id);
		const a = agentById(s, t.agentId);
		if (!a) continue;
		if (t.course === 'skill' && t.skill) a.skills[t.skill] = Math.min(B.TRAINING_SKILL_CAP, a.skills[t.skill] + 1);
		if (t.course === 'language' && t.countryId && !a.languages.includes(t.countryId)) a.languages.push(t.countryId);
		if (t.course === 'legend') a.legendBonus = true;
		if (a.status === 'training') setIdle(a);
		grantXp(s, a, B.XP_TRAINING);
		log(s, 'training_done', { agentId: a.id, course: t.course });
	}
}

export function tickBuilds(s: GameState): void {
	for (const b of [...s.builds].sort((x, y) => x.id - y.id)) {
		if (b.doneDay > s.day) continue;
		s.builds = s.builds.filter((x) => x.id !== b.id);
		if (b.kind === 'dept' && b.dept) {
			s.departments[b.dept] = b.targetLevel;
			log(s, 'dept_built', { dept: b.dept, level: b.targetLevel });
		} else if (b.kind === 'surv') {
			s.survLevel = b.targetLevel;
			s.survMaxEver = Math.max(s.survMaxEver, s.survLevel);
			if (s.survLevel >= 3) markDirty(s);
			log(s, 'surv_built', { level: s.survLevel });
		} else if (b.kind === 'repr') {
			s.reprLevel = b.targetLevel;
			s.reprMaxEver = Math.max(s.reprMaxEver, s.reprLevel);
			addUnrest(s, B.REPR_UNREST_ON_ENABLE[b.targetLevel - 1]);
			markDirty(s);
			recomputeControl(s);
			log(s, 'repr_built', { level: s.reprLevel });
		}
	}
}

export function tickResearch(s: GameState): void {
	const r = s.research;
	if (!r || r.doneDay > s.day) return;
	s.techs.push(r.techId);
	s.research = null;
	log(s, 'tech_done', { techId: r.techId });
}
