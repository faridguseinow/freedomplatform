# Inventory And Combos

This stage replaces direct product stock editing with a stock movement ledger and adds fixed combos.

## Migration

Apply:

```text
supabase/migrations/202607230005_inventory_and_combos.sql
```

The migration creates:

- `stock_documents`
- `stock_document_items`
- `stock_movements`
- `combos`
- `combo_components`

It also adds `products.average_purchase_cost`.

Existing `products.stock_quantity > 0` rows are migrated into posted opening balance documents. The product cache remains in `products.stock_quantity`, but it is recalculated from `stock_movements`.

## Inventory Rules

Admins create draft stock documents, add items, then post them.

Supported document movement types:

- `opening_balance`
- `purchase`
- `write_off`
- `adjustment_in`
- `adjustment_out`
- sale, return, reservation, release, and transfer types for later order modules

Posted documents create immutable `stock_movements`.

Cancellation does not delete movements. It creates reversal movements and marks the document as `cancelled`.

Product stock cannot be changed directly from normal frontend updates. Use RPC:

- `create_opening_stock_document`
- `post_stock_document`
- `cancel_stock_document`
- `reconcile_product_stock`

## Frontend

Admin routes:

- `/admin/inventory` - stock balances and quick document creation.
- `/admin/inventory/documents` - stock document list, posting, cancellation.
- `/admin/inventory/products/:productId` - product movement history.
- `/admin/combos` - combo creation and status management.

Product page behavior:

- New product initial stock creates an opening balance document.
- Existing product stock is read-only on the product form.
- Stock changes are made through inventory documents.

## Combos

`combos` stores the sellable bundle.

`combo_components` stores products and services included in the bundle.

Current frontend supports `selection_mode = fixed`.

The SQL model also includes component metadata for future `choice` combos.

Availability is calculated by:

- product stock for tracked products;
- unlimited availability for services and non-stock products;
- minimum available quantity across required stock components.

Views:

- `combo_availability`
- `employee_combos`

`employee_combos` exposes safe sales data and does not expose purchase costs or internal stock movement details.

## RLS

Organization admins can manage records only inside their active organization.

Employees can read only safe employee-facing combo view data.

Platform owners keep support access.

Stock movements are append-only through trusted RPC functions.

## Manual Test Flow

1. Apply migration `202607230005_inventory_and_combos.sql`.
2. Sign in as `organization_admin`.
3. Open `/admin/products`.
4. Create a stock-tracked product with initial stock.
5. Confirm `/admin/inventory` shows the stock balance.
6. Create and post a purchase document.
7. Confirm product stock increased.
8. Cancel the posted document and confirm reversal movements were created.
9. Open `/admin/combos`.
10. Create a fixed combo from one product and one service.
11. Confirm combo availability changes when stock changes.

## Current Limitations

- No order checkout yet.
- No automatic sale/reservation movements yet.
- Combo editing currently updates the combo card; component replacement can be extended after order constraints are added.
- `choice` combo UI is intentionally left for a later step.
