// Одна партия бота до конца + сбор метрик. Чистая функция от (бот, зерно, правки BALANCE).
import { BALANCE as B, advance, createGame, type GameState, type LogEntry } from '../src/lib/game/index';
import { botByName } from './bots';

export const CURVE_KEYS = ['budget', 'reputation', 'exposure', 'investigation', 'unrest', 'influence', 'share', 'agents', 'control'] as const;
export type CurveKey = (typeof CURVE_KEYS)[number];

export interface Snap {
	budget: number;
	income: number;
	expenses: number;
	reputation: number;
	influence: number;
	exposure: number;
	investigation: number;
	unrest: number;
	share: number;
	agents: number;
	salaries: number;
	deptLevels: number;
	planTarget: number;
	lastRatio: number | null;
}

export interface GameRecord {
	bot: string;
	seed: string;
	/** 'win:<path>' или 'loss:<reason>' */
	result: string;
	month: number;
	score: number;
	snaps: Record<number, Snap>;
	counts: Record<string, number>;
	firsts: Record<string, number | null>;
	final: Record<string, number | string | boolean | null>;
	curves?: Record<CurveKey, number[]>;
}

const SNAP_MONTHS = [1, 6, 12, 24, 36, 48, 60];

function snap(s: GameState, money: { income: number; expenses: number }): Snap {
	let lv = 0;
	for (const v of Object.values(s.departments)) lv += v;
	let sal = 0;
	for (const a of s.agents) sal += Math.round((a.rank === 'novice' ? B.SALARY_NOVICE : a.rank === 'experienced' ? B.SALARY_EXPERIENCED : B.SALARY_VETERAN) * (1 + B.SALARY_LEVEL_STEP * (a.level - 1)) * a.salaryMult);
	return {
		budget: s.budget,
		income: money.income,
		expenses: money.expenses,
		reputation: s.reputation,
		influence: s.influence,
		exposure: s.exposure,
		investigation: s.investigation,
		unrest: s.unrest,
		share: s.share,
		agents: s.agents.length,
		salaries: sal,
		deptLevels: lv,
		planTarget: s.plan.target,
		lastRatio: s.plan.ratioHistory.at(-1) ?? null
	};
}

function inc(c: Record<string, number>, k: string, n = 1) {
	c[k] = (c[k] ?? 0) + n;
}

function countEvent(s: GameState, e: LogEntry, c: Record<string, number>, f: Record<string, number | null>) {
	const m = Math.max(1, Math.ceil(e.day / 30));
	const first = (k: string) => {
		if (f[k] === undefined || f[k] === null) f[k] = m;
	};
	switch (e.kind) {
		case 'rival_action': {
			const a = String(e.data.action);
			if (e.data.success) inc(c, 'ai_' + a);
			break;
		}
		case 'rival_disbanded':
		case 'rival_absorbed':
			inc(c, e.kind);
			first('rivalOut');
			break;
		case 'coalition_formed':
			first('coalition');
			inc(c, e.kind);
			break;
		case 'election':
			if (e.data.newAdmin) inc(c, 'newAdmin');
			break;
		case 'leak':
			inc(c, 'leak');
			if (e.data.revealed) inc(c, 'leakRevealed');
			break;
		case 'sabotage':
			inc(c, 'sabotage');
			if (e.data.revealed) inc(c, 'sabotageRevealed');
			break;
		case 'op_success':
		case 'op_fail':
			inc(c, `${e.kind}_${e.data.type}`);
			break;
		case 'tech_done':
			first('tech_' + e.data.techId);
			break;
		case 'repr_built':
			first('repr' + e.data.level);
			break;
		case 'surv_built':
			first('surv' + e.data.level);
			break;
		case 'network_up':
			first(`net_${e.data.countryId}_${e.data.level}`);
			break;
		case 'unrest_threshold':
			first('unrest' + e.data.level);
			break;
		case 'quest_choice':
			inc(c, `q_${e.data.questId}_${e.data.choice}`);
			break;
		default:
			inc(c, e.kind);
	}
}

export interface PlayOpts {
	curves?: boolean;
	/** Шаг бота в днях. */
	step?: number;
	/** Подготовка партии перед первым ходом (сценарии). */
	setup?: (s: GameState) => void;
}

