import { json, error } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import { db } from '../../../lib/server/db/index';
import { saves } from '../../../lib/server/db/schema';
import { createSaveSchema } from '../../../lib/server/saves';

export async function GET() {
	const rows = await db
		.select({
			id: saves.id,
			name: saves.name,
			seed: saves.seed,
			schemaVersion: saves.schemaVersion,
			createdAt: saves.createdAt,
			updatedAt: saves.updatedAt
		})
		.from(saves)
		.orderBy(desc(saves.updatedAt));
	return json(rows);
}

export async function POST({ request }) {
	const parsed = createSaveSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, parsed.error.issues.map((i) => i.message).join('; '));
	const now = Date.now();
	const row = { id: crypto.randomUUID(), ...parsed.data, createdAt: now, updatedAt: now };
	await db.insert(saves).values(row);
	return json(row, { status: 201 });
}
