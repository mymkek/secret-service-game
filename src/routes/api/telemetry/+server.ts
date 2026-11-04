import { error, json } from '@sveltejs/kit';
import { db } from '../../../lib/server/db/index';
import { LIMITS, TelemetryError, batchSchema, ingestBatch, telemetryEnabled } from '../../../lib/server/telemetry';

export async function POST({ request }) {
	// Выключено - тихо принимаем и выбрасываем, чтобы клиент не повторял запросы.
	if (!telemetryEnabled(process.env.TELEMETRY_ENABLED, import.meta.env.DEV)) return json({ ok: true, disabled: true });
	const len = Number(request.headers.get('content-length') ?? 0);
	if (len > LIMITS.bodyBytes) error(413, 'body too large');
	const text = await request.text();
	if (text.length > LIMITS.bodyBytes) error(413, 'body too large');
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		error(400, 'invalid json');
	}
	const parsed = batchSchema.safeParse(raw);
	if (!parsed.success) error(400, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 5).join('; '));
	try {
		const res = await ingestBatch(db, parsed.data, { userAgent: request.headers.get('user-agent') });
		return json({ ok: true, ...res });
	} catch (e) {
		if (e instanceof TelemetryError) error(e.status as 404 | 413, e.message);
		throw e;
	}
}
