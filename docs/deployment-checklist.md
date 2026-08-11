# Deployment Checklist

1. Применить миграции `202607230006`, `202607230007`, `202607230008`, `202607230009`.
2. Проверить схему через Supabase SQL editor или `supabase db lint`.
3. Создать `platform_owner` в Supabase Auth и `platform_user_roles`.
4. Создать организацию The Liga.
5. Назначить organization admin.
6. Создать employee.
7. Настроить places.
8. Настроить shift templates.
9. Настроить finance categories и platform share rate.
10. Настроить Telegram notification settings.
11. Deploy Edge Function `process-notification-outbox`.
12. Установить Edge Function secrets.
13. Настроить Cron/outbox processor.
14. Заполнить frontend env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
15. Выполнить production build: `npm run build`.
16. Развернуть frontend на Vercel.
17. Добавить Vercel URL в Supabase Auth redirect URLs.
18. Выполнить smoke tests из `docs/the-liga-smoke-test.md`.
19. Подготовить rollback plan: предыдущий frontend deployment и SQL backup/export.
20. Сделать backup/export перед крупной миграцией.
