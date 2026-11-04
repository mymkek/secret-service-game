// GENERATED из quests.data.json (node src/lib/content/ink/generate.mjs). Не править руками.
// Квест: raise_request
EXTERNAL core_var(name)
EXTERNAL core_can(choiceId)
EXTERNAL core_choose(choiceId, param)

-> start

=== start ===
Агент заходит в кабинет с папкой и тщательно отрепетированной речью о рынке труда. В папке графики, в речи слова «переработки» и «внешние предложения». Вопрос в конечном счёте один: сколько вы цените человека, который рискует жизнью за ваш бюджет.
-> choices

=== choices ===
+ {core_can("accept")} [Согласиться (зарплата +25% к базе, лояльность +10)] -> do_accept
+ {core_can("refuse")} [Отказать (лояльность −10)] -> do_refuse
+ -> waiting

=== waiting ===
-> DONE

=== do_accept ===
~ temp err = core_choose("accept", -1)
{ err == "":
    Бухгалтерия вздыхает, агент сияет. Он обещает работать лучше. Бухгалтерия не обещает ничего.
    -> END
}
Не удалось применить решение ({err}).
-> choices

=== do_refuse ===
~ temp err = core_choose("refuse", -1)
{ err == "":
    «Все мы делаем что можем», говорите вы. Агент уходит молча. Резюме он обновит вечером.
    -> END
}
Не удалось применить решение ({err}).
-> choices
