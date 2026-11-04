<script lang="ts">
	import { untrack } from 'svelte';
	import { game } from '../../lib/ui/game.svelte';
	// Правила — самостоятельный HTML для печати (docs/rules/rules.html); показываем его как есть в iframe,
	// чтобы его стили не смешивались со стилями игры. На экране — колонка шириной с лист A4.
	import rulesHtml from '../../../docs/rules/rules.html?raw';

	const SCREEN_CSS = `<style>@media screen {
		html { background: #0A1628; }
		body { max-width: 210mm; margin: 0 auto; padding: 0 16mm 16mm; }
		.cover { height: auto; min-height: 150mm; margin: 0 -16mm 8mm; }
		h1 { margin-top: 10mm; }
	}</style>`;
	const srcdoc = rulesHtml.replace('</head>', `${SCREEN_CSS}</head>`);

	// Читать правила удобнее на паузе.
	$effect(() => untrack(() => game.pause()));
</script>

<iframe title="Правила игры" {srcdoc} class="h-[calc(100vh-9rem)] w-full rounded-lg border border-white/10 bg-white"></iframe>
