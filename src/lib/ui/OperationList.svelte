<script lang="ts">
	import { selectCases, selectOperations, type Operation } from '../game/index';
	import { game } from './game.svelte';
	import { caseText, senatorName, stateName } from './content';
	import { OP_LABEL, rivalName } from './labels';

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
		<li class="rounded border border-line bg-bg p-2 text-sm">
			<div class="flex items-start justify-between gap-2">
				<div>
					<div class="font-medium">{OP_LABEL[op.type]}{op.dirty ? ' (грязная)' : ''}: {targetLabel(op)}</div>
					<div class="text-xs text-muted">Команда: {op.agentIds.map((id) => game.agentNameById(id)).join(', ')}</div>
				</div>
				<div class="text-right text-xs whitespace-nowrap">
					<div>Шанс <strong>{Math.round(op.chance * 100)}%</strong></div>
					<div class="text-muted">{op.inWarrant ? 'ждём ордер · ' : ''}{Math.max(0, op.daysLeft)} дн.</div>
				</div>
			</div>
			<div class="mt-1 h-1.5 overflow-hidden rounded bg-panel" role="progressbar" aria-label="Прогресс операции" aria-valuenow={Math.round(op.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
				<div class="h-full bg-fbi" style="width: {op.progress * 100}%"></div>
			</div>
			<div class="mt-2 flex flex-wrap items-center gap-2">
				<select
					class="rounded border border-line bg-panel px-1 py-0.5 text-xs"
					aria-label="Подкрепление для операции {op.id}"
					value={reinforce[op.id] ?? ''}
					onchange={(e) => (reinforce[op.id] = e.currentTarget.value)}
				>
					<option value="">Подкрепление…</option>
					{#each idle as a (a.id)}<option value={String(a.id)}>{game.agentName(a)}</option>{/each}
				</select>
				<button
					class="btn px-2 py-0.5 text-xs"
					disabled={!reinforce[op.id]}
					onclick={() => game.act({ type: 'reinforceOp', opId: op.id, agentId: Number(reinforce[op.id]) }, 'Подкрепление отправлено')}>Отправить</button
				>
				<button class="btn btn-danger ml-auto px-2 py-0.5 text-xs" onclick={() => game.act({ type: 'cancelOp', opId: op.id }, 'Операция отменена')}>Отменить</button>
			</div>
		</li>
	{/each}
</ul>
