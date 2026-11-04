// GENERATED из quests.data.json (node src/lib/content/ink/generate.mjs). Не править руками.
// Квест: plan_warning
EXTERNAL core_var(name)
EXTERNAL core_can(choiceId)
EXTERNAL core_choose(choiceId, param)

-> start

=== start ===
Два квартала подряд раскрываемость ниже половины от плана. Приходит письмо на хорошей бумаге: ещё один такой квартал, и вам предложат заняться чем-нибудь другим. Текст составлен вежливо, что, как известно, хуже всего.
-> choices

=== choices ===
+ {core_can("ok")} [Принять к сведению] -> do_ok
+ -> waiting

=== waiting ===
-> DONE

=== do_ok ===
~ temp err = core_choose("ok", -1)
{ err == "":
    Письмо подшито в папку «Важное». Перечитывать его будете часто.
    -> END
}
Не удалось применить решение ({err}).
-> choices
