<script lang="ts">
	import { BALANCE, previewOperation, type OpTarget, type OpType } from '../game/index';
	import { game, fmtMoney } from './game.svelte';
	import { OP_LABEL, RANK_LABEL, SKILL_LABEL, errorText } from './labels';

	let { opType, caseId, target }: { opType: OpType; caseId?: number; target?: OpTarget } = $props();

	let picked = $state<number[]>([]);

	const idle = $derived((game.s?.agents ?? []).filter((a) => a.status === 'idle'));
	const preview = $derived(game.s ? previewOperation(game.s, { opType, agentIds: picked, caseId, target }) : null);

	function toggle(id: number) {
		picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
	}

	function start() {
		const err = game.act({ type: 'startOp', opType, agentIds: picked, caseId, target }, `${OP_LABEL[opType]} начато`);
		if (!err) picked = [];
	}

	const maxTeam = $derived(BALANCE.OP_AGENTS_REQUIRED[opType] + BALANCE.OP_MAX_EXTRA_AGENTS);
	/** Подсказка про следующего агента: прибавка к шансу и особая польза напарника (D-066). */
	const nextHint = $derived.by(() => {
		if (!preview || picked.length === 0 || picked.length >= maxTeam) return [] as string[];
		const out: string[] = [];
		const n = picked.length + 1;
		if (preview.nextAgentBonus) out.push(`+${Math.round(preview.nextAgentBonus * 100)} % за ${n === 2 ? 'второго' : 'третьего'} агента`);
		if (preview.nextAgentSpecial === 'cover') out.push('прикрытие: ниже риск гибели при провале');
		return out;
	});

	const chanceTone = $derived(!preview ? '' : preview.chance >= 0.65 ? 'text-ok' : preview.chance >= 0.4 ? 'text-warn' : 'text-danger');
</script>

<div class="space-y-2">
	<div class="text-xs text-muted">Свободные агенты ({idle.length}). Выберите команду: от 1 до {maxTeam} агентов, первый отмеченный ведёт операцию.</div>
	{#if idle.length === 0}
		<p class="text-sm text-warn">Нет свободных агентов.</p>
	{:else}
		<ul class="max-h-48 space-y-1 overflow-y-auto pr-1">
			{#each idle as a (a.id)}
				<li>
					<label class="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3 py-1.5 text-sm hover:border-gold has-[:checked]:border-gold has-[:checked]:bg-gold/10">
						<input type="checkbox" checked={picked.includes(a.id)} onchange={() => toggle(a.id)} class="accent-[var(--color-gold)]" />
						<span class="flex-1 truncate">{game.agentName(a)}</span>
							{#if picked[0] === a.id}<span class="chip border-gold/60 text-gold" title="Ведущий: при внедрении внедряется только он">ведущий</span>{/if}
						<span class="chip">{RANK_LABEL[a.rank]} {a.level}</span>
						<span class="hidden text-xs text-muted xl:inline" title="Слежка / Бой / Допрос / Взлом">
							{(['surveillance', 'combat', 'interrogation', 'hacking'] as const).map((k) => `${SKILL_LABEL[k][0]}${a.skills[k]}`).join(' ')}
						</span>
					</label>
				</li>
			{/each}
		</ul>
	{/if}

	{#if preview}
		<div class="rounded-xl bg-surface-1 px-3 py-2 text-sm" aria-live="polite">
			<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<span>Шанс успеха: <strong class="text-lg tabular-nums {chanceTone}" data-testid="op-chance">{Math.round(preview.chance * 100)}%</strong></span>
				<span class="text-muted">Стоимость: <span class="text-ink">{fmtMoney(preview.cost)}</span></span>
				<span class="text-muted">Срок: <span class="text-ink">{preview.days} дн.</span></span>
				{#if preview.warrantDays}<span class="text-muted">в т.ч. ордер: {preview.warrantDays} дн.</span>{/if}
			</div>
			{#if nextHint.length}
				<div class="mt-1 text-xs text-ok" data-testid="op-next-hint">Ещё один агент: {nextHint.join('; ')}.</div>
			{/if}
			{#if game.s && preview.cost > game.s.budget && preview.error !== 'credit_limit'}
				<div class="mt-1 text-xs text-warn">Не хватает {Math.round(preview.cost - game.s.budget)} k$ — запуск уйдёт в кредит (5% в месяц с долга).</div>
			{/if}
			{#if preview.error && (picked.length > 0 || preview.error === 'credit_limit' || preview.error === 'requirements')}
				<div class="mt-1 text-xs text-warn">{errorText(preview.error)}</div>
			{/if}
		</div>
		<button class="btn btn-gold w-full" disabled={!!preview.error || picked.length === 0} onclick={start}>Начать: {OP_LABEL[opType]}</button>
	{/if}
</div>
