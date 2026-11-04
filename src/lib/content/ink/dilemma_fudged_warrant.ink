// Написано вручную: в quests.data.json у сценария "handwritten": true, generate.mjs его пропускает.
// Тексты сцены, доводы и исходы лежат в quests.data.json и повторены здесь дословно (проверяет content.test.ts).
// Квест: dilemma_fudged_warrant
EXTERNAL core_var(name)
EXTERNAL core_can(choiceId)
EXTERNAL core_choose(choiceId, param)

-> start

=== function risk_word(r) ===
{ r == "low":
    ~ return "низкий"
}
{ r == "medium":
    ~ return "средний"
}
~ return "высокий"

=== start ===
~ temp days = core_var("p_warrantDays")
Для слежки нужен ордер, а суд рассматривает заявки неторопливо. В вашей заявке чего-то не хватает: пара фактов слабовата, одна ссылка на источник расплывчата. Исправить можно за вечер, и никто не заметит.
Обычный срок ордера: {days} дн.
За ожидание: ордер выписан по настоящим фактам, и любой аудитор это подтвердит. Лишние недели стоят лишь времени.
За правку: факты почти те же, суд лишь подтвердит очевидное. Каждый день ожидания работает на цель.
-> choices

=== choices ===
~ temp r_fudge = core_var("risk_fudge")
+ {core_can("wait")} [Ждать ордер (обычный срок)] -> do_wait
+ {core_can("fudge")} [Подправить заявку (грязное; ордер 0 дней, шанс +5%; риск: {risk_word(r_fudge)})] -> do_fudge
+ -> waiting

=== waiting ===
-> DONE

=== do_wait ===
~ temp err = core_choose("wait", -1)
{ err == "":
    Заявка ушла судье как есть. Ждём, пока бюрократия закончит бюрократить.
    -> END
}
Не удалось применить решение ({err}).
-> choices

=== do_fudge ===
~ temp err = core_choose("fudge", -1)
{ err == "":
    В заявке появились две точные формулировки, которых там раньше не было. Судья подписал за пять минут. Слежка идёт.
    -> END
}
Не удалось применить решение ({err}).
-> choices
