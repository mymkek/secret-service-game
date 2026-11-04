// Русские подписи для идентификаторов ядра. Тексты контента (src/lib/content) имеют приоритет — см. content.ts.
import { deptNames, opTexts, perkNames, techNames } from '../content/index';
import type { DeptKey, OpType, Rank, RivalId, SkillKey, TechId, VictoryPath } from '../game/index';

export const DEPT_LABEL: Record<DeptKey, string> = deptNames;
export const DEPT_HINT: Record<DeptKey, string> = {
	analytics: 'Шанс расследований и очки плана',
	operations: 'Лимит агентов и сила команд',
	cyber: 'Кибердела и слежка',
	counterintel: 'Защита от кротов и слежки',
	pr: 'Смягчает скандалы',
	legal: 'Ордера и слушания'
};
export const OP_LABEL: Record<OpType, string> = {
	investigation: opTexts.investigation.name,
	terror: opTexts.terror.name,
	infiltration: opTexts.infiltration.name,
	surveillance: opTexts.surveillance.name
};
export const RANK_LABEL: Record<Rank, string> = { novice: 'Новичок', experienced: 'Опытный', veteran: 'Ветеран' };
export const SKILL_LABEL: Record<SkillKey, string> = { surveillance: 'Слежка', combat: 'Бой', interrogation: 'Допрос', hacking: 'Взлом' };
export const STATUS_LABEL: Record<string, string> = {
	idle: 'Свободен',
	on_op: 'На операции',
	training: 'Обучение',
	abroad: 'За рубежом',
	embedded: 'Внедрён',
	protest_duty: 'Дежурство на протестах'
};
export const PERK_LABEL: Record<string, string> = Object.fromEntries(Object.entries(perkNames).map(([k, v]) => [k, v.name]));
export const LEGEND_LABEL: Record<string, string> = { diplomat: 'Дипломат', businessman: 'Бизнесмен', journalist: 'Журналист', student: 'Студент' };
export const RECRUIT_LABEL: Record<string, string> = { money: 'Деньги', ideology: 'Идеология', kompromat: 'Компромат' };
export const COURSE_LABEL: Record<string, string> = { skill: 'Навык', language: 'Язык', legend: 'Легенда' };

const RIVAL_NAMES: Record<string, string> = {
	police: 'Полиция',
	cia: 'ЦРУ',
	secret_service: 'Секретная служба',
	player: 'ФБР',
	unknown: 'Неизвестный'
};
export function rivalName(id: string | null | undefined): string {
	return id ? (RIVAL_NAMES[id] ?? id) : '';
}
/** CSS-переменные палитры по ведомствам (токены из app.css). */
export const AGENCY_VAR: Record<string, string> = {
	player: 'var(--color-fbi)',
	police: 'var(--color-police)',
	cia: 'var(--color-cia)',
	secret_service: 'var(--color-usss)',
	mossad: 'var(--color-mossad)'
};
export const RIVALS: RivalId[] = ['police', 'cia', 'secret_service'];

export const TECH_LABEL: Record<TechId, string> = Object.fromEntries(Object.entries(techNames).map(([k, v]) => [k, `${k}. ${v.name}`])) as Record<TechId, string>;
export const TECH_BRANCH: Record<string, string> = { A: 'Аналитика', B: 'Разведка', C: 'Контроль' };

export const PATH_LABEL: Record<VictoryPath, string> = {
	'1984': '«1984»: тотальный контроль',
	shadow: '«Тень»: мировая сеть',
	monopoly: '«Монополия»: ФБР без конкурентов',
	clean: '«Чистые руки»: честная служба',
	cardinal: '«Кардинал»: серый кардинал'
};

export const ERROR_LABEL: Record<string, string> = {
	credit_limit: 'Превышен кредитный лимит',
	repr_requires_surv: 'Сначала откатите репрессии: они требуют этого уровня слежки',
	game_over: 'Партия окончена',
	no_money: 'Не хватает денег',
	no_influence: 'Не хватает влияния',
	agent_cap: 'Достигнут лимит агентов',
	agent_busy: 'Агент занят',
	agent_not_found: 'Агент не найден',
	candidate_not_found: 'Кандидат не найден',
	requirements: 'Не выполнены требования',
	max_level: 'Максимальный уровень',
	min_level: 'Слишком низкий уровень',
	already_building: 'Уже строится',
	already_known: 'Уже известно',
	already_running: 'Уже идёт',
	research_busy: 'Исследование уже идёт',
	previous_tier: 'Сначала предыдущая ступень',
	apex_locked: 'Вершина другой ветки выбрана',
	no_research: 'Нет исследования',
	cooldown: 'Откат',
	skill_cap: 'Навык на максимуме',
	bad_value: 'Неверное значение',
	bad_target: 'Неверная цель',
	target_required: 'Нужна цель',
	case_not_found: 'Дело не найдено',
	case_taken: 'Дело уже взято',
	bad_case_kind: 'Не тот тип дела',
	no_jurisdiction: 'Нет полномочий',
	case_not_interceptable: 'Дело нельзя перехватить',
	not_enough_agents: 'Мало агентов',
	too_many_agents: 'Слишком много агентов',
	team_full: 'Команда заполнена',
	agent_forbids_dirty: 'Агент отказывается от грязных дел',
	op_not_found: 'Операция не найдена',
	agent_not_embedded: 'Агент не внедрён',
	agent_not_abroad: 'Агент не за рубежом',
	need_embedded_agent: 'Нужен внедрённый агент',
	kompromat_not_found: 'Компромат не найден',
	fake_limit: 'Предел фальсификации',
	no_pending_perk: 'Нет перка к выбору',
	quest_not_found: 'Квест не найден',
	choice_not_found: 'Выбор не найден',
	choice_unavailable: 'Выбор недоступен',
	no_idle_agent: 'Нет свободного агента',
	no_kompromat: 'Нет компромата',
	need_repr5: 'Нужны Репрессии 5',
	need_legal3: 'Нужен Юридический 3',
	kompromat_unavailable: 'Компромат недоступен',
	bad_actor: 'Неверный исполнитель',
	bad_action: 'Неверное действие',
	rival_dead: 'Соперник уже выбыл'
};
export const errorText = (e: string | null | undefined): string => (e ? (ERROR_LABEL[e] ?? e) : '');

