# Organization Catalog

The organization catalog lets an `organization_admin` configure business structure without code changes.

## Model

Tables:

- `catalog_categories`: optional grouping for products, services, and places.
- `places`: service locations such as tables, VIP rooms, PlayStation zones, billiard, racing rigs, and custom `other` types.
- `products`: sale items with price and basic stock quantity.
- `services`: fixed-price and hourly services.

Products and stock use one product card in this stage. A separate stock movement ledger will be added later.

## Places

A place can be timed or not.

Timed places require:

- `hourly_rate`
- `minimum_minutes`
- `billing_step_minutes`

Non-timed places may keep those fields empty.

For custom place types, use `type = other` and fill `custom_type_name`.

## Products Vs Services

Product:

- sold as a catalog item;
- has sale price;
- may have purchase price;
- may track stock quantity.

Service:

- can be fixed-price;
- can be hourly;
- does not track stock.

Combos are intentionally not implemented yet. They should be built after products and services are stable.

## RLS

Organization admins can select, insert, and update catalog records only inside their active organization.

Platform owners keep global support access.

Employees must not read sensitive product fields such as:

- `purchase_price`
- `stock_quantity`
- `minimum_stock_quantity`
- `created_by`

For employee-facing reads, use safe views:

- `employee_categories`
- `employee_places`
- `employee_products`
- `employee_services`

The frontend already includes future employee hooks for these views, but the employee workspace is not implemented in this stage.

## Archive Logic

Frontend does not physically delete catalog records.

Archive sets:

```text
status = archived
archived_at = now()
```

Restore clears `archived_at`.

Status changes use RPC:

- `set_category_status`
- `set_place_status`
- `set_product_status`
- `set_service_status`

## Storage

Bucket:

```text
organization-assets
```

Paths:

```text
organizations/{organization_id}/categories/{category_id}/main.webp
organizations/{organization_id}/places/{place_id}/main.webp
organizations/{organization_id}/products/{product_id}/main.webp
organizations/{organization_id}/services/{service_id}/main.webp
```

Images are compressed in the browser before upload:

- source limit: 5 MB;
- max side: 1200 px;
- output: WebP;
- quality: about 0.8.

PostgreSQL stores only the image path. It does not store base64 image data.

## Manual Test Steps

1. Apply `202607230004_organization_catalog.sql`.
2. Sign in as `organization_admin`.
3. Create a product category.
4. Create a place category.
5. Create a table without timer.
6. Create a timed zone with hourly rate, minimum minutes, and billing step.
7. Create a product with sale price and stock quantity.
8. Create a fixed service.
9. Create an hourly service.
10. Archive and restore each item type.
11. Sign in as `employee` and verify safe views do not expose purchase price or stock quantity.

## Next Stage

Recommended next modules:

1. Combos.
2. Stock movement ledger.
3. Orders.
4. Timed sessions.
