// GENERATED из quests.data.json (node src/lib/content/ink/generate.mjs). Не править руками.
// Квест: senator_secret
EXTERNAL core_var(name)
EXTERNAL core_can(choiceId)
EXTERNAL core_choose(choiceId, param)

-> start

=== start ===
В папку легло то, что сенатор очень хотел бы не видеть в чужих руках. Информация лежит и ждёт применения. Ей можно распорядиться по-разному: для денег и голосов, для конкурента или просто хранить до лучших дней.
-> choices

=== choices ===
+ {core_can("blackmail")} [Шантажировать (влияние +5 +3 за силу компромата; 25% скандал: репутация −5, засвеченность +10, следствие +5; грязное)] -> do_blackmail
+ {core_can("hold")} [Придержать (компромат остаётся до истечения срока)] -> do_hold
+ {core_can("give:police")} [Слить полиции (влияние полиции +10, её враждебность −0.3 на 180 дней)] -> do_give_police
+ {core_can("give:cia")} [Слить ЦРУ (влияние ЦРУ +10, его враждебность −0.3 на 180 дней)] -> do_give_cia
+ {core_can("give:secret_service")} [Слить Секретной службе (влияние +10, враждебность −0.3 на 180 дней)] -> do_give_secret_service
+ -> waiting

=== waiting ===
-> DONE

=== do_blackmail ===
~ temp err = core_choose("blackmail", -1)
{ err == "":
    Сенатор внезапно вспоминает о нуждах вашего ведомства. Компромат остаётся у вас, но этот приём одноразовый на ближайшие полгода.
    -> END
}
Не удалось применить решение ({err}).
-> choices

=== do_hold ===
~ temp err = core_choose("hold", -1)
{ err == "":
    Папка возвращается в сейф. Иногда лучшее оружие то, которое ещё не применено.
    -> END
}
Не удалось применить решение ({err}).
-> choices

=== do_give_police ===
~ temp err = core_choose("give:police", -1)
{ err == "":
    Полиция получает материал, благодарит и обещает вести себя тише. Верить этому не обязательно.
    -> END
}
Не удалось применить решение ({err}).
-> choices

=== do_give_cia ===
~ temp err = core_choose("give:cia", -1)
{ err == "":
    ЦРУ принимает папку без лишних слов и улыбок. Это у них означает благодарность.
    -> END
}
Не удалось применить решение ({err}).
-> choices

=== do_give_secret_service ===
~ temp err = core_choose("give:secret_service", -1)
{ err == "":
    Секретная служба уважительно кивает. Кто-то из окружения президента теперь знает, что вы умеете делиться.
    -> END
}
Не удалось применить решение ({err}).
-> choices
