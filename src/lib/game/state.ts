// Создание партии, сериализация и миграции GameState (§11.3).
import { BALANCE as B } from './balance';
import { generateAgent, refreshHirePool } from './agents';
import { distribute, incomeForMonth } from './economy';
import { absorbChance, monthOfDay } from './formulas';
import { aiInterval } from './formulas';
import { US_STATES, senatorIds } from './geo';
import { emptyNetwork } from './networks';
import { randInt, seedRng } from './rng';
import { recomputeControl } from './society';
import type { AutopauseFlags, DeptKey, GameConfig, GameState, Jurisdiction, Network, Rival, Speed } from './types';
import { RIVAL_IDS } from './types';

/** Текущая версия схемы сохранения. Повышать при несовместимых изменениях GameState. */
export const SCHEMA_VERSION = 5;

export interface NewGameOptions {
	seed: string;
	config?: Partial<GameConfig>;
	speed?: Speed;
	autopause?: Partial<AutopauseFlags>;
}

function defaultConfig(c: Partial<GameConfig> = {}): GameConfig {
	return {
		agency: c.agency ?? 'fbi',
		stateCaseWeights: { ...(c.stateCaseWeights ?? {}) },
		extraTraits: structuredCloneJson(c.extraTraits ?? []),
		extraCards: structuredCloneJson(c.extraCards ?? []),
		senatorResistance: { ...(c.senatorResistance ?? {}) }
	};
}

function structuredCloneJson<T>(x: T): T {
	return JSON.parse(JSON.stringify(x)) as T;
}

/** Создать новую партию. Детерминирована по seed (и config). */
export function createGame(opts: NewGameOptions): GameState {
	const config = defaultConfig(opts.config);
	const jurisdiction: Record<string, Jurisdiction> = {};
	for (const st of US_STATES)
		jurisdiction[st] = { level: (B.START_FULL_STATES as string[]).includes(st) ? 2 : B.START_PARTIAL_LEVEL, holder: null };
	const networks: Record<string, Network> = {};
	for (const c of B.SHADOW_COUNTRIES[config.agency]) networks[c] = emptyNetwork();
	const rivals: Rival[] = RIVAL_IDS.map((id) => ({
		id,
		alive: true,
		absorbed: false,
		collapsing: false,
		reputation: B.RIVAL_START[id].rep,
		influence: B.RIVAL_START[id].infl,
		planRatio: 1,
		planRatioPrev: 1,
		planBonusThisQuarter: 0,
		kompromatOnPlayer: 0,
		lobbyMult: 1,
		hearingMult: 1,
		priorityMult: 1,
		share: 0,
		nextActionDay: aiInterval(B.AI_ACTION_INTERVAL_DAYS[id], false),
		grudgeUntilDay: 0,
		digBlockedUntilDay: 0,
		lowShareQuarters: 0,
		favorUntilDay: 0,
		sabotageCount: 0
	}));

	const s: GameState = {
		schemaVersion: SCHEMA_VERSION,
		seed: opts.seed,
		rngState: seedRng(opts.seed),
		nextId: 1,
		day: 0,
		speed: opts.speed ?? 1,
		paused: true,
		pauseReasons: [],
		autopause: { ...(B.AUTOPAUSE_DEFAULTS as AutopauseFlags), ...(opts.autopause ?? {}) },
		config,
		budget: B.START_BUDGET,
		reputation: B.START_REPUTATION,
		influence: B.START_INFLUENCE,
		exposure: B.START_EXPOSURE,
		investigation: 0,
		control: 0,
		unrest: B.START_UNREST,
		share: 0,
		lastIncome: 0,
		firstIncome: 0,
		hearingMult: 1,
		priorityMult: 1,
		departments: { ...(B.START_DEPARTMENTS as Record<DeptKey, number>) },
		builds: [],
		survLevel: 0,
		survMaxEver: 0,
		reprLevel: 0,
		reprMaxEver: 0,
		reprRollbacks: [],
		research: null,
		techs: [],
		apexChosen: null,
		agents: [],
		hirePool: [],
		defectors: [],
		trainings: [],
		tasks: [],
		cases: [],
		operations: [],
		highProfile: [],
		strikes: {},
		kompromat: [],
		rivals,
		coalition: false,
		stateJurisdiction: jurisdiction,
		networks,
		missions: [],
		leaders: [],
		senators: senatorIds(B.BUDGET_COMMITTEE_SIZE).map((id) => ({ id, resistance: 0 })),
		presidentTerm: 1,
		plan: {
			quarter: 1,
			target: B.PLAN_FIRST_QUARTER,
			points: 0,
			fakePoints: 0,
			fakeTotal: 0,
			ratioHistory: [],
			criticalStreak: 0,
			metCount: 0,
			nextTargetMult: 1,
			planRatioPrev: 1
		},
		cards: { nextCardDay: 0, cooldowns: {}, active: [] },
		quests: [],
		counters: {
			dirtyActions: 0,
			dirtyThisMonth: false,
			bankruptStreak: 0,
			lowShareStreak: 0,
			hold1984Days: 0,
			holdShadowDays: 0,
			holdCardinalDays: 0,
			lastHearingDay: null,
			lastPlayerFailDay: null,
			firstNegativeBudgetSeen: false,
			unrest50Seen: false,
			unrest80Seen: false,
			investigationAbove50: false,
			prCampaignReadyDay: 0,
			counterKompromatReadyDay: 0,
			congressWorkReadyDay: 0,
			informantReadyDay: 0,
			informantCasesUntilDay: 0,
			senatorQuestReadyDay: 0,
			controlBonus: 0
		},
		log: [],
		outcome: { status: 'active', victoryPath: null, defeatReason: null, month: null, day: null, score: null }
	};

	// Стартовый состав: 4 новичка и 2 опытных, тем же генератором без трейтов (§4.2.2).
	const roster = B.START_ROSTER as Record<'novice' | 'experienced' | 'veteran', number>;
	for (const rank of ['novice', 'experienced', 'veteran'] as const)
		for (let i = 0; i < roster[rank]; i++) s.agents.push(generateAgent(s, { rank, traits: false }));
	refreshHirePool(s);
	// Сопротивление сенаторов (D-046): из контента, иначе randInt по сенаторам в порядке id.
	const [rmin, rmax] = B.SENATOR_RESISTANCE_RANGE;
	for (const sen of s.senators) {
		const fromContent = config.senatorResistance[sen.id];
		sen.resistance = fromContent !== undefined ? fromContent : randInt(s, rmin, rmax);
	}
	// Начальная доля: та же формула с plan_ratio = 1 у всех (§6.2).
	distribute(s, 1);
	// D-051: до первого дохода база кредита — доход месяца 1.
	s.lastIncome = incomeForMonth(s, 1);
	s.firstIncome = s.lastIncome;
	s.cards.nextCardDay = randInt(s, B.CARD_INTERVAL_MIN_DAYS, B.CARD_INTERVAL_MAX_DAYS);
	recomputeControl(s);
	return s;
}

