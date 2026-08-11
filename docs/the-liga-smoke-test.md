# The Liga Smoke Test

1. Войти как `platform_owner`.
   Expected: открыт `/platform`, роль отображается как владелец платформы.
2. Создать или открыть The Liga.
   Expected: организация active, timezone `Asia/Baku`, currency `AZN`.
3. Назначить admin.
   Expected: membership `organization_admin` active.
4. Создать employee.
   Expected: membership `employee` active.
5. Создать shift templates.
   Expected: есть `Первая смена` 10:00-18:00 и `Вторая смена` 18:00-02:00.
6. Создать места.
   Expected: PS/Racing/Billiard timed places и Table 1-5 active.
7. Создать товар с opening balance.
   Expected: product stock_quantity совпадает с ledger.
8. Создать услугу.
   Expected: service active и доступна сотруднику.
9. Создать combo.
   Expected: combo active, components snapshots доступны при добавлении в заказ.
10. Войти как employee.
    Expected: открыт `/employee`, без смены операции заблокированы.
11. Открыть shift.
    Expected: shift open, operational day создан.
12. Запустить PS session.
    Expected: timed session active, место занято.
13. Добавить товар.
    Expected: order item создан, stock reservation active.
14. Добавить combo.
    Expected: combo item создан, component snapshots сохранены, reservations созданы.
15. Завершить session.
    Expected: timed session completed, billable amount добавлен в order.
16. Оплатить cash.
    Expected: order paid, payment completed, cash shift_id привязан.
17. Проверить stock.
    Expected: reservations consumed, sale stock movements созданы.
18. Проверить shift summary.
    Expected: cash входит в expected cash, card_transfer не входит.
19. Закрыть shift.
    Expected: variance рассчитана сервером, shift closed.
20. Проверить operational day.
    Expected: totals пересчитаны, day completed если нет открытых смен.
21. Проверить automatic finance income.
    Expected: один `income` transaction с source `order`.
22. Создать expense.
    Expected: expense создан, крупный расход уходит в pending approval при настройке порога.
23. Рассчитать financial period.
    Expected: revenue, COGS, operating expenses и net profit рассчитаны.
24. Submit.
    Expected: financial period status `submitted`.
25. Approve platform owner.
    Expected: period `locked`, создан platform share accrual.
26. Проверить share accrual.
    Expected: accrued amount = max(net profit, 0) × percentage / 100.
27. Report payment.
    Expected: platform share payment `reported_sent`.
28. Confirm receipt.
    Expected: payment `confirmed`, accrual paid/outstanding обновлены.
29. Проверить Telegram outbox.
    Expected: outbox rows claimed once, sent/cancelled/failed статусы корректны.
30. Проверить audit.
    Expected: ключевые действия есть в audit logs без лишнего доступа employee.
