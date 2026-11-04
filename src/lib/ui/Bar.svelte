<script lang="ts">
	let {
		label,
		value,
		max = 100,
		tone = 'gold',
		suffix = '',
		hint = ''
	}: { label: string; value: number; max?: number; tone?: 'gold' | 'ok' | 'warn' | 'danger' | 'fbi'; suffix?: string; hint?: string } = $props();

	const pct = $derived(Math.max(0, Math.min(100, (value / max) * 100)));
	const color = $derived({ gold: 'bg-gold', ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', fbi: 'bg-fbi' }[tone]);
</script>

<div class="min-w-0" title={hint}>
	<div class="flex items-baseline justify-between gap-2 text-xs">
		<span class="truncate text-muted">{label}</span>
		<span class="font-semibold tabular-nums">{value}{suffix}</span>
	</div>
	<div class="mt-0.5 h-1.5 overflow-hidden rounded bg-bg" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
		<div class="h-full {color}" style="width: {pct}%"></div>
	</div>
</div>