export function playGame(botName: string, seed: string, o: PlayOpts = {}): GameRecord {
	const bot = botByName(botName).make(seed);
	const s = createGame({ seed });
	o.setup?.(s);
	const step = o.step ?? 3;
	const counts: Record<string, number> = {};
	const firsts: Record<string, number | null> = {};
	const snaps: Record<number, Snap> = {};
	const curves = o.curves ? (Object.fromEntries(CURVE_KEYS.map((k) => [k, [] as number[]])) as Record<CurveKey, number[]>) : undefined;
	const moles = new Set<number>();
	let lastLogId = 0;
	let lastMoney = { income: 0, expenses: 0 };
	let maxInv = 0;
	let maxExp = 0;
	let maxUnrest = 0;
	let riotMonths = 0;
	let invFreezeMonths = 0;
	let negBudgetMonths = 0;
	let maxSenators = 0;
	let presidentEver = false;
	let maxHold1984 = 0;
	let maxHoldShadow = 0;
	let minNetAll = 0;
	let maxNetAll = 0;
	const scan = () => {
		for (const e of s.log) {
			if (e.id <= lastLogId) continue;
			countEvent(s, e, counts, firsts);
			if (e.kind === 'month_money') lastMoney = { income: Number(e.data.income), expenses: Number(e.data.expenses) };
		}
		lastLogId = s.log.length ? s.log[s.log.length - 1].id : lastLogId;
		for (const a of s.agents) {
			if (a.moleFor && !moles.has(a.id)) {
				moles.add(a.id);
				inc(counts, 'molePlanted');
			}
		}
		const sen = new Set(s.kompromat.filter((k) => k.target.kind === 'senator' && (k.expiresDay === null || k.expiresDay > s.day || s.techs.includes('C2'))).map((k) => (k.target as { id: string }).id));
		maxSenators = Math.max(maxSenators, sen.size);
		if (s.kompromat.some((k) => k.target.kind === 'president')) presidentEver = true;
		maxHold1984 = Math.max(maxHold1984, s.counters.hold1984Days);
		maxHoldShadow = Math.max(maxHoldShadow, s.counters.holdShadowDays);
		const lv = Object.values(s.networks).map((n) => n.level);
		minNetAll = Math.max(minNetAll, Math.min(...lv));
		maxNetAll = Math.max(maxNetAll, Math.max(...lv));
	};
	let guard = 0;
	while (s.outcome.status === 'active' && guard++ < 5000) {
		bot(s);
		scan();
		const before = s.day;
		advance(s, step, { ignorePause: true });
		scan();
		maxInv = Math.max(maxInv, s.investigation);
		maxExp = Math.max(maxExp, s.exposure);
		maxUnrest = Math.max(maxUnrest, s.unrest);
		// Конец месяца попал в этот шаг?
		const mEnd = Math.floor(s.day / 30);
		if (mEnd > Math.floor(before / 30) && s.day % 30 === 0) {
			const m = mEnd;
			if (s.unrest >= B.RIOT_THRESHOLD) riotMonths++;
			if (s.investigation >= B.INVESTIGATION_FREEZE_THRESHOLD) invFreezeMonths++;
			if (s.budget < 0) negBudgetMonths++;
			if (SNAP_MONTHS.includes(m)) snaps[m] = snap(s, lastMoney);
			if (curves && s.outcome.status === 'active') {
				curves.budget.push(s.budget);
				curves.reputation.push(+s.reputation.toFixed(1));
				curves.exposure.push(+s.exposure.toFixed(1));
				curves.investigation.push(+s.investigation.toFixed(1));
				curves.unrest.push(+s.unrest.toFixed(1));
				curves.influence.push(+s.influence.toFixed(1));
				curves.share.push(+s.share.toFixed(4));
				curves.agents.push(s.agents.length);
				curves.control.push(+s.control.toFixed(1));
			}
		}
	}
	const o2 = s.outcome;
	const result = o2.status === 'won' ? `win:${o2.victoryPath}` : o2.status === 'lost' ? `loss:${o2.defeatReason}` : 'loss:stuck';
	return {
		bot: botName,
		seed,
		result,
		month: o2.month ?? Math.ceil(s.day / 30),
		score: o2.score ?? 0,
		snaps,
		counts,
		firsts,
		final: {
			budget: s.budget,
			reputation: +s.reputation.toFixed(1),
			influence: +s.influence.toFixed(1),
			exposure: +s.exposure.toFixed(1),
			investigation: +s.investigation.toFixed(1),
			/** Точное значение в момент конца партии (для D-064: банкротство при «Под следствием» ≥ порога заморозки). */
			investigationExact: s.investigation,
			unrest: +s.unrest.toFixed(1),
			control: +s.control.toFixed(1),
			share: +s.share.toFixed(4),
			agents: s.agents.length,
			metCount: s.plan.metCount,
			quarters: s.plan.ratioHistory.length,
			fakeTotal: s.plan.fakeTotal,
			dirtyActions: s.counters.dirtyActions,
			reprMax: s.reprMaxEver,
			survMax: s.survMaxEver,
			techs: s.techs.join(','),
			apex: s.apexChosen,
			nets: Object.values(s.networks).map((n) => n.level).join('/'),
			rivalsAlive: s.rivals.filter((r) => r.alive).length,
			maxInv: +maxInv.toFixed(1),
			maxExp: +maxExp.toFixed(1),
			maxUnrest: +maxUnrest.toFixed(1),
			riotMonths,
			invFreezeMonths,
			negBudgetMonths,
			maxSenators,
			presidentEver,
			maxHold1984,
			maxHoldShadow,
			minNetMax: minNetAll,
			maxNetMax: maxNetAll,
			deptLevels: Object.values(s.departments).join('/'),
			kompOnPlayer: s.rivals.reduce((a, r) => a + r.kompromatOnPlayer, 0)
		},
		curves
	};
}
