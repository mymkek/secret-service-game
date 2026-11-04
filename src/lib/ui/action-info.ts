import { BALANCE as B, type ActionCostView } from '../game/index';
import type { ConfirmInfo, ConfirmRow } from './kit/ConfirmDialog.svelte';

/** Все числа берутся из BALANCE / из представлений ядра (selectActionCosts), здесь только тексты. */
export const pct = (x: number) => `${Math.round(x * 100)}%`;
const sign = (x: number) => (x > 0 ? `+${x}` : `${x}`);
const money = (x: number) => `${Math.round(x)} k$`;

/** Для рисков, которых нет в представлении ядра: слова вместо числа. */
export const riskWord = (p: number) => (p < 0.12 ? 'низкий' : p < 0.3 ? 'средний' : 'высокий');

export type RivalActionType = 'sabotage' | 'lobby' | 'poach' | 'absorb';

/** Подсказка: что делает / цена / риск (для тултипа и окна подтверждения). */
export interface ActionInfo extends ConfirmInfo {
	summary: string;
}

function build(i: Omit<ActionInfo, 'summary'>): ActionInfo {
	const parts = [i.what];
	if (i.costs?.length) parts.push('Цена: ' + i.costs.map((c) => `${c.label} ${c.value}`).join(', ') + '.');
	if (i.risks?.length) parts.push('Риск: ' + i.risks.map((r) => `${r.label} ${r.value}`).join('; ') + '.');
	return { ...i, summary: parts.join(' ') };
}

const costRows = (v: ActionCostView): ConfirmRow[] => {
	const rows: ConfirmRow[] = [];
	rows.push({ label: 'Деньги', value: v.cost ? money(v.cost) : 'бесплатно' });
	if (v.influence) rows.push({ label: 'Влияние', value: `-${v.influence}` });
	return rows;
};

export function rivalActionInfo(type: RivalActionType, rival: string, v: ActionCostView, collapsing = false): ActionInfo {
	switch (type) {
		case 'sabotage': {
			const S = B.ACT_SABOTAGE;
			return build({
				title: `Подстава: ${rival}`,
				what: `Внедрённый агент портит работу ${rival}: план цели ${S.targetPlan} в этом квартале, репутация цели ${S.targetRep}. Нужен наш агент внутри.`,
				costs: [...costRows(v), { label: 'Засвеченность', value: sign(S.exposure), tone: 'warn' }],
				risks: [
					{ label: 'Раскрытие', value: v.risk !== null ? pct(v.risk) : '-', tone: 'danger' },
					{ label: 'Если раскроют', value: `репутация ${S.revealRep}, засвеченность +${S.revealExposure}, следствие +${S.revealInvestigation}, агент потерян`, tone: 'danger' }
				],
				dirty: true,
				art: 'case'
			});
		}
		case 'lobby': {
			const L = B.ACT_LOBBY;
			return build({
				title: `Лоббирование против: ${rival}`,
				what: `В Конгрессе режут финансирование ${rival}: множитель цели x${L.targetMult} на следующий квартал (не ниже x${L.multMin}).`,
				costs: costRows(v),
				risks: [
					{ label: 'Обратный эффект', value: v.risk !== null ? pct(v.risk) : pct(L.backfireChance), tone: 'warn' },
					{ label: 'Если сработает', value: `влияние ${L.backfireInfluence}`, tone: 'warn' }
				],
				art: 'hearings'
			});
		}
		case 'poach': {
			const P = B.ACT_POACH;
			return build({
				title: `Переманить агента у: ${rival}`,
				what: `Мгновенно: в штат приходит опытный агент (лояльность ${P.loyalty}), план ${rival} ${P.targetPlan} в этом квартале. Нужно свободное место в штате.`,
				costs: costRows(v),
				risks: [
					{ label: 'Агент окажется кротом', value: v.risk !== null ? pct(v.risk) : '-', tone: 'warn' },
					{ label: 'Как проверить', value: 'проверка лояльности' }
				],
				art: 'informant'
			});
		}
		case 'absorb': {
			const A = B.ACT_ABSORB;
			return build({
				title: `Поглощение: ${rival}`,
				what: `Операция на ${A.days} дн. Успех: ${rival} поглощён, вы получаете ${A.novices} новичков и штаты цели.${collapsing ? ' Цель на грани: дешевле и шанс выше.' : ''}`,
				costs: costRows(v),
				risks: [
					{ label: 'Шанс успеха', value: v.chance !== null ? pct(v.chance) : '-', tone: 'ok' },
					{ label: 'При провале', value: `влияние ${A.failInfluence}, обида цели ${A.grudgeDays} дн.`, tone: 'danger' }
				],
				art: 'menu'
			});
		}
	}
}

export function leakInfo(rival: string, v: ActionCostView & { strength: number; targetRepDelta: number }): ActionInfo {
	const L = B.ACT_LEAK;
	return build({
		title: `Слив компромата: ${rival}`,
		what: `Предмет компромата (сила ${v.strength}) уходит в СМИ и расходуется: репутация ${rival} ${v.targetRepDelta}.`,
		costs: [...costRows(v), { label: 'Компромат', value: '-1 предмет' }, { label: 'Засвеченность', value: sign(L.exposure), tone: 'warn' }],
		risks: [
			{ label: 'Раскрытие источника', value: v.risk !== null ? pct(v.risk) : '-', tone: 'danger' },
			{ label: 'Если раскроют', value: `репутация ${L.revealRep}, засвеченность +${L.revealExposure}, обида ${L.grudgeDays} дн.`, tone: 'danger' }
		],
		dirty: true,
		art: 'journalist'
	});
}

