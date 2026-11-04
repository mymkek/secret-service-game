// Типы игрового состояния. Всё, что лежит в GameState, сериализуется в JSON
// без потерь: только числа, строки, boolean, null, массивы и plain-объекты.
// Отсутствующее значение — всегда null (не undefined), чтобы round-trip был точным.

export const RIVAL_IDS = ['police', 'cia', 'secret_service'] as const;
export type RivalId = (typeof RIVAL_IDS)[number];
export type AgencyId = 'player' | RivalId;
export type Actor = 'player' | RivalId;

export const DEPT_KEYS = ['analytics', 'operations', 'cyber', 'counterintel', 'pr', 'legal'] as const;
export type DeptKey = (typeof DEPT_KEYS)[number];

export const OP_TYPES = ['investigation', 'terror', 'infiltration', 'surveillance'] as const;
export type OpType = (typeof OP_TYPES)[number];

export const RANKS = ['novice', 'experienced', 'veteran'] as const;
export type Rank = (typeof RANKS)[number];

export const SKILLS = ['surveillance', 'combat', 'interrogation', 'hacking'] as const;
export type SkillKey = (typeof SKILLS)[number];

export const BUILTIN_TRAITS = ['corrupt', 'hero', 'blabbermouth', 'workaholic', 'idealist', 'with_past'] as const;
export type BuiltinTraitId = (typeof BUILTIN_TRAITS)[number];
/** Встроенный трейт или трейт из контента (content-schema.ts). */
export type TraitId = string;

/** Порядок важен: автоматический выбор перка берёт первый подходящий (§4.2.3). */
export const PERKS = ['cold_blooded', 'marksman', 'analyst', 'ghost', 'mentor', 'iron_will', 'negotiator', 'netrunner'] as const;
export type PerkId = (typeof PERKS)[number];

export type AgentStatus = 'idle' | 'on_op' | 'training' | 'abroad' | 'embedded' | 'protest_duty';

export const TECH_IDS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'] as const;
export type TechId = (typeof TECH_IDS)[number];

export type CountryId = string;
export type StateId = string;

export const LEADER_ARCHETYPES = ['rights', 'blogger', 'union', 'ex_agent'] as const;
export type LeaderArchetype = (typeof LEADER_ARCHETYPES)[number];

export const LEGENDS = ['diplomat', 'businessman', 'journalist', 'student'] as const;
export type Legend = (typeof LEGENDS)[number];

export const RECRUIT_METHODS = ['money', 'ideology', 'kompromat'] as const;
export type RecruitMethod = (typeof RECRUIT_METHODS)[number];

export type VictoryPath = '1984' | 'shadow' | 'monopoly' | 'clean' | 'cardinal';
export type DefeatReason = 'timeout' | 'arrested' | 'bankrupt' | 'riot' | 'reputation' | 'dismissed' | 'disbanded';
export type Speed = 1 | 2 | 3;

export type AgentLocation =
	| { stateId: StateId }
	| { countryId: CountryId }
	| { rivalId: RivalId }
	| { leaderId: number }
	| null;

export interface Skills {
	surveillance: number;
	combat: number;
	interrogation: number;
	hacking: number;
}

export interface Agent {
	id: number;
	/** Детерминированное число для выбора имени из контента (resolveAgentName). */
	nameSeed: number;
	rank: Rank;
	level: number;
	xp: number;
	skills: Skills;
	/** Навык «профиля» кандидата (+1 при генерации). */
	profileSkill: SkillKey;
	/** Основной навык последней операции — растёт при повышении уровня. */
	lastOpSkill: SkillKey | null;
	loyalty: number;
	salaryMult: number;
	traits: TraitId[];
	perks: PerkId[];
	/** Сколько перков агент ещё должен выбрать (повышения уровня). */
	pendingPerks: number;
	status: AgentStatus;
	/** Скрыто от игрока. */
	moleFor: RivalId | null;
	busyStreakDays: number;
	idleStreakDays: number;
	successesThisMonth: number;
	failsThisMonth: number;
	location: AgentLocation;
	languages: CountryId[];
	/** Легенда заброски (§9.1) — влияет на прогресс сети. */
	legend: Legend | null;
	/** Одноразовый бонус «Легенда» на ближайшую заброску. */
	legendBonus: boolean;
	lastMedalDay: number | null;
	hiredDay: number;
}

