import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '../../../../lib/server/db/index';
import { saves } from '../../../../lib/server/db/schema';
import { updateSaveSchema } from '../../../../lib/server/saves';

export async function GET({ params }) {
	const [row] = await db.select().from(saves).where(eq(saves.id, params.id));
	if (!row) error(404, 'save not found');
	return json(row);
}

export async function PUT({ params, request }) {
	const parsed = updateSaveSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, parsed.error.issues.map((i) => i.message).join('; '));
	const [row] = await db
		.update(saves)
		.set({ ...parsed.data, updatedAt: Date.now() })
		.where(eq(saves.id, params.id))
		.returning();
	if (!row) error(404, 'save not found');
	return json(row);
}

export async function DELETE({ params }) {
	const res = await db.delete(saves).where(eq(saves.id, params.id)).returning({ id: saves.id });
	if (!res.length) error(404, 'save not found');
	return new Response(null, { status: 204 });
}
