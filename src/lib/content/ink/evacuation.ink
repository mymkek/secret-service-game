// GENERATED из quests.data.json (node src/lib/content/ink/generate.mjs). Не править руками.
// Квест: evacuation
EXTERNAL core_var(name)
EXTERNAL core_can(choiceId)
EXTERNAL core_choose(choiceId, param)

-> start

=== start ===
~ temp stage = core_var("stage")
{ stage == "checking":
    Проверка идёт. Если угроза реальна, агенту придётся очень тихо ждать. Результат будет через 20 дней.
- else:
    Зашифрованное сообщение от агента за рубежом: «Меня, кажется, ведут. Заберите». Подробности не приложены. Либо он действительно в опасности, либо слишком много читает шпионских романов. Проверить можно, но это займёт время.
}
-> choices

=== choices ===
+ {core_can("evacuate")} [Эвакуировать (150 k$; сеть в стране −1, агент возвращается)] -> do_evacuate
+ {core_can("stay")} [Оставить на месте (если угроза реальна: 40% потеря агента и сети)] -> do_stay
+ {core_can("check")} [Проверить (20 дней; при реальной угрозе 20% агент пойман)] -> do_check
+ -> waiting

=== waiting ===
-> DONE

=== do_evacuate ===
~ temp err = core_choose("evacuate", -1)
{ err == "":
    Самолёт, паспорт, чужая фамилия. Агент дома, сеть слегка потеряла в весе. Если опасность была реальной, это дёшево.
    -> END
}
Не удалось применить решение ({err}).
-> choices

=== do_stay ===
~ temp err = core_choose("stay", -1)
{ err == "":
    Вы решили, что агент справится сам. Дальнейшее зависит от того, был ли он прав. Узнаем из сводок.
    -> END
}
Не удалось применить решение ({err}).
-> choices

=== do_check ===
~ temp err = core_choose("check", -1)
{ err == "":
    Запрос отправлен. Агент ждёт. Время идёт, нервы тоже.
    -> END
}
Не удалось применить решение ({err}).
-> choices