export const CHOICE_LABELS: Record<string, string> = {
	testify: 'Давать показания',
	secrecy: 'Сослаться на секретность',
	scapegoat: 'Выдать козла отпущения',
	accept: 'Согласиться',
	refuse: 'Отказать',
	concede: 'Пойти на уступки',
	infiltrate: 'Внедрить агента',
	discredit: 'Дискредитировать',
	deal: 'Заплатить',
	detain: 'Задержать',
	disperse: 'Разогнать',
	allow: 'Разрешить',
	provocateur: 'Подослать провокатора',
	return: 'Вернуть',
	court: 'Через суд',
	ignore: 'Игнорировать',
	pay: 'Заплатить',
	kompromat: 'Использовать компромат',
	report: 'Доложить',
	blackmail: 'Шантажировать',
	hold: 'Придержать',
	evacuate: 'Эвакуировать',
	stay: 'Остаться',
	check: 'Проверить',
	bribe: 'Подкупить',
	purge: 'Провести чистку',
	flee: 'Бежать',
	improvise: 'Импровизировать',
	ok: 'Понятно'
};

export const QUEST_TITLES: Record<string, string> = {
	hearings: 'Слушания в Конгрессе',
	raise_request: 'Просьба о прибавке',
	union_meeting: 'Встреча с профсоюзом',
	blogger_docs: 'Блогер с документами',
	rally: 'Митинг',
	defector_contact: 'Контакт перебежчика',
	informant: 'Информатор',
	senator_secret: 'Тайна сенатора',
	evacuation: 'Эвакуация',
	journalist: 'Журналист',
	double_agent: 'Двойной агент',
	airport: 'Аэропорт',
	plan_warning: 'Предупреждение по плану',
	director_questioning: 'Допрос директора'
};
export const STATE_NAMES: Record<string, string> = {
	AL: 'Алабама', AK: 'Аляска', AZ: 'Аризона', AR: 'Арканзас', CA: 'Калифорния', CO: 'Колорадо', CT: 'Коннектикут', DE: 'Делавэр', FL: 'Флорида', GA: 'Джорджия',
	HI: 'Гавайи', ID: 'Айдахо', IL: 'Иллинойс', IN: 'Индиана', IA: 'Айова', KS: 'Канзас', KY: 'Кентукки', LA: 'Луизиана', ME: 'Мэн', MD: 'Мэриленд',
	MA: 'Массачусетс', MI: 'Мичиган', MN: 'Миннесота', MS: 'Миссисипи', MO: 'Миссури', MT: 'Монтана', NE: 'Небраска', NV: 'Невада', NH: 'Нью-Гэмпшир', NJ: 'Нью-Джерси',
	NM: 'Нью-Мексико', NY: 'Нью-Йорк', NC: 'Сев. Каролина', ND: 'Сев. Дакота', OH: 'Огайо', OK: 'Оклахома', OR: 'Орегон', PA: 'Пенсильвания', RI: 'Род-Айленд', SC: 'Юж. Каролина',
	SD: 'Юж. Дакота', TN: 'Теннесси', TX: 'Техас', UT: 'Юта', VT: 'Вермонт', VA: 'Виргиния', WA: 'Вашингтон', WV: 'Зап. Виргиния', WI: 'Висконсин', WY: 'Вайоминг'
};

export const CASE_FALLBACK = {
	regular: { title: 'Расследование', description: 'Федеральное дело, требующее оперативной работы.' },
	terror: { title: 'Угроза теракта', description: 'Высокоприоритетное дело. Конкуренты тоже следят за ним.' }
};

type Tone = 'positive' | 'negative' | 'neutral';
export function cardFallback(id: string): { title: string; body: string; tone: Tone } {
	const m: Record<string, [string, string, Tone]> = {
		defense_cut: ['Президент урезал финансирование', 'Доход ведомства снижен на полгода.', 'negative'],
		terror_attack: ['Теракт в крупном городе', 'Появилось срочное дело. Раскройте его раньше соперников.', 'neutral'],
		document_leak: ['Утечка документов', 'Секретные документы попали в прессу.', 'negative'],
		congress_hearings: ['Слушания в Конгрессе', 'Конгресс вызывает спецслужбы на ковёр.', 'negative'],
		blockbuster: ['Удачный блокбастер', 'Фильм о спецслужбах повысил репутацию.', 'positive'],
		surveillance_program_leak: ['Утечка программы слежки', 'Сотрудник слил подробности программы слежки.', 'negative'],
		budget_surplus: ['Бюджетный профицит', 'Доход ведомства временно вырос.', 'positive'],
		police_brutality: ['Скандал с полицейским насилием', 'Репутация полиции пострадала.', 'neutral'],
		diplomatic_crisis: ['Дипломатический кризис', 'Международная обстановка осложнилась.', 'neutral'],
		cyber_attack: ['Хакерская атака', 'Появилось киберделе с повышенной наградой.', 'neutral'],
		president_demands: ['Президент требует результатов', 'Цель плана на следующий квартал выросла.', 'negative']
	};
	const r = m[id];
	return r ? { title: r[0], body: r[1], tone: r[2] } : { title: id, body: '', tone: 'neutral' };
}

