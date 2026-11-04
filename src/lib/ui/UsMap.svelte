<script lang="ts">
	import { selectCases, selectRivals } from '../game/index';
	import { game } from './game.svelte';
	import { MAP_H, MAP_STATES, MAP_W } from './map-data';
	import { caseText, stateName } from './content';
	import { AGENCY_VAR, rivalName } from './labels';

	let { selected = null, onselect }: { selected?: string | null; onselect: (id: string) => void } = $props();

	const collapsing = $derived(game.s ? selectRivals(game.s).filter((r) => r.collapsing) : []);
	const cases = $derived(game.s ? selectCases(game.s) : []);
	const byState = $derived.by(() => {
		const m = new Map<string, typeof cases>();
		for (const c of cases) {
			const l = m.get(c.stateId) ?? [];
			l.push(c);
			m.set(c.stateId, l);
		}
		return m;
	});

	const day = $derived(game.s?.day ?? 0);
	/** Операции по делам: взятое дело не истекает (§5.4), вместо срока показываем ход операции. */
	const opByCase = $derived(new Map((game.s?.operations ?? []).filter((o) => o.caseId !== null).map((o) => [o.caseId, o])));
	const RING = 2 * Math.PI * 11;

	function progress(o: { startDay: number; endDay: number }): number {
		return o.endDay > o.startDay ? Math.min(1, Math.max(0, (day - o.startDay) / (o.endDay - o.startDay))) : 1;
	}

	function caseLabel(c: (typeof cases)[number], op: { endDay: number } | undefined): string {
		if (op) return `в работе: до конца операции ${Math.max(0, op.endDay - day)} дн.`;
		return c.daysLeft !== null ? `осталось дней: ${c.daysLeft}` : 'без срока';
	}

	function fill(id: string): { color: string; opacity: number } {
		const j = game.s?.stateJurisdiction[id];
		if (!j) return { color: 'var(--color-panel)', opacity: 1 };
		if (j.level >= 2) return { color: AGENCY_VAR.player, opacity: 0.6 };
		if (j.level === 1) return { color: AGENCY_VAR.player, opacity: 0.35 };
		if (j.holder) return { color: AGENCY_VAR[j.holder], opacity: 0.55 };
		return { color: 'var(--color-panel)', opacity: 1 };
	}

	function label(id: string): string {
		const j = game.s?.stateJurisdiction[id];
		const n = byState.get(id)?.length ?? 0;
		const power = !j ? '' : j.level >= 2 ? 'полные полномочия ФБР' : j.level === 1 ? 'частичные полномочия ФБР' : `полномочия у ${rivalName(j.holder) || 'никого'}`;
		return `${stateName(id)}: ${power}${n ? `, дел: ${n}` : ''}`;
	}

	function key(e: KeyboardEvent, id: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onselect(id);
		}
	}
</script>

<svg viewBox="0 0 {MAP_W} {MAP_H}" class="h-auto w-full" role="group" aria-label="Карта США: штаты и полномочия">
	<g>
		{#each MAP_STATES as st (st.id)}
			{@const f = fill(st.id)}
			<path
				d={st.d}
				role="button"
				tabindex="0"
				aria-label={label(st.id)}
				aria-pressed={selected === st.id}
				data-state={st.id}
				class="cursor-pointer transition-[stroke-width] hover:brightness-125"
				style="fill: {f.color}; fill-opacity: {f.opacity}; stroke: {selected === st.id ? 'var(--color-gold)' : 'var(--color-line)'}; stroke-width: {selected === st.id ? 2.5 : 0.8};"
				onclick={() => onselect(st.id)}
				onkeydown={(e) => key(e, st.id)}
			/>
		{/each}
	</g>
	<g pointer-events="none" fill="var(--color-muted)" font-size="9" text-anchor="middle" opacity="0.7">
		{#each MAP_STATES as st (st.id)}
			<text x={st.cx} y={st.cy + 3}>{st.id}</text>
		{/each}
	</g>
	<g>
		{#each [...byState] as [sid, list] (sid)}
			{@const st = MAP_STATES.find((x) => x.id === sid)}
			{#if st}
				{#each list as c, i (c.id)}
					{@const op = c.takenByOpId !== null ? opByCase.get(c.id) : undefined}
					{@const urgent = !op && c.daysLeft !== null && c.daysLeft <= 7}
					<g
						role="button"
						tabindex="0"
						aria-label="{caseText(c).title}, {stateName(sid)}, сложность {c.difficulty}, {caseLabel(c, op)}"
						class="cursor-pointer"
						transform="translate({st.cx + (i % 3) * 20 - 10}, {st.cy - 14 - Math.floor(i / 3) * 20})"
						onclick={() => onselect(sid)}
						onkeydown={(e) => key(e, sid)}
					>
						<title>{caseText(c).title}: {caseLabel(c, op)}</title>
						{#if op}
							<circle r="9" style="fill: var(--color-ok); stroke: var(--color-bg); stroke-width: 1;" />
							<circle r="11" fill="none" transform="rotate(-90)" style="stroke: var(--color-gold); stroke-width: 2.5; stroke-dasharray: {RING * progress(op)} {RING};" />
							<text y="3.5" text-anchor="middle" font-size="9" font-weight="700" style="fill: var(--color-bg)" pointer-events="none">▶</text>
						{:else}
							<circle
								r="9"
								style="fill: {c.kind === 'terror' ? 'var(--color-danger)' : 'var(--color-gold)'}; fill-opacity: {c.accessible ? 0.95 : 0.35}; stroke: {urgent ? 'var(--color-ink)' : 'var(--color-bg)'}; stroke-width: {urgent ? 2 : 1};"
							/>
							<text y="3.5" text-anchor="middle" font-size="10" font-weight="700" style="fill: var(--color-bg)" pointer-events="none">{c.daysLeft ?? '∞'}</text>
						{/if}
					</g>
				{/each}
			{/if}
		{/each}
	</g>
</svg>

<ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Легенда карты">
	<li><span class="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style="background: var(--color-fbi); opacity: 0.6"></span>Полные полномочия ФБР</li>
	<li><span class="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style="background: var(--color-fbi); opacity: 0.25"></span>Частичные</li>
	<li><span class="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style="background: var(--color-police)"></span>Полиция</li>
	<li><span class="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style="background: var(--color-cia)"></span>ЦРУ</li>
	<li><span class="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style="background: var(--color-usss)"></span>Секретная служба</li>
	<li><span class="mr-1 inline-block h-3 w-3 rounded-full bg-gold align-middle"></span>Дело (число — дней до ухода)</li>
	<li><span class="mr-1 inline-block h-3 w-3 rounded-full bg-danger align-middle"></span>Теракт</li>
	<li><span class="mr-1 inline-block h-3 w-3 rounded-full bg-ok align-middle ring-2 ring-gold"></span>Дело в работе (срок стоит, кольцо — ход операции)</li>
	{#each collapsing as r (r.id)}
		<li class="text-warn">{rivalName(r.id)} — на грани, скоро выбудет</li>
	{/each}
</ul>
