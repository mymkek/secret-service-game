<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		onclose,
		tone = 'default',
		wide = false,
		children,
		footer
	}: {
		title: string;
		onclose?: () => void;
		tone?: 'default' | 'good' | 'bad' | 'warn';
		wide?: boolean;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	let box: HTMLDivElement | undefined = $state();

	$effect(() => {
		const prev = document.activeElement as HTMLElement | null;
		box?.querySelector<HTMLElement>('button, [href], select, input')?.focus();
		return () => prev?.focus?.();
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && onclose) {
			e.stopPropagation();
			onclose();
		}
		if (e.key === 'Tab' && box) {
			const f = [...box.querySelectorAll<HTMLElement>('button:not(:disabled), [href], select, input, textarea')];
			if (!f.length) return;
			const first = f[0];
			const last = f[f.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	const border = $derived({ default: 'border-line', good: 'border-ok', bad: 'border-danger', warn: 'border-warn' }[tone]);
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4 backdrop-blur-sm" role="presentation">
	<div
		bind:this={box}
		role="dialog"
		aria-modal="true"
		aria-label={title}
		tabindex="-1"
		{onkeydown}
		class="max-h-[90vh] w-full overflow-y-auto rounded-xl border-2 {border} bg-panel p-5 shadow-2xl {wide ? 'max-w-3xl' : 'max-w-lg'}"
	>
		<div class="mb-3 flex items-start justify-between gap-3">
			<h2 class="text-lg font-semibold text-gold">{title}</h2>
			{#if onclose}
				<button class="btn px-2 py-0.5" onclick={onclose} aria-label="Закрыть окно">✕</button>
			{/if}
		</div>
		<div class="space-y-3 text-sm">{@render children()}</div>
		{#if footer}
			<div class="mt-4 flex flex-wrap justify-end gap-2">{@render footer()}</div>
		{/if}
	</div>
</div>