/** Кандидат в пуле найма — это готовый агент, ещё не принятый на службу. */
export type Candidate = Agent;

export interface Defector {
	id: number;
	agent: Agent;
	defectedDay: number;
	/** День, когда бросается шанс возвращения. */
	returnDay: number;
	resolved: boolean;
}

export type CaseKind = 'regular' | 'terror';
export type CaseSource = 'random' | 'card_terror' | 'card_cyber' | 'repr3' | 'informant';

export interface Case {
	id: number;
	kind: CaseKind;
	stateId: StateId;
	difficulty: number;
	createdDay: number;
	/** null — дело без таймера (сеть информаторов, информатор в мэрии). */
	expiresDay: number | null;
	/** Сила улики 1..3 для допроса (§5.4, §9.3, D-045). */
	evidenceStrength: number;
	rewardMult: number;
	source: CaseSource;
	/** Минимальный уровень Кибер для взятия (карточка cyber_attack). */
	minCyber: number;
	/** День гонки для карточки «Теракт в крупном городе». */
	raceDay: number | null;
	raceBonus: number;
	/** Дело стало доступным через «Перехват дела». */
	intercepted: boolean;
	/** id операции игрока, которая ведёт дело. */
	takenByOpId: number | null;
}

export type OpTarget =
	| { kind: 'rival'; id: RivalId }
	| { kind: 'leader'; id: number }
	| { kind: 'senator'; id: string }
	| { kind: 'president' };

export interface Operation {
	id: number;
	type: OpType;
	caseId: number | null;
	target: OpTarget | null;
	agentIds: number[];
	/** Подкрепления, пришедшие после 50 % прогресса. */
	extraJoinedLate: number[];
	startDay: number;
	/** Конец ордера (для «Слежки»), иначе = startDay. */
	warrantEndDay: number;
	endDay: number;
	cost: number;
	difficulty: number;
	dirty: boolean;
}

export type KompromatTarget =
	| { kind: 'rival'; id: RivalId }
	| { kind: 'senator'; id: string }
	| { kind: 'president'; id: number }
	| { kind: 'leader'; id: number };

export interface KompromatItem {
	id: number;
	target: KompromatTarget;
	strength: number;
	acquiredDay: number;
	expiresDay: number | null;
	usedCooldownUntil: number | null;
}

export interface Rival {
	id: RivalId;
	alive: boolean;
	absorbed: boolean;
	reputation: number;
	influence: number;
	planRatio: number;
	planBonusThisQuarter: number;
	kompromatOnPlayer: number;
	lobbyMult: number;
	hearingMult: number;
	priorityMult: number;
	share: number;
	nextActionDay: number;
	grudgeUntilDay: number;
	digBlockedUntilDay: number;
	lowShareQuarters: number;
	/** «Услуга» из квеста «Сенатор»: враждебность −0.3 до этого дня. */
	favorUntilDay: number;
	/** Прошлые подставы игрока против этого соперника (n_prev). */
	sabotageCount: number;
}

export interface Jurisdiction {
	level: number;
	holder: RivalId | null;
}

export interface Network {
	level: number;
	progress: number;
	agentIds: number[];
	doubleAgentActive: boolean;
	/** Источник завербован через компромат — шанс двойного агента ×2. */
	kompromatSource: boolean;
	/** «Чистка в сети»: до этого дня прогресса нет. */
	purgeUntilDay: number;
}

