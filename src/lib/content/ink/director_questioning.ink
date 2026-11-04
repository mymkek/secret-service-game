// GENERATED из quests.data.json (node src/lib/content/ink/generate.mjs). Не править руками.
// Квест: director_questioning
EXTERNAL core_var(name)
EXTERNAL core_can(choiceId)
EXTERNAL core_choose(choiceId, param)

-> start

=== start ===
Следователи пришли к вам с вежливыми лицами и повесткой. Речь о делах, которые вы считали закрытыми. Дело против директора открыто и набирает вес. Дальше цифры на шкале будут только расти, если не принять мер.
-> choices

=== choices ===
+ {core_can("ok")} [Принять к сведению] -> do_ok
+ -> waiting

=== waiting ===
-> DONE

=== do_ok ===
~ temp err = core_choose("ok", -1)
{ err == "":
    Вы отвечаете на вопросы и просите копию протокола. Копию не дают. Адвокат вздыхает: «Началось».
    -> END
}
Не удалось применить решение ({err}).
-> choices
