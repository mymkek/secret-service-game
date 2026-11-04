// Тексты записей журнала для каждого LOG_KINDS. Подстановка: formatEventText (content-schema.ts).
// Плейсхолдеры - ключи LogEntry.data плюс производные из log-text.ts (renderLogEntry):
// {agentName} {rivalName} {toName} {stateName} {countryName} {deptName} {techName} {questTitle}
// {cardTitle} {opName} {courseName} {rankName} {legendName} {methodName} {archetypeName}
// {actionText} {ratioPct} {sharePct} {pathName} {hearingReason} {title} {resultText} {repLossRounded} {senatorName}
// Правила расширения - templates/events.md.
import type { LogKind, PendingLogKind } from '../game/types';

type Sev = 'info' | 'success' | 'warning' | 'danger';

// PendingLogKind: виды, ещё не перенесённые в LOG_KINDS. Когда ядро их перенесёт, тип PendingLogKind
// станет пустым (never), а записи ниже останутся валидными: объединение типов не изменится.
type EventTextDef = { text: string; severity: Sev };

/**
 * Виды, текст к которым написан раньше, чем ядро добавило их в LOG_KINDS/PENDING_LOG_KINDS.
 * Когда вид появится в ядре, ничего менять не нужно: он исключён из строгого типа baseTexts
 * (Exclude), а bundle.ts включает такие записи в бандл только если вид известен схеме.
 * После появления вида в ядре запись можно перенести в baseTexts и убрать из FutureLogKind.
 */
export type FutureLogKind = 'rival_collapsing';

export const futureEventTexts: Record<FutureLogKind, EventTextDef> = {
	rival_collapsing: {
		text: '{rivalName} на грани краха: репутация обнулена. До дня {disbandDay} он бездействует и может быть поглощён на льготных условиях.',
		severity: 'success'
	}
};

