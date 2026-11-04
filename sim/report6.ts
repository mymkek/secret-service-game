// Метрики перемера D-069 (§10.5): пути и окна §10.2, «1984» (Репрессии 7, бюджет M48, срывы удержания),
// окна и сгорания дилемм по причинам. Сравнивает прогоны по одинаковым ботам.
// Запуск: npx tsx sim/report6.ts <метка>=<файл.json>[+<ещё.json>] [<метка>=<файл.json> ...] (файлы через + склеиваются)
import { readFileSync } from 'node:fs';
import type { GameRecord } from './game';
import { mean, median, quantile } from './stats';

const pct = (x: number, d = 1) => (Number.isFinite(x) ? (100 * x).toFixed(d) : '—');
const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const c = (r: GameRecord, k: string) => r.counts[k] ?? 0;
const fin = (r: GameRecord, k: string) => Number(r.final[k] ?? 0);

const OP_DL = ['valuable_source', 'forced_confession', 'sting', 'share_with_cia', 'fudged_warrant', 'cover_life'];
const WHY = ['condition', 'cancelled', 'failed', 'not_reached'];
const PATHS: { path: string; base: string }[] = [
	{ path: 'clean', base: 'clean' },
	{ path: 'monopoly', base: 'monopoly' },
	{ path: '1984', base: '1984' },
	{ path: 'shadow', base: 'shadow' },
	{ path: 'cardinal', base: 'cardinal' }
];

type Run = { label: string; bots: Map<string, GameRecord[]> };

function load(spec: string): Run {
	const eq = spec.indexOf('=');
	const [label, file] = eq > 0 ? [spec.slice(0, eq), spec.slice(eq + 1)] : [spec, spec];
	const records = file.split('+').flatMap((x) => (JSON.parse(readFileSync(x, 'utf8')) as { records: GameRecord[] }).records);
	const bots = new Map<string, GameRecord[]>();
	for (const r of records) {
		if (!bots.has(r.bot)) bots.set(r.bot, []);
		bots.get(r.bot)!.push(r);
	}
	return { label, bots };
}

const winRate = (rs: GameRecord[], path: string) => rs.filter((r) => r.result === 'win:' + path).length / rs.length;
const winMonths = (rs: GameRecord[], path: string) => rs.filter((r) => r.result === 'win:' + path).map((r) => r.month);
const q3 = (xs: number[]) => `${f(quantile(xs, 0.1), 0)}/${f(median(xs), 0)}/${f(quantile(xs, 0.9), 0)}`;

/** 95 % полуширина разности двух долей (независимые выборки). */
function ci(p1: number, n1: number, p2: number, n2: number): number {
	return 1.96 * Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
}

