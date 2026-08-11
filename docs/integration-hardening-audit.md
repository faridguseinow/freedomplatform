# Integration Hardening Audit

Цель этапа: не добавлять новый бизнес-модуль, а подготовить существующую систему к первому рабочему запуску The Liga.

## Проверено

- Порядок миграций 006, 007, 008 и функции, переопределённые поздними миграциями.
- Финальная `complete_order_payment`: сохраняет оплату, списание склада, закрытие заказа, shift context, finance income и audit.
- Финальная `post_stock_document`: сохраняет ledger movements, reconciliation и finance purchase.
- Shift context triggers для orders, payments, timed sessions и adjustment requests.
- Finance formulas: revenue, COGS по snapshots, cash flow, platform share.
- RLS по finance/stock/audit/employee views.
- Notification outbox worker flow.
- Frontend route bundles и env handling.

## Исправлено в migration 009

- Добавлен atomic `claim_notification_outbox` через `FOR UPDATE SKIP LOCKED`.
- Добавлен `finish_notification_outbox_item` для sent/cancelled/failed workflow.
- Добавлен `get_organization_readiness`.
- Усилен submit financial period: locked period проверяется до upsert.
- Добавлен locked-period trigger.
- Добавлены idempotency indexes для platform share finance transactions и share rates.
- Employee safe views пересозданы с `security_invoker = true`.
- `combo_availability` скрывает точный stock для не-admin пользователей.

## Остаточные риски

- Полный SQL integration test требует локальную Supabase DB и тестовые Auth users.
- Старые CRUD-формы ещё используют локальные error messages; общий mapper добавлен и должен постепенно подключаться ко всем API.
- The Liga seed template требует ручной замены UUID перед запуском.
