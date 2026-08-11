# Backup And Export Plan

Полный backup-модуль пока не реализуется. Для следующего этапа нужен ZIP export организации с JSON/CSV файлами по таблицам.

Состав export:

- organization;
- profiles and memberships;
- shifts;
- operational days;
- handovers;
- orders;
- order_items;
- timed sessions;
- payments;
- products;
- services;
- combos;
- stock_documents;
- stock_movements;
- finance_transactions;
- financial_periods;
- platform_share accruals and payments;
- audit_logs.

Файлы из Storage не включать в ZIP. В export сохранять только storage paths/URLs.

Будущий API plan:

- `request_organization_export(organization_id)` создаёт задачу export.
- Edge Function с service role читает tenant data по allowlist таблиц.
- Export записывается в private storage bucket.
- Platform owner видит все exports, organization admin только exports своей организации.
- Ссылки на скачивание должны быть short-lived signed URLs.
- Export должен логироваться в audit log.
