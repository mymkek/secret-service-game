import { error, json } from '@sveltejs/kit';
import { db } from '../../../../../lib/server/db/index';
import { getSessionFull, telemetryEnabled } from '../../../../../lib/server/telemetry';

export async function GET({ params }) {
	if (!telemetryEnabled(process.env.TELEMETRY_ENABLED, import.meta.env.DEV)) error(404, 'telemetry disabled');
	const full = await getSessionFull(db, params.id);
	if (!full) error(404, 'session not found');
	return json(full);
}
