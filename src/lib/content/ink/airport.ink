// GENERATED из quests.data.json (node src/lib/content/ink/generate.mjs). Не править руками.
// Квест: airport
EXTERNAL core_var(name)
EXTERNAL core_can(choiceId)
EXTERNAL core_choose(choiceId, param)

-> start

=== start ===
Паспортный контроль, длинная очередь, и вдруг у стойки человек в штатском смотрит на вашего агента слишком долго. Либо ему кажется, либо нет. Агент на связи ждёт указаний: бежать сразу или попробовать пройти.
-> choices

=== choices ===
+ {core_can("flee")} [Бежать (агент возвращается, заброска сорвана)] -> do_flee
+ {core_can("improvise")} [Импровизировать (шанс провала на границе удваивается)] -> do_improvise
+ -> waiting

=== waiting ===
-> DONE

=== do_flee ===
~ temp err = core_choose("flee", -1)
{ err == "":
    Агент разворачивается и исчезает в толпе. Заброска провалена, но он цел. В нашей профессии это уже успех.
    -> END
}
Не удалось применить решение ({err}).
-> choices

=== do_improvise ===
~ temp err = core_choose("improvise", -1)
{ err == "":
    Агент улыбается, показывает документы и просит не задерживать очередь. Что будет дальше, узнаем из донесения.
    -> END
}
Не удалось применить решение ({err}).
-> choices
