import { BALANCE as B, selectResources, type PlayerAction } from '../game/index';
import { game } from './game.svelte';
import { pct } from './action-info';

/** Знак и один знак после запятой: +2, -1.5. */
const d = (x: number) => {
	const r = Math.round(x * 10) / 10;
	return r > 0 ? `+${r}` : `${r}`;
};

/**
 * Выполнить действие против соперников/власти и показать уведомление с конкретным итогом.
 * Итог берётся из свежих записей журнала ядра и из разницы ресурсов до/после (без формул).
 * Возвращает true, если действие выполнено.
 */
export function perform(action: PlayerAction, rival?: string): boolean {
	const s0 = game.s;
	if (!s0) return false;
	const before = selectResources(s0);
	const lastId = s0.log.at(-1)?.id ?? 0;
	if (game.act(action) !== null) return false;
	const s = game.s;
	if (!s) return true;
	const after = selectResources(s);
	const fresh = s.log.filter((e) => e.id > lastId);
	const dInfl = after.influence - before.influence;
	const dRep = after.reputation - before.reputation;
	const dInv = after.investigation - before.investigation;
	const who = rival ?? 'соперник';
	let text = '';
	let kind: 'success' | 'warn' = 'success';
	let href: string | undefined;
	let ms = 6000;

	switch (action.type) {
		case 'poach': {
			const e = fresh.find((x) => x.kind === 'poach');
			const name = game.agentNameById(Number(e?.data.agentId));
			text = `${name} перешёл к нам от ${who}: опытный, лояльность ${B.ACT_POACH.loyalty}. Может оказаться кротом — проверка лояльности в «Персонале». План ${who} ${B.ACT_POACH.targetPlan} в этом квартале.`;
			href = '/personnel';
			ms = 12000;
			break;
		}
		case 'leak': {
			const e = fresh.find((x) => x.kind === 'leak');
			const L = B.ACT_LEAK;
			const delta = L.repPerStrength * Number(e?.data.strength ?? 1);
			if (e?.data.revealed) {
				kind = 'warn';
				text = `Слив прошёл: репутация ${who} ${d(delta)}. Но источник раскрыт: ваша репутация ${L.revealRep}, засвеченность +${L.revealExposure}, обида ${who} на ${L.grudgeDays} дн.`;
			} else text = `Слив прошёл: репутация ${who} ${d(delta)}. Источник не раскрыт, засвеченность +${L.exposure}.`;
			break;
		}
		case 'sabotage': {
			const e = fresh.find((x) => x.kind === 'sabotage');
			const S = B.ACT_SABOTAGE;
			if (e?.data.revealed) {
				kind = 'warn';
				text = `Подстава раскрыта: репутация ${S.revealRep}, засвеченность +${S.revealExposure}, следствие +${S.revealInvestigation}, агент потерян. План ${who} всё же ${S.targetPlan}.`;
			} else text = `Подстава прошла тихо: план ${who} ${S.targetPlan} в этом квартале, репутация ${S.targetRep}.`;
			break;
		}
		case 'lobby': {
			const L = B.ACT_LOBBY;
			if (fresh.some((x) => x.kind === 'lobby' && x.data.backfire)) {
				kind = 'warn';
				text = `Лоббирование сработало, но с обратным эффектом: влияние ${d(dInfl)} (вместо ${-L.influence}). Финансирование ${who} урезано (x${L.targetMult}).`;
			} else text = `Лоббирование прошло: финансирование ${who} урезано (x${L.targetMult} на квартал), влияние ${d(dInfl)}.`;
			break;
		}
		case 'absorb': {
			const t = s.tasks.find((x) => x.kind === 'absorb' && x.rivalId === (action as { rivalId: string }).rivalId);
			text = `Поглощение ${who} запущено: итог через ${B.ACT_ABSORB.days} дн.${t?.chance != null ? `, шанс успеха ${pct(t.chance)}` : ''}.`;
			break;
		}
		case 'congressWork':
			text = `Работа с Конгрессом: влияние ${d(dInfl)}. Следующая — через ${B.ACT_CONGRESS_WORK.cooldownDays} дн.`;
			break;
		case 'prCampaign':
			text = `Пиар-кампания: репутация ${d(dRep)}. Следующая — через ${B.PR_CAMPAIGN.cooldownDays} дн.`;
			break;
		case 'loyaltyCheck':
			text = `Проверка лояльности запущена: результат через ${B.ACT_LOYALTY_CHECK.days} дн.`;
			break;
		case 'counterKompromat':
			text = `Встречный компромат сработал: «Под следствием» ${d(dInv)}, соперник не сможет «Копать» ${B.ACT_COUNTER_KOMPROMAT.digBlockDays} дн.`;
			break;
		case 'blackmail': {
			const scandal = fresh.some((x) => x.kind === 'blackmail_scandal');
			const S = B.QUEST_SENATOR;
			if (scandal) {
				kind = 'warn';
				text = `Шантаж удался (влияние ${d(dInfl)}), но вспыхнул скандал: репутация ${S.scandalRep}, засвеченность +${S.scandalExposure}, следствие +${S.scandalInvestigation}.`;
			} else text = `Шантаж удался: влияние ${d(dInfl)}, без последствий.`;
			break;
		}
		case 'intercept': {
			const I = B.ACT_INTERCEPT;
			if (fresh.some((x) => x.kind === 'intercept' && x.data.risk)) {
				kind = 'warn';
				text = `Дело перехвачено, но не гладко: влияние ${d(dInfl)}, обида держателя штата на ${I.grudgeDays} дн.`;
			} else text = `Дело перехвачено: теперь оно доступно вам, влияние ${d(dInfl)}.`;
			href = '/ops';
			break;
		}
		default:
			return true;
	}
	game.toast(text, kind, ms, href);
	return true;
}