export type MissionStage = 'prep' | 'infiltrate' | 'recruit' | 'recall';

/** Заброска шпиона (§9.1) — таймерная цепочка, агент занят. */
export interface Mission {
	id: number;
	agentId: number;
	countryId: CountryId;
	legend: Legend;
	recruit: RecruitMethod;
	prepared: boolean;
	stage: MissionStage;
	stageEndDay: number;
	/** Бросок провала на границе уже сделан (×2 при «импровизировать»). */
	borderMult: number;
}

export interface Leader {
	id: number;
	archetype: LeaderArchetype;
	stateId: StateId;
	influence: number;
	crossed60: boolean;
	/** «Под колпаком» — рост влияния вдвое медленнее (§9.5). */
	underWatch: boolean;
	/** Для «Бывшего агента» — id записи defectors[]. */
	defectorId: number | null;
}

export interface Senator {
	id: string;
	/** Сопротивление 1..3: сложность слежки = clamp(4 + resistance − 2, 1, 5) (D-046). */
	resistance: number;
}

export interface PlanState {
	quarter: number;
	target: number;
	points: number;
	fakePoints: number;
	/** F — накопленные фальшивки за партию. */
	fakeTotal: number;
	/** Реальные ratio (без фальшивок) по кварталам. */
	ratioHistory: number[];
	criticalStreak: number;
	/** Сколько кварталов план выполнен без фальшивок (для «Чистых рук»). */
	metCount: number;
	/** Множитель цели следующего квартала (карточка «Президент требует»). */
	nextTargetMult: number;
}

export interface ActiveCard {
	id: string;
	untilDay: number;
	params: Record<string, number | string | boolean | null>;
}

export interface CardsState {
	nextCardDay: number;
	cooldowns: Record<string, number>;
	active: ActiveCard[];
}

export interface Build {
	id: number;
	kind: 'dept' | 'surv' | 'repr';
	dept: DeptKey | null;
	targetLevel: number;
	doneDay: number;
}

export interface Training {
	id: number;
	agentId: number;
	course: 'skill' | 'language' | 'legend';
	skill: SkillKey | null;
	countryId: CountryId | null;
	doneDay: number;
}

export interface Research {
	techId: TechId;
	startDay: number;
	doneDay: number;
}

export interface TimedTask {
	id: number;
	kind: 'loyalty_check' | 'absorb' | 'quest_timer';
	doneDay: number;
	rivalId: RivalId | null;
	questSessionId: number | null;
	/** Шанс, зафиксированный при запуске (поглощение, D-052); иначе null. */
	chance: number | null;
}

export type QuestId =
	| 'hearings'
	| 'raise_request'
	| 'union_meeting'
	| 'blogger_docs'
	| 'rally'
	| 'defector_contact'
	| 'informant'
	| 'senator_secret'
	| 'evacuation'
	| 'journalist'
	| 'double_agent'
	| 'airport'
	| 'recruit_retry'
	| 'plan_warning'
	| 'director_questioning';

/** Активная сессия квеста/решения. Ink-состояние хранится непрозрачно. */
export interface QuestSession {
	id: number;
	questId: QuestId;
	createdDay: number;
	/** Этап для многошаговых квестов (Ink может вести свой). */
	stage: string;
	params: Record<string, number | string | boolean | null>;
	/** Ждём таймер (например, «внедрить агента» 30 дней) — выбор недоступен. */
	waitUntilDay: number | null;
	inkStateJson: string | null;
}

export interface Counters {
	dirtyActions: number;
	dirtyThisMonth: boolean;
	bankruptStreak: number;
	lowShareStreak: number;
	hold1984Days: number;
	holdShadowDays: number;
	/** Дни непрерывного удержания условия «Серого кардинала» (D-050). */
	holdCardinalDays: number;
	lastHearingDay: number | null;
	lastPlayerFailDay: number | null;
	firstNegativeBudgetSeen: boolean;
	unrest50Seen: boolean;
	unrest80Seen: boolean;
	investigationAbove50: boolean;
	prCampaignReadyDay: number;
	congressWorkReadyDay: number;
	informantReadyDay: number;
	informantCasesUntilDay: number;
	senatorQuestReadyDay: number;
	controlBonus: number;
}

