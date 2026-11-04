// GENERATED из quests.data.json (node src/lib/content/ink/generate.mjs). Не править руками.
// Квест: recruit_retry
EXTERNAL core_var(name)
EXTERNAL core_can(choiceId)
EXTERNAL core_choose(choiceId, param)

-> start

=== start ===
Первая попытка завербовать источника не удалась, и выдержанная пауза закончилась. Агент на месте и готов к новому разговору. Способ можно сменить. Если решения не будет, выберут прежний, а если он недоступен, запасной.
-> choices

=== choices ===
+ {core_can("money")} [Деньги (60 k$; шанс 70%)] -> do_money
+ {core_can("ideology")} [Идеология (бесплатно; шанс 40%)] -> do_ideology
+ {core_can("kompromat")} [Компромат (1 предмет; шанс 85%, но риск двойного агента вдвое выше)] -> do_kompromat
+ -> waiting

=== waiting ===
-> DONE

=== do_money ===
~ temp err = core_choose("money", -1)
{ err == "":
    Агент приносит конверт и говорит о «взаимной выгоде». Источник слушает внимательно и считает про себя.
    -> END
}
Не удалось применить решение ({err}).
-> choices

=== do_ideology ===
~ temp err = core_choose("ideology", -1)
{ err == "":
    Агент говорит долго и красиво о высоких целях. Источник кивает. Согласится ли, станет ясно позже.
    -> END
}
Не удалось применить решение ({err}).
-> choices

=== do_kompromat ===
~ temp err = core_choose("kompromat", -1)
{ err == "":
    Агент кладёт на стол папку и ничего не говорит. Разговор получился коротким. Насколько искренним, покажет время.
    -> END
}
Не удалось применить решение ({err}).
-> choices
