# Финансы организации и доля Freedom Platform

Модуль добавлен поверх готовых заказов, смен и склада. Старые миграции не меняются: вся новая схема лежит в `202607230008_finance_and_platform_share.sql`.

## Что добавлено

- Финансовые категории организации.
- Финансовые операции: доходы, расходы, закупки, начисление доли платформы, платежи платформе.
- Настройки финансов организации.
- Регулярные расходы и генерация операций по расписанию.
- Финансовые периоды, которыми самостоятельно управляет владелец организации.
- История ставок доли Freedom Platform по организациям.
- Начисления и подтверждение оплат доли платформы.
- Финансовый audit log.

## Автоматизация

- При `complete_order_payment` создаётся доход `income` с источником `order`.
- Повторный доход по одному заказу невозможен из-за partial unique index.
- Заказы со статусом `payment_refused` не попадают в финансы.
- При `post_stock_document` для документа типа `purchase` создаётся оплаченная операция `purchase`.
- В пользовательской модели прибыли закупка целиком относится на расход периода закупки.
- Snapshot-себестоимость заказов сохраняется для внутренней аналитики, но не вычитается из прибыли повторно.

## P&L и cash flow

P&L считается по начислению:

- revenue: оплаченные доходы;
- goods purchases: сумма проведённых закупок товаров; в совместимых API хранится в поле `cogs`;
- operating expenses: подтверждённые расходы, влияющие на прибыль;
- net profit before platform share;
- platform share amount.

Cash flow считается по датам оплаты:

- cash inflow: paid income;
- cash outflow: paid expense, purchase, platform share payment.

## Роли и доступ

- `employee`: доступа к финансовым таблицам нет.
- `organization_admin`: видит и ведёт финансы своей организации, открывает и закрывает периоды, сообщает об оплате платформы.
- `platform_owner`: видит финансы организаций и фактически внесённые оплаты, но не одобряет финансовые периоды.

Большинство критичных записей защищены guard-триггером и меняются только через RPC.

## Основные RPC

- `create_manual_income`
- `create_expense`
- `approve_expense`
- `generate_due_recurring_expenses`
- `calculate_financial_period`
- `close_financial_period`
- `reopen_financial_period`
- `set_platform_share_rate`
- `report_platform_share_payment`
- `confirm_platform_share_payment`

## Маршруты

Admin:

- `/admin/finance`
- `/admin/finance/income`
- `/admin/finance/expenses`
- `/admin/finance/recurring`
- `/admin/finance/purchases`
- `/admin/finance/cash-flow`
- `/admin/finance/profit-loss`
- `/admin/finance/periods`
- `/admin/finance/periods/:periodId`
- `/admin/finance/platform-share`
- `/admin/finance/settings`

Platform:

- `/platform/finance`
- `/platform/finance/organizations/:organizationId`
- `/platform/finance/payments`

## Что проверить после применения SQL

1. Выполнить миграцию `202607230008_finance_and_platform_share.sql`.
2. Открыть `/admin/finance` под `organization_admin`.
3. Оплатить тестовый заказ и проверить появление дохода.
4. Провести складской документ `purchase` и проверить появление закупки.
5. Закрыть финансовый период и проверить статус `locked` и запись в журнале.
6. Снова открыть период, проверить статус `open`, затем повторно закрыть его.
7. Под `organization_admin` сообщить об оплате доли.
8. Под `platform_owner` подтвердить платёж.
