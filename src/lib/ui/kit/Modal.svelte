<script lang="ts">
	import type { Snippet } from 'svelte';
	import IconButton from './IconButton.svelte';

	let {
		title,
		onclose,
		tone = 'default',
		wide = false,
		artSide = 'auto',
		art,
		children,
		footer
	}: {
		title: string;
		onclose?: () => void;
		tone?: 'default' | 'good' | 'bad' | 'warn';
		wide?: boolean;
		/** Где рисовать иллюстрацию: auto - слева у широких окон, сверху у узких. */
		artSide?: 'auto' | 'top' | 'left';
		/** Слот под SVG-иллюстрацию (см. Illustration). */
		art?: Snippet;
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

	const accent = $derived({ default: 'border-white/10', good: 'border-ok/50', bad: 'border-danger/60', warn: 'border-gold/40' }[tone]);
	const glow = $derived({ default: 'from-fbi/15', good: 'from-ok/15', bad: 'from-danger/15', warn: 'from-gold/15' }[tone]);
	const left = $derived(artSide === 'left' || (artSide === 'auto' && wide));
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation">
	<!-- Окно не выше экрана: шапка и футер закреплены, прокручивается только тело. -->
	<div
		bind:this={box}
		role="dialog"
		aria-modal="true"
		aria-label={title}
		tabindex="-1"
		{onkeydown}
		class="flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-modal border bg-gradient-to-b {glow} to-surface-2 to-40% bg-surface-2 shadow-elev-3 {accent} {wide ? 'max-w-4xl' : 'max-w-xl'}"
	>
		<div class="flex shrink-0 items-start justify-between gap-3 px-6 pt-5 pb-3">
			<h2 class="font-protocol text-2xl font-bold text-gold-bright">{title}</h2>
			{#if onclose}<IconButton icon="close" label="Закрыть окно" size="sm" variant="ghost" onclick={onclose} />{/if}
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto px-6 py-2" data-modal-body>
			<div class="flex gap-6 {art && left ? 'flex-col sm:flex-row' : 'flex-col'}">
				{#if art}<div class="flex justify-center {left ? 'sm:pt-1' : ''}">{@render art()}</div>{/if}
				<div class="min-w-0 flex-1 space-y-3 text-base">{@render children()}</div>
			</div>
		</div>
		{#if footer}
			<div class="flex shrink-0 flex-wrap justify-end gap-3 border-t border-white/10 px-6 pt-4 pb-5">{@render footer()}</div>
		{:else}
			<div class="h-4 shrink-0"></div>
		{/if}
	</div>
</div>
