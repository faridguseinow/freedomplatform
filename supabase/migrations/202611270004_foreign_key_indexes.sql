-- Performance: index foreign keys used in joins and ON DELETE checks
-- (advisor lint 0001). Audit-only *_by columns are intentionally skipped:
-- nothing filters by them and every extra index slows down writes.
create index if not exists orders_place_id_idx on public.orders (place_id);
create index if not exists order_items_timed_session_id_idx on public.order_items (timed_session_id);
create index if not exists timed_sessions_place_id_idx on public.timed_sessions (place_id);
create index if not exists timed_sessions_service_id_idx on public.timed_sessions (service_id);
create index if not exists order_place_history_from_place_id_idx on public.order_place_history (from_place_id);
create index if not exists order_place_history_to_place_id_idx on public.order_place_history (to_place_id);
create index if not exists order_adjustment_requests_order_item_id_idx on public.order_adjustment_requests (order_item_id);
create index if not exists order_combo_components_product_id_idx on public.order_combo_components (product_id);
create index if not exists order_combo_components_service_id_idx on public.order_combo_components (service_id);
create index if not exists order_item_payment_allocations_organization_id_idx on public.order_item_payment_allocations (organization_id);
create index if not exists customer_debt_payments_organization_id_idx on public.customer_debt_payments (organization_id);
create index if not exists customer_debt_payments_shift_id_idx on public.customer_debt_payments (shift_id);
create index if not exists shift_handover_orders_active_session_id_idx on public.shift_handover_orders (active_session_id);
create index if not exists stock_movements_document_item_id_idx on public.stock_movements (document_item_id);
create index if not exists recurring_expenses_category_id_idx on public.recurring_expenses (category_id);

-- Redundant: the leading column is already covered by another index.
drop index if exists public.organization_memberships_organization_id_idx; -- unique (organization_id, user_id)
drop index if exists public.operational_days_organization_id_idx;        -- unique (organization_id, business_date)
drop index if exists public.services_organization_id_idx;                -- services_organization_status_idx
