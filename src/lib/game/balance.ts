// Константы баланса — один к одному с «Приложением A» docs/gdd.md.
// Ключи и значения синхронизированы тестом balance.test.ts (он парсит docs/gdd.md).
// Симулятор и балансер меняют числа ТОЛЬКО здесь (и синхронно в Приложении A).
/* eslint-disable */

export const BALANCE = {
	// A.0 Формат требований
	// A.1 Время и календарь
	/** дней — §0, §3.3 */
	DAYS_PER_MONTH: 30,
	/** мес — §0, §8.6 */
	TERM_MONTHS: 60,
	/** мс — §3.1 адаптер */
	DAY_MS_BY_SPEED: [3000,1500,1000],
	/** мес — §9.7 */
	ELECTION_MONTH: 47,
	/** вер. — §9.7 */
	ELECTION_NEW_ADMIN_CHANCE: 0.5,
	/** множ. — §9.7 */
	ELECTION_PRIORITY_MULTS: [0.85,1,1.15,1],
	/** множ. — §9.7 */
	ELECTION_INFLUENCE_MULT: 0.8,
	// A.2 Старт
	/** k$ — §2.1 */
	START_BUDGET: 1500,
	/** шк. — §2.1 */
	START_REPUTATION: 50,
	/** шк. — §2.1 */
	START_INFLUENCE: 20,
	/** шк. — §2.1 */
	START_EXPOSURE: 10,
	/** шк. — §2.1 */
	START_UNREST: 15,
	/** чел. — §4.2.2 */
	START_ROSTER: {"novice":4,"experienced":2,"veteran":0},
	/** ур. — §4.1 */
	START_DEPARTMENTS: {"analytics":1,"operations":1,"cyber":0,"counterintel":0,"pr":0,"legal":0},
	/** штаты — §6.7 */
	START_FULL_STATES: ["CA","TX","FL","NY","PA","IL","OH","GA","NC","MI"],
	/** ур. — §6.7, остальные 40 штатов */
	START_PARTIAL_LEVEL: 1,
	// A.3 Ресурсы: дрейф, скандалы, следствие
	/** доля/мес — §2.2 */
	REP_MEAN_REVERT: 0.03,
	/** шк. — §2.2 */
	REP_ANCHOR: 50,
	/** шк. — §2.2 */
	REP_SOFTCAP_START: 70,
	/** множ. — §2.2 */
	REP_GAIN_MIN_MULT: 0.1,
	/** доля/мес — §2.4 */
	INFL_MEAN_REVERT: 0.03,
	/** шк. — §2.4 */
	INFL_ANCHOR: 20,
	/** шк./мес — §2.3 */
	EXPOSURE_DECAY: 2,
	/** шк./мес/ур — §2.3 */
	EXPOSURE_DECAY_PER_PR: 0.5,
	/** шк. — §2.3 */
	SCANDAL_EXPOSURE_FLOOR: 10,
	/** вер. — §2.3 */
	SCANDAL_K: 0.6,
	/** вер. — §2.3 */
	SCANDAL_P_MAX: 0.6,
	/** шк. — §2.3 */
	SCANDAL_REP_BASE: 5,
	/** шк./шк. — §2.3 */
	SCANDAL_REP_PER_EXPOSURE: 0.15,
	/** шк. — §2.3 */
	SCANDAL_INVESTIGATION_THRESHOLD: 50,
	/** шк./шк. — §2.3 */
	SCANDAL_INVESTIGATION_PER_EXPOSURE: 0.1,
	/** шк. — §2.3 */
	SCANDAL_EXPOSURE_RELEASE: 10,
	/** шк. — §2.3, §9.6 */
	HEARINGS_EXPOSURE_THRESHOLD: 60,
	/** дней — §9.6 */
	HEARINGS_COOLDOWN_DAYS: 90,
	/** множ. — §6.2, §9.6 */
	HEARING_WEIGHT_MULT: 0.9,
	/** множ. — §6.2, §9.6 */
	HEARING_WEIGHT_MULT_LEGAL3: 0.95,
	/** шк. — §9.6 */
	HEARING_TESTIFY: {"reputation":-3,"influence":-5,"exposure":-5},
	/** шк. — §9.6 */
	HEARING_SECRECY: {"influence":-10,"exposure":5},
	/** шк./мес — §2.6 */
	INVESTIGATION_DECAY: 1,
	/** шк./мес/ур — §2.6 */
	INVESTIGATION_DECAY_PER_LEGAL: 0.5,
	/** шк. — §2.6 */
	INVESTIGATION_FREEZE_THRESHOLD: 50,
	/** множ. — §2.6, §6.2 */
	INVESTIGATION_FREEZE_MULT: 0.8,
	/** шк. — §2.6, §8.6 */
	INVESTIGATION_ARREST_THRESHOLD: 100,
	/** шк./действие — §6.3 */
	DIRTY_INVESTIGATION_PER_ACTION: 1,
	/** дней — §2.5 */
	KOMPROMAT_TTL_DAYS: 360,
	/** шк. — §4.3, §8.5 */
	ILLEGAL_TARGET_EXPOSURE: 12,
	/** шк./мес/ур — §2.4 */
	NET_INFLUENCE_PER_LEVEL: 0.2,
	// A.4 Экономика
	/** k$/мес — §6.2 */
	POOL_START_MONTHLY: 3200,
	/** доля — §6.2 */
	POOL_GROWTH_PER_QUARTER: 0.02,
	/** доля — §6.2 */
	SHARE_FLOOR: 0.05,
	/** множ. — §6.2 */
	PLAN_RATIO_CAP: 1.5,
	/** кварт. — §6.2 */
	PLAN_RATIO_SMOOTHING_QUARTERS: 2,
	/** мес дохода — §6.2 */
	CARRYOVER_CAP_MONTHS: 4,
	/** доля — §6.2 */
	CLAWBACK_RATE: 0.5,
	/** k$/мес — §3.3 */
	HQ_UPKEEP: 150,
	/** мес — §8.6 */
	BANKRUPT_MONTHS: 3,
	/** мес — §8.6 */
	BANKRUPT_GRACE_MONTHS: 9,
	/** мес дохода — §8.6 */
	BANKRUPT_HARD_FLOOR_MONTHS: 6,
	/** распределений — §8.6 */
	DISBAND_GRACE_QUARTERS: 2,
	/** мес дохода — §2.7 */
	CREDIT_LIMIT_MONTHS: 1,
	/** доля/мес — §2.7 */
	CREDIT_INTEREST_RATE: 0.05,
	/** множ. — §6.1, §6.2 */
	SS_PRESIDENT_FAVOR: 1.1,
	/** доля — §6.6 */
	DISBAND_SHARE: 0.12,
	/** кварт. — §6.6 */
	DISBAND_QUARTERS: 2,
	/** доля — §6.6 */
	RIVAL_DISBAND_SHARE: 0.15,
	/** доля — §6.6 */
	COALITION_SHARE: 0.4,
	// A.5 Отделы
	/** ур. — §4.1 */
	DEPT_MAX_LEVEL: 5,
	/** k$ — §4.1 */
	DEPT_COST_BY_LEVEL: [80,160,320,560,900],
	/** дней/ур — §4.1 */
	DEPT_BUILD_DAYS_PER_LEVEL: 10,
	/** k$/мес/ур — §4.1 */
	DEPT_UPKEEP_PER_LEVEL: 20,
	/** ур. — §4.1 */
	DEPT_REQUIREMENTS: {"operations":{"3":{"analytics":2}},"cyber":{"1":{"analytics":1},"3":{"analytics":2}},"counterintel":{"1":{"analytics":1},"3":{"cyber":2}}},
	/** шк./мес/ур — §2.2 */
	PR_PASSIVE_REP: 0.3,
	/** доля/ур — §2.3, §6.4 */
	PR_SCANDAL_REDUCTION: 0.1,
	/** k$, шк., дней — §6.3 */
	PR_CAMPAIGN: {"cost":60,"repBase":2,"repPerLevel":1,"cooldownDays":30},
	/** доля/ур — §2.2, §5.3 */
	LEGAL_FAIL_REDUCTION: 0.08,
	/** доля/ур — §2.6 */
	LEGAL_INVESTIGATION_REDUCTION: 0.1,
	/** вер./ур — §6.3 */
	CYBER_LEAK_REVEAL_REDUCTION: 0.03,
	/** вер./ур — §6.4 */
	CI_DEFENSE_PER_LEVEL: 0.06,
	/** доля/ур — §4.2.7, §6.4 */
	CI_DEFECTION_REDUCTION: 0.12,
	/** чел. — §4.2.1 */
	AGENT_CAP_BASE: 4,
	/** JP — §4.2.1 */
	AGENT_CAP_JP_DIVISOR: 10,
	/** чел./ур — §4.2.1 */
	AGENT_CAP_PER_OPS_LEVEL: 2,
	// A.6 Агенты
	/** канд. — §4.2.2 */
	HIRE_POOL_SIZE: 5,
	/** вес — §4.2.2 */
	HIRE_RANK_WEIGHTS: {"novice":55,"experienced":33,"veteran":12},
	/** k$ — §4.2.2 */
	HIRE_COST_NOVICE: 50,
	/** k$ — §4.2.2 */
	HIRE_COST_EXPERIENCED: 150,
	/** k$ — §4.2.2 */
	HIRE_COST_VETERAN: 400,
	/** k$/мес — §4.2.6 */
	SALARY_NOVICE: 25,
	/** k$/мес — §4.2.6 */
	SALARY_EXPERIENCED: 50,
	/** k$/мес — §4.2.6 */
	SALARY_VETERAN: 90,
	/** доля/ур — §4.2.6 */
	SALARY_LEVEL_STEP: 0.05,
	/** множ. — §4.2.6 */
	SALARY_MULTS: [1,1.25,1.5],
	/** навык — §4.2.2 */
	SKILL_RANGE_BY_RANK: {"novice":[1,3],"experienced":[4,6],"veteran":[7,9]},
	/** шк. — §4.2.2 */
	LOYALTY_RANGE_BY_RANK: {"novice":[70,85],"experienced":[50,69],"veteran":[20,80]},
	/** ур. — §4.2.2 */
	START_LEVEL_BY_RANK: {"novice":1,"experienced":2,"veteran":3},
	/** вер. — §4.2.2 */
	HIRE_TRAIT_CHANCE: 0.4,
	/** вер. — §4.2.2 */
	VETERAN_PAST_CHANCE: 0.3,
	/** вес — §4.2.5 */
	TRAIT_WEIGHTS: {"corrupt":20,"hero":20,"blabbermouth":20,"workaholic":20,"idealist":20},
	/** разн. — §4.2.5 */
	TRAIT_CORRUPT: {"loyaltyPerMonth":-2,"theftChance":0.05,"theftAmount":20,"theftExposure":2,"moleMult":2},
	/** вер. — §4.2.5 */
	TRAIT_HERO_TERROR_BONUS: 0.05,
	/** шк. — §4.2.5 */
	TRAIT_HERO_REP_ON_SUCCESS: 1,
	/** шк./оп. — §4.2.5 */
	TRAIT_BLABBERMOUTH_EXPOSURE: 1,
	/** шк. — §4.2.5 */
	TRAIT_IDEALIST: {"loyaltyPerMonth":1,"dirtyPenalty":-10},
	/** разн. — §4.2.5 */
	TRAIT_WITH_PAST: {"opBonus":0.05,"rivalKompromat":1},
	/** шк. — §4.2.2 */
	FIRE_LOYALTY_PENALTY: 1,
	/** XP — §4.2.3 */
	XP_SUCCESS_BASE: 20,
	/** XP — §4.2.3 */
	XP_PER_DIFFICULTY: 10,
	/** XP — §4.2.3 */
	XP_FAIL: 10,
	/** XP — §4.2.4 */
	XP_TRAINING: 20,
	/** XP — §4.2.3 */
	XP_LEVEL_THRESHOLDS: [0,100,250,450,700],
	/** ур. — §4.2.3 */
	AGENT_MAX_LEVEL: 5,
	/** навык — §4.2.3 */
	SKILL_MAX: 10,
	/** разн. — §4.2.3 */
	PERK_EFFECTS: {"cold_blooded":{"borderFail":-0.05,"infiltrate":0.05},"marksman":{"terror":0.05,"death":-0.05},"analyst":{"investigation":0.05},"ghost":{"exposureMult":0.5},"mentor":{"teamXpMult":1.5},"iron_will":{"loyaltyFloor":40},"negotiator":{"interrogation":0.1},"netrunner":{"surveillance":0.05}},
	/** дней — §4.2.4 */
	TRAINING_SKILL_DAYS: 20,
	/** k$ — §4.2.4 */
	TRAINING_SKILL_COST: 40,
	/** навык — §4.2.4 */
	TRAINING_SKILL_CAP: 8,
	/** дней — §4.2.4 */
	TRAINING_LANGUAGE_DAYS: 30,
	/** k$ — §4.2.4 */
	TRAINING_LANGUAGE_COST: 40,
	/** вер. — §4.2.4, §9.1 */
	TRAINING_LANGUAGE_BORDER_BONUS: 0.03,
	/** множ. — §4.2.4, §9.1 */
	TRAINING_LANGUAGE_NET_MULT: 1.1,
	/** дней — §4.2.4 */
	TRAINING_LEGEND_DAYS: 20,
	/** k$ — §4.2.4 */
	TRAINING_LEGEND_COST: 30,
	/** вер. — §4.2.4 */
	TRAINING_LEGEND_BONUS: 0.05,
	/** шк./мес — §4.2.7 */
	LOYALTY_PAID: 1,
	/** шк./мес — §4.2.6, §4.2.7 */
	LOYALTY_UNPAID: -10,
	/** шк./мес — §4.2.7 */
	LOYALTY_SALARY_BONUS: {"1":0,"1.25":2,"1.5":4},
	/** шк. — §4.2.7 */
	LOYALTY_PER_SUCCESS: 3,
	/** шк. — §4.2.7 */
	LOYALTY_PER_FAIL: 5,
	/** шк./мес — §4.2.7 */
	LOYALTY_OVERWORK: 3,
	/** дней — §4.2.7 */
	OVERWORK_STREAK_DAYS: 60,
	/** дней — §4.2.7 */
	OVERWORK_REST_DAYS: 5,
	/** k$ — §4.2.7 */
	MEDAL_COST: 20,
	/** шк. — §4.2.7 */
	MEDAL_LOYALTY: 10,
	/** дней — §4.2.7 */
	MEDAL_COOLDOWN_DAYS: 180,
	/** шк. — §4.2.7, §6.3 */
	SCAPEGOAT_LOYALTY_PENALTY: 5,
	/** вер./мес — §4.2.7 */
	RAISE_REQUEST_CHANCE: 0.08,
	/** разн. — §4.2.7 */
	RAISE_ACCEPT: {"salaryMultStep":0.25,"loyalty":10},
	/** шк. — §4.2.7 */
	RAISE_REFUSE_LOYALTY: -10,
	/** шк. — §4.2.7 (границы 0–19/20–39/40–69/70–100) */
	LOYALTY_BANDS: [20,40,70],
	/** вер./мес — §4.2.7 */
	DEFECT_CHANCE_LOW: 0.03,
	/** вер./мес — §4.2.7 */
	DEFECT_CHANCE_CRITICAL: 0.1,
	/** шт. — §4.2.7 */
	DEFECTOR_KOMPROMAT: 2,
	/** вер. — §4.2.7 */
	DEFECTOR_RETURN_CHANCE: 0.25,
	/** дней — §4.2.7 */
	DEFECTOR_RETURN_DELAY_DAYS: [90,360],
	/** шк. — §9.5 */
	DEFECTOR_RETURN_LOYALTY: 20,
	/** шк. — §4.2.7 */
	DEFECTOR_LEADER_MIN_UNREST: 40,
	/** вер. — §4.2.7 */
	DEFECTOR_LEADER_CHANCE: 0.5,
	// A.7 Операции, дела, план
	/** k$ — §5.1 */
	OP_COST: {"investigation":30,"terror":100,"infiltration":60,"surveillance":25},
	/** чел. — §5.1 */
	OP_AGENTS_REQUIRED: {"investigation":2,"terror":4,"infiltration":1,"surveillance":1},
	/** дней — §5.1 */
	OP_DURATION_DAYS: {"investigation":30,"terror":30,"infiltration":40,"surveillance":15},
	/** вер. — §5.2 */
	OP_BASE_CHANCE: {"investigation":0.6,"terror":0.4,"infiltration":0.45,"surveillance":0.65},
	/** — — §5.2 */
	OP_DEPT: {"investigation":"analytics","terror":"operations","infiltration":"counterintel","surveillance":"cyber"},
	/** — — §5.2 (max из списка) */
	OP_PRIMARY_SKILL: {"investigation":["interrogation","surveillance"],"terror":["combat"],"infiltration":["surveillance"],"surveillance":["surveillance","hacking"]},
	/** чел. — §5.1 */
	OP_MAX_EXTRA_AGENTS: 2,
	/** вер./навык — §5.2 */
	OP_SKILL_COEF: 0.04,
	/** навык — §5.2 */
	OP_SKILL_PIVOT: 5,
	/** вер./ур — §5.2 */
	OP_DEPT_COEF: 0.03,
	/** вер./ур — §5.2 */
	OP_LEVEL_COEF: 0.02,
	/** вер./чел — §5.2 */
	OP_REINFORCE_BONUS: 0.04,
	/** множ. — §5.2 */
	OP_LATE_REINFORCE_FACTOR: 0.5,
	/** вер./ур — §5.2 */
	OP_DIFFICULTY_COEF: 0.06,
	/** вер. — §5.2, §6.4 */
	OP_MOLE_PENALTY: 0.1,
	/** вер. — §5.2 */
	OP_CHANCE_MIN: 0.05,
	/** вер. — §5.2 */
	OP_CHANCE_MAX: 0.95,
	/** доля — §5.2 */
	OP_CANCEL_REFUND: 0.5,
	/** ур. — §5.1 */
	OP_TARGET_DIFFICULTY: {"rival":3,"leader":2,"senator":4,"president":5},
	/** шк. — §5.3 */
	OP_INVEST_REP_SUCCESS: 2,
	/** шк. — §5.3 */
	OP_INVEST_REP_FAIL: -2,
	/** очк. — §5.3 */
	OP_INVEST_PLAN_POINTS: 1,
	/** k$ — §5.3 */
	OP_INVEST_REWARD_BASE: 20,
	/** k$ — §5.3 */
	OP_INVEST_REWARD_PER_DIFF: 15,
	/** шк. — §5.3 */
	OP_TERROR_REP_SUCCESS: 6,
	/** шк. — §5.3 */
	OP_TERROR_REP_FAIL: -8,
	/** очк. — §5.3 */
	OP_TERROR_PLAN_POINTS: 3,
	/** шк. — §5.3 */
	OP_TERROR_INFLUENCE: 3,
	/** k$ — §5.3 */
	OP_TERROR_REWARD_BASE: 150,
	/** k$ — §5.3 */
	OP_TERROR_REWARD_PER_DIFF: 30,
	/** шк. — §5.3 */
	OP_TERROR_FAIL_EXPOSURE: 8,
	/** вер. — §5.3 */
	OP_TERROR_DEATH: {"base":0.15,"perCombat":0.02,"min":0.03,"max":0.25},
	/** разн. — §5.3 */
	OP_INFILTRATION_FAIL: {"exposure":5,"lossChance":0.5,"loyalty":-10,"rivalKompromat":1},
	/** вер./мес — §5.3 */
	EMBED_KOMPROMAT_CHANCE: 0.5,
	/** сила — §5.3 */
	EMBED_KOMPROMAT_STRENGTH: 2,
	/** вер./мес — §5.3 */
	EMBED_DETECT_CHANCE: 0.04,
	/** шк. — §5.3 */
	OP_SURVEILLANCE_SUCCESS_EXPOSURE: 1,
	/** шк. — §5.3 */
	OP_SURVEILLANCE_FAIL_EXPOSURE: 5,
	/** вер. — §5.3, §9.4 */
	RANDOM_FIND_CHANCE: 0.05,
	/** дел/мес — §5.4 */
	CASE_BASE_PER_MONTH: 6,
	/** дел/мес/год — §5.4 */
	CASE_GROWTH_PER_YEAR: 1,
	/** дел/мес — §5.4 */
	TERROR_PER_MONTH: 0.5,
	/** вес (d1..d5) — §5.4 */
	CASE_DIFFICULTY_WEIGHTS: [25,30,25,15,5],
	/** вес (d1..d5) — §5.4 */
	TERROR_DIFFICULTY_WEIGHTS: [0,0,40,40,20],
	/** дней — §5.4 */
	CASE_TIMER_DAYS: 15,
	/** дней — §5.4 */
	TERROR_TIMER_DAYS: 10,
	/** ур. — §5.4 */
	PARTIAL_JURISDICTION_MAX_DIFFICULTY: 3,
	/** ур. — §6.3 */
	HIGH_PROFILE_MIN_DIFFICULTY: 4,
	/** разн. — §6.3 */
	HIGH_PROFILE_STATE_UPGRADE: {"count":3,"windowDays":180},
	/** сила — §5.4 */
	EVIDENCE_STRENGTH_RANGE: [1,3],
	/** сила — §5.4, §9.3 */
	EVIDENCE_STRENGTH_MAX: 3,
	/** ур. Слежки — §5.4 */
	EVIDENCE_SURV_BONUS_MIN_LEVEL: 4,
	/** ур. — §5.1 */
	SENATOR_RESISTANCE_RANGE: [1,3],
	/** ур. — §5.1 */
	SENATOR_RESISTANCE_PIVOT: 2,
	/** очк./агент/мес — §5.5 */
	PLAN_PER_AGENT: 0.27,
	/** очк. — §5.5 */
	PLAN_MIN: 4,
	/** очк. — §5.5 */
	PLAN_FIRST_QUARTER: 4,
	/** очк./кварт. (годы 1..5) — §5.5 */
	PLAN_BASE_BY_YEAR: [6,9,11,13,15],
	/** шк. — §5.5 */
	PLAN_OVER_REP: 3,
	/** шк. — §5.5 */
	PLAN_OVER_INFL: 2,
	/** шк. — §5.5 (ratio ≥ 1.3) */
	PLAN_OVER_INFL_HIGH: 4,
	/** доля — §5.5 */
	PLAN_HIGH_RATIO: 1.3,
	/** доля — §5.5 */
	PLAN_FAIL_RATIO: 0.7,
	/** шк. — §5.5 */
	PLAN_FAIL_REP: -5,
	/** доля — §5.5, §8.6 */
	PLAN_CRITICAL_RATIO: 0.5,
	/** кварт. — §8.6 */
	PLAN_CRITICAL_QUARTERS: 3,
	/** кварт. — §5.5, §8.6 */
	DISMISS_GRACE_QUARTERS: 1,
	/** доля — §4.4.2, §5.5 */
	CONTROL_PLAN_REDUCTION: 0.3,
	/** доля — §5.5 */
	FAKE_MAX_SHARE: 0.3,
	/** шк. — §5.5 */
	FAKE_EXPOSURE_PER_POINT: 1,
	/** вер. — §5.5 */
	FAKE_CATCH_K: 0.005,
	/** вер. — §5.5 */
	FAKE_CATCH_MAX: 0.8,
	/** шк. — §5.5 */
	FAKE_CAUGHT: {"reputation":-15,"exposure":15,"investigation":15},
	// A.8 Слежка, репрессии, лидеры
	/** k$ — §4.3 */
	SURV_COST_BY_LEVEL: [50,100,200,350,500,800],
	/** дней/ур — §4.3 */
	SURV_BUILD_DAYS_PER_LEVEL: 15,
	/** k$/мес/ур — §4.3 */
	SURV_UPKEEP_PER_LEVEL: 15,
	/** ур. Кибер (для ур. 1..6) — §4.3 */
	SURV_REQ_CYBER: [0,1,2,3,4,5],
	/** tech id — §4.3 */
	SURV_L6_REQ_TECH: "A2",
	/** шк./мес (ур. 0..6) — §2.3, §4.3 */
	SURV_EXPOSURE_MONTHLY: [0,0,0,0.5,1,2,4],
	/** вер./ур — §5.2 */
	SURV_INVEST_BONUS_PER_LEVEL: 0.02,
	/** множ. — §4.3 */
	SURV_L2_DURATION_MULT: 0.9,
	/** дней — §4.3, §5.4 */
	SURV_L3_CASE_TIMER_BONUS: 5,
	/** вер. — §4.3, §5.2 */
	SURV_L4_SURVEILLANCE_BONUS: 0.1,
	/** шт. — §4.3 */
	SURV_L6_KOMPROMAT_MULT: 2,
	/** дней — §4.3 */
	WARRANT_BASE_DAYS: 10,
	/** дней/ур — §4.3 */
	WARRANT_DAYS_PER_LEGAL: 2,
	/** дней — §4.3 */
	WARRANT_MIN_DAYS: 2,
	/** k$ — §4.4.1 */
	REPR_COST_BY_LEVEL: [80,160,240,320,400,480,560],
	/** дней — §4.4.1 */
	REPR_BUILD_DAYS: 15,
	/** k$/мес/ур — §4.4.1 */
	REPR_UPKEEP_PER_LEVEL: 20,
	/** шк. (ур. 1..7) — §4.4.2 */
	REPR_CONTROL: [5,10,15,15,20,25,30],
	/** шк. (ур. 1..7) — §4.4.1 */
	REPR_UNREST_ON_ENABLE: [2,5,8,12,20,15,0],
	/** требование (ур. 1..7) — §4.4.1; формат `req` см. A.0 */
	REPR_REQUIREMENTS: [{"surv":2},{"surv":2},{"surv":3},{"dept":{"pr":2}},{"dept":{"legal":3}},{"surv":5},{"surv":6,"tech":["A3"]}],
	/** сила — §4.4.1 */
	REPR_L3_KOMPROMAT_STRENGTH: 1,
	/** шк./мес/ур — §2.3 */
	REPR_EXPOSURE_PER_LEVEL: 1,
	/** шк./мес/ур — §4.4.3 */
	REPR_UNREST_MONTHLY_PER_LEVEL: 0.5,
	/** вер. — §5.2 */
	REPR_L1_INVEST_BONUS: 0.03,
	/** множ. — §5.5 */
	REPR_L2_PLAN_MULT: 0.95,
	/** дел/мес — §4.4.1 */
	REPR_L3_EXTRA_CASES: 2,
	/** вер./мес — §4.4.1 */
	REPR_L3_KOMPROMAT_CHANCE: 0.5,
	/** множ. — §2.3 */
	REPR_CENSORSHIP_SCANDAL_MULT: 0.5,
	/** шк. — §4.4.1 */
	REPR_L5_REMOVE_LEADER: {"unrest":5,"exposure":5},
	/** шк. — §4.4.3 */
	REPR_L7_UNREST_CAP: 30,
	/** шк./мес — §4.4.3 */
	REPR_L7_UNREST_DRAIN: 5,
	/** вер./мес/ур — §9.1 */
	REPR_NET_FAIL_PER_LEVEL: 0.005,
	/** шк. — §4.4.2 */
	CONTROL_UNREST_PIVOT: 50,
	/** шк./мес — §4.4.2 */
	CONTROL_BONUS_DECAY: 1,
	/** шк./мес — §4.4.3 */
	UNREST_DECAY: 3,
	/** дней — §4.4.3 */
	THAW_WINDOW_DAYS: 30,
	/** ур. — §4.4.3 */
	THAW_MIN_LEVELS: 2,
	/** шк. — §4.4.3 */
	THAW_EFFECT: {"unrest":-15,"exposure":10,"investigation":10},
	/** шк. — §4.4.4 */
	PROTEST_THRESHOLD: 50,
	/** шк. — §4.4.4 */
	PROTEST_STEP: 10,
	/** шк. — §4.4.4 */
	PROTEST_MISSING_AGENT_REP: -2,
	/** шк. — §4.4.4 */
	RIOT_THRESHOLD: 80,
	/** шк./мес — §2.3 */
	UNREST_RIOT_LEAK_EXPOSURE: 5,
	/** вер. — §4.4.4 */
	COUP_COEF: 0.02,
	/** вер./мес — §4.4.4 */
	COUP_P_MAX: 0.1,
	/** шк. — §4.4.4 */
	COUP_UNREST_PIVOT: 75,
	/** шк. — §4.4.4 */
	COUP_UNREST_STEP: 5,
	/** шк. — §4.4.5 */
	LEADER_SPAWN_THRESHOLD: 40,
	/** шк. — §4.4.5 */
	LEADER_SPAWN_STEP: 20,
	/** шт. — §4.4.5 */
	LEADER_MAX: 3,
	/** вер./мес — §4.4.5 */
	LEADER_SPAWN_CHANCE: 0.3,
	/** шк. — §4.4.5 */
	LEADER_START_INFLUENCE: {"default":20,"blogger":30},
	/** шк./мес — §4.4.5 */
	LEADER_GROWTH: {"default":4,"blogger":6},
	/** шк./мес — §4.4.5 */
	LEADER_DECLINE: 4,
	/** шк. — §4.4.5 */
	LEADER_DECLINE_BELOW_UNREST: 40,
	/** шк./шк. — §4.4.3 */
	LEADER_UNREST_COEF: 0.02,
	/** шк. — §4.4.5 */
	LEADER_PEAK_EFFECT: {"protestUnrest":10,"protestExposure":5,"rivalInfluence":10,"resetTo":70},
	/** шк. — §4.4.5 */
	LEADER_QUEST_INFLUENCE: 60,
	/** шк. — §4.4.5 */
	LEADER_STRIKE_INFLUENCE: 50,
	/** шк./мес — §4.4.5 */
	LEADER_RIGHTS_EXPOSURE: 0.5,
	/** множ. — §4.4.3, §4.4.5 */
	LEADER_RIGHTS_UNREST_MULT: 0.5,
	/** вер. — §4.4.5 */
	LEADER_PEAK_PROTEST_CHANCE: 0.5,
	// A.9 Технологии
	/** k$ — §4.5 */
	TECH_COST_BY_TIER: [300,600,1000],
	/** дней — §4.5 */
	TECH_DAYS_BY_TIER: [60,90,120],
	/** шт. — §4.5 */
	TECH_MAX_APEX: 1,
	/** вер. — §4.5, §5.2 */
	TECH_A1_INVEST_BONUS: 0.05,
	/** дел/мес — §4.5, §5.4 */
	TECH_A2_EXTRA_CASES: 1,
	/** множ. — §4.5, §6.3 */
	TECH_C1_DIRTY_COST_MULT: 0.7,
	/** множ. — §4.5, §6.3 */
	TECH_C1_DIRTY_EXPOSURE_MULT: 0.75,
	/** вер. — §4.5, §5.2 */
	TECH_C2_SENATOR_BONUS: 0.15,
	/** ур. — §4.5, §9.1 */
	NET_CAP_BY_TECH: {"none":0,"B1":2,"B2":3,"B3":5},
	/** множ. — §9.1 */
	TECH_B2_NET_MULT: 1.25,
	/** доля — §4.5 */
	RESEARCH_CANCEL_REFUND: 0.5,
	/** требование — §4.5; формат `req` см. A.0 */
	TECH_TREE: {"A1":{"branch":"A","tier":1,"req":{"surv":2}},"A2":{"branch":"A","tier":2,"req":{"tech":["A1"]}},"A3":{"branch":"A","tier":3,"req":{"tech":["A2"],"repr":6}},"B1":{"branch":"B","tier":1,"req":{}},"B2":{"branch":"B","tier":2,"req":{"tech":["B1"],"dept":{"counterintel":1}}},"B3":{"branch":"B","tier":3,"req":{"tech":["B2"]}},"C1":{"branch":"C","tier":1,"req":{"dept":{"cyber":1}}},"C2":{"branch":"C","tier":2,"req":{"tech":["C1"]}},"C3":{"branch":"C","tier":3,"req":{"tech":["C2"],"surv":6}}},
	// A.10 Конкуренты и действия
	/** шк. — §6.1 */
	RIVAL_START: {"police":{"rep":45,"infl":25},"cia":{"rep":50,"infl":35},"secret_service":{"rep":60,"infl":30}},
	/** доля — §6.2 */
	RIVAL_PLAN_MEAN: {"police":0.95,"cia":0.9,"secret_service":1},
	/** доля — §6.2 */
	RIVAL_PLAN_SPREAD: {"police":0.15,"cia":0.15,"secret_service":0.05},
	/** доля/мес — §6.1 */
	RIVAL_MEAN_REVERT: 0.05,
	/** доля — §5.4, §6.2 */
	RIVAL_PLAN_PER_LOST_CASE: 0.02,
	/** — — §6.4 */
	RIVAL_STYLE: {"police":"mass","cia":"intriguer","secret_service":"courtier"},
	/** дней — §6.4 */
	AI_ACTION_INTERVAL_DAYS: {"police":8,"cia":10,"secret_service":10},
	/** множ. — §6.4, §6.6 */
	AI_COALITION_INTERVAL_MULT: 0.7,
	/** множ. — §6.4 */
	AI_HOSTILITY_BASE: 0.5,
	/** множ. — §6.4 */
	AI_HOSTILITY_SHARE_COEF: 2,
	/** множ. — §6.4 */
	AI_HOSTILITY_GRUDGE: 0.5,
	/** множ. — §6.4 */
	AI_HOSTILITY_COALITION: 1,
	/** множ. — §6.4 */
	AI_HOSTILITY_CIA_NETWORK: 0.5,
	/** ур. — §6.4 */
	AI_HOSTILITY_CIA_NETWORK_LEVEL: 3,
	/** множ. — §6.4 */
	AI_HOSTILITY_MIN: 0.2,
	/** множ. — §6.4 */
	AI_HOSTILITY_MAX: 2.5,
	/** вес — §6.4 */
	AI_WEIGHTS: {"mass":{"WORK_PLAN":40,"PR":15,"LOBBY_SELF":10,"ATTACK_RIVAL":5,"SURVEIL_PLAYER":5,"DIG_DIRECTOR":5,"LEAK_FAILURES":5,"CUT_JURISDICTION":10,"PLANT_MOLE":0,"POACH_AGENT":5},"intriguer":{"WORK_PLAN":15,"PR":10,"LOBBY_SELF":10,"ATTACK_RIVAL":5,"SURVEIL_PLAYER":20,"DIG_DIRECTOR":15,"LEAK_FAILURES":10,"CUT_JURISDICTION":5,"PLANT_MOLE":10,"POACH_AGENT":5},"courtier":{"WORK_PLAN":25,"PR":15,"LOBBY_SELF":25,"ATTACK_RIVAL":5,"SURVEIL_PLAYER":5,"DIG_DIRECTOR":5,"LEAK_FAILURES":5,"CUT_JURISDICTION":15,"PLANT_MOLE":0,"POACH_AGENT":0}},
	/** вер. — §6.4 */
	AI_ACTION_BASE: {"WORK_PLAN":1,"PR":1,"LOBBY_SELF":1,"ATTACK_RIVAL":0.5,"SURVEIL_PLAYER":0.5,"DIG_DIRECTOR":0.5,"LEAK_FAILURES":0.6,"CUT_JURISDICTION":0.35,"PLANT_MOLE":0.3,"POACH_AGENT":0.25},
	/** вер./шк. — §6.4 */
	AI_SURVEIL_PER_EXPOSURE: 0.004,
	/** вер./шк. — §6.4 */
	AI_POACH_PER_LOYALTY: 0.005,
	/** вер./доля — §6.4 */
	AI_SHARE_COEF: 0.4,
	/** доля — §6.4 */
	AI_SHARE_PIVOT: 0.25,
	/** вер. — §6.1, §6.4 */
	AI_POLICE_PENALTY: 0.05,
	/** вер. — §6.4 */
	AI_CHANCE_MIN: 0.05,
	/** вер. — §6.4 */
	AI_CHANCE_MAX: 0.9,
	/** разн. — §6.4 */
	AI_EFFECTS: {"WORK_PLAN":{"plan":0.05},"PR":{"rep":2},"LOBBY_SELF":{"infl":3},"ATTACK_RIVAL":{"rep":-3},"SURVEIL_PLAYER":{"kompromat":1},"DIG_DIRECTOR":{"investigation":6,"kompromatCost":1},"LEAK_FAILURES":{"rep":-4,"exposure":3,"windowDays":60},"CUT_JURISDICTION":{"levels":1,"minInfl":30,"minInflSS":40},"PLANT_MOLE":{"maxLoyalty":40},"POACH_AGENT":{"maxLoyalty":50,"kompromat":1}},
	/** вер. — §6.4 */
	AI_DETECT_BASE: 0.2,
	/** вер./ур — §6.4 */
	AI_DETECT_PER_CI: 0.15,
	/** вер. — §6.4 */
	AI_DETECT_MAX: 0.95,
	/** вер./мес — §6.4 */
	MOLE_MONTHLY_KOMPROMAT_CHANCE: 0.5,
	/** вер./мес/ур — §6.4 */
	MOLE_PASSIVE_DETECT_PER_CI: 0.05,
	/** разн. — §6.3 */
	ACT_LEAK: {"cost":30,"repPerStrength":-3.5,"exposure":3,"revealBase":0.2,"revealMin":0.05,"revealRep":-5,"revealExposure":8,"grudgeDays":90},
	/** разн. — §6.3 */
	ACT_INTERCEPT: {"cost":20,"influence":5,"targetPlan":-0.03,"riskChance":0.15,"riskInfluence":-5,"grudgeDays":90},
	/** разн. — §6.3 */
	ACT_SABOTAGE: {"cost":50,"targetPlan":-0.15,"targetRep":-5,"exposure":2,"revealBase":0.15,"revealPerPrev":0.05,"revealMax":0.8,"revealRep":-15,"revealExposure":20,"revealInvestigation":15},
	/** разн. — §6.3 */
	ACT_LOBBY: {"cost":60,"influence":15,"minInfluence":15,"targetMult":0.8,"multMin":0.5,"backfireChance":0.1,"backfireInfluence":-10},
	/** разн. — §6.3 */
	ACT_POACH: {"cost":150,"loyalty":40,"targetPlan":-0.05,"moleBase":0.2,"molePerCI":0.03,"moleMin":0.02},
	/** разн. — §6.3 */
	ACT_CONGRESS_WORK: {"cost":50,"influence":3,"cooldownDays":30},
	/** разн. — §6.3 */
	ACT_ABSORB: {"cost":1000,"influence":30,"days":30,"maxTargetRep":20,"minInfluence":60,"base":0.5,"perInfl":0.01,"perRep":0.01,"min":0.1,"max":0.9,"novices":3,"failInfluence":-15,"grudgeDays":180,"collapseMinInfluence":30,"collapseBonus":0.2,"collapseCost":600},
	/** разн. — §6.3 */
	ACT_COUNTER_KOMPROMAT: {"investigationBase":-5,"investigationPerStrength":-5,"digBlockDays":90,"exposure":3,"cooldownDays":90},
	/** шк. — §6.3 */
	ACT_SCAPEGOAT: {"investigation":-20,"exposure":-10},
	/** разн. — §6.3 */
	ACT_LOYALTY_CHECK: {"cost":30,"days":10,"base":0.4,"perCI":0.1},
	/** разн. — §6.3 */
	ACT_RESTORE_STATE: {"cost":50,"influence":10,"base":0.4,"perInfl":0.004,"perHighProfile":0.05,"min":0.1,"max":0.9},
	// A.11 Карточки
	/** дней — §7 */
	CARD_INTERVAL_MIN_DAYS: 60,
	/** дней — §7 */
	CARD_INTERVAL_MAX_DAYS: 120,
	/** дней — §7 */
	CARD_REPEAT_COOLDOWN_DAYS: 360,
	/** вес — §7 */
	CARD_WEIGHTS: {"defense_cut":10,"terror_attack":10,"document_leak":10,"congress_hearings":8,"blockbuster":8,"surveillance_program_leak":6,"budget_surplus":6,"police_brutality":6,"diplomatic_crisis":6,"cyber_attack":6,"president_demands":6},
	/** разн. — §7 */
	CARD_DEFENSE_CUT: {"incomeMult":0.85,"months":6},
	/** разн. — §7 */
	CARD_TERROR_ATTACK: {"difficulty":4,"timerDays":20,"raceDays":[15,30],"bonus":300,"rivalPlan":0.2},
	/** разн. — §7 */
	CARD_DOCUMENT_LEAK: {"rep":-8,"exposure":10,"aiTargetWeight":20},
	/** разн. — §7 */
	CARD_HEARINGS_AI: {"rep":-5,"weightMult":0.9,"playerExposureThreshold":20},
	/** шк. — §7 */
	CARD_BLOCKBUSTER_REP: 6,
	/** разн. — §7 */
	CARD_SURV_LEAK: {"exposure":15,"rep":-10,"minSurv":5,"ciWeightReduction":0.15},
	/** разн. — §7 */
	CARD_BUDGET_SURPLUS: {"incomeMult":1.1,"months":3},
	/** шк. — §7 */
	CARD_POLICE_BRUTALITY_REP: -10,
	/** разн. — §7 */
	CARD_DIPLOMATIC_CRISIS: {"ciaWeightMult":0.85,"netFail":0.05,"months":3},
	/** разн. — §7 */
	CARD_CYBER_ATTACK: {"difficulty":4,"timerDays":30,"rewardMult":2,"minCyber":2},
	/** множ. — §5.5, §7 */
	CARD_PRESIDENT_DEMANDS_PLAN_MULT: 1.2,
	// A.12 Сети, заброска, квесты
	/** — — §8.2, §9.1 */
	SHADOW_COUNTRIES: {"fbi":["canada","mexico","cuba"],"cia":["canada","mexico","cuba"],"mossad":["egypt","jordan","syria","lebanon"]},
	/** вер./мес — §9.1 */
	COUNTRY_CI: {"canada":0.01,"mexico":0.015,"cuba":0.03},
	/** множ. — §9.1 */
	ALLY_COUNTRIES_FAIL_EXPOSURE_MULT: {"canada":1.5},
	/** ур. — §9.1 */
	NET_MAX_LEVEL: 5,
	/** прогр./мес — §9.1 */
	NET_PROGRESS_PER_AGENT: 0.28,
	/** доля/навык — §9.1 */
	NET_SKILL_COEF: 0.05,
	/** прогр.×(ур+1) — §9.1 */
	NET_PROGRESS_TO_NEXT: 0.5,
	/** вер./мес/ур — §9.1 */
	NET_KOMPROMAT_PER_LEVEL: 0.04,
	/** доля — §9.1 */
	NET_KOMPROMAT_RIVAL_SHARE: 0.7,
	/** вер./мес/ур — §9.1 */
	NET_FAIL_PER_LEVEL: 0.005,
	/** вер./ур — §9.1 */
	NET_FAIL_CI_REDUCTION: 0.004,
	/** вер. — §9.1 */
	NET_FAIL_MIN: 0.005,
	/** вер. — §9.1 */
	NET_FAIL_MAX: 0.2,
	/** разн. — §9.1 */
	NET_FAIL_EFFECT: {"levels":-1,"rep":-5,"exposure":8},
	/** вер./мес — §9.1, §9.4 */
	DOUBLE_AGENT_CHANCE: 0.03,
	/** ур. — §9.1 */
	DOUBLE_AGENT_MIN_LEVEL: 2,
	/** разн. — §9.1 */
	NET_PURGE: {"cost":50,"days":20},
	/** дней — §9.1 */
	NET_RECALL_DAYS: 10,
	/** разн. — §9.1 */
	PRISONER_EXCHANGE: {"cost":100,"influence":-5,"loyalty":10},
	/** вер. — §9.1 */
	LEGEND_BORDER_FAIL: {"diplomat":0.05,"businessman":0.1,"journalist":0.15,"student":0.2},
	/** вер. — §9.1 */
	LEGEND_INFILTRATE_BONUS: {"diplomat":0,"businessman":0.05,"journalist":0.05,"student":0.1},
	/** множ. — §9.1 */
	LEGEND_NET_GROWTH: {"diplomat":0.8,"businessman":1,"journalist":1.2,"student":0.7},
	/** k$ — §9.1 */
	LEGEND_COST: {"diplomat":80,"businessman":60,"journalist":40,"student":20},
	/** дней — §9.1 */
	ZABROSKA_PREP_DAYS: 20,
	/** вер. — §9.1 */
	ZABROSKA_PREP_BONUS: 0.1,
	/** дней — §9.1 */
	ZABROSKA_INFILTRATE_DAYS: 30,
	/** вер. — §9.1 */
	ZABROSKA_INFILTRATE_BASE: 0.5,
	/** вер./навык — §9.1 */
	ZABROSKA_SKILL_COEF: 0.04,
	/** навык — §9.1 */
	ZABROSKA_SKILL_PIVOT: 5,
	/** вер. — §9.1 */
	ZABROSKA_CHANCE_MIN: 0.05,
	/** вер. — §9.1 */
	ZABROSKA_CHANCE_MAX: 0.95,
	/** вер. — §9.1 */
	BORDER_FAIL_MIN: 0.01,
	/** вер. — §9.1 */
	BORDER_FAIL_MAX: 1,
	/** шк. — §9.1 */
	ZABROSKA_FAIL_EXPOSURE: 3,
	/** вер. — §9.1, §9.4 */
	AIRPORT_RECOGNIZED_CHANCE: 0.1,
	/** разн. — §9.1 */
	RECRUIT_METHODS: {"money":{"cost":60,"p":0.7},"ideology":{"cost":0,"p":0.4},"kompromat":{"kompromat":1,"p":0.85,"doubleAgentMult":2}},
	/** дней — §9.1 */
	RECRUIT_RETRY_DAYS: 30,
	/** — — §9.1 */
	RECRUIT_FALLBACK_ORDER: ["money","ideology"],
	/** ур. (полосы лояльности 0–19/20–39/40–69/70–100) — §9.1 */
	CAPTURE_NET_LEVEL_LOSS: [5,1,0,0],
	/** вер./мес — §9.5 */
	EVAC_REQUEST_CHANCE: 0.05,
	/** разн. — §9.5 */
	EVAC: {"cost":150,"realThreat":0.4,"stayCollapse":0.4,"checkDays":20,"checkCapture":0.2},
	/** ур. — §9.2 */
	DETECTIVE_MIN_DIFFICULTY: 4,
	/** чел. — §9.2 */
	DETECTIVE_SUSPECTS: 5,
	/** дней — §9.2 */
	DETECTIVE_TIME_LIMIT_DAYS: 30,
	/** дней — §9.2 */
	DETECTIVE_ACTION_DAYS: 3,
	/** вер. — §9.2 */
	DETECTIVE_TAIL_BASE: 0.6,
	/** вер. — §9.2 */
	DETECTIVE_WITNESS_P: 0.7,
	/** вер. — §9.2, §9.4 */
	WITNESS_RECANT_CHANCE: 0.15,
	/** шк. — §9.2 */
	DETECTIVE_WRONG_ARREST_REP: -5,
	/** ур. — §9.3 */
	INTERROGATION_MIN_DIFFICULTY: 3,
	/** раунд — §9.3 */
	INTERROGATION_MAX_ROUNDS: 6,
	/** шк. — §9.3 */
	INTERROGATION_START: {"stress":20,"lieMin":60,"lieMax":90,"confessLie":20,"breakStress":90},
	/** разн. — §9.3 */
	INTERROGATION_TACTICS: {"evidence":{"lie":-25,"minStrength":2,"closeChance":0.6},"goodbad":{"stress":20,"lie":-10,"agents":2},"deal":{"planPoints":0,"accompliceDiffDelta":-1},"bluff":{"base":0.4,"perSkill":0.05,"lie":-40},"wait":{"stress":10,"days":2,"lawyerChance":0.25}},
	/** дней — §9.5 */
	QUEST_ACTION_DAYS: 30,
	/** разн. — §9.5 */
	QUEST_UNION: {"concedeInfl":-30,"concedeUnrest":-10,"infiltrateP":0.6,"infiltrateFailExposure":5,"refuseInfl":15,"strikeDays":60},
	/** разн. — §9.5 */
	QUEST_BLOGGER: {"discreditP":0.7,"discreditInfl":-40,"backfireInfl":30,"backfireExposure":5,"dealCost":100,"returnChance":0.3,"returnDays":[90,180],"detainInfl":30,"detainProtestP":0.5,"protestUnrest":10},
	/** разн. — §9.5 */
	QUEST_RALLY: {"disperseControl":5,"disperseUnrest":15,"disperseExposure":5,"allowInfluence":-5,"allowUnrest":-5,"provocateurP":0.5,"provocateurInfl":-25,"failRep":-5,"failExposure":10},
	/** разн. — §9.5 */
	QUEST_DEFECTOR: {"courtInfl":-50,"courtLegal":3,"ignoreNet":-1},
	/** разн. — §9.5 */
	QUEST_INFORMANT: {"triggerChance":0.05,"cooldownDays":360,"cost":60,"honestP":0.7,"casesPerMonth":1,"months":6,"kompromatMonths":4,"doubleKompromat":2,"policeRep":3,"policePlan":0.05},
	/** разн. — §9.5 */
	QUEST_SENATOR: {"triggerChance":0.1,"cooldownDays":180,"blackmailInflBase":5,"blackmailInflPerStrength":3,"scandalP":0.25,"scandalRep":-5,"scandalExposure":10,"scandalInvestigation":5,"giveRivalInfl":10,"favorHostility":-0.3,"favorDays":180,"minSurv":3},
	/** разн. — §9.5 */
	QUEST_JOURNALIST: {"bribeCost":80,"bribeP":0.6,"discreditP":0.75,"discreditExposure":5,"detainUnrest":5,"abroadRep":-3,"ignoreP":0.5,"articleRep":-8,"articleExposure":5,"triggerExposure":30,"triggerDiv":200,"triggerMax":0.3},
	// A.13 Победы, поражения, счёт
	/** — — §8 */
	VICTORY_PRIORITY: ["monopoly","cardinal","shadow","1984","clean"],
	/** дней — §8.1 */
	VICTORY_1984_HOLD_DAYS: 360,
	/** шк. — §8.1 */
	VICTORY_1984_CONTROL: 100,
	/** ур. — §8.2 */
	SHADOW_NETWORK_LEVEL: 4,
	/** дней — §8.2 */
	SHADOW_HOLD_DAYS: 180,
	/** кварт. — §8.4 */
	CLEAN_MIN_QUARTERS_MET: 19,
	/** шк. — §8.4 */
	CLEAN_MIN_REPUTATION: 90,
	/** шк. — §8.4 */
	CLEAN_MAX_EXPOSURE: 10,
	/** ур. — §8.4 */
	CLEAN_MAX_SURV_LEVEL: 2,
	/** чел. — §8.5 */
	CARDINAL_SENATORS_REQUIRED: 5,
	/** чел. — §8.5 */
	BUDGET_COMMITTEE_SIZE: 9,
	/** шк. — §8.5 */
	CARDINAL_PRESIDENT_FAIL_INVESTIGATION: 20,
	/** дней — §8.5 */
	CARDINAL_HOLD_DAYS: 120,
	/** шк./мес — §8.5 */
	CARDINAL_HOLD_INVESTIGATION: 6,
	/** вер./мес — §8.5 */
	CARDINAL_HOLD_BURN_CHANCE: 0.15,
	/** ур. Слежки — §4.3, §8.5 */
	CARDINAL_PRESIDENT_MIN_SURV: 6,
	/** очк. — §8.7 */
	SCORE_VICTORY: 10000,
	/** очк./мес — §8.7 */
	SCORE_PER_MONTH_LEFT: 100,
	/** очк./шк. — §8.7 */
	SCORE_PER_REPUTATION: 20,
	/** очк./шк. — §8.7 */
	SCORE_PER_INFLUENCE: 10,
	/** k$/очк. — §8.7 */
	SCORE_BUDGET_DIVISOR: 10,
	/** очк./шк. — §8.7 */
	SCORE_PER_EXPOSURE: 10,
	// A.14 Прочее
	/** шт. — §11.3 */
	LOG_MAX_ENTRIES: 200,
	/** флаги — §3.4 */
	AUTOPAUSE_DEFAULTS: {"chanceCard":true,"quarterReport":true,"hearings":true,"questChoice":true,"election":true,"outcome":true,"agentDefected":true,"networkFailed":true,"moleFound":true,"unrestThreshold":true,"investigationThreshold":true,"firstNegativeBudget":true,"raiseRequest":true,"caseExpiring":false,"operationDone":false},
	/** дней — §3.4 */
	CASE_EXPIRING_WARN_DAYS: 3,
};

export type Balance = typeof BALANCE;