const baseTexts: Record<Exclude<LogKind | PendingLogKind, FutureLogKind>, EventTextDef> = {
	kompromat_burned: { text: '{senatorName} сорвался, и компромат на него сгорел. Хранить такое стоило не рядом с камином.', severity: 'danger' },
	absorb_failed: { text: 'Поглощение {rivalName} сорвалось. Влияние потеряно, обида осталась.', severity: 'warning' },
	agent_captured: { text: '{agentName} задержан противником. Возвращать его никто не планирует.', severity: 'danger' },
	agent_defected: { text: '{agentName} перешёл к конкуренту ({rivalName}) вместе с накопленными знаниями о вас.', severity: 'danger' },
	agent_deployed: { text: '{agentName} заброшен в страну: {countryName}, прикрытие «{legendName}».', severity: 'info' },
	agent_fired: { text: '{agentName} уволен. Выходное пособие выплачено, остальные сотрудники всё запомнили.', severity: 'warning' },
	agent_hired: { text: 'В штат принят новый сотрудник: {rankName} {agentName}.', severity: 'success' },
	agent_killed: { text: '{agentName} погиб при исполнении. Бюрократия уже готовит формулировку «героически».', severity: 'danger' },
	agent_level_up: { text: '{agentName} получил уровень {level}. Просит не повышать зарплату сразу.', severity: 'success' },
	agent_returned: { text: '{agentName} вернулся с задания, цел и на удивление вежлив.', severity: 'info' },
	agent_theft: { text: '{agentName} уличён в мелком воровстве из ведомственной кассы.', severity: 'warning' },
	blackmail_scandal: { text: 'Шантаж сенатора раскрылся. Пресса в восторге, Конгресс нет.', severity: 'danger' },
	case_expired: { text: 'Время на дело вышло, его забрал {toName}. В их отчёте оно будет смотреться красиво.', severity: 'warning' },
	case_lost: { text: 'Дело ушло конкуренту ({toName}). Теперь они расскажут, как это было просто.', severity: 'warning' },
	case_new: { text: 'Новое дело в штате {stateName}, сложность {difficulty}.', severity: 'info' },
	chance_card: { text: 'Событие: «{cardTitle}».', severity: 'info' },
	coalition_formed: { text: 'Конкуренты объединились против вас. Стало заметно теснее.', severity: 'danger' },
	defeat: { text: 'Игра окончена: {title}.', severity: 'danger' },
	dept_built: { text: 'Отдел «{deptName}» теперь на уровне {level}.', severity: 'success' },
	director_questioning: { text: 'Директора вызвали на допрос. Дело против вас набирает вес.', severity: 'danger' },
	election: { text: 'Выборы прошли. Администрация сменилась: приоритеты ведомств перераспределены, президент к вам холоднее.', severity: 'warning' },
	embedded_exposed: { text: 'Внедрённый {agentName} раскрыт. Возвращается с объяснительной.', severity: 'warning' },
	fake_caught: { text: 'Приписки в отчётности вскрылись. Репутация и спокойствие директора пострадали.', severity: 'danger' },
	hearings: { text: 'Слушания в Конгрессе назначены {hearingReason}.', severity: 'warning' },
	hearings_skipped: { text: 'Слушания могли бы состояться, но Конгресс ещё не отошёл от прошлых.', severity: 'info' },
	intercept: { text: 'Дело перехвачено у {rivalName}. Там это пока обсуждают.', severity: 'success' },
	journalist_article: { text: 'Вышла статья о нашем ведомстве. Заголовок читать не рекомендуется.', severity: 'danger' },
	jurisdiction_up: { text: 'Штат {stateName}: полномочия расширены до уровня {level} за громкие успехи.', severity: 'success' },
	leader_backs_rival: { text: 'Лидер сопротивления поддержал {rivalName}. Те довольны и благодарны.', severity: 'warning' },
	leader_new: { text: 'В штате {stateName} появился лидер сопротивления: {archetypeName}.', severity: 'warning' },
	leader_removed: { text: 'Лидер сопротивления исчез из поля зрения. Журналисты задают вопросы.', severity: 'warning' },
	leak: { text: 'Компромат на {rivalName} слит в прессу. Источник, как водится, не назван.', severity: 'info' },
	lobby: { text: 'Лоббирование против {rivalName} прошло в кулуарах. Эффект проявится в следующем квартале.', severity: 'info' },
	loyalty_check_done: { text: 'Проверка лояльности завершена. Кротов, которые не спрятались, нет.', severity: 'info' },
	mole_found: { text: 'Крот раскрыт: {agentName} работал на {rivalName}. Уволен без выходного пособия.', severity: 'success' },
	month_money: { text: 'Итоги месяца: доход {income} k$, расходы {expenses} k$, бюджет {budget} k$.', severity: 'info' },
	national_protest: { text: 'Общенациональный протест. Недовольство растёт, засвеченность тоже.', severity: 'danger' },
	network_failed: { text: 'Сеть в стране {countryName} дала сбой и опустилась до уровня {level}.', severity: 'danger' },
	network_up: { text: 'Сеть в стране {countryName} выросла до уровня {level}.', severity: 'success' },
	op_cancelled: { text: 'Операция отменена. Половина денег вернулась, объяснения остались.', severity: 'info' },
	op_fail: { text: 'Операция «{opName}» провалена. Придётся писать отчёт.', severity: 'danger' },
	op_started: { text: 'Начата операция «{opName}».', severity: 'info' },
	op_success: { text: 'Операция «{opName}» завершена успешно. Ведомство довольно, цифры тоже.', severity: 'success' },
	plan_warning: { text: 'Предупреждение: план по раскрываемости не выполнен {streak} кв. подряд.', severity: 'danger' },
	poach: { text: 'Агент {agentName} переманен у {rivalName}.', severity: 'success' },
	protests: { text: 'Протесты: на улицах {agents} ваших сотрудников, не хватает ещё {missing}.', severity: 'warning' },
	quarter_report: { text: 'Квартал {quarter}: очков {points} из {target} ({ratioPct}), доля бюджета {sharePct}.', severity: 'info' },
	quest_choice: { text: 'Решение по вопросу «{questTitle}» принято и подшито в дело.', severity: 'info' },
	quest_opened: { text: 'Требуется решение: «{questTitle}».', severity: 'warning' },
	random_find: { text: 'Случайная находка: у нас новый компромат на {rivalName}.', severity: 'info' },
	recruit_failed: { text: 'Вербовка источника в стране {countryName} не удалась.', severity: 'warning' },
	repr_built: { text: 'Включён уровень репрессий {level}. Население заметило.', severity: 'warning' },
	repr_rollback: { text: 'Репрессии понижены до уровня {level}. Общество вздохнуло, контроль нет.', severity: 'info' },
	restore_state: { text: 'Попытка вернуть полномочия в штате {stateName}: {resultText}.', severity: 'info' },
	rival_absorbed: { text: '{rivalName} поглощён. Здание теперь ваше, кофемашина тоже.', severity: 'success' },
	rival_action: { text: '{rivalName} {actionText}.', severity: 'warning' },
	rival_disbanded: { text: '{rivalName} расформирован. Остальные соперники сделали вид, что не нервничают.', severity: 'success' },
	sabotage: { text: 'Подстава против {rivalName} {resultText}.', severity: 'info' },
	scandal: { text: 'Скандал! Репутация −{repLossRounded}, пар выпущен.', severity: 'danger' },
	scapegoat: { text: 'Назначен виновный. Агент {agentName} больше не числится в штате.', severity: 'warning' },
	source_recruited: { text: 'Источник в стране {countryName} завербован ({methodName}).', severity: 'success' },
	surv_built: { text: 'Слежка выведена на уровень {level}. Информации больше, вопросов тоже.', severity: 'success' },
	surv_rollback: { text: 'Слежка понижена до уровня {level}. Освободившиеся деньги нашли применение.', severity: 'info' },
	tech_done: { text: 'Исследование завершено: «{techName}».', severity: 'success' },
	terror_race_lost: { text: 'Теракт раскрыт не нами: премия ушла к {rivalName}.', severity: 'danger' },
	thaw: { text: 'Оттепель! Недовольство спало, зато журналисты нашли, о чём писать.', severity: 'warning' },
	training_done: { text: '{agentName} закончил {courseName} и вернулся к делам.', severity: 'success' },
	unrest_threshold: { text: 'Недовольство достигло порога {level}. Улицы напряжены.', severity: 'danger' },
	victory: { text: 'Победа: {pathName}.', severity: 'success' },
	zabroska_failed: { text: '{agentName} провалил заброску в страну {countryName}. Возвращаться ему некуда.', severity: 'danger' }
};

/** Все тексты событий (строгие и «будущие»). */
export const eventTexts: Record<Exclude<LogKind | PendingLogKind, FutureLogKind>, EventTextDef> & Record<FutureLogKind, EventTextDef> = {
	...baseTexts,
	...futureEventTexts
};
