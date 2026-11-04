// Общие помощники ботов-стратегий. Боты ходят только через публичный API ядра
// (applyAction / validateAction / селекторы), как игрок. RNG партии не трогают:
// своя случайность — только из botRng(seed).
import {
	BALANCE as B,
	applyAction,
	previewOperation,
	questChoices,
	selectCases,
	selectForecast,
	selectCredit,
	isDilemmaQuest,
	lineSkill,
	PERKS,
	type Agent,
	type DeptKey,
	type GameState,
	type OpTarget,
	type OpType,
	type PlayerAction,
	type QuestSession,
	type TechId
} from '../src/lib/game/index';

export type BotTurn = (s: GameState) => void;
export interface BotDef {
	name: string;
	/** Краткое описание стратегии для отчёта. */
	about: string;
	make(seed: string): BotTurn;
}

// ------------------------------------------------------------ базовое

export function act(s: GameState, a: PlayerAction): boolean {
	return applyAction(s, 'player', a).ok;
}

/** Детерминированный RNG бота (не игровой): mulberry32 от хэша зерна. */
export function botRng(seed: string): () => number {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
	let a = h || 1;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export const month = (s: GameState) => Math.max(1, Math.ceil(s.day / 30));
/** Дней до конца квартала (90 сразу после закрытия квартала). */
export const dayOfQuarterLeft = (s: GameState) => 90 - (s.day % 90);
export const idle = (s: GameState) => s.agents.filter((a) => a.status === 'idle');
export const hasTech = (s: GameState, t: TechId) => s.techs.includes(t);
export const forecastNet = (s: GameState) => selectForecast(s).net;
export const forecastIncome = (s: GameState) => selectForecast(s).income;

export function primarySkill(a: Agent, type: OpType): number {
	return Math.max(...(B.OP_PRIMARY_SKILL[type] as readonly string[]).map((k) => a.skills[k as keyof Agent['skills']]));
}

export function isHero(a: Agent): boolean {
	return a.traits.includes('hero');
}

// ------------------------------------------------------------ перки, лояльность

export function handlePerks(s: GameState): void {
	for (const a of s.agents) {
		while (a.pendingPerks > 0) {
			const p = PERKS.find((x) => !a.perks.includes(x));
			if (!p || !act(s, { type: 'choosePerk', agentId: a.id, perk: p })) break;
		}
	}
}

/** Медали агентам с низкой лояльностью (если хватает денег сверх резерва). */
export function loyaltyCare(s: GameState, reserve: number, threshold = 45): void {
	for (const a of s.agents) {
		if (a.loyalty >= threshold) continue;
		if (s.budget < reserve + B.MEDAL_COST) return;
		act(s, { type: 'medal', agentId: a.id });
	}
}

/** Проверка лояльности раз в period дней (кроты скрыты: бот проверяет «вслепую»). */
export function periodicLoyaltyCheck(s: GameState, mem: { lastCheck: number }, period: number, reserve: number): void {
	if (s.day - mem.lastCheck < period || s.budget < reserve + B.ACT_LOYALTY_CHECK.cost) return;
	if (act(s, { type: 'loyaltyCheck' })) mem.lastCheck = s.day;
}

// ------------------------------------------------------------ квесты

export type QuestPolicy = (s: GameState, q: QuestSession, available: string[]) => string | null;

/** Безопасная «честная» политика: ни одного грязного выбора. */
export const honestQuestPolicy: QuestPolicy = (s, q, av) => {
	const pick = (...ids: string[]) => ids.find((x) => av.includes(x)) ?? null;
	switch (q.questId) {
		case 'hearings':
			return pick('testify', 'secrecy');
		case 'raise_request':
			return s.budget > 600 ? pick('accept') : pick('refuse');
		case 'union_meeting':
			return pick('concede', 'refuse');
		case 'blogger_docs':
			return pick('deal');
		case 'rally':
			return pick('allow');
		case 'defector_contact':
			return pick('court', 'return', 'ignore');
		case 'informant':
			return s.budget > 400 ? pick('pay', 'report') : pick('report');
		case 'senator_secret':
			return pick('hold');
		case 'evacuation':
			return pick('check', 'stay');
		case 'journalist':
			return s.budget > 400 ? pick('bribe', 'ignore') : pick('ignore');
		case 'double_agent':
			return pick('purge', 'ignore');
		case 'airport':
			return pick('flee');
		case 'recruit_retry':
			return pick(String(q.params.previous), 'money', 'ideology');
		default:
			return av[0] ?? null;
	}
};

export function handleQuests(s: GameState, policy: QuestPolicy): void {
	for (const q of [...s.quests]) {
		if (!s.quests.includes(q)) continue;
		if (isDilemmaQuest(q.questId)) {
			handleDilemma(s, q);
			continue;
		}
		const av = questChoices(s, q)
			.filter((c) => c.available)
			.map((c) => c.id);
		if (av.length === 0) continue;
		const c = policy(s, q, av);
		if (c) act(s, { type: 'questChoice', sessionId: q.id, choice: c });
	}
}

// ------------------------------------------------------------ дилеммы и линейка (D-067)

/** default — вариант 0 (§9.8); honest — лучший не грязный; dirty — грязный, где он есть; random — случайный доступный. */
export type DlMode = 'default' | 'honest' | 'dirty' | 'random';
/** decline — всегда отказ (вариант 0); honest — «Осторожно» + «Собирать доказательства»; dirty — «Доказать преданность» + «Подтолкнуть». */
export type LineMode = 'decline' | 'honest' | 'dirty' | 'random';
export type ElMode = 'silent' | 'announce' | 'leak';

/**
 * Политика дилемм текущего хода. Выставляет обёртка бота (bots.ts) перед ходом, как rosterLimit.
 * only — грязный выбор только у перечисленных дилемм (остальные по honest), для разложения вклада.
 */
export const dlConfig = {
	dl: 'default' as DlMode,
	line: 'decline' as LineMode,
	el: null as ElMode | null,
	/** Принудительный выбор в «Тихом сигнале» (wait/legal/wiretap/detain), иначе по dl. */
	sig: null as string | null,
	only: null as Set<string> | null,
	rng: (() => 0.5) as () => number,
	/** Агенты, которых бот не отдаёт в линейку (шпионы «Тени», оперативники «Монополии»). */
	exclude: new Set<number>(),
	/** Ведущий линейки: минимальный штат, при котором бот вообще берётся. */
	lineMinRoster: 7,
	/** D-066: старая политика команд (пары на расследованиях) — для сравнения с r4. */
	legacyTeams: false
};

const HONEST_DL: Record<string, string> = {
	dilemma_valuable_source: 'recruit',
	dilemma_source_crime: 'surrender',
	dilemma_forced_confession: 'by_the_book',
	dilemma_sting: 'observe',
	dilemma_quiet_signal: 'legal',
	dilemma_share_with_cia: 'share',
	dilemma_fudged_warrant: 'wait',
	dilemma_cover_life: 'forbid',
	dilemma_election_dossier: 'silent'
};
const DIRTY_DL: Record<string, string[]> = {
	dilemma_valuable_source: ['recruit'],
	dilemma_source_crime: ['blind_eye'],
	dilemma_forced_confession: ['press'],
	dilemma_sting: ['provoke'],
	dilemma_quiet_signal: ['detain', 'wiretap', 'legal'],
	dilemma_share_with_cia: ['share'],
	dilemma_fudged_warrant: ['fudge'],
	dilemma_cover_life: ['allow'],
	dilemma_election_dossier: ['leak']
};

const lineWait = new WeakMap<QuestSession, number>();

function handleDilemma(s: GameState, q: QuestSession): void {
	const all = questChoices(s, q);
	const av = all.filter((c) => c.available);
	const choose = (id: string | null | undefined, param?: number) => {
		if (!id || !av.some((c) => c.id === id)) return false;
		return act(s, param === undefined ? { type: 'questChoice', sessionId: q.id, choice: id } : { type: 'questChoice', sessionId: q.id, choice: id, param });
	};
	const r = dlConfig.rng;
	if (q.questId.startsWith('vanguard_')) {
		lineDecision(s, q, av, choose);
		return;
	}
	if (av.length === 0) return;
	const mode = dlConfig.dl;
	if (q.questId === 'dilemma_quiet_signal' && dlConfig.sig) {
		if (choose(dlConfig.sig)) return;
	}
	if (q.questId === 'dilemma_election_dossier' && dlConfig.el) {
		if (choose(dlConfig.el)) return;
	}
	if (mode === 'random') {
		choose(av[Math.floor(r() * av.length)].id);
		return;
	}
	if (mode === 'default') {
		choose(av[0].id);
		return;
	}
	const short = q.questId.replace('dilemma_', '');
	const dirtyHere = mode === 'dirty' && (dlConfig.only === null || dlConfig.only.has(short) || (short === 'source_crime' && dlConfig.only.has('valuable_source')));
	if (dirtyHere) for (const id of DIRTY_DL[q.questId] ?? []) if (choose(id)) return;
	if (choose(HONEST_DL[q.questId])) return;
	choose(av[0].id);
}

function lineDecision(s: GameState, q: QuestSession, av: ReturnType<typeof questChoices>, choose: (id: string, param?: number) => boolean): void {
	const mode = dlConfig.line;
	const r = dlConfig.rng;
	if (q.questId === 'vanguard_result') {
		choose('ok');
		return;
	}
	if (mode === 'random') {
		if (av.length === 0) return;
		const c = av[Math.floor(r() * av.length)];
		const ids = c.agentIds ?? [];
		choose(c.id, ids.length ? ids[Math.floor(r() * ids.length)] : undefined);
		return;
	}
	if (mode === 'decline') {
		choose('decline') || choose('recall');
		return;
	}
	const has = (id: string) => av.some((c) => c.id === id);
	if (q.questId === 'vanguard_offer') {
		if (q.stage === 'partner') {
			const leadId = Number(q.params.leadId);
			const p = av.find((c) => c.id === 'partner');
			const partners = (p?.agentIds ?? []).filter((id) => !dlConfig.exclude.has(id));
			// Напарник: самый «дешёвый» свободный (уровень, затем навык), если дома остаётся ≥ 4 свободных рук штата.
			if (p && partners.length > 0 && s.agents.length >= dlConfig.lineMinRoster + 2) {
				const pick = partners
					.map((id) => s.agents.find((a) => a.id === id)!)
					.filter((a) => a.id !== leadId && !isHero(a))
					.sort((x, y) => x.level - y.level || x.id - y.id)[0];
				if (pick && choose('partner', pick.id)) return;
			}
			choose('alone') || choose('decline');
			return;
		}
		const st = av.find((c) => c.id === 'start');
		const leads = (st?.agentIds ?? []).filter((id) => !dlConfig.exclude.has(id));
		if (st && leads.length > 0 && s.agents.length >= dlConfig.lineMinRoster && s.budget >= 400) {
			const lead = leads.map((id) => s.agents.find((a) => a.id === id)!).sort((x, y) => lineSkill(y) - lineSkill(x) || x.id - y.id)[0];
			if (choose('start', lead.id)) return;
		}
		choose('decline');
		return;
	}
	const pick = (pref: string[]) => {
		for (const id of pref) if (has(id) && choose(id)) return true;
		return false;
	};
	const ok =
		q.questId === 'vanguard_stage2'
			? pick(mode === 'dirty' ? ['devoted', 'cautious'] : ['cautious'])
			: q.questId === 'vanguard_stage3'
				? pick(mode === 'dirty' ? ['provoke', 'evidence'] : ['evidence'])
				: pick(['go']);
	if (ok) return;
	// Нет денег на этап: ждём до 60 дней, потом отзываем.
	const since = lineWait.get(q) ?? s.day;
	lineWait.set(q, since);
	if (s.day - since > 60) choose('recall');
}

// ------------------------------------------------------------ дела на карте

export interface CaseOpts {
	/** Не тратить бюджет ниже этого уровня. */
	reserve: number;
	/** Агенты, которых нельзя брать на дела. */
	exclude?: Set<number>;
	/** Минимальный шанс расследования / теракта. */
	minInvest?: number;
	minTerror?: number;
	/** Добавлять подкрепление на теракт, если свободных много. */
	terrorExtras?: boolean;
	/** Брать «пару» лидер + слабейший (true) или двух лучших. */
	pairWeakest?: boolean;
	/** D-051: запускать расследования в кредит, когда наличных не хватает (по умолчанию да). */
	credit?: boolean;
	/** D-066: лишние свободные агенты идут подкреплением в идущие операции (по умолчанию да). */
	reinforce?: boolean;
}

/** Хватает ли денег на операцию: наличные сверх резерва, либо (D-051) кредит на расследование. */
function opAffordable(s: GameState, type: OpType, cost: number, reserve: number, credit: boolean): boolean {
	if (s.budget >= cost + reserve) return true;
	if (!credit || type !== 'investigation') return false;
	return selectCredit(s).availableForOps >= cost;
}

/** Статистика команд и подкреплений для отчёта (сбрасывает game.ts на старте партии). */
export const teamStats = { reinforced: 0 };

/**
 * D-066: одиночки, пока дел не меньше, чем свободных рук; лишние руки — в подкрепление.
 * Расследование: ведущий — самый слабый агент, который один даёт шанс ≥ max(minInvest, 0.5) (сильных бережём
 * для тяжёлых дел), иначе лучший. Подкрепление на старте: теракт — до 2 лучших бойцов (прикрытие);
 * расследование d ≥ 3 — +1, d ≥ 4 — +2, только из «лишних» (свободных больше, чем оставшихся дел).
 * Если шанс ниже порога, добираем людей до 3. После раздачи дел лишние свободные (кроме одного в резерве)
 * идут подкреплением в идущие теракты и самые трудные расследования (пока прогресс < 50 %).
 */
function runCasesD066(s: GameState, o: CaseOpts): number {
	const ex = o.exclude ?? new Set<number>();
	const minI = o.minInvest ?? 0.3;
	const minT = o.minTerror ?? 0.4;
	let started = 0;
	const free = () => s.agents.filter((a) => a.status === 'idle' && !ex.has(a.id));
	const cases = selectCases(s)
		.filter((c) => c.accessible && c.takenByOpId === null)
		.sort(
			(x, y) =>
				(y.kind === 'terror' ? 100 : 0) - (x.kind === 'terror' ? 100 : 0) ||
				(x.daysLeft ?? 999) - (y.daysLeft ?? 999) ||
				y.difficulty - x.difficulty
		);
	const pv = (type: OpType, caseId: number, team: Agent[]) => previewOperation(s, { opType: type, agentIds: team.map((a) => a.id), caseId });
	for (let i = 0; i < cases.length; i++) {
		const c = cases[i];
		const type: OpType = c.kind === 'terror' ? 'terror' : 'investigation';
		const pool = free().sort((x, y) => primarySkill(y, type) - primarySkill(x, type) || x.id - y.id);
		if (pool.length === 0) break;
		if (!opAffordable(s, type, B.OP_COST[type], o.reserve, o.credit !== false)) continue;
		const thr = type === 'terror' ? minT : minI;
		const remaining = cases.length - i - 1;
		const spare = Math.max(0, pool.length - 1 - remaining);
		let lead = pool[0];
		if (type === 'investigation') {
			const goal = Math.max(thr, 0.5);
			for (let j = pool.length - 1; j >= 0; j--) {
				const p = pv(type, c.id, [pool[j]]);
				if (!p.error && p.chance >= goal) {
					lead = pool[j];
					break;
				}
			}
		}
		const team = [lead];
		const rest = pool.filter((a) => a !== lead);
		// Подкрепление: теракт — лучшие бойцы; расследование — младшие по уровню (учатся, прибавка слота та же).
		const extrasOrder = type === 'terror' ? rest : [...rest].sort((x, y) => x.level - y.level || primarySkill(y, type) - primarySkill(x, type) || x.id - y.id);
		let want = type === 'terror' ? (o.terrorExtras === false ? 0 : 2) : c.difficulty >= 4 ? 2 : c.difficulty >= 3 ? 1 : 0;
		want = Math.min(want, type === 'terror' ? rest.length : spare, B.OP_MAX_EXTRA_AGENTS);
		for (let k = 0; k < want; k++) team.push(extrasOrder[k]);
		let p = pv(type, c.id, team);
		let k = team.length - 1;
		while (!p.error && p.chance < thr && team.length < 1 + B.OP_MAX_EXTRA_AGENTS && k < extrasOrder.length) {
			team.push(extrasOrder[k++]);
			p = pv(type, c.id, team);
		}
		if (p.error || p.chance < thr) continue;
		if (act(s, { type: 'startOp', opType: type, caseId: c.id, agentIds: team.map((a) => a.id) })) started++;
	}
	if (o.reinforce !== false) {
		const openLeft = selectCases(s).filter((c) => c.accessible && c.takenByOpId === null).length;
		let surplus = free().length - openLeft - 1;
		if (surplus > 0) {
			const ops = s.operations
				.filter((op) => (op.type === 'terror' || op.type === 'investigation') && op.caseId !== null && op.agentIds.length < 1 + B.OP_MAX_EXTRA_AGENTS)
				.filter((op) => (s.day - op.startDay) / Math.max(1, op.endDay - op.startDay) < 0.5)
				.sort((a, b) => (b.type === 'terror' ? 1 : 0) - (a.type === 'terror' ? 1 : 0) || b.difficulty - a.difficulty || a.id - b.id);
			for (const op of ops) {
				if (surplus <= 0) break;
				if (op.type === 'investigation' && op.difficulty < 3) continue;
				const cand = free().sort((x, y) =>
					op.type === 'terror' ? primarySkill(y, 'terror') - primarySkill(x, 'terror') || x.id - y.id : x.level - y.level || x.id - y.id
				)[0];
				if (!cand) break;
				if (act(s, { type: 'reinforceOp', opId: op.id, agentId: cand.id })) {
					surplus--;
					teamStats.reinforced++;
				}
			}
		}
	}
	return started;
}

/** Расследования и теракты: доступные дела, лучший по навыку ведущий. */
export function runCases(s: GameState, o: CaseOpts): number {
	if (!dlConfig.legacyTeams) return runCasesD066(s, o);
	const ex = o.exclude ?? new Set<number>();
	const minI = o.minInvest ?? 0.3;
	const minT = o.minTerror ?? 0.4;
	let started = 0;
	const cases = selectCases(s)
		.filter((c) => c.accessible && c.takenByOpId === null)
		.sort(
			(x, y) =>
				(y.kind === 'terror' ? 100 : 0) - (x.kind === 'terror' ? 100 : 0) ||
				(x.daysLeft ?? 999) - (y.daysLeft ?? 999) ||
				x.difficulty - y.difficulty
		);
	for (const c of cases) {
		const type: OpType = c.kind === 'terror' ? 'terror' : 'investigation';
		const need = B.OP_AGENTS_REQUIRED[type];
		const pool = s.agents
			.filter((a) => a.status === 'idle' && !ex.has(a.id))
			.sort((x, y) => primarySkill(y, type) - primarySkill(x, type) || x.id - y.id);
		if (pool.length < need) continue;
		if (!opAffordable(s, type, B.OP_COST[type], o.reserve, o.credit !== false)) continue;
		let team: Agent[];
		if (type === 'investigation' && o.pairWeakest !== false) team = [pool[0], pool[pool.length - 1]];
		else team = pool.slice(0, need);
		if (type === 'terror' && o.terrorExtras && pool.length >= need + 2) team = pool.slice(0, need + 2);
		const ids = team.map((a) => a.id);
		const pv = previewOperation(s, { opType: type, agentIds: ids, caseId: c.id });
		if (pv.error) continue;
		if (pv.chance < (type === 'terror' ? minT : minI)) {
			// Попробуем двух лучших вместо пары «лучший + слабый».
			if (type === 'investigation' && pool.length >= 2) {
				const ids2 = [pool[0].id, pool[1].id];
				const pv2 = previewOperation(s, { opType: type, agentIds: ids2, caseId: c.id });
				if (!pv2.error && pv2.chance >= minI && act(s, { type: 'startOp', opType: type, caseId: c.id, agentIds: ids2 })) started++;
			}
			continue;
		}
		if (act(s, { type: 'startOp', opType: type, caseId: c.id, agentIds: ids })) started++;
	}
	return started;
}

// ------------------------------------------------------------ найм и стройка

export interface HireOpts {
	target: number;
	reserve: number;
	/** Минимальный прогноз чистого дохода после найма. */
	minNet: number;
	allowVeteran?: boolean;
	preferSkill?: keyof Agent['skills'];
}

/** Глобальный потолок штата для экспериментов (bot@N). */
export const rosterLimit = { cap: Infinity };

export function hire(s: GameState, o: HireOpts): boolean {
	if (s.agents.length >= Math.min(o.target, rosterLimit.cap)) return false;
	const net = forecastNet(s);
	const cands = s.hirePool
		.filter((c) => o.allowVeteran || c.rank !== 'veteran')
		.map((c) => {
			const cost = c.rank === 'novice' ? B.HIRE_COST_NOVICE : c.rank === 'experienced' ? B.HIRE_COST_EXPERIENCED : B.HIRE_COST_VETERAN;
			const sal = c.rank === 'novice' ? B.SALARY_NOVICE : c.rank === 'experienced' ? B.SALARY_EXPERIENCED : B.SALARY_VETERAN;
			const sk = o.preferSkill ? c.skills[o.preferSkill] : Math.max(c.skills.interrogation, c.skills.surveillance);
			const bad = c.traits.includes('corrupt') || c.traits.includes('blabbermouth') ? 3 : 0;
			return { c, cost, sal, score: sk - bad - (c.traits.includes('with_past') ? 1 : 0) };
		})
		.filter((x) => s.budget >= x.cost + o.reserve && net - x.sal * 1.1 >= o.minNet)
		.sort((x, y) => y.score - x.score || x.cost - y.cost);
	const best = cands[0];
	if (!best) return false;
	return act(s, { type: 'hire', candidateId: best.c.id });
}

/**
 * Найм с оглядкой на план (§5.5: цель растёт на 0.81 очка/квартал за агента, а поток дел фиксирован):
 * нанимаем, только если нет свободных рук при открытых доступных делах, прошлый квартал выполнен с запасом,
 * текущий идёт по графику, и после найма прогноз чистого дохода ≥ minNet.
 */
export function planHire(s: GameState, o: HireOpts & { exclude?: Set<number>; ratioNeed?: number }): boolean {
	const ex = o.exclude ?? new Set<number>();
	const freeHome = s.agents.filter((a) => a.status === 'idle' && !ex.has(a.id)).length;
	const unmet = selectCases(s).filter((c) => c.accessible && c.takenByOpId === null).length;
	// Расследованию нужна пара: один свободный агент дело не возьмёт.
	if (freeHome >= (dlConfig.legacyTeams ? 2 : 1) || unmet === 0) return false; // D-066: одному свободному хватит на дело
	// D-049: пока годовой пол цели выше 0.81·N, новый агент цель не поднимает — нанимать можно без запаса по плану.
	// Смотрим на пол следующего квартала (найм окупается в нём).
	const base = (B as Record<string, unknown>).PLAN_BASE_BY_YEAR as number[] | undefined;
	const nextQ = s.plan.quarter + 1;
	const floor = base ? base[Math.min(base.length - 1, Math.floor((nextQ - 1) / 4))] : 0;
	const floorBinding = floor >= B.PLAN_PER_AGENT * 3 * (s.agents.length + 1);
	if (!floorBinding) {
		const last = s.plan.ratioHistory.at(-1) ?? 99;
		if (last < (o.ratioNeed ?? 1.15)) return false;
		const pace = s.plan.points / Math.max(1, s.plan.target);
		const elapsed = 1 - dayOfQuarterLeft(s) / 90;
		if (pace < elapsed * 0.9) return false;
	}
	return hire(s, o);
}

/**
 * Аварийный режим: если бюджет с учётом ближайшего месяца уходит в минус —
 * увольняем свободных агентов с самой большой зарплатой (минимум minKeep в штате).
 */
export function emergency(s: GameState, minKeep = 6): boolean {
	let fired = false;
	for (let i = 0; i < 3; i++) {
		const net = forecastNet(s);
		if (s.budget + net >= 0 || net >= 0 || s.agents.length <= minKeep) break;
		const cand = s.agents
			.filter((a) => a.status === 'idle')
			.sort((x, y) => salaryOf(y) - salaryOf(x))[0];
		if (!cand || s.budget < salaryOf(cand)) break;
		if (!act(s, { type: 'fire', agentId: cand.id })) break;
		fired = true;
	}
	return fired;
}

export function salaryOf(a: Agent): number {
	const base = a.rank === 'novice' ? B.SALARY_NOVICE : a.rank === 'experienced' ? B.SALARY_EXPERIENCED : B.SALARY_VETERAN;
	return Math.round(base * (1 + B.SALARY_LEVEL_STEP * (a.level - 1)) * a.salaryMult);
}

/** Можно ли взять новую постоянную статью расходов (monthly) и остаться с прогнозом ≥ margin. */
export function affordRecurring(s: GameState, monthly: number, margin: number): boolean {
	return forecastNet(s) - monthly >= margin;
}

/** Достроить отделы до целей по порядку списка. Не больше одной новой стройки за ход. */
export function buildDepts(s: GameState, plan: [DeptKey, number][], reserve: number, margin = 60): boolean {
	if (!affordRecurring(s, B.DEPT_UPKEEP_PER_LEVEL, margin)) return false;
	for (const [d, lvl] of plan) {
		if (s.departments[d] >= lvl) continue;
		if (s.builds.some((b) => b.kind === 'dept' && b.dept === d)) continue;
		const cost = B.DEPT_COST_BY_LEVEL[s.departments[d]];
		if (s.budget < cost + reserve) return false;
		if (act(s, { type: 'buildDept', dept: d })) return true;
	}
	return false;
}

export function research(s: GameState, order: TechId[], reserve: number): boolean {
	if (s.research) return false;
	for (const t of order) {
		if (hasTech(s, t)) continue;
		const tier = (B.TECH_TREE as Record<string, { tier: number }>)[t].tier;
		if (s.budget < B.TECH_COST_BY_TIER[tier - 1] + reserve) return false;
		return act(s, { type: 'research', tech: t });
	}
	return false;
}

export function buildSurvTo(s: GameState, level: number, reserve: number): boolean {
	if (s.survLevel >= level || s.builds.some((b) => b.kind === 'surv')) return false;
	const cost = B.SURV_COST_BY_LEVEL[s.survLevel];
	if (s.budget < cost + reserve) return false;
	return act(s, { type: 'buildSurv' });
}

export function buildReprTo(s: GameState, level: number, reserve: number): boolean {
	if (s.reprLevel >= level || s.builds.some((b) => b.kind === 'repr')) return false;
	const cost = B.REPR_COST_BY_LEVEL[s.reprLevel];
	if (s.budget < cost + reserve) return false;
	return act(s, { type: 'buildRepr' });
}

/** Пиар-кампания и работа с Конгрессом. */
export function publicRelations(s: GameState, reserve: number, maxRep = 100, influenceBelow = 40): void {
	if (s.reputation < maxRep && s.budget >= reserve + B.PR_CAMPAIGN.cost) act(s, { type: 'prCampaign' });
	if (s.influence < influenceBelow && s.budget >= reserve + B.ACT_CONGRESS_WORK.cost) act(s, { type: 'congressWork' });
}

// ------------------------------------------------------------ грязное

/** Слежка за целью лучшим свободным агентом (без «Героев»). */
export function surveil(s: GameState, target: OpTarget, reserve: number, ex: Set<number>, minChance = 0.35, extras = 0): boolean {
	const pool = s.agents
		.filter((a) => a.status === 'idle' && !ex.has(a.id) && !isHero(a))
		.sort((x, y) => primarySkill(y, 'surveillance') - primarySkill(x, 'surveillance') || x.id - y.id);
	if (pool.length < 1 + extras) return false;
	const ids = pool.slice(0, 1 + extras).map((a) => a.id);
	const pv = previewOperation(s, { opType: 'surveillance', agentIds: ids, target });
	if (pv.error || pv.chance < minChance || s.budget < pv.cost + reserve) return false;
	return act(s, { type: 'startOp', opType: 'surveillance', agentIds: ids, target });
}

export function infiltrate(s: GameState, target: OpTarget, reserve: number, ex: Set<number>, minChance = 0.3): boolean {
	const pool = s.agents
		.filter((a) => a.status === 'idle' && !ex.has(a.id) && !isHero(a))
		.sort((x, y) => primarySkill(y, 'infiltration') - primarySkill(x, 'infiltration') || x.id - y.id);
	if (pool.length < 1) return false;
	const ids = pool.slice(0, Math.min(3, pool.length) >= 3 ? 3 : 1).map((a) => a.id);
	const pv = previewOperation(s, { opType: 'infiltration', agentIds: ids, target });
	if (pv.error || pv.chance < minChance || s.budget < pv.cost + reserve) return false;
	return act(s, { type: 'startOp', opType: 'infiltration', agentIds: ids, target });
}

export function rivalKompromat(s: GameState, id?: string) {
	return s.kompromat.filter(
		(k) => k.target.kind === 'rival' && (id === undefined || k.target.id === id) && (k.expiresDay === null || k.expiresDay > s.day)
	);
}

/**
 * Защита от следствия. D-057: у встречного компромата откат 90 дней — тратим его раньше (порог threshold),
 * а при критическом уровне (≥ 80) жертвуем «козлом отпущения» (самый слабый свободный агент).
 */
export function defendInvestigation(s: GameState, threshold: number): void {
	const t = Math.min(threshold, 25);
	if (s.investigation >= t) {
		const k = rivalKompromat(s).sort((a, b) => b.strength - a.strength)[0];
		if (k) act(s, { type: 'counterKompromat', kompromatId: k.id });
	}
	if (s.investigation >= 80 && s.agents.length > 6) {
		const v = s.agents.filter((a) => a.status === 'idle').sort((x, y) => x.level - y.level || x.id - y.id)[0];
		if (v) act(s, { type: 'scapegoat', agentId: v.id });
	}
}

/** Фальшивые очки плана в последний ход квартала, чтобы дотянуть до ratio ≥ goal. */
export function fakeAtQuarterEnd(s: GameState, goal: number, onlyIfBelow = 1.0): number {
	if (dayOfQuarterLeft(s) > 3) return 0;
	const target = s.plan.target;
	// Очки от операций, которые закончатся до конца квартала, не знаем точно — считаем по факту.
	const ratio = (s.plan.points + s.plan.fakePoints) / Math.max(1, target);
	if (ratio >= onlyIfBelow) return 0;
	const need = Math.ceil(goal * target) - s.plan.points - s.plan.fakePoints;
	const room = Math.floor(B.FAKE_MAX_SHARE * target) - s.plan.fakePoints;
	const n = Math.min(need, room);
	if (n <= 0) return 0;
	return act(s, { type: 'fakeStats', points: n }) ? n : 0;
}
