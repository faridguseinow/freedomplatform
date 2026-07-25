# Shifts, Cash And Telegram

This stage adds employee shift responsibility, cash reconciliation, handover, operational day reports, and a Telegram notification outbox.

## Migration

Apply:

```text
supabase/migrations/202607230007_shifts_cash_and_reports.sql
```

Do not edit older migrations.

## Shift Templates

Admins configure shifts in `/admin/shift-templates`.

Examples for The Liga:

- First shift: `10:00-18:00`
- Second shift: `18:00-02:00`, `crosses_midnight = true`

These are intentionally not seeded by migration.

## Business Date

`business_date` is calculated server-side from the organization timezone.

Early morning time before `06:00` belongs to the previous business date. This keeps a shift from `18:00` to `02:00` on the start date.

## Opening Shift

Employee opens a shift manually in `/employee/shift`.

The system:

- checks active employee membership;
- blocks duplicate open shifts;
- creates or reuses the operational day;
- calculates scheduled start/end from the template;
- accepts pending handover when available;
- writes audit;
- creates `shift_opened` notification outbox row.

The shift is not opened on page refresh.

## Workspace Guard

`/employee/workspace` is blocked without an open shift.

Even if the UI is bypassed, server triggers require an open employee shift for order, payment, timed session, and adjustment operations.

Admins can work in admin/support mode without an employee shift. Their operations are audited without a shift id.

## Cash Responsibility

Expected cash:

```text
opening_cash_amount + completed cash payments
```

Card transfers are not included in expected cash.

On close, the server calculates:

- cash sales;
- card transfer sales;
- paid total;
- unpaid total;
- payment refused total;
- completed orders count;
- active/open orders;
- active sessions;
- expected cash;
- actual cash;
- variance.

Variance status:

- `balanced`
- `shortage`
- `overage`

Comment is required when variance is not zero.

## Handover

Closing a shift does not close open orders or active sessions.

If open orders or active sessions exist, the system creates:

- `shift_handovers`
- `shift_handover_orders`

The next employee opening a shift accepts pending handover automatically.

## Operational Day

Operational days aggregate all shifts for a business date:

- total revenue;
- cash revenue;
- card transfer revenue;
- unpaid total;
- payment refused total;
- orders counters.

When no open shift remains, the day is marked completed and a `daily_summary` notification is created.

## Telegram Outbox

Tables:

- `organization_notification_settings`
- `notification_outbox`

The database stores only:

- Telegram enabled flag;
- Telegram chat ID;
- notification preferences.

The Telegram bot token must be configured only as an Edge Function secret:

```text
TELEGRAM_BOT_TOKEN
```

## Edge Function

Function:

```text
supabase/functions/process-notification-outbox
```

Required secrets:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
TELEGRAM_BOT_TOKEN
```

Deploy:

```bash
supabase functions deploy process-notification-outbox
supabase secrets set TELEGRAM_BOT_TOKEN=...
```

Manual run:

```bash
curl -X POST https://PROJECT_REF.functions.supabase.co/process-notification-outbox
```

Recommended Supabase Cron interval:

```text
every 5-15 minutes
```

The processor:

- claims pending rows;
- respects organization notification settings;
- sends Telegram messages;
- marks sent;
- retries with backoff;
- avoids duplicate sends through deduplication keys.

## Admin Routes

- `/admin/shifts`
- `/admin/shifts/:shiftId`
- `/admin/shift-templates`
- `/admin/operational-days`
- `/admin/notification-settings`

## Employee Routes

- `/employee/shift`
- `/employee/workspace`

## Manual Checks

1. Apply migration `202607230007_shifts_cash_and_reports.sql`.
2. Create first shift template `10:00-18:00`.
3. Create second shift template `18:00-02:00` with `crosses_midnight`.
4. Sign in as employee.
5. Open `/employee/shift`.
6. Open shift with opening cash.
7. Open `/employee/workspace`.
8. Create and pay a cash order.
9. Create and pay a card transfer order.
10. Confirm expected cash includes only opening cash plus cash payments.
11. Close shift with exact cash.
12. Open another shift and close with shortage plus comment.
13. Leave an order/session open and close shift.
14. Open next employee shift and confirm handover accepted.
15. Review `/admin/shifts`.
16. Review `/admin/operational-days`.
17. Configure Telegram chat ID in `/admin/notification-settings`.
18. Set Edge Function secret `TELEGRAM_BOT_TOKEN`.
19. Deploy and manually run `process-notification-outbox`.
20. Confirm outbox rows are marked `sent` or retried without duplicates.

## Current Limitations

- No expenses or withdrawals yet.
- No salary/payroll.
- No fiscal receipts.
- No monthly close.
- No Freedom Platform revenue share.
- Telegram messages are operational summaries, not accounting reports.
