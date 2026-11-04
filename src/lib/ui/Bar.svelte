<script lang="ts">
	import ProgressBar from './kit/ProgressBar.svelte';

	let {
		label,
		value,
		max = 100,
		tone = 'gold',
		suffix = '',
		hint = ''
	}: { label: string; value: number; max?: number; tone?: 'gold' | 'ok' | 'warn' | 'danger' | 'fbi'; suffix?: string; hint?: string } = $props();
</script>

<!-- Обёртка над ProgressBar из кита: подпись и число сверху. -->
<div class="min-w-0" title={hint}>
	<div class="flex items-baseline justify-between gap-2 text-xs">
		<span class="truncate text-muted">{label}</span>
		<span class="font-bold tabular-nums">{value}{suffix}</span>
	</div>
	<ProgressBar class="mt-1" {label} {value} {max} {tone} height="h-2" />
</div>
