<script lang="ts">
	import { selectLog } from '../game/index';
	import { game } from './game.svelte';

	let { limit = 40 }: { limit?: number } = $props();

	const entries = $derived(game.s ? selectLog(game.s, limit) : []);
	const lines = $derived(entries.map((e) => ({ e, ...game.line(e) })).filter((l) => l.text));

	const tone = { info: 'text-ink', success: 'text-ok', warning: 'text-warn', danger: 'text-danger' };
</script>

<ul class="space-y-1 text-sm" aria-label="Лента событий">
	{#each lines as l (l.e.id)}
		<li class="flex gap-2">
			<span class="w-10 shrink-0 text-right text-xs text-muted tabular-nums">д.{l.e.day}</span>
			<span class="whitespace-pre-line {tone[l.severity]}">{l.text}</span>
		</li>
	{:else}
		<li class="text-muted">Пока тихо. Снимите паузу, чтобы время пошло.</li>
	{/each}
</ul>
