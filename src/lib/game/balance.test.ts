// balance.ts должен совпадать с «Приложением A» docs/gdd.md один к одному (CLAUDE.md, инварианты).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';

function parseAppendixA(): Record<string, unknown> {
	const md = readFileSync(fileURLToPath(new URL('../../../docs/gdd.md', import.meta.url)), 'utf8');
	const app = md.slice(md.indexOf('## Приложение A'));
	const out: Record<string, unknown> = {};
	for (const line of app.split(/\r?\n/)) {
		const m = line.match(/^\| ([A-Z0-9_]+) \| (.+?) \| (.*?) \| (.*?) \|\s*$/);
		if (m) out[m[1]] = JSON.parse(m[2]);
	}
	return out;
}

describe('balance.ts ↔ Приложение A', () => {
	const gdd = parseAppendixA();

	it('те же ключи', () => {
		expect(Object.keys(BALANCE).sort()).toEqual(Object.keys(gdd).sort());
		expect(Object.keys(gdd).length).toBeGreaterThan(390);
	});

	it('те же значения', () => {
		for (const k of Object.keys(gdd)) expect({ [k]: (BALANCE as Record<string, unknown>)[k] }).toEqual({ [k]: gdd[k] });
	});
});
