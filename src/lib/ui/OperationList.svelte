<script lang="ts">
	import { selectCases, selectOperations, type Operation } from '../game/index';
	import { game } from './game.svelte';
	import { caseText, senatorName, stateName } from './content';
	import { OP_LABEL, rivalName } from './labels';
	import { confirmAction } from './confirm.svelte';
	import { cancelOpInfo } from './action-info';
	import { Chip, ProgressBar } from './kit';

	const ops = $derived(game.s ? selectOperations(game.s) : []);
	const cases = $derived(game.s ? selectCases(game.s) : []);
	const idle = $derived((game.s?.agents ?? []).filter((a) => a.status === 'idle'));
	let reinforce = $state<Record<number, string>>({});

	function targetLabel(op: Operation): string {
		if (op.caseId !== null) {
			const c = cases.find((x) => x.id === op.caseId);
			return c ? `${caseText(c).title}, ${stateName(c.stateId)}` : `Дело #${op.caseId}`;
		}
		const t = op.target;
		if (!t) return '';
		if (t.kind === 'rival') return rivalName(t.id);
		if (t.kind === 'leader') return `Лидер протеста #${t.id}`;
		if (t.kind === 'senator') return senatorName(t.id);
		return 'Президент';
	}
</script>

{#if ops.length === 0}
	<p class="text-sm text-muted">Активных операций нет.</p>
{/if}
<ul class="space-y-2">
	{#each ops as op (op.id)}
		<li class="card-1 text-sm">
			<div class="flex items-start justify-between gap-2">
				<div>
					<div class="font-bold">{OP_LABEL[op.type]}{op.dirty ? ' (грязная)' : ''}: {targetLabel(op)}</div>
					<div class="text-xs text-muted">Команда: {op.agentIds.map((id) => game.agentNameById(id)).join(', ')}</div>
					{#if op.held}<Chip class="mt-1" tone="warn" icon="clock" title="Операция дошла до решения: завершение ждёт вашего выбора в окне дилеммы">ждёт вашего решения</Chip>{/if}
				</div>
				<div class="text-right text-xs whitespace-nowrap">
					<div>Шанс <strong>{Math.round(op.chance * 100)}%</strong></div>
					<div class="text-muted">{op.held ? 'ждёт решения' : `${op.inWarrant ? 'ждём ордер · ' : ''}${Math.max(0, op.daysLeft)} дн.`}</div>
				</div>
			</div>
			<ProgressBar class="mt-2" label="Прогресс операции" value={op.progress * 100} tone="fbi" height="h-2" />
			<div class="mt-2 flex flex-wrap items-center gap-2">
				<select
					class="text-xs"
					aria-label="Подкрепление для операции {op.id}"
					value={reinforce[op.id] ?? ''}
					onchange={(e) => (reinforce[op.id] = e.currentTarget.value)}
				>
					<option value="">Подкрепление…</option>
					{#each idle as a (a.id)}<option value={String(a.id)}>{game.agentName(a)}</option>{/each}
				</select>
				<button
					class="btn btn-sm"
					disabled={!reinforce[op.id]}
					onclick={() => game.act({ type: 'reinforceOp', opId: op.id, agentId: Number(reinforce[op.id]) }, 'Подкрепление отправлено')}>Отправить</button
				>
				{#if op.nextAgentBonus || op.nextAgentSpecial}
					<span class="basis-full text-xs text-ok" data-testid="reinforce-hint">
						{[
							op.nextAgentBonus ? `+${Math.round(op.nextAgentBonus * 100)} % за каждого следующего агента` : '',
							op.nextAgentSpecial === 'cover' ? 'прикрытие: ниже риск гибели' : ''
						]
							.filter(Boolean)
							.join('; ')}
					</span>
				{/if}
				<button class="btn btn-danger ml-auto btn-sm" onclick={() => confirmAction.ask(cancelOpInfo(`${OP_LABEL[op.type]}: ${targetLabel(op)}`), () => game.act({ type: 'cancelOp', opId: op.id }, 'Операция отменена'))}>Отменить</button>
			</div>
		</li>
	{/each}
</ul>