export function report(specs: string[]): string {
	const runs = specs.map(load);
	const L: string[] = [];
	const base = runs[0];
	const targetBots = (run: Run, base: string) => [...run.bots.keys()].filter((b) => b.split('@')[0] === base && !b.includes('#'));

	L.push('## Пути (целевые боты): побед %, месяц победы p10/p50/p90', '');
	L.push(`| бот | ${runs.map((r) => `${r.label}: побед | ${r.label}: p10/50/90`).join(' | ')} | Δ последний − первый (±95 %) |`);
	L.push(`|---|${runs.map(() => '---|---').join('|')}|---|`);
	for (const { path, base: b } of PATHS) {
		for (const bot of targetBots(base, b)) {
			const cells = runs.map((run) => {
				const rs = run.bots.get(bot);
				return rs ? `${pct(winRate(rs, path))} | ${q3(winMonths(rs, path))}` : '— | —';
			});
			const a = base.bots.get(bot)!;
			const z = runs[runs.length - 1].bots.get(bot);
			if (!z) {
				L.push(`| ${bot} | ${cells.join(' | ')} | — |`);
				continue;
			}
			const pa = winRate(a, path);
			const pz = winRate(z, path);
			L.push(`| ${bot} | ${cells.join(' | ')} | ${f(100 * (pz - pa), 1)} ± ${f(100 * ci(pa, a.length, pz, z.length), 1)} |`);
		}
	}

	L.push('', '## Лучший путь ко второму (по лучшему целевому боту пути)', '');
	for (const run of runs) {
		const best = PATHS.map(({ path, base: b }) => {
			const xs = targetBots(run, b).map((bot) => ({ bot, p: winRate(run.bots.get(bot)!, path) }));
			xs.sort((x, y) => y.p - x.p);
			return xs.length ? { path, ...xs[0] } : null;
		})
			.filter((x): x is { path: string; bot: string; p: number } => x !== null)
			.sort((x, y) => y.p - x.p);
		if (best.length < 2) continue;
		L.push(`- **${run.label}:** ${best.map((x) => `${x.path} ${pct(x.p)} (${x.bot})`).join(', ')}; отношение ${f(best[0].p / best[1].p)}; размах ${pct(best[best.length - 1].p)}–${pct(best[0].p)}`);
	}

	L.push('', '## «1984»: Репрессии 7, бюджет M48, удержание', '');
	L.push('| прогон | бот | Репр. 7: доля / мес. p10/50/90 | бюджет M48 p10/50/90 (живые) | удержание начато | срыв ≥1 раз (из начавших) | срыв после ≥ 30 дней | срывов/партию | побед из начавших |');
	L.push('|---|---|---|---|---|---|---|---|---|');
	for (const run of runs)
		for (const bot of targetBots(run, '1984')) {
			const rs = run.bots.get(bot)!;
			const r7 = rs.map((r) => r.firsts.repr7).filter((x): x is number => typeof x === 'number');
			const b48 = rs.map((r) => r.snaps[48]?.budget).filter((x): x is number => x !== undefined);
			const started = rs.filter((r) => fin(r, 'maxHold1984') > 0);
			const brk = started.filter((r) => c(r, 'hold1984_break') > 0);
			const brk30 = started.filter((r) => c(r, 'hold1984_break30') > 0);
			L.push(
				`| ${run.label} | ${bot} | ${pct(r7.length / rs.length)} / ${q3(r7)} | ${q3(b48)} | ${pct(started.length / rs.length)} | ${pct(brk.length / Math.max(1, started.length))} | ${pct(brk30.length / Math.max(1, started.length))} | ${f(mean(rs.map((r) => c(r, 'hold1984_break'))))} | ${pct(started.filter((r) => r.result === 'win:1984').length / Math.max(1, started.length))} |`
			);
		}

	L.push('', '## «Тень»: удержание', '');
	L.push('| прогон | бот | удержание начато | срыв ≥1 раз (из начавших) | срыв после ≥ 30 дней | побед из начавших |');
	L.push('|---|---|---|---|---|---|');
	for (const run of runs)
		for (const bot of targetBots(run, 'shadow')) {
			const rs = run.bots.get(bot)!;
			const started = rs.filter((r) => fin(r, 'maxHoldShadow') > 0);
			L.push(
				`| ${run.label} | ${bot} | ${pct(started.length / rs.length)} | ${pct(started.filter((r) => c(r, 'holdShadow_break') > 0).length / Math.max(1, started.length))} | ${pct(started.filter((r) => c(r, 'holdShadow_break30') > 0).length / Math.max(1, started.length))} | ${pct(started.filter((r) => r.result === 'win:shadow').length / Math.max(1, started.length))} |`
			);
		}

	L.push('', '## Окна дилемм (операционные + «Тихий сигнал») и сгорания', '');
	L.push('Окон/мес — среднее по партиям (окна / месяцев партии). Сгорания — среднее на партию, по причинам.', '');
	L.push(`| прогон | бот | окон/мес | опер./партию | сигнал/партию | ${OP_DL.map((x) => x.replace(/_/g, ' ')).join(' | ')} | сгорело всего | «Признание» по условию | «Признание» прочее | сгор. по причинам ${WHY.join('/')} |`);
	L.push(`|---|---|---|---|---|${OP_DL.map(() => '---').join('|')}|---|---|---|---|`);
	for (const run of runs)
		for (const [bot, rs] of run.bots) {
			if (bot.includes('#') && !bot.startsWith('clean@12#sig')) continue;
			const rate = mean(rs.map((r) => (OP_DL.reduce((a, k) => a + c(r, 'qo_dilemma_' + k), 0) + c(r, 'qo_dilemma_quiet_signal')) / Math.max(1, fin(r, 'monthsPlayed'))));
			const opw = mean(rs.map((r) => OP_DL.reduce((a, k) => a + c(r, 'qo_dilemma_' + k), 0)));
			const fcCond = mean(rs.map((r) => c(r, 'burn_forced_confession_condition')));
			const fcAll = mean(rs.map((r) => WHY.reduce((a, w) => a + c(r, `burn_forced_confession_${w}`), 0)));
			const why = WHY.map((w) => f(mean(rs.map((r) => OP_DL.reduce((a, k) => a + c(r, `burn_${k}_${w}`), 0))))).join('/');
			L.push(
				`| ${run.label} | ${bot} | ${f(rate)} | ${f(opw)} | ${f(mean(rs.map((r) => c(r, 'qo_dilemma_quiet_signal'))))} | ${OP_DL.map((k) => f(mean(rs.map((r) => c(r, 'qo_dilemma_' + k))))).join(' | ')} | ${f(mean(rs.map((r) => c(r, 'dilemma_burned'))))} | ${f(fcCond)} | ${f(fcAll - fcCond)} | ${why} |`
			);
		}
	return L.join('\n');
}

if (process.argv[1]?.endsWith('report6.ts')) console.log(report(process.argv.slice(2)));
