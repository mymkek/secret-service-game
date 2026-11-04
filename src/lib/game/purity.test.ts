// Инварианты ядра (CLAUDE.md): чистый TS без Svelte/DOM, без Math.random/Date.now, только относительные импорты.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DILEMMA_LOG_KINDS, LOG_KINDS, PENDING_LOG_KINDS } from './types';

const root = fileURLToPath(new URL('.', import.meta.url));

function sources(dir: string): string[] {
	const out: string[] = [];
	for (const f of readdirSync(dir)) {
		const p = join(dir, f);
		if (statSync(p).isDirectory()) out.push(...sources(p));
		else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
	}
	return out;
}

const files = sources(root).map((p) => ({ p, src: readFileSync(p, 'utf8') }));

describe('чистота ядра', () => {
	it('нет запрещённых API и импортов', () => {
		const banned = [/Math\.random/, /Date\.now/, /new Date\(/, /performance\.now/, /from ['"]svelte/, /from ['"]\$app/, /from ['"]\$lib/, /\bwindow\./, /\bdocument\./, /localStorage/, /requestAnimationFrame/];
		for (const { p, src } of files) for (const re of banned) expect({ file: p, hit: re.test(src) }).toEqual({ file: p, hit: false });
	});

	it('все виды записей журнала перечислены в LOG_KINDS (для текстов контента)', () => {
		const used = new Set<string>();
		for (const { src } of files) {
			for (const m of src.matchAll(/log\(\s*s,\s*'([a-z_]+)'/g)) used.add(m[1]);
			for (const m of src.matchAll(/\?\s*'([a-z_]+)'\s*:\s*'([a-z_]+)'/g)) {
				if (/log\(/.test(src.slice(Math.max(0, (m.index ?? 0) - 40), m.index))) {
					used.add(m[1]);
					used.add(m[2]);
				}
			}
		}
		for (const k of used) expect([...LOG_KINDS, ...PENDING_LOG_KINDS, ...DILEMMA_LOG_KINDS] as readonly string[]).toContain(k);
	});
});
