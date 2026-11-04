// Раннер симуляций: N партий × боты, параллельно по ядрам.
// Запуск: npx tsx sim/run.ts --bots honest,dirty --n 1000 --label baseline [--set KEY=JSON]... [--curves] [--scenario late]
// Результат: sim/out/<дата>-<метка>.json (сводка + записи партий) и .md (краткий отчёт).
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { BOTS } from './bots';
import type { GameRecord } from './game';
import { markdown, summarize } from './stats';

const here = dirname(fileURLToPath(import.meta.url));

function args() {
	const a = process.argv.slice(2);
	const o = { bots: BOTS.map((b) => b.name), n: 1000, start: 0, label: 'run', set: {} as Record<string, unknown>, curves: false, workers: Math.max(1, cpus().length - 2), scenario: null as string | null, chunk: 25, prefix: 's' };
	for (let i = 0; i < a.length; i++) {
		const k = a[i];
		const v = a[i + 1];
		if (k === '--bots') (o.bots = v.split(',')), i++;
		else if (k === '--n') (o.n = Number(v)), i++;
		else if (k === '--start') (o.start = Number(v)), i++;
		else if (k === '--label') (o.label = v), i++;
		else if (k === '--workers') (o.workers = Number(v)), i++;
		else if (k === '--scenario') (o.scenario = v), i++;
		else if (k === '--prefix') (o.prefix = v), i++;
		else if (k === '--curves') o.curves = true;
		else if (k === '--set') {
			const eq = v.indexOf('=');
			o.set[v.slice(0, eq)] = JSON.parse(v.slice(eq + 1));
			i++;
		}
	}
	return o;
}

export async function runAll(o: ReturnType<typeof args>): Promise<Map<string, GameRecord[]>> {
	const jobs: { bot: string; seeds: string[] }[] = [];
	for (const bot of o.bots)
		for (let i = 0; i < o.n; i += o.chunk) {
			const seeds: string[] = [];
			for (let j = i; j < Math.min(o.n, i + o.chunk); j++) seeds.push(`${o.prefix}${o.start + j}`);
			jobs.push({ bot, seeds });
		}
	const out = new Map<string, GameRecord[]>(o.bots.map((b) => [b, []]));
	let next = 0;
	let done = 0;
	const t0 = Date.now();
	await Promise.all(
		Array.from({ length: Math.min(o.workers, jobs.length) }, () =>
			new Promise<void>((resolve, reject) => {
				const w = new Worker(join(here, 'worker.ts'), { workerData: { overrides: o.set }, execArgv: process.execArgv });
				const feed = () => {
					if (next >= jobs.length) {
						w.postMessage(null);
						return;
					}
					const j = jobs[next++];
					w.postMessage({ ...j, curves: o.curves, scenario: o.scenario });
				};
				w.on('message', (recs: GameRecord[]) => {
					for (const r of recs) out.get(r.bot)!.push(r);
					done++;
					if (done % 20 === 0) process.stderr.write(`\r${done}/${jobs.length} чанков, ${((Date.now() - t0) / 1000).toFixed(0)} с`);
					feed();
				});
				w.on('error', reject);
				w.on('exit', () => resolve());
				feed();
			})
		)
	);
	process.stderr.write(`\rготово: ${jobs.length} чанков за ${((Date.now() - t0) / 1000).toFixed(1)} с\n`);
	for (const recs of out.values()) recs.sort((a, b) => Number(a.seed.slice(o.prefix.length)) - Number(b.seed.slice(o.prefix.length)));
	return out;
}

async function main() {
	const o = args();
	const res = await runAll(o);
	const sums = o.bots.map((b) => summarize(b, res.get(b)!));
	const date = new Date().toISOString().slice(0, 10);
	const dir = join(here, 'out');
	mkdirSync(dir, { recursive: true });
	const base = join(dir, `${date}-${o.label}`);
	const meta = { label: o.label, n: o.n, start: o.start, prefix: o.prefix, bots: o.bots, set: o.set, scenario: o.scenario };
	const records = [...res.values()].flat().map((r) => ({ ...r, curves: undefined }));
	writeFileSync(base + '.json', JSON.stringify({ meta, summaries: sums, records }));
	const md = markdown(`Прогон ${o.label}`, meta, sums);
	writeFileSync(base + '.md', md);
	console.log(md);
	console.log(`\n→ ${base}.json / .md`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
else if (process.argv[1]?.endsWith('run.ts')) main();
