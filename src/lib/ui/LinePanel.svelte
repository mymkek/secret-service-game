<script lang="ts">
	import { selectLine } from '../game/index';
	import type { ConfirmInfo } from './kit';
	import { game } from './game.svelte';
	import { confirmAction } from './confirm.svelte';
	import { content } from './content';
	import { errorText } from './labels';
	import { Button, Chip, ProgressBar } from './kit';

	const info = $derived(game.s ? selectLine(game.s) : null);
	const line = $derived(info?.line ?? null);
	const stageText = $derived(line ? content.line?.stages.find((x) => x.stage === line.stage) : undefined);

	const PHASE: Record<string, string> = {
		stage: 'идёт этап',
		pause: 'пауза перед следующим этапом',
		window: 'ждёт вашего решения'
	};

	const recallInfo: ConfirmInfo = {
		title: 'Отозвать агентов из «Народного авангарда»',
		what: 'Операция прекращается, агенты возвращаются в штат. Вложенные деньги не возвращаются, а всё, что движение успело сделать, остаётся в истории вашей службы.',
		confirmLabel: 'Отозвать',
		danger: true,
		art: 'vanguard'
	};

	function recall() {
		confirmAction.ask(recallInfo, () => game.act({ type: 'lineRecall' }, 'Агенты отозваны с линейки'));
	}
</script>

{#if line}
	<section class="card space-y-2" aria-label="Линейка «Народный авангард»" data-testid="line-panel">
		<div class="flex items-center justify-between gap-2">
			<h2 class="h2 mb-0">{content.line?.name ?? '«Народный авангард»'}</h2>
			<Chip tone={line.phase === 'window' ? 'warn' : 'info'}>этап {line.stage} из 4</Chip>
		</div>
		<ProgressBar label="Этап линейки" value={((line.stage - (line.phase === 'stage' ? 0.5 : line.phase === 'pause' ? 0 : 0.25)) / 4) * 100} tone="fbi" height="h-2" />
		{#if stageText}<p class="text-sm"><strong>{stageText.title}.</strong> {stageText.text}</p>{/if}
		<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
			<dt class="text-muted">Ведущий</dt>
			<dd>{game.agentNameById(line.leadId)}</dd>
			<dt class="text-muted">Напарник</dt>
			<dd>{line.partnerId !== null ? game.agentNameById(line.partnerId) : 'нет'}</dd>
			<dt class="text-muted">Сейчас</dt>
			<dd>
				{PHASE[line.phase]}{#if line.phase === 'stage' && line.chance !== null}, шанс {Math.round(line.chance * 100)} %{/if}
			</dd>
			{#if line.daysLeft !== null && line.phase !== 'window'}
				<dt class="text-muted">{line.phase === 'stage' ? 'До конца этапа' : 'До следующего этапа'}</dt>
				<dd class="tabular-nums" data-testid="line-days">{Math.max(0, line.daysLeft)} дн.</dd>
			{/if}
		</dl>
		<div class="flex items-center justify-between gap-2">
			<span class="text-xs text-muted">{line.recallError ? errorText(line.recallError) : 'Отозвать можно сейчас.'}</span>
			<Button variant="danger" size="sm" disabled={!!line.recallError} onclick={recall}>Отозвать</Button>
		</div>
	</section>
{/if}
