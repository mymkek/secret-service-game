import { describe, expect, it } from 'vitest';
import { createSaveSchema, updateSaveSchema } from './saves';

describe('save schemas', () => {
	const ok = { name: 'a', seed: 's', schemaVersion: 1, state: '{"x":1}' };
	it('принимает корректный сейв', () => expect(createSaveSchema.safeParse(ok).success).toBe(true));
	it('отклоняет невалидный JSON в state', () =>
		expect(createSaveSchema.safeParse({ ...ok, state: '{' }).success).toBe(false));
	it('отклоняет пустое обновление', () => expect(updateSaveSchema.safeParse({}).success).toBe(false));
});
