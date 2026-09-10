-- The original inventory bootstrap must never create a second balance source
-- for a product that already has movement history.
create unique index if not exists stock_movements_migration_opening_balance_once_idx
on public.stock_movements (product_id)
where reference_type = 'migration_202607230005';