export type LogValue = number | string | boolean | null;

export interface LogEntry {
	id: number;
	day: number;
	kind: string;
	data: Record<string, LogValue>;
	/** Для действий соперников: кто (или 'unknown'). */
	source: RivalId | 'unknown' | null;
}

export interface Outcome {
	status: 'active' | 'won' | 'lost';
	victoryPath: VictoryPath | null;
	defeatReason: DefeatReason | null;
	month: number | null;
	day: number | null;
	score: number | null;
}

export interface AutopauseFlags {
	chanceCard: boolean;
	quarterReport: boolean;
	hearings: boolean;
	questChoice: boolean;
	election: boolean;
	outcome: boolean;
	agentDefected: boolean;
	networkFailed: boolean;
	moleFound: boolean;
	unrestThreshold: boolean;
	investigationThreshold: boolean;
	firstNegativeBudget: boolean;
	raiseRequest: boolean;
	caseExpiring: boolean;
	operationDone: boolean;
}
export type AutopauseKey = keyof AutopauseFlags;

/** Параметры партии, задаваемые при создании (сохраняются в state для детерминизма). */
export interface GameConfig {
	agency: 'fbi';
	/** Веса штатов для генерации дел (контент), по умолчанию 1. */
	stateCaseWeights: Record<StateId, number>;
	/** Дополнительные трейты из контента (валидируются content-schema). */
	extraTraits: ContentTraitDef[];
	/** Дополнительные карточки из контента. */
	extraCards: ContentCardDef[];
	/** Сопротивление сенаторов из контента (id → 1..3); остальным — randInt на старте (D-046). */
	senatorResistance: Record<string, number>;
}

// --- Определения контента, которые ядро исполняет (подмножество zod-схем) ---

export type TraitModifier =
	| { kind: 'opChance'; opType: OpType | 'all'; value: number }
	| { kind: 'loyaltyPerMonth'; value: number }
	| { kind: 'exposurePerOp'; value: number }
	| { kind: 'defectMult'; value: number }
	| { kind: 'noOverwork' }
	| { kind: 'forbidDirty' };

export interface ContentTraitDef {
	id: string;
	weight: number;
	modifiers: TraitModifier[];
}

export type CardTarget = 'player' | 'all' | 'random_rival' | RivalId;

export type CardEffect =
	| { kind: 'reputation'; target: CardTarget; value: number }
	| { kind: 'influence'; target: CardTarget; value: number }
	| { kind: 'exposure'; value: number }
	| { kind: 'investigation'; value: number }
	| { kind: 'unrest'; value: number }
	| { kind: 'budget'; value: number }
	| { kind: 'incomeMult'; value: number; months: number }
	| { kind: 'rivalPlan'; target: CardTarget; value: number }
	| { kind: 'hearings' }
	| { kind: 'spawnCase'; caseKind: CaseKind; difficulty: number; timerDays: number | null; rewardMult: number }
	| { kind: 'planTargetMult'; value: number };

export type CardRequirement =
	| { kind: 'minSurv'; value: number }
	| { kind: 'minRepr'; value: number }
	| { kind: 'minDept'; dept: DeptKey; value: number }
	| { kind: 'minExposure'; value: number }
	| { kind: 'maxExposure'; value: number }
	| { kind: 'tech'; tech: TechId }
	| { kind: 'rivalAlive'; rival: RivalId }
	| { kind: 'minMonth'; value: number };

export interface ContentCardDef {
	id: string;
	weight: number;
	effects: CardEffect[];
	requires: CardRequirement[];
}

