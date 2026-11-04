import { error, json } from '@sveltejs/kit';
import { db } from '../../../../lib/server/db/index';
import { listSessions, telemetryEnabled } from '../../../../lib/server/telemetry';

export async function GET({ url }) {
	if (!telemetryEnabled(process.env.TELEMETRY_ENABLED, import.meta.env.DEV)) error(404, 'telemetry disabled');
	const limit = Number(url.searchParams.get('limit') ?? 100);
	const offset = Number(url.searchParams.get('offset') ?? 0);
	return json(await listSessions(db, { limit: Number.isFinite(limit) ? limit : 100, offset: Number.isFinite(offset) ? offset : 0 }));
}
