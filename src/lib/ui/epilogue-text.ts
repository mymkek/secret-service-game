// Тексты эпилога «Через 25 лет. Доклад комиссии» (ГДД §9.10). Основные тексты - content.epilogue (пишет content-writer);
// запасные строки ниже нужны, пока раздел не заполнен, и подставляют числа из EpilogueView по ключам.
import { formatEventText, type EpilogueView } from '../game/index';
import { content } from './content';

type Line = EpilogueView['lines'][number];
type Verdict = EpilogueView['verdict'];

const n = (v: unknown) => Number(v ?? 0);

const LINE_FALLBACK: Record<Line['key'], (v: Line['values']) => string> = {
	forced_confessions: (v) => `Из ${n(v.forcedConfessions)} признаний, полученных под давлением, ложными оказались ${n(v.falseConfessions)}.`,
	stings: (v) => `Из ${n(v.stings)} фигурантов провокаций ${n(v.stingsWouldntAct)} сами ничего бы не совершили.`,
	informant: (v) => `Ваш источник совершил преступлений под защитой Бюро: ${n(v.informantCrimes)}.`,
	signals: (v) => `Тихих сигналов было ${n(v.signals)}, реальных из них ${n(v.signalsReal)}: предотвращено по правилам ${n(v.signalsPrevented)}, грязными методами ${n(v.signalsPreventedDirty)}, случилось ${n(v.missedSignals)}.`,
	innocents: (v) => `Под слежкой оказались невиновные: ${n(v.innocentsSurveilled)}, задержаны: ${n(v.innocentsDetained)}.`,
	warrants: (v) => `Ордеров оформлено задним числом: ${n(v.warrantsFudged)}, вскрылось: ${n(v.fudgeCaught)}.`,
	cover_lives: (v) => `Агенты вели двойную жизнь под прикрытием: ${n(v.coverRomances)}, скандалов: ${n(v.coverScandals)}.`,
	vanguard: (v) => `Операций «Народный авангард»: начато ${n(v.linesStarted)}, доведено до конца ${n(v.linesCompleted)}, провокаций ${n(v.linesProvoked)}.`,
	shared_with_cia: (v) => `Данные переданы ЦРУ: ${n(v.sharedWithCia)} раз.`,
	election: () => 'Накануне выборов Бюро вмешалось в кампанию.',
	dirty_actions: (v) => `Прочих грязных действий за время службы: ${n(v.dirtyActions)}.`
};

const VERDICT_FALLBACK: Record<Verdict, { title: string; text: string }> = {
	church: { title: 'Новый Комитет Чёрча', text: 'Комиссия признала злоупотребления системными и передала материалы в Конгресс.' },
	reform: { title: 'Комиссия рекомендует реформу', text: 'Надзор за ведомством предлагается усилить, а ряд практик прекратить.' },
	gray: { title: 'Серая зона', text: 'Серьёзных нарушений не доказано, но вопросы к методам остаются.' },
	heavy_memory: { title: 'Чистые руки, тяжёлая память', text: 'Правил вы не нарушали, однако пропущенные угрозы остались на вашей совести.' },
	exemplary: { title: 'Образцовое ведомство', text: 'Комиссия не нашла к вашей службе претензий.' }
};

const ELECTION_FALLBACK: Record<string, string> = {
	'new_admin:none': 'Выборы привели к смене администрации. Бюро не вмешивалось.',
	'new_admin:public': 'Администрация сменилась. Публичное заявление Бюро позднее признали вмешательством.',
	'new_admin:leak': 'Администрация сменилась. Утечка досье на кандидата вошла в учебники как вмешательство в выборы.',
	'reelected:none': 'Президент переизбран. Бюро не вмешивалось.',
	'reelected:public': 'Президент переизбран. Публичное заявление Бюро оценили как давление на избирателей.',
	'reelected:leak': 'Президент переизбран. Утечка досье на соперника была признана вмешательством.'
};

/** Текст строки «отложенной правды» и необязательная врезка «В реальности было похожее дело…». */
export function epilogueLine(l: Line): { text: string; realCase?: string } {
	const def = content.epilogue?.lines[l.key];
	if (def) return { text: formatEventText(def.text, l.values), realCase: def.realCase };
	return { text: LINE_FALLBACK[l.key](l.values) };
}

export function verdictText(v: Verdict): { title: string; text: string } {
	return content.epilogue?.verdicts[v] ?? VERDICT_FALLBACK[v];
}

export function epilogueElection(e: NonNullable<EpilogueView['election']>): string {
	const key = `${e.result}:${e.meddling}`;
	return content.epilogue?.election[key as keyof NonNullable<typeof content.epilogue>['election']] ?? ELECTION_FALLBACK[key] ?? '';
}

export const epilogueTitle = (years: number) => content.epilogue?.title ?? `Через ${years} лет. Доклад комиссии`;