// ------------------------------------------------------------ сериализация

/** Миграции: ключ — версия, из которой мигрируем, в версию key + 1. */
export const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
	// v1 → v2 (D-045, D-046): сила улики у дел, сопротивление сенаторов, config.senatorResistance.
	// Без RNG: значения, сохраняющие поведение v1 (сложность слежки за сенатором = 4).
	1: (raw) => {
		const r = raw as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
		const [emin, emax] = B.EVIDENCE_STRENGTH_RANGE;
		for (const c of r.cases ?? []) if (c.evidenceStrength == null) c.evidenceStrength = Math.round((emin + emax) / 2);
		for (const sen of r.senators ?? []) if (!sen.resistance) sen.resistance = B.SENATOR_RESISTANCE_PIVOT;
		r.config = { ...(r.config ?? {}), senatorResistance: r.config?.senatorResistance ?? {} };
		return r;
	},
	// v2 → v3 (D-050, D-051, D-052): счётчик удержания «Кардинала», база кредита, шанс поглощения в задаче.
	2: (raw) => {
		const r = raw as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
		r.counters = { ...(r.counters ?? {}), holdCardinalDays: r.counters?.holdCardinalDays ?? 0 };
		if (typeof r.lastIncome !== 'number') r.lastIncome = incomeForMonth(r as GameState, monthOfDay(r.day ?? 0));
		for (const t of r.tasks ?? []) {
			if (t.chance !== undefined) continue;
			const target = (r.rivals ?? []).find((x: { id: string }) => x.id === t.rivalId);
			// Без данных о моменте запуска — по текущему влиянию до оплаты не восстановить; берём текущее.
			t.chance = t.kind === 'absorb' && target ? absorbChance(r.influence ?? 0, target.reputation ?? 0) : null;
		}
		return r;
	},
	// v3 → v4 (D-057, D-058, D-059): откат встречного компромата, сглаживание плана, статус «на грани».
	// planRatioPrev = текущий planRatio: первое распределение после загрузки ведёт себя как без сглаживания.
	3: (raw) => {
		const r = raw as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
		r.counters = { ...(r.counters ?? {}), counterKompromatReadyDay: r.counters?.counterKompromatReadyDay ?? 0 };
		for (const x of r.rivals ?? []) {
			if (x.collapsing === undefined) x.collapsing = false;
			if (x.planRatioPrev === undefined) x.planRatioPrev = x.planRatio ?? 1;
		}
		if (r.plan && r.plan.planRatioPrev === undefined) r.plan.planRatioPrev = r.plan.ratioHistory?.at?.(-1) ?? 1;
		for (const t of r.tasks ?? []) if (t.disbandOnFail === undefined) t.disbandOnFail = false;
		return r;
	},
	// v4 → v5 (D-063): firstIncome — доход месяца 1. Он детерминирован зерном и config, поэтому
	// пересчитываем его новой партией с тем же seed/config (без влияния на RNG загружаемого сейва).
	4: (raw) => {
		const r = raw as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
		if (typeof r.firstIncome !== 'number') r.firstIncome = createGame({ seed: String(r.seed), config: r.config ?? {} }).firstIncome;
		return r;
	}
};

export function migrate(raw: Record<string, unknown>): GameState {
	let v = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
	if (v > SCHEMA_VERSION) throw new Error(`save schemaVersion ${v} is newer than supported ${SCHEMA_VERSION}`);
	let cur = raw;
	while (v < SCHEMA_VERSION) {
		const m = MIGRATIONS[v];
		if (!m) throw new Error(`no migration from schemaVersion ${v}`);
		cur = m(cur);
		v += 1;
		cur.schemaVersion = v;
	}
	return cur as unknown as GameState;
}

/** GameState → JSON-строка для saves.state_json. */
export function serialize(s: GameState): string {
	return JSON.stringify(s);
}

/** JSON-строка (или уже распарсенный объект) → GameState с миграцией. */
export function deserialize(json: string | Record<string, unknown>): GameState {
	const raw = typeof json === 'string' ? (JSON.parse(json) as Record<string, unknown>) : structuredCloneJson(json);
	if (!raw || typeof raw !== 'object' || !Array.isArray(raw.rngState) || typeof raw.seed !== 'string')
		throw new Error('not a GameState');
	return migrate(raw);
}

/** Глубокая копия состояния (через JSON — состояние гарантированно сериализуемо). */
export function cloneState(s: GameState): GameState {
	return structuredCloneJson(s);
}
