// Агрегация записей партий: исходы, месяцы, срезы бюджета, счётчики событий, кривые p10/p50/p90.
import { CURVE_KEYS, type CurveKey, type GameRecord } from './game';

export const RESULTS = [
	'win:1984',
	'win:shadow',
	'win:cardinal',
	'win:monopoly',
	'win:clean',
	'loss:timeout',
	'loss:arrested',
	'loss:bankrupt',
	'loss:riot',
	'loss:reputation',
	'loss:dismissed',
	'loss:disbanded'
] as const;

export function quantile(xs: number[], q: number): number {
	if (xs.length === 0) return NaN;
	const a = [...xs].sort((x, y) => x - y);
	const pos = (a.length - 1) * q;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}
export const median = (xs: number[]) => quantile(xs, 0.5);
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export interface BotSummary {
	bot: string;
	n: number;
	results: Record<string, number>;
	winRate: number;
	months: Record<string, { p10: number; p50: number; p90: number }>;
	snaps: Record<number, Record<string, number>>;
	/** доля партий, доживших до месяца M с бюджетом > 0 — и среди всех, и среди доживших */
	budgetPositive: Record<number, { alive: number; positiveOfAlive: number; positiveOfAll: number }>;
	countsMean: Record<string, number>;
	countsAny: Record<string, number>;
	finalMedian: Record<string, number>;
	firstsMedian: Record<string, { p50: number; reached: number }>;
	scoreMean: number;
	scoreSd: number;
	curves?: Record<CurveKey, { p10: number[]; p50: number[]; p90: number[]; n: number[] }>;
}

export function summarize(bot: string, recs: GameRecord[]): BotSummary {
	const n = recs.length;
	const results: Record<string, number> = {};
	for (const r of recs) results[r.result] = (results[r.result] ?? 0) + 1;
	const months: BotSummary['months'] = {};
	for (const k of Object.keys(results)) {
		const ms = recs.filter((r) => r.result === k).map((r) => r.month);
		months[k] = { p10: quantile(ms, 0.1), p50: median(ms), p90: quantile(ms, 0.9) };
	}
	const wins = recs.filter((r) => r.result.startsWith('win:'));
	months['win:any'] = { p10: quantile(wins.map((r) => r.month), 0.1), p50: median(wins.map((r) => r.month)), p90: quantile(wins.map((r) => r.month), 0.9) };
	const snaps: BotSummary['snaps'] = {};
	const budgetPositive: BotSummary['budgetPositive'] = {};
	for (const m of [1, 6, 12, 24, 36, 48, 60]) {
		const ss = recs.map((r) => r.snaps[m]).filter(Boolean);
		if (!ss.length) continue;
		const keys = Object.keys(ss[0]) as (keyof (typeof ss)[0])[];
		snaps[m] = {};
		for (const k of keys) {
			const vals = ss.map((x) => x[k]).filter((v): v is number => typeof v === 'number');
			snaps[m][k as string] = median(vals);
		}
		snaps[m].alive = ss.length;
		const pos = ss.filter((x) => x.budget > 0).length;
		budgetPositive[m] = { alive: ss.length, positiveOfAlive: pos / ss.length, positiveOfAll: pos / n };
	}
	const countKeys = new Set<string>();
	for (const r of recs) for (const k of Object.keys(r.counts)) countKeys.add(k);
	const countsMean: Record<string, number> = {};
	const countsAny: Record<string, number> = {};
	for (const k of countKeys) {
		countsMean[k] = mean(recs.map((r) => r.counts[k] ?? 0));
		countsAny[k] = recs.filter((r) => (r.counts[k] ?? 0) > 0).length / n;
	}
	const finalMedian: Record<string, number> = {};
	for (const k of Object.keys(recs[0]?.final ?? {})) {
		const vals = recs.map((r) => r.final[k]);
		if (typeof vals[0] === 'number') finalMedian[k] = median(vals as number[]);
		else if (typeof vals[0] === 'boolean') finalMedian[k] = vals.filter(Boolean).length / n;
	}
	const firstKeys = new Set<string>();
	for (const r of recs) for (const k of Object.keys(r.firsts)) firstKeys.add(k);
	const firstsMedian: BotSummary['firstsMedian'] = {};
	for (const k of firstKeys) {
		const vals = recs.map((r) => r.firsts[k]).filter((v): v is number => typeof v === 'number');
		firstsMedian[k] = { p50: median(vals), reached: vals.length / n };
	}
	const scores = recs.map((r) => r.score);
	const sm = mean(scores);
	const sd = Math.sqrt(mean(scores.map((x) => (x - sm) ** 2)));
	let curves: BotSummary['curves'];
	if (recs[0]?.curves) {
		curves = {} as NonNullable<BotSummary['curves']>;
		for (const k of CURVE_KEYS) {
			const p10: number[] = [];
			const p50: number[] = [];
			const p90: number[] = [];
			const nn: number[] = [];
			for (let m = 0; m < 60; m++) {
				const vals = recs.map((r) => r.curves![k][m]).filter((v) => v !== undefined);
				nn.push(vals.length);
				p10.push(+quantile(vals, 0.1).toFixed(3));
				p50.push(+quantile(vals, 0.5).toFixed(3));
				p90.push(+quantile(vals, 0.9).toFixed(3));
			}
			curves[k] = { p10, p50, p90, n: nn };
		}
	}
	return { bot, n, results, winRate: wins.length / n, months, snaps, budgetPositive, countsMean, countsAny, finalMedian, firstsMedian, scoreMean: sm, scoreSd: sd, curves };
}

