// Выгрузка телеметрии партий из БД (локальный libSQL-файл или Turso) в JSONL/CSV для анализа баланса.
// Запуск: npx tsx sim/telemetry-export.ts [--out sim/out/telemetry] [--since <ms|ISO>] [--replay] [--include-unfinished]
// БД: DATABASE_URL / DATABASE_AUTH_TOKEN (или TURSO_*), по умолчанию file:local.db.
// Файлы: sessions.jsonl, sessions.csv, actions.jsonl, events.jsonl, snapshots.jsonl, snapshots.csv [, replay.jsonl]
import { createClient } from '@libsql/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { replaySession, type ReplayAction } from '../src/lib/telemetry/replay';

function args() {
	const a = process.argv.slice(2);
	const o = { out: 'sim/out/telemetry', since: 0, replay: false, unfinished: false };
	for (let i = 0; i < a.length; i++) {
		if (a[i] === '--out') o.out = a[++i];
		else if (a[i] === '--since') {
			const v = a[++i];
			o.since = /^\d+$/.test(v) ? Number(v) : Date.parse(v);
		} else if (a[i] === '--replay') o.replay = true;
		else if (a[i] === '--include-unfinished') o.unfinished = true;
	}
	return o;
}

const csvCell = (v: unknown) => {
	if (v === null || v === undefined) return '';
	const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: Record<string, unknown>[], cols: string[]) => [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';
const jsonl = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

async function main() {
	const o = args();
	const client = createClient({
		url: process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || 'file:local.db',
		authToken: process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined
	});
	const q = async (sql: string, args: (string | number)[] = []) => (await client.execute({ sql, args })).rows.map((r) => ({ ...r })) as Record<string, any>[];

	const where = ['started_at >= ?'];
	if (!o.unfinished) where.push("outcome in ('won','lost')");
	const sessions = await q(`select * from game_sessions where ${where.join(' and ')} order by started_at`, [o.since]);
	const ids = new Set(sessions.map((s) => s.id as string));
	const inScope = <T extends Record<string, any>>(rows: T[]) => rows.filter((r) => ids.has(r.session_id));

	const actions = inScope(await q('select session_id, seq, day, action, ok, error, created_at from game_actions order by session_id, seq'));
	const events = inScope(await q('select session_id, log_id, day, kind, data, source from game_events order by session_id, log_id'));
	const snaps = inScope(await q('select session_id, month, day, metrics from game_snapshots order by session_id, month'));

	mkdirSync(o.out, { recursive: true });
	const sessionOut = sessions.map(({ config, ...rest }) => ({ ...rest, has_config: config !== null }));
	writeFileSync(join(o.out, 'sessions.jsonl'), jsonl(sessionOut));
	writeFileSync(
		join(o.out, 'sessions.csv'),
		toCsv(sessionOut, ['id', 'seed', 'schema_version', 'config_hash', 'app_version', 'start_day', 'started_at', 'ended_at', 'outcome', 'victory_path', 'defeat_reason', 'final_day', 'final_month', 'score', 'save_id'])
	);
	writeFileSync(join(o.out, 'actions.jsonl'), jsonl(actions.map((a) => ({ ...a, ok: !!a.ok, action: JSON.parse(a.action) }))));
	writeFileSync(join(o.out, 'events.jsonl'), jsonl(events.map((e) => ({ ...e, data: JSON.parse(e.data) }))));
	const snapRows = snaps.map((s) => ({ session_id: s.session_id, month: s.month, day: s.day, ...JSON.parse(s.metrics) }));
	writeFileSync(join(o.out, 'snapshots.jsonl'), jsonl(snapRows));
	const snapCols = ['session_id', 'month', 'day', 'budget', 'income', 'expensesForecast', 'reputation', 'influence', 'exposure', 'investigation', 'unrest', 'control', 'share', 'debt', 'kompromat', 'planQuarter', 'planPoints', 'planTarget', 'agents', 'deptLevels', 'surv', 'repr'];
	writeFileSync(join(o.out, 'snapshots.csv'), toCsv(snapRows, snapCols));
	console.log(`sessions=${sessions.length} actions=${actions.length} events=${events.length} snapshots=${snaps.length} -> ${o.out}`);

	if (o.replay) {
		const byS = new Map<string, ReplayAction[]>();
		for (const a of actions) {
			const list = byS.get(a.session_id) ?? [];
			list.push({ seq: a.seq, day: a.day, action: JSON.parse(a.action), ok: !!a.ok, error: a.error });
			byS.set(a.session_id, list);
		}
		// Конфиг из контента нужен только для сессий, у которых он не сохранён.
		let fallback: Record<string, unknown> | undefined;
		const out: unknown[] = [];
		let ok = 0;
		for (const s of sessions) {
			let config = s.config ? JSON.parse(s.config) : null;
			if (!config) {
				if (!fallback) {
					try {
						const { contentToConfig } = await import('../src/lib/game/index');
						const { content } = await import('../src/lib/content/index');
						fallback = contentToConfig(content) as unknown as Record<string, unknown>;
					} catch (e) {
						fallback = {};
						console.warn('contentToConfig unavailable:', (e as Error).message);
					}
				}
				config = null;
			}
			const r = replaySession(
				{ seed: s.seed, startDay: s.start_day, config, outcome: s.outcome, finalDay: s.final_day },
				byS.get(s.id) ?? [],
				{ config: fallback as never }
			);
			const good = r.skipped === null && r.actionMismatches.length === 0 && r.outcomeMatches !== false;
			if (good) ok++;
			out.push({
				session_id: s.id,
				seed: s.seed,
				skipped: r.skipped,
				ok: good,
				recorded: { outcome: s.outcome, finalDay: s.final_day },
				replayed: { outcome: r.replayedOutcome, day: r.replayedDay },
				actionMismatches: r.actionMismatches.slice(0, 20),
				mismatchCount: r.actionMismatches.length
			});
		}
		writeFileSync(join(o.out, 'replay.jsonl'), jsonl(out));
		console.log(`replay: ${ok}/${sessions.length} reproduced exactly (see replay.jsonl)`);
	}
	client.close();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
