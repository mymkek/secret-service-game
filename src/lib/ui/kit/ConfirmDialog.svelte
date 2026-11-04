<script lang="ts" module>
	import type { IllustrationName } from './Illustration.svelte';

	export interface ConfirmRow {
		label: string;
		value: string;
		tone?: 'default' | 'ok' | 'warn' | 'danger';
	}
	export interface ConfirmInfo {
		title: string;
		/** Что произойдёт. */
		what: string;
		/** Цена: деньги, влияние, компромат. */
		costs?: ConfirmRow[];
		/** Риски и побочные эффекты. */
		risks?: ConfirmRow[];
		/** Грязное действие (закрывает «Чистые руки»). */
		dirty?: boolean;
		confirmLabel?: string;
		/** Необратимое/разрушающее: кнопка красная. */
		danger?: boolean;
		art?: IllustrationName;
	}
</script>

<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import Illustration from './Illustration.svelte';

	let { info, onconfirm, oncancel }: { info: ConfirmInfo; onconfirm: () => void; oncancel: () => void } = $props();

	// Фокус на «Выполнить» (Modal по умолчанию фокусирует первую кнопку - крестик).
	$effect(() => document.querySelector<HTMLElement>('[role="dialog"] [data-confirm]')?.focus());

	const TONE = { default: 'text-ink', ok: 'text-ok', warn: 'text-warn', danger: 'text-danger' } as const;

	// Enter подтверждает, если фокус не на другой кнопке/ссылке (тогда Enter нажимает её сам). Esc обрабатывает Modal.
	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.isComposing) return;
		const t = e.target as HTMLElement | null;
		if (t && t.closest('button, a, select, input, textarea')) return; // кнопка нажмётся сама
		e.preventDefault();
		onconfirm();
	}
</script>

<svelte:window {onkeydown} />

{#snippet rows(title: string, list: { label: string; value: string; tone?: 'default' | 'ok' | 'warn' | 'danger' }[])}
	<div>
		<div class="h2 !mb-1">{title}</div>
		<dl class="card-1 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
			{#each list as r (r.label)}
				<dt class="text-muted">{r.label}</dt>
				<dd class="text-right font-bold tabular-nums {TONE[r.tone ?? 'default']}">{r.value}</dd>
			{/each}
		</dl>
	</div>
{/snippet}

<Modal title={info.title} tone={info.dirty || info.danger ? 'bad' : 'warn'} onclose={oncancel}>
	{#snippet art()}{#if info.art}<Illustration name={info.art} size={120} />{/if}{/snippet}
	<p class="font-protocol text-lg leading-relaxed">{info.what}</p>
	{#if info.costs?.length}{@render rows('Цена', info.costs)}{/if}
	{#if info.risks?.length}{@render rows('Риски', info.risks)}{/if}
	{#if info.dirty}
		<p class="flex items-start gap-2 rounded-2xl border border-danger/50 bg-danger/10 p-3 text-sm text-danger">
			<Icon name="warning" size={20} />
			<span>Грязное действие: оно добавит «Под следствием» и закроет путь победы «Чистые руки».</span>
		</p>
	{/if}
	{#snippet footer()}
		<Button onclick={oncancel}>Отмена</Button>
		<Button variant={info.danger ? 'danger' : 'primary'} icon="check" onclick={onconfirm} data-confirm>{info.confirmLabel ?? 'Выполнить'}</Button>
	{/snippet}
</Modal>
