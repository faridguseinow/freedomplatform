# Orders, Sessions And Payments

This stage adds the sales core for Freedom Platform.

## Migration

Apply:

```text
supabase/migrations/202607230006_orders_sessions_and_payments.sql
```

The migration creates orders, order items, timed sessions, stock reservations, payments, adjustment requests, place move history, audit logs, safe employee views, and RPC functions.

## Order Lifecycle

Statuses:

- `open`
- `waiting_payment`
- `paid`
- `unpaid`
- `payment_refused`
- `cancelled`

An order can be created:

- without a place;
- on a normal table/place;
- automatically when a timed session starts.

Frontend does not send totals or prices. RPC functions snapshot catalog prices and recalculate totals on the server.

## Order Items

Supported item types:

- `product`
- `service`
- `combo`
- `timed_session`
- `manual_item` for future use

Snapshots are stored at sale time:

- name;
- description;
- image path;
- unit price;
- cost snapshot for admin reporting;
- combo component composition.

Later catalog changes do not change historical order records.

## Reservations

`stock_reservations` is not a stock movement.

Available stock is:

```text
ledger stock - active reservations
```

Products and fixed combos reserve stock while the order is open.

Reservations become real `stock_movements` only when:

- payment is completed;
- payment is refused, because the product was physically issued.

Reservation race protection uses product row locking before checking available stock.

## Stock Sale Movements

Payment and refusal consume active reservations and create `stock_movements` with:

```text
movement_type = sale
quantity_delta < 0
reference_type = order
reference_id = order_item_id
```

After each sale movement, `reconcile_product_stock` updates product stock cache.

## Timed Sessions

The frontend does not write elapsed seconds to the database.

Stored server fields:

- `started_at`
- `ended_at`
- `actual_minutes`
- `billable_minutes`
- `calculated_amount`

Formula:

```text
grace_minutes = 10

if actual_minutes <= minimum_minutes + grace_minutes:
  billable_minutes = minimum_minutes
else:
  billable_minutes =
    minimum_minutes +
    ceil((actual_minutes - minimum_minutes - grace_minutes) / billing_step_minutes)
    * billing_step_minutes
```

Amount:

```text
hourly_rate * billable_minutes / 60
```

For The Liga this supports:

- minimum 60 minutes;
- 10 grace minutes after each billing boundary;
- after the grace period, round up by 30 minutes.

## Places

A place can have:

- no order;
- one active open/waiting payment order;
- one active timed session.

An active timed session cannot be moved. After completion, the order can be moved to another place by `move_open_order_to_place`.

Move history is stored in `order_place_history`.

## Adjustments

Employees do not directly remove items or change quantities.

They create `order_adjustment_requests`.

Admins review through:

```text
review_order_adjustment
```

Approved item removal:

- marks item as `removed`;
- releases active reservations;
- recalculates totals;
- writes audit log.

Approved quantity change:

- checks stock if quantity increases;
- updates reservation;
- recalculates totals.

## Payments

Methods:

- `cash`
- `card_transfer`

For MVP, one completed payment per order is allowed.

`complete_order_payment`:

- rejects active timed sessions;
- rejects pending adjustment requests;
- creates completed payment;
- consumes reservations;
- creates sale movements;
- marks order as `paid`;
- closes the order.

## Payment Refused

`mark_order_payment_refused` requires a comment.

It:

- sets `payment_refused`;
- keeps `paid_amount = 0`;
- sets `unpaid_amount = total_amount`;
- consumes reservations;
- creates sale movements;
- closes and releases the order place.

Refused orders are not paid revenue, but stock is still written off because the items were issued.

## RLS And Safe Data

Tables are protected by RLS and direct write guards.

Critical writes go through RPC only.

Employee-facing views:

- `employee_workspace_places`
- `employee_orders`
- `employee_order_items`
- `employee_timed_sessions`

Employees do not see:

- purchase prices;
- average costs;
- cost snapshots;
- audit logs.

Admins can read order details, cost snapshots, reservations, payments, and adjustment requests in their organization.

## Audit

`audit_logs` records significant events:

- order created;
- item added;
- adjustment requested;
- adjustment approved/rejected;
- session started;
- session completed;
- payment completed;
- payment refused;
- order moved.

Page views are not logged.

## Frontend Routes

Employee:

- `/employee/workspace`
- `/employee/shift` remains placeholder

Admin:

- `/admin/orders`
- `/admin/orders/:orderId`
- `/admin/adjustment-requests`

## Manual Checks

1. Apply migration `202607230006_orders_sessions_and_payments.sql`.
2. Sign in as employee.
3. Open `/employee/workspace`.
4. Create an order without place.
5. Open a normal table order.
6. Start a timed session on a timed place.
7. Add a product.
8. Add a fixed service.
9. Add a fixed combo.
10. Confirm active reservations exist in admin order detail.
11. Complete the timed session.
12. Set order waiting payment.
13. Complete cash payment.
14. Complete another order with `card_transfer`.
15. Confirm `stock_movements` contain `sale` rows.
16. Create a new order and mark payment refused.
17. Confirm refused order has unpaid amount and no completed payment.
18. Confirm refused order still consumed stock reservations.
19. Create an item removal request as employee.
20. Approve it from `/admin/adjustment-requests`.

## Current Limitations

- No cash shifts yet.
- No Telegram notifications yet.
- No fiscal receipts.
- No booking calendar.
- No loyalty module.
- `choice` combos are still future work.
- Employee order detail route is not split out yet; the drawer in workspace is the working POS surface.
