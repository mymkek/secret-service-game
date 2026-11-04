<script lang="ts">
	let {
		value,
		max = 100,
		tone = 'gold',
		label,
		height = 'h-2.5',
		class: cls = ''
	}: { value: number; max?: number; tone?: 'gold' | 'ok' | 'warn' | 'danger' | 'fbi' | 'violet'; label: string; height?: string; class?: string } = $props();

	const pct = $derived(Math.max(0, Math.min(100, (value / max) * 100)));
	const fill = $derived({ gold: 'bg-grad-gold', ok: 'bg-grad-green', warn: 'bg-grad-amber', danger: 'bg-grad-coral', fbi: 'bg-grad-blue', violet: 'bg-grad-violet' }[tone]);
</script>

<div class="overflow-hidden rounded-full bg-surface-1 shadow-[inset_0_1px_3px_rgb(0_0_0/0.5)] {height} {cls}" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}>
	<div class="h-full rounded-full transition-[width] duration-300 {fill}" style="width: {pct}%"></div>
</div>
