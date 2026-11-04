// Воркер: применяет правки BALANCE и играет выданные партии.
import { parentPort, workerData } from 'node:worker_threads';
import { BALANCE } from '../src/lib/game/index';
import { playGame } from './game';
import { SCENARIOS } from './scenarios';

interface Job {
	bot: string;
	seeds: string[];
	curves: boolean;
	scenario: string | null;
}

const overrides = (workerData?.overrides ?? {}) as Record<string, unknown>;
for (const [k, v] of Object.entries(overrides)) (BALANCE as Record<string, unknown>)[k] = v;

parentPort!.on('message', (job: Job | null) => {
	if (job === null) {
		process.exit(0);
	}
	const out = job.seeds.map((seed) =>
		playGame(job.bot, seed, { curves: job.curves, setup: job.scenario ? SCENARIOS[job.scenario] : undefined })
	);
	parentPort!.postMessage(out);
});
