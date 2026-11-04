// GENERATED из quests.data.json (node src/lib/content/ink/generate.mjs). Не править руками.
// Квест: double_agent
EXTERNAL core_var(name)
EXTERNAL core_can(choiceId)
EXTERNAL core_choose(choiceId, param)

-> start

=== start ===
Контрразведка сообщает: в сети за рубежом есть источник, который сообщает информацию не только вам. Выбор прост: чистить сеть, теряя время, или делать вид, что всё под контролем, пока ЦРУ собирает материал.
-> choices

=== choices ===
+ {core_can("purge")} [Чистить сеть (50 k$, 20 дней без прогресса, двойной агент устраняется)] -> do_purge
+ {core_can("ignore")} [Игнорировать (ЦРУ получает компромат на вас каждый месяц, пока не почищено)] -> do_ignore
+ -> waiting

=== waiting ===
-> DONE

=== do_purge ===
~ temp err = core_choose("purge", -1)
{ err == "":
    Сеть аккуратно перетряхивают. Прогресса нет, зато тихо. Источники вздыхают и начинают проверять друг друга.
    -> END
}
Не удалось применить решение ({err}).
-> choices

=== do_ignore ===
~ temp err = core_choose("ignore", -1)
{ err == "":
    Вы говорите «разберёмся потом». Потом наступает быстро, и с копиями отчётов.
    -> END
}
Не удалось применить решение ({err}).
-> choices