export function interceptInfo(): ActionInfo {
	const I = B.ACT_INTERCEPT;
	return build({
		title: 'Перехват дела',
		what: `Дело становится доступным вам; план держателя штата ${I.targetPlan} (если держатель есть).`,
		costs: [
			{ label: 'Деньги', value: money(I.cost) },
			{ label: 'Влияние', value: `-${I.influence}` }
		],
		risks: [
			{ label: 'Неудача', value: riskWord(I.riskChance), tone: 'warn' },
			{ label: 'Если не повезёт', value: `влияние ${I.riskInfluence}, обида держателя ${I.grudgeDays} дн.`, tone: 'warn' }
		],
		art: 'case'
	});
}

export function congressInfo(v: ActionCostView): ActionInfo {
	const C = B.ACT_CONGRESS_WORK;
	return build({
		title: 'Работа с Конгрессом',
		what: `Влияние +${C.influence}. Повторить можно через ${C.cooldownDays} дн.`,
		costs: costRows(v),
		risks: [{ label: 'Риск', value: 'нет', tone: 'ok' }],
		art: 'hearings'
	});
}

export function prInfo(v: ActionCostView): ActionInfo {
	const P = B.PR_CAMPAIGN;
	return build({
		title: 'Пиар-кампания',
		what: `Репутация +${P.repBase} плюс ${P.repPerLevel} за каждый уровень отдела Пиар. Повторить можно через ${P.cooldownDays} дн.`,
		costs: costRows(v),
		risks: [{ label: 'Риск', value: 'нет', tone: 'ok' }],
		art: 'journalist'
	});
}

export function loyaltyInfo(v: ActionCostView): ActionInfo {
	const C = B.ACT_LOYALTY_CHECK;
	return build({
		title: 'Проверка лояльности',
		what: `Через ${C.days} дн. каждый тайный крот в штате раскрывается с шансом ${pct(C.base)} плюс ${pct(C.perCI)} за уровень Контрразведки и удаляется.`,
		costs: costRows(v),
		risks: [{ label: 'Риск', value: 'нет', tone: 'ok' }],
		art: 'director'
	});
}

export function counterInfo(v: ActionCostView): ActionInfo {
	const C = B.ACT_COUNTER_KOMPROMAT;
	return build({
		title: 'Встречный компромат',
		what: `Предмет компромата на соперника расходуется: «Под следствием» снижается на ${-C.investigationBase} и ещё на ${-C.investigationPerStrength} за единицу силы; соперник не может «Копать» ${C.digBlockDays} дн.`,
		costs: [...costRows(v), { label: 'Компромат', value: '-1 предмет' }, { label: 'Засвеченность', value: sign(C.exposure), tone: 'warn' }],
		risks: [{ label: 'Откат действия', value: `${C.cooldownDays} дн.` }],
		dirty: true,
		art: 'director'
	});
}

export function blackmailInfo(target: string, v?: { risk: number | null; influenceGain: number; readyInDays: number }): ActionInfo {
	const S = B.QUEST_SENATOR;
	const gain = v ? v.influenceGain : S.blackmailInflBase;
	const risk = v?.risk ?? S.scandalP;
	return build({
		title: `Шантаж: ${target}`,
		what: `Сенатор уступает: влияние +${Math.round(gain * 10) / 10}${v ? ` (с учётом силы этого компромата)` : ` плюс ${S.blackmailInflPerStrength} за единицу силы компромата`}. Предмет уходит на откат ${S.cooldownDays} дн. (не расходуется).`,
		costs: [{ label: 'Деньги', value: 'бесплатно' }],
		risks: [
			{ label: 'Скандал', value: pct(risk), tone: 'danger' },
			{ label: 'Если вспыхнет', value: `репутация ${S.scandalRep}, засвеченность +${S.scandalExposure}, следствие +${S.scandalInvestigation}`, tone: 'danger' }
		],
		dirty: true,
		art: 'senator'
	});
}

// --------------------------------------------------------------- простые подтверждения

export const hireInfo = (name: string, cost: number, salary: number): ActionInfo =>
	build({
		title: `Нанять: ${name}`,
		what: 'Агент поступает в штат и сразу начинает получать зарплату.',
		costs: [
			{ label: 'Найм', value: money(cost) },
			{ label: 'Зарплата', value: `${salary} k$/мес` }
		],
		art: 'informant'
	});

export const fireInfo = (name: string): ActionInfo =>
	build({
		title: `Уволить: ${name}`,
		what: 'Агент покидает ведомство навсегда. Лояльность остальных немного падает.',
		risks: [
			{ label: 'Лояльность остальных', value: `-${B.FIRE_LOYALTY_PENALTY}`, tone: 'warn' },
			{ label: 'Обратимо', value: 'нет', tone: 'danger' }
		],
		danger: true,
		confirmLabel: 'Уволить',
		art: 'defeat'
	});

export const cancelOpInfo = (label: string): ActionInfo =>
	build({
		title: 'Отменить операцию',
		what: `Операция «${label}» будет прекращена. Отменить это решение нельзя.`,
		risks: [{ label: 'Обратимо', value: 'нет', tone: 'danger' }],
		danger: true,
		confirmLabel: 'Отменить операцию',
		art: 'result'
	});

export const buildInfo = (name: string, cost: number): ActionInfo =>
	build({
		title: `Строительство: ${name}`,
		what: 'Улучшение займёт несколько дней, деньги списываются сразу.',
		costs: [{ label: 'Деньги', value: money(cost) }],
		art: 'report'
	});
