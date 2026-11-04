// Seeded RNG (§0). Один поток на партию; его состояние лежит в GameState.rngState,
// поэтому сейв + зерно дают точный повтор. Алгоритм: sfc32, засев — cyrb128 от строки.
// Каждая функция ниже делает РОВНО одно обращение к генератору (кроме shuffle).

/** Хеш строки в 4 × uint32 (cyrb128). Используется для засева и для детерминированных «seed»-чисел. */
export function cyrb128(str: string): [number, number, number, number] {
	let h1 = 1779033703,
		h2 = 3144134277,
		h3 = 1013904242,
		h4 = 2773480762;
	for (let i = 0; i < str.length; i++) {
		const k = str.charCodeAt(i);
		h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
		h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
		h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
		h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
	}
	h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
	h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
	h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
	h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
	h1 ^= h2 ^ h3 ^ h4;
	h2 ^= h1;
	h3 ^= h1;
	h4 ^= h1;
	return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Детерминированное uint32 из строки — для nameSeed и подобного, без расхода RNG. */
export function hash32(str: string): number {
	return cyrb128(str)[0];
}

export function seedRng(seed: string): number[] {
	const s = cyrb128(seed);
	const st = [s[0], s[1], s[2], s[3]];
	// Прогрев: первые выходы sfc32 слабо перемешаны.
	for (let i = 0; i < 15; i++) nextRaw(st);
	return st;
}

function nextRaw(st: number[]): number {
	let a = st[0] >>> 0,
		b = st[1] >>> 0,
		c = st[2] >>> 0,
		d = st[3] >>> 0;
	const t = (((a + b) >>> 0) + d) >>> 0;
	d = (d + 1) >>> 0;
	a = b ^ (b >>> 9);
	b = (c + (c << 3)) >>> 0;
	c = ((c << 21) | (c >>> 11)) >>> 0;
	c = (c + t) >>> 0;
	st[0] = a >>> 0;
	st[1] = b >>> 0;
	st[2] = c;
	st[3] = d;
	return t;
}

/** Носитель состояния RNG: GameState или любой объект с rngState. */
export interface RngHolder {
	rngState: number[];
}

/** rng.next(): [0, 1). */
export function next(h: RngHolder): number {
	return nextRaw(h.rngState) / 4294967296;
}

/** roll(p): одно обращение к RNG всегда; при p ≤ 0 — false (§0). */
export function roll(h: RngHolder, p: number): boolean {
	const r = next(h);
	if (p <= 0) return false;
	return r < p;
}

/** randInt(a, b): целое из [a, b] включительно. */
export function randInt(h: RngHolder, a: number, b: number): number {
	const r = next(h);
	if (b < a) return a;
	return a + Math.floor(r * (b - a + 1));
}

/** randFloat(a, b): вещественное из [a, b). */
export function randFloat(h: RngHolder, a: number, b: number): number {
	return a + next(h) * (b - a);
}

/**
 * pickWeighted: индекс по весам. При нулевой сумме весов возвращает -1,
 * но один вызов RNG всё равно тратится (§0).
 */
export function pickWeightedIndex(h: RngHolder, weights: readonly number[]): number {
	const r = next(h);
	let total = 0;
	for (const w of weights) total += w > 0 ? w : 0;
	if (total <= 0) return -1;
	let x = r * total;
	for (let i = 0; i < weights.length; i++) {
		const w = weights[i] > 0 ? weights[i] : 0;
		if (x < w) return i;
		x -= w;
	}
	// Защита от погрешности float: последний ненулевой.
	for (let i = weights.length - 1; i >= 0; i--) if (weights[i] > 0) return i;
	return -1;
}

export function pickWeighted<T>(h: RngHolder, items: readonly T[], weights: readonly number[]): T | null {
	const i = pickWeightedIndex(h, weights);
	return i < 0 ? null : items[i];
}

/** Равномерный выбор; при пустом списке RNG всё равно тратится. */
export function pickOne<T>(h: RngHolder, items: readonly T[]): T | null {
	const r = next(h);
	if (items.length === 0) return null;
	return items[Math.floor(r * items.length)];
}

/** Перемешивание Фишера–Йетса: length − 1 обращений. */
export function shuffle<T>(h: RngHolder, items: readonly T[]): T[] {
	const a = items.slice();
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(next(h) * (i + 1));
		const t = a[i];
		a[i] = a[j];
		a[j] = t;
	}
	return a;
}