export interface GameState {
	schemaVersion: number;
	seed: string;
	rngState: number[];
	nextId: number;
	day: number;
	speed: Speed;
	paused: boolean;
	pauseReasons: string[];
	autopause: AutopauseFlags;
	config: GameConfig;

	budget: number;
	reputation: number;
	influence: number;
	exposure: number;
	investigation: number;
	control: number;
	unrest: number;
	/** Доля игрока из последнего распределения. */
	share: number;
	/** Доход последнего месяца (до первого дохода — доход месяца 1); база лимита кредита (D-051). */
	lastIncome: number;
	hearingMult: number;
	priorityMult: number;

	departments: Record<DeptKey, number>;
	builds: Build[];
	survLevel: number;
	survMaxEver: number;
	reprLevel: number;
	reprMaxEver: number;
	reprRollbacks: number[];

	research: Research | null;
	techs: TechId[];
	apexChosen: TechId | null;

	agents: Agent[];
	hirePool: Candidate[];
	defectors: Defector[];
	trainings: Training[];
	tasks: TimedTask[];

	cases: Case[];
	operations: Operation[];
	/** Громкие успехи {stateId, day} за последние 180 дней (§6.3). */
	highProfile: { stateId: StateId; day: number }[];
	/** Забастовки по штатам: день окончания. */
	strikes: Record<StateId, number>;

	kompromat: KompromatItem[];
	rivals: Rival[];
	coalition: boolean;
	stateJurisdiction: Record<StateId, Jurisdiction>;

	networks: Record<CountryId, Network>;
	missions: Mission[];
	leaders: Leader[];
	senators: Senator[];
	presidentTerm: number;

	plan: PlanState;
	cards: CardsState;
	quests: QuestSession[];
	counters: Counters;
	log: LogEntry[];
	outcome: Outcome;
}

/** Все виды записей журнала. Тексты к ним пишет контент (content-schema.ts → EventTextSchema). */
export const LOG_KINDS = [
	'absorb_failed', 'agent_captured', 'agent_defected', 'agent_deployed', 'agent_fired', 'agent_hired',
	'agent_killed', 'agent_level_up', 'agent_returned', 'agent_theft', 'blackmail_scandal', 'case_expired',
	'case_lost', 'case_new', 'chance_card', 'coalition_formed', 'defeat', 'dept_built', 'director_questioning',
	'election', 'embedded_exposed', 'fake_caught', 'hearings', 'hearings_skipped', 'intercept',
	'journalist_article', 'jurisdiction_up', 'kompromat_burned', 'leader_backs_rival', 'leader_new', 'leader_removed', 'leak',
	'lobby', 'loyalty_check_done', 'mole_found', 'month_money', 'national_protest', 'network_failed',
	'network_up', 'op_cancelled', 'op_fail', 'op_started', 'op_success', 'plan_warning', 'poach', 'protests',
	'quarter_report', 'quest_choice', 'quest_opened', 'random_find', 'recruit_failed', 'repr_built',
	'repr_rollback', 'restore_state', 'rival_absorbed', 'rival_action', 'rival_disbanded', 'sabotage',
	'scandal', 'scapegoat', 'source_recruited', 'surv_built', 'surv_rollback', 'tech_done',
	'terror_race_lost', 'thaw', 'training_done', 'unrest_threshold', 'victory', 'zabroska_failed'
] as const;
export type LogKind = (typeof LOG_KINDS)[number];

/**
 * Новые виды журнала, для которых контент ещё не дал тексты. Ядро их уже пишет, UI показывает
 * id как есть. Когда content-writer добавит тексты, вид переносится в LOG_KINDS.
 * EventTextSchema уже принимает их, чтобы тексты можно было добавить заранее.
 */
export const PENDING_LOG_KINDS = [] as const satisfies readonly string[];
export type PendingLogKind = (typeof PENDING_LOG_KINDS)[number];
