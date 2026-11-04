// Метрики D-066 (команды, план, гибель) и D-067 (дилеммы, линейка, выборы) по записям прогонов.
// Запуск: npx tsx sim/report5.ts sim/out/<файл>.json [ещё.json ...] — печатает markdown-таблицы.
import { readFileSync } from 'node:fs';
import type { GameRecord } from './game';
import { investigationCatastrophe, mean, median, quantile } from './stats';

const pct = (x: number, d = 1) => (Number.isFinite(x) ? (100 * x).toFixed(d) : '—');
const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const c = (r: GameRecord, k: string) => r.counts[k] ?? 0;
const fin = (r: GameRecord, k: string) => Number(r.final[k] ?? 0);

const OP_DL = ['valuable_source', 'forced_confession', 'sting', 'share_with_cia', 'fudged_warrant', 'cover_life'];

function byBot(files: string[]): Map<string, GameRecord[]> {
	const m = new Map<string, GameRecord[]>();
	for (const file of files) {
		const d = JSON.parse(readFileSync(file, 'utf8')) as { records: GameRecord[] };
		for (const r of d.records) {
			if (!m.has(r.bot)) m.set(r.bot, []);
			m.get(r.bot)!.push(r);
		}
	}
	return m;
}

function sd(xs: number[]): number {
	const m = mean(xs);
	return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

export function report(files: string[]): string {
	const bots = byBot(files);
	const L: string[] = [];
	L.push('## Исходы и счёт', '');
	L.push('| бот | n | побед | путь | мес. победы p10/50/90 | bankrupt | timeout | прочие поражения | катастр. следствия | счёт ср. ± sd | счёт p10 |');
	L.push('|---|---|---|---|---|---|---|---|---|---|---|');
	for (const [b, rs] of bots) {
		const n = rs.length;
		const wins = rs.filter((r) => r.result.startsWith('win:'));
		const paths = new Map<string, number>();
		for (const r of wins) paths.set(r.result.slice(4), (paths.get(r.result.slice(4)) ?? 0) + 1);
		const ms = wins.map((r) => r.month);
		const other = rs.filter((r) => r.result.startsWith('loss:') && r.result !== 'loss:bankrupt' && r.result !== 'loss:timeout');
		const sc = rs.map((r) => r.score);
		L.push(
			`| ${b} | ${n} | ${pct(wins.length / n)} | ${[...paths].map(([k, v]) => `${k} ${pct(v / n)}`).join(', ') || '—'} | ${f(quantile(ms, 0.1), 0)}/${f(median(ms), 0)}/${f(quantile(ms, 0.9), 0)} | ${pct(rs.filter((r) => r.result === 'loss:bankrupt').length / n)} | ${pct(rs.filter((r) => r.result === 'loss:timeout').length / n)} | ${pct(other.length / n)} | ${pct(rs.filter(investigationCatastrophe).length / n)} | ${f(mean(sc), 0)} ± ${f(sd(sc), 0)} | ${f(quantile(sc, 0.1), 0)} |`
		);
	}

	L.push('', '## D-066: план по годам (среднее ratio кварталов года, по партиям, дожившим до конца года)', '');
	L.push('| бот | год 1 | год 2 | год 3 | год 4 | год 5 | доля кварталов ≥ 1.0 (метCount/кварталов) |');
	L.push('|---|---|---|---|---|---|---|');
	for (const [b, rs] of bots) {
		const cells: string[] = [];
		for (let y = 1; y <= 5; y++) {
			const xs = rs.filter((r) => r.final.quarters !== undefined && fin(r, 'quarters') >= y * 4).map((r) => fin(r, 'ry' + y));
			cells.push(`${f(mean(xs))} (p50 ${f(median(xs))})`);
		}
		const met = mean(rs.map((r) => fin(r, 'metCount') / Math.max(1, fin(r, 'quarters'))));
		L.push(`| ${b} | ${cells.join(' | ')} | ${pct(met)} |`);
	}

	L.push('', '## D-066: команды и гибель', '');
	L.push('| бот | теракт 1/2/3, % | теракт завершено/партию | гибель на терактах/партию | смертей на провал | расслед. 1/2/3, % | расслед./партию | подкреплений в ходе/партию |');
	L.push('|---|---|---|---|---|---|---|---|');
	for (const [b, rs] of bots) {
		const t = [1, 2, 3].map((k) => rs.reduce((a, r) => a + c(r, `team_terror_${k}`), 0));
		const tt = t.reduce((a, x) => a + x, 0);
		const iv = [1, 2, 3].map((k) => rs.reduce((a, r) => a + c(r, `team_investigation_${k}`), 0));
		const it = iv.reduce((a, x) => a + x, 0);
		const fails = rs.reduce((a, r) => a + c(r, 'op_fail_terror'), 0);
		const deaths = rs.reduce((a, r) => a + c(r, 'terror_deaths'), 0);
		L.push(
			`| ${b} | ${t.map((x) => pct(x / Math.max(1, tt), 0)).join('/')} | ${f(tt / rs.length, 1)} | ${f(deaths / rs.length)} | ${f(deaths / Math.max(1, fails))} | ${iv.map((x) => pct(x / Math.max(1, it), 0)).join('/')} | ${f(it / rs.length, 1)} | ${f(mean(rs.map((r) => c(r, 'reinforced'))), 1)} |`
		);
	}

	L.push('', '## Ранние смерти (до M12)', '');
	L.push('| бот | поражений с месяцем < 12 | ≤ 12 |');
	L.push('|---|---|---|');
	for (const [b, rs] of bots) {
		const lt = rs.filter((r) => r.result.startsWith('loss:') && r.month < 12).length;
		const le = rs.filter((r) => r.result.startsWith('loss:') && r.month <= 12).length;
		L.push(`| ${b} | ${pct(lt / rs.length)} | ${pct(le / rs.length)} |`);
	}

	L.push('', '## D-067: окна дилемм', '');
	L.push('Окна в месяц = (операционные + «Тихий сигнал») / месяцев партии, среднее по партиям. «Источник замешан» и выборы — отдельно.', '');
	L.push(`| бот | окон/мес | опер./партию | сигнал/партию | источник замешан/партию | сгорело/партию | ${OP_DL.map((x) => x.replace(/_/g, ' ')).join(' | ')} |`);
	L.push(`|---|---|---|---|---|---|${OP_DL.map(() => '---').join('|')}|`);
	for (const [b, rs] of bots) {
		const rate = mean(rs.map((r) => (OP_DL.reduce((a, k) => a + c(r, 'qo_dilemma_' + k), 0) + c(r, 'qo_dilemma_quiet_signal')) / Math.max(1, fin(r, 'monthsPlayed'))));
		const opw = mean(rs.map((r) => OP_DL.reduce((a, k) => a + c(r, 'qo_dilemma_' + k), 0)));
		L.push(
			`| ${b} | ${f(rate)} | ${f(opw)} | ${f(mean(rs.map((r) => c(r, 'qo_dilemma_quiet_signal'))))} | ${f(mean(rs.map((r) => c(r, 'qo_dilemma_source_crime'))))} | ${f(mean(rs.map((r) => c(r, 'dilemma_burned'))))} | ${OP_DL.map((k) => f(mean(rs.map((r) => c(r, 'qo_dilemma_' + k))))).join(' | ')} |`
		);
	}

	L.push('', '## D-067: последствия (history, среднее на партию) и дела от дилемм', '');
	const H = ['forcedConfessions', 'falseReviews', 'stings', 'stingsExposed', 'informantCrimes', 'sourceExposed', 'signals', 'signalsReal', 'signalsPrevented', 'signalsPreventedDirty', 'missedSignals', 'innocentsDetained', 'warrantsFudged', 'fudgeCaught', 'coverScandals', 'leakRevealed'];
	L.push(`| бот | ${H.join(' | ')} | дела source ok/fail | sting ok/fail | signal ok/fail | real_culprit ok/fail |`);
	L.push(`|---|${H.map(() => '---').join('|')}|---|---|---|---|`);
	for (const [b, rs] of bots) {
		const tg = (t: string) => `${f(mean(rs.map((r) => c(r, `tag_${t}_ok`))))}/${f(mean(rs.map((r) => c(r, `tag_${t}_fail`))))}`;
		L.push(`| ${b} | ${H.map((k) => f(mean(rs.map((r) => fin(r, 'h_' + k))))).join(' | ')} | ${tg('source')} | ${tg('sting')} | ${tg('signal')} | ${tg('real_culprit')} |`);
	}

	L.push('', '## D-067: линейка «Народный авангард»', '');
	L.push('| бот | предложений/партию | стартов/партию | партий со стартом | успех чистый / грязный (на старт) | тихий срыв | провал | отзыв | потеряно агентов на старт | деньги линейки/партию | изъятие в квартале выплаты / выплата | изъятие/квартал без выплаты |');
	L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
	for (const [b, rs] of bots) {
		const st = rs.reduce((a, r) => a + fin(r, 'h_linesStarted'), 0);
		const sum = (k: string) => rs.reduce((a, r) => a + c(r, k), 0);
		const lost = rs.reduce((a, r) => a + fin(r, 'h_lineAgentsLost'), 0);
		const money = sum('line_money_seen');
		const clawL = sum('claw_after_line');
		const qAll = sum('quarter_report');
		const qLine = rs.reduce((a, r) => a + (c(r, 'line_money_seen') > 0 ? 1 : 0), 0);
		const clawOther = (sum('clawback_total') - clawL) / Math.max(1, qAll - qLine);
		L.push(
			`| ${b} | ${f(mean(rs.map((r) => c(r, 'qo_vanguard_offer'))))} | ${f(st / rs.length)} | ${pct(rs.filter((r) => fin(r, 'h_linesStarted') > 0).length / rs.length)} | ${pct(sum('line_success_evidence') / Math.max(1, st))} / ${pct(sum('line_success_provoke') / Math.max(1, st))} | ${pct(sum('line_quiet') / Math.max(1, st))} | ${pct(sum('line_failed') / Math.max(1, st))} | ${pct(sum('line_recalled') / Math.max(1, st))} | ${f(lost / Math.max(1, st))} | ${f(money / rs.length, 0)} | ${pct(clawL / Math.max(1, money))} | ${f(clawOther, 0)} |`
		);
	}

	L.push('', '## D-067: выборы (партии, дожившие до M47)', '');
	L.push('| бот | дожили | вмешательство none/public/leak | смена власти | побед после M47 при none / public / leak | побед после M47: переизбран / новая власть |');
	L.push('|---|---|---|---|---|---|');
	for (const [b, rs] of bots) {
		const alive = rs.filter((r) => r.final.electionResult !== 'none');
		if (!alive.length) continue;
		const by = (m: string) => alive.filter((r) => r.final.meddling === m);
		const late = (xs: GameRecord[]) => (xs.length ? pct(xs.filter((r) => r.result.startsWith('win:') && r.month >= 47).length / xs.length) + ` (n=${xs.length})` : '—');
		L.push(
			`| ${b} | ${alive.length} | ${['none', 'public', 'leak'].map((m) => by(m).length).join('/')} | ${pct(alive.filter((r) => r.final.electionResult === 'new_admin').length / alive.length)} | ${['none', 'public', 'leak'].map((m) => late(by(m))).join(' / ')} | ${late(alive.filter((r) => r.final.electionResult === 'reelected'))} / ${late(alive.filter((r) => r.final.electionResult === 'new_admin'))} |`
		);
	}

	L.push('', '## Деньги и план (среднее ± sd на партию)', '');
	L.push('| бот | очков плана за партию | очков/квартал | бюджет M24 p50 | бюджет M48 p50 | бюджет>0 на M48 (из живых) | грязных действий | «Под следствием» max p50 |');
	L.push('|---|---|---|---|---|---|---|---|');
	for (const [b, rs] of bots) {
		const pp = rs.map((r) => c(r, 'plan_points_total'));
		const ppq = rs.map((r) => c(r, 'plan_points_total') / Math.max(1, c(r, 'quarter_report')));
		const b24 = rs.map((r) => r.snaps[24]?.budget).filter((x): x is number => x !== undefined);
		const b48 = rs.map((r) => r.snaps[48]?.budget).filter((x): x is number => x !== undefined);
		L.push(
			`| ${b} | ${f(mean(pp), 1)} ± ${f(sd(pp), 1)} | ${f(mean(ppq))} ± ${f(sd(ppq))} | ${f(median(b24), 0)} | ${f(median(b48), 0)} | ${pct(b48.filter((x) => x > 0).length / Math.max(1, b48.length))} | ${f(median(rs.map((r) => fin(r, 'dirtyActions'))), 0)} | ${f(median(rs.map((r) => fin(r, 'maxInv'))), 0)} |`
		);
	}
	return L.join('\n');
}

if (process.argv[1]?.endsWith('report5.ts')) console.log(report(process.argv.slice(2)));
