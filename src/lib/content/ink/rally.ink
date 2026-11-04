// GENERATED из quests.data.json (node src/lib/content/ink/generate.mjs). Не править руками.
// Квест: rally
EXTERNAL core_var(name)
EXTERNAL core_can(choiceId)
EXTERNAL core_choose(choiceId, param)

-> start

=== start ===
У здания собрались несколько сотен человек с самодельными транспарантами и громкоговорителем. Правозащитник требует отчёта о методах работы. Из окна кабинета хорошо видно и лозунги, и журналистов.
-> choices

=== choices ===
+ {core_can("disperse")} [Разогнать (контроль +5, недовольство +15, засвеченность +5)] -> do_disperse
+ {core_can("allow")} [Дать пройти (влияние лидера −5, недовольство −5)] -> do_allow
+ {core_can("provocateur")} [Запустить провокатора (50%: влияние лидера −25; иначе скандал: репутация −5, засвеченность +10; грязное)] -> do_provocateur
+ -> waiting

=== waiting ===
-> DONE

=== do_disperse ===
~ temp err = core_choose("disperse", -1)
{ err == "":
    Площадь опустела быстро. Порядок восстановлен, видео уже набирает просмотры. Недовольство никуда не делось, оно просто переехало.
    -> END
}
Не удалось применить решение ({err}).
-> choices

=== do_allow ===
~ temp err = core_choose("allow", -1)
{ err == "":
    Митинг проходит мирно и заканчивается раньше расписания. Пресса разочарована: сюжета нет.
    -> END
}
Не удалось применить решение ({err}).
-> choices

=== do_provocateur ===
~ temp err = core_choose("provocateur", -1)
{ err == "":
    В толпе появляется человек с самым громким голосом. Чей он, станет ясно по итогам, журнал сообщит.
    -> END
}
Не удалось применить решение ({err}).
-> choices