const pct = (x: number) => (Number.isFinite(x) ? (100 * x).toFixed(1) : '—');
const num = (x: number, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '—');

export function markdown(title: string, meta: Record<string, unknown>, sums: BotSummary[]): string {
	const L: string[] = [];
	L.push(`# ${title}`, '');
	L.push('```', JSON.stringify(meta), '```', '');
	L.push('## Исходы, % партий', '');
	const cols = RESULTS.filter((r) => sums.some((s) => s.results[r]));
	L.push(`| бот | n | ${cols.map((c) => c.replace('win:', 'W ').replace('loss:', 'L ')).join(' | ')} | побед | мес. победы p10/50/90 |`);
	L.push(`|---|---|${cols.map(() => '---').join('|')}|---|---|`);
	for (const s of sums) {
		const w = s.months['win:any'];
		L.push(
			`| ${s.bot} | ${s.n} | ${cols.map((c) => pct((s.results[c] ?? 0) / s.n)).join(' | ')} | ${pct(s.winRate)} | ${num(w.p10)}/${num(w.p50)}/${num(w.p90)} |`
		);
	}
	L.push('', '## Месяц исхода (p10/p50/p90) по типу исхода', '');
	for (const s of sums) {
		L.push(`- **${s.bot}**: ` + Object.entries(s.months).filter(([k]) => k !== 'win:any').map(([k, v]) => `${k} ${num(v.p10)}/${num(v.p50)}/${num(v.p90)}`).join('; '));
	}
	L.push('', '## Экономика: медианы на конец месяца (только дожившие)', '');
	L.push('| бот | M | живы | бюджет | доход | расходы | зарплаты | агентов | реп | влияние | засв. | следствие | недов. | доля | бюджет>0 (из живых / из всех) |');
	L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
	for (const s of sums)
		for (const m of [1, 12, 24, 48]) {
			const x = s.snaps[m];
			if (!x) continue;
			const bp = s.budgetPositive[m];
			L.push(
				`| ${s.bot} | ${m} | ${x.alive} | ${num(x.budget)} | ${num(x.income)} | ${num(x.expenses)} | ${num(x.salaries)} | ${num(x.agents)} | ${num(x.reputation)} | ${num(x.influence)} | ${num(x.exposure)} | ${num(x.investigation)} | ${num(x.unrest)} | ${num(x.share, 3)} | ${pct(bp.positiveOfAlive)} / ${pct(bp.positiveOfAll)} |`
			);
		}
	L.push('', '## События на партию (среднее; в скобках — доля партий, где было хотя бы раз)', '');
	const ev = ['scandal', 'hearings', 'molePlanted', 'mole_found', 'agent_defected', 'ai_POACH_AGENT', 'ai_DIG_DIRECTOR', 'ai_CUT_JURISDICTION', 'agent_killed', 'agent_captured', 'network_failed', 'fake_caught', 'leak', 'sabotage', 'national_protest', 'thaw', 'director_questioning'];
	L.push(`| бот | ${ev.join(' | ')} | мес. бунта (U≥80) |`);
	L.push(`|---|${ev.map(() => '---').join('|')}|---|`);
	for (const s of sums)
		L.push(`| ${s.bot} | ${ev.map((k) => `${num(s.countsMean[k] ?? 0, 2)} (${pct(s.countsAny[k] ?? 0)})`).join(' | ')} | ${num(s.finalMedian.riotMonths ?? 0, 1)} |`);
	L.push('', '## Финальное состояние (медианы)', '');
	const fk = ['reputation', 'exposure', 'investigation', 'unrest', 'agents', 'metCount', 'dirtyActions', 'reprMax', 'survMax', 'maxSenators', 'maxHold1984', 'maxHoldShadow', 'minNetMax', 'rivalsAlive', 'maxInv', 'riotMonths', 'negBudgetMonths'];
	L.push(`| бот | ${fk.join(' | ')} | счёт ср. ± sd |`);
	L.push(`|---|${fk.map(() => '---').join('|')}|---|`);
	for (const s of sums) L.push(`| ${s.bot} | ${fk.map((k) => num(s.finalMedian[k] ?? NaN, 1)).join(' | ')} | ${num(s.scoreMean)} ± ${num(s.scoreSd)} |`);
	L.push('', '## Вехи (медианный месяц; доля партий, где достигнуто)', '');
	for (const s of sums) {
		const keys = Object.keys(s.firstsMedian).filter((k) => /^(tech_|repr[5-7]|surv[56]|net_.*_4|rivalOut|coalition|unrest80)/.test(k)).sort();
		if (keys.length) L.push(`- **${s.bot}**: ` + keys.map((k) => `${k} ${num(s.firstsMedian[k].p50)} (${pct(s.firstsMedian[k].reached)})`).join('; '));
	}
	L.push('');
	return L.join('\n');
}
