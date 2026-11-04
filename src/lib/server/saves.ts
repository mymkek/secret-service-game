import { z } from 'zod';

const stateText = z
	.string()
	.max(2_000_000)
	.refine((s) => {
		try {
			JSON.parse(s);
			return true;
		} catch {
			return false;
		}
	}, 'state must be valid JSON text');

export const createSaveSchema = z.object({
	name: z.string().trim().min(1).max(100),
	seed: z.string().min(1).max(200),
	schemaVersion: z.number().int().min(0),
	state: stateText
});

export const updateSaveSchema = createSaveSchema
	.partial()
	.refine((o) => Object.keys(o).length > 0, 'empty update');
