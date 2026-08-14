// TODO: Replace these manual types with generated Supabase types after the schema stabilizes.
export type AppRole = 'platform_owner' | 'organization_admin' | 'employee'

export type OrganizationStatus = 'active' | 'suspended' | 'archived'

export type CatalogItemStatus = 'active' | 'inactive' | 'archived'

export type PlaceType =
  | 'table'
  | 'vip_room'
  | 'playstation'
  | 'billiard'
  | 'racing'
  | 'private_room'
  | 'service_area'
  | 'other'

export type ServicePricingType = 'fixed' | 'hourly'

export type CatalogCategoryType = 'product' | 'service' | 'place'

export type StockMovementType =
  | 'opening_balance'
  | 'purchase'
  | 'sale'
  | 'return_in'
  | 'return_out'
  | 'write_off'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'combo_reservation'
  | 'combo_release'
  | 'order_reservation'
  | 'order_release'
  | 'transfer_in'
  | 'transfer_out'

export type StockDocumentStatus = 'draft' | 'posted' | 'cancelled'

export type ComboStatus = 'active' | 'inactive' | 'archived'

export type ComboComponentType = 'product' | 'service'

export type ComboSelectionMode = 'fixed' | 'choice'

export type OrderStatus =
  | 'open'
  | 'waiting_payment'
  | 'paid'
  | 'unpaid'
  | 'payment_refused'
  | 'cancelled'

export type OrderItemType = 'product' | 'service' | 'combo' | 'timed_session' | 'manual_item'

export type OrderItemStatus = 'active' | 'removal_requested' | 'removed' | 'cancelled'

export type TimedSessionStatus = 'active' | 'completed' | 'cancelled'

export type PaymentMethod = 'cash' | 'card_transfer'

export type PaymentStatus = 'pending' | 'completed' | 'cancelled' | 'refunded'

export type AdjustmentRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled'

export type AdjustmentRequestType =
  | 'remove_order_item'
  | 'change_quantity'
  | 'cancel_order'
  | 'change_payment_method'
  | 'correct_session_time'
  | 'other'

export type StockReservationStatus = 'active' | 'released' | 'consumed' | 'cancelled'

export type ShiftStatus = 'open' | 'closing' | 'closed' | 'force_closed'

export type ShiftHandoverStatus = 'pending' | 'accepted' | 'completed' | 'cancelled'

export type CashVarianceStatus = 'balanced' | 'shortage' | 'overage'

export type NotificationOutboxStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled'

export type NotificationType =
  | 'shift_opened'
  | 'shift_closed'
  | 'shift_not_closed'
  | 'daily_summary'
  | 'cash_shortage'
  | 'cash_overage'
  | 'payment_refused'
  | 'adjustment_requested'
  | 'adjustment_reviewed'
  | 'low_stock'
  | 'custom'

export type OperationalDayStatus = 'open' | 'waiting_final_shift' | 'completed' | 'corrected'

export type FinanceTransactionType =
  | 'income'
  | 'expense'
  | 'purchase'
  | 'platform_share_accrual'
  | 'platform_share_payment'
  | 'adjustment'

export type FinanceTransactionStatus = 'planned' | 'pending' | 'paid' | 'partial' | 'cancelled'

export type FinancePaymentMethod = 'cash' | 'card_transfer' | 'bank_transfer' | 'other'

export type FinanceSourceType =
  | 'order'
  | 'manual'
  | 'stock_document'
  | 'recurring_expense'
  | 'platform_share'
  | 'adjustment'

export type FinancialPeriodStatus =
  | 'open'
  | 'submitted'
  | 'clarification_requested'
  | 'approved'
  | 'locked'
  | 'rejected'

export type PlatformShareStatus =
  | 'accumulating'
  | 'pending_approval'
  | 'approved'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'disputed'

export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export type ExpenseApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected'

export type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  avatar_path: string | null
  preferred_locale: 'ru' | 'az' | 'en'
  is_active: boolean
  created_at: string
  updated_at: string
}

export type OrganizationRow = {
  id: string
  name: string
  slug: string
  description: string | null
  logo_path: string | null
  status: OrganizationStatus
  default_locale: 'ru' | 'az' | 'en'
  timezone: string
  currency_code: string
  created_by: string
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type PlatformUserRoleRow = {
  user_id: string
  role: Extract<AppRole, 'platform_owner'>
  created_by: string | null
  created_at: string
}

export type OrganizationMembershipRow = {
  id: string
  organization_id: string
  user_id: string
  role: Extract<AppRole, 'organization_admin' | 'employee'>
  is_active: boolean
  job_title: string | null
  phone: string | null
  notes: string | null
  sort_order: number
  deactivated_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type OrganizationMembershipWithProfile = OrganizationMembershipRow & {
  profile: Pick<
    ProfileRow,
    'id' | 'email' | 'full_name' | 'avatar_path' | 'preferred_locale' | 'is_active'
  > | null
}

export type EmployeeLockPinRow = {
  membership_id: string
  pin_hash: string | null
  pin_set_at: string | null
  pin_updated_by: string | null
  pending_pin_hash: string | null
  pending_pin_change_requested_at: string | null
  pending_pin_change_requested_by: string | null
  created_at: string
  updated_at: string
}

export type EmployeeLockStateRow = {
  membership_id: string
  has_pin: boolean
  pin_set_at: string | null
  has_pending_pin_change: boolean
  pending_pin_change_requested_at: string | null
}

export type CatalogCategoryRow = {
  id: string
  organization_id: string
  type: CatalogCategoryType
  name: string
  description: string | null
  image_path: string | null
  sort_order: number
  status: CatalogItemStatus
  created_by: string
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type PlaceRow = {
  id: string
  organization_id: string
  category_id: string | null
  name: string
  type: PlaceType
  custom_type_name: string | null
  description: string | null
  image_path: string | null
  has_timer: boolean
  hourly_rate: number | null
  minimum_minutes: number | null
  billing_step_minutes: number | null
  capacity: number | null
  sort_order: number
  workspace_x: number | null
  workspace_y: number | null
  workspace_w: number | null
  workspace_h: number | null
  status: CatalogItemStatus
  created_by: string
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type ProductRow = {
  id: string
  organization_id: string
  category_id: string | null
  sku: string | null
  name: string
  description: string | null
  characteristics: string | null
  image_path: string | null
  sale_price: number
  purchase_price: number | null
  stock_quantity: number
  minimum_stock_quantity: number
  average_purchase_cost: number
  unit_name: string
  track_stock: boolean
  sort_order: number
  status: CatalogItemStatus
  created_by: string
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type ServiceRow = {
  id: string
  organization_id: string
  category_id: string | null
  name: string
  description: string | null
  characteristics: string | null
  image_path: string | null
  pricing_type: ServicePricingType
  fixed_price: number | null
  hourly_rate: number | null
  minimum_minutes: number | null
  billing_step_minutes: number | null
  sort_order: number
  status: CatalogItemStatus
  created_by: string
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type EmployeeCategoryRow = Pick<
  CatalogCategoryRow,
  'id' | 'organization_id' | 'type' | 'name' | 'description' | 'image_path' | 'sort_order' | 'status'
>

export type EmployeePlaceRow = Pick<
  PlaceRow,
  | 'id'
  | 'organization_id'
  | 'category_id'
  | 'name'
  | 'type'
  | 'custom_type_name'
  | 'description'
  | 'image_path'
  | 'has_timer'
  | 'hourly_rate'
  | 'minimum_minutes'
  | 'billing_step_minutes'
  | 'capacity'
  | 'sort_order'
  | 'workspace_x'
  | 'workspace_y'
  | 'workspace_w'
  | 'workspace_h'
  | 'status'
>

export type EmployeeProductRow = Pick<
  ProductRow,
  | 'id'
  | 'organization_id'
  | 'category_id'
  | 'sku'
  | 'name'
  | 'description'
  | 'characteristics'
  | 'image_path'
  | 'sale_price'
  | 'unit_name'
  | 'sort_order'
  | 'status'
>

export type EmployeeServiceRow = Pick<
  ServiceRow,
  | 'id'
  | 'organization_id'
  | 'category_id'
  | 'name'
  | 'description'
  | 'characteristics'
  | 'image_path'
  | 'pricing_type'
  | 'fixed_price'
  | 'hourly_rate'
  | 'minimum_minutes'
  | 'billing_step_minutes'
  | 'sort_order'
  | 'status'
>

export type StockDocumentRow = {
  id: string
  organization_id: string
  document_number: number
  type: StockMovementType
  status: StockDocumentStatus
  document_date: string
  supplier_name: string | null
  reference: string | null
  comment: string | null
  total_amount: number | null
  created_by: string
  posted_by: string | null
  posted_at: string | null
  cancelled_by: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
}

export type StockDocumentItemRow = {
  id: string
  organization_id: string
  document_id: string
  product_id: string
  quantity: number
  unit_cost: number | null
  line_total: number | null
  comment: string | null
  created_at: string
}

export type StockMovementRow = {
  id: string
  organization_id: string
  product_id: string
  document_id: string | null
  document_item_id: string | null
  movement_type: StockMovementType
  quantity_delta: number
  unit_cost: number | null
  total_cost: number | null
  reference_type: string | null
  reference_id: string | null
  comment: string | null
  created_by: string
  created_at: string
}

export type ProductStockBalanceRow = {
  organization_id: string
  product_id: string
  calculated_quantity: number
  cached_quantity: number
  variance: number
}

export type ComboRow = {
  id: string
  organization_id: string
  category_id: string | null
  name: string
  description: string | null
  image_path: string | null
  sale_price: number
  selection_mode: ComboSelectionMode
  sort_order: number
  status: ComboStatus
  created_by: string
  created_at: string
  updated_at: string
  archived_at: string | null
}

export type ComboComponentRow = {
  id: string
  organization_id: string
  combo_id: string
  component_type: ComboComponentType
  product_id: string | null
  service_id: string | null
  quantity: number
  included_minutes: number | null
  sort_order: number
  is_required: boolean
  created_at: string
}

export type ComboAvailabilityRow = {
  combo_id: string
  organization_id: string
  is_available: boolean
  available_quantity: number | null
  missing_components: unknown
}

export type EmployeeComboRow = Pick<
  ComboRow,
  'id' | 'organization_id' | 'category_id' | 'name' | 'description' | 'image_path' | 'sale_price'
> & {
  available_quantity: number | null
  component_preview: unknown
}

export type OrderRow = {
  id: string
  organization_id: string
  order_number: number
  place_id: string | null
  current_place_name_snapshot: string | null
  status: OrderStatus
  customer_label: string | null
  comment: string | null
  subtotal: number
  total_amount: number
  paid_amount: number
  unpaid_amount: number
  opened_by: string
  closed_by: string | null
  opened_at: string
  closed_at: string | null
  payment_refusal_comment: string | null
  opened_shift_id: string | null
  closed_shift_id: string | null
  created_at: string
  updated_at: string
}

export type OrderItemRow = {
  id: string
  organization_id: string
  order_id: string
  item_type: OrderItemType
  status: OrderItemStatus
  product_id: string | null
  service_id: string | null
  combo_id: string | null
  timed_session_id: string | null
  name_snapshot: string
  description_snapshot: string | null
  image_path_snapshot: string | null
  quantity: number
  unit_price: number
  total_price: number
  unit_cost_snapshot: number | null
  total_cost_snapshot: number | null
  metadata: unknown
  added_by: string
  added_at: string
  removed_by: string | null
  removed_at: string | null
  removal_reason: string | null
  created_at: string
  updated_at: string
}

export type EmployeeOrderItemRow = Omit<
  OrderItemRow,
  'unit_cost_snapshot' | 'total_cost_snapshot' | 'removed_by'
>

export type OrderComboComponentRow = {
  id: string
  organization_id: string
  order_item_id: string
  component_type: ComboComponentType
  product_id: string | null
  service_id: string | null
  name_snapshot: string
  quantity: number
  unit_price_snapshot: number | null
  unit_cost_snapshot: number | null
  included_minutes: number | null
  created_at: string
}

export type TimedSessionRow = {
  id: string
  organization_id: string
  order_id: string
  place_id: string
  service_id: string | null
  status: TimedSessionStatus
  place_name_snapshot: string
  service_name_snapshot: string | null
  hourly_rate_snapshot: number
  minimum_minutes_snapshot: number
  billing_step_minutes_snapshot: number
  started_at: string
  ended_at: string | null
  actual_minutes: number | null
  billable_minutes: number | null
  calculated_amount: number | null
  started_by: string
  ended_by: string | null
  cancellation_reason: string | null
  started_shift_id: string | null
  ended_shift_id: string | null
  created_at: string
  updated_at: string
}

export type StockReservationRow = {
  id: string
  organization_id: string
  order_id: string
  order_item_id: string
  product_id: string
  quantity: number
  status: StockReservationStatus
  created_by: string
  created_at: string
  released_at: string | null
  consumed_at: string | null
}

export type OrderPlaceHistoryRow = {
  id: string
  organization_id: string
  order_id: string
  from_place_id: string | null
  to_place_id: string | null
  from_place_name_snapshot: string | null
  to_place_name_snapshot: string | null
  moved_by: string
  moved_at: string
  comment: string | null
}

export type OrderAdjustmentRequestRow = {
  id: string
  organization_id: string
  order_id: string
  order_item_id: string | null
  request_type: AdjustmentRequestType
  status: AdjustmentRequestStatus
  requested_quantity: number | null
  reason: string
  shift_id: string | null
  requested_by: string
  requested_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_comment: string | null
  expires_at: string | null
  created_at: string
}

export type PaymentRow = {
  id: string
  organization_id: string
  order_id: string
  method: PaymentMethod
  status: PaymentStatus
  amount: number
  shift_id: string | null
  received_by: string
  completed_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
}

export type AuditLogRow = {
  id: string
  organization_id: string | null
  actor_user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  metadata: unknown
  shift_id: string | null
  created_at: string
}

export type EmployeeWorkspacePlaceRow = EmployeePlaceRow & {
  active_order_id: string | null
  active_order_number: number | null
  active_order_status: OrderStatus | null
  active_order_total: number | null
  active_session_id: string | null
  active_session_started_at: string | null
  active_session_hourly_rate: number | null
  active_session_minimum_minutes: number | null
  active_session_billing_step_minutes: number | null
  active_order_item_count: number
}

export type EmployeeOrderRow = Omit<OrderRow, 'closed_by'>

export type ShiftTemplateRow = {
  id: string
  organization_id: string
  name: string
  start_time: string
  end_time: string
  crosses_midnight: boolean
  sort_order: number
  is_active: boolean
  expected_duration_minutes: number | null
  late_close_grace_minutes: number
  created_by: string
  created_at: string
  updated_at: string
}

export type OperationalDayRow = {
  id: string
  organization_id: string
  business_date: string
  opened_at: string
  closed_at: string | null
  status: OperationalDayStatus
  total_revenue: number
  cash_revenue: number
  card_transfer_revenue: number
  unpaid_total: number
  payment_refused_total: number
  total_orders: number
  paid_orders: number
  created_at: string
  updated_at: string
}

export type EmployeeShiftRow = {
  id: string
  organization_id: string
  operational_day_id: string
  shift_template_id: string | null
  employee_user_id: string
  status: ShiftStatus
  opened_at: string
  scheduled_start_at: string | null
  scheduled_end_at: string | null
  closed_at: string | null
  opening_cash_amount: number
  expected_cash_amount: number | null
  actual_cash_amount: number | null
  cash_variance: number | null
  cash_variance_status: CashVarianceStatus | null
  cash_variance_comment: string | null
  cash_sales_total: number
  card_transfer_sales_total: number
  paid_orders_total: number
  unpaid_orders_total: number
  payment_refused_total: number
  completed_orders_count: number
  payment_refused_count: number
  opened_orders_count: number
  transferred_orders_count: number
  closing_comment: string | null
  force_closed_by: string | null
  force_close_reason: string | null
  created_at: string
  updated_at: string
}

export type ShiftHandoverRow = {
  id: string
  organization_id: string
  operational_day_id: string
  from_shift_id: string
  to_shift_id: string | null
  status: ShiftHandoverStatus
  opening_orders_count: number
  active_sessions_count: number
  expected_cash_handover: number | null
  actual_cash_handover: number | null
  comment: string | null
  created_by: string
  accepted_by: string | null
  created_at: string
  accepted_at: string | null
  completed_at: string | null
}

export type ShiftHandoverOrderRow = {
  id: string
  organization_id: string
  handover_id: string
  order_id: string
  active_session_id: string | null
  order_total_snapshot: number
  place_name_snapshot: string | null
  created_at: string
}

export type OrganizationNotificationSettingsRow = {
  id: string
  organization_id: string
  telegram_enabled: boolean
  telegram_chat_id: string | null
  notify_shift_opened: boolean
  notify_shift_closed: boolean
  notify_daily_summary: boolean
  notify_cash_variance: boolean
  notify_payment_refused: boolean
  notify_adjustment_requests: boolean
  notify_low_stock: boolean
  created_at: string
  updated_at: string
}

export type NotificationOutboxRow = {
  id: string
  organization_id: string
  type: NotificationType
  status: NotificationOutboxStatus
  entity_type: string | null
  entity_id: string | null
  payload: unknown
  attempt_count: number
  next_attempt_at: string
  processing_started_at: string | null
  sent_at: string | null
  last_error: string | null
  deduplication_key: string | null
  created_at: string
  updated_at: string
}

export type FinanceCategoryRow = {
  id: string
  organization_id: string
  transaction_type: FinanceTransactionType
  name: string
  description: string | null
  system_code: string | null
  affects_profit: boolean
  affects_cash_flow: boolean
  eligible_for_platform_share_deduction: boolean
  sort_order: number
  is_active: boolean
  is_system: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export type OrganizationFinanceSettingsRow = {
  organization_id: string
  large_expense_threshold: number | null
  require_large_expense_approval: boolean
  default_platform_share_percentage: number | null
  reporting_currency_code: string | null
  financial_month_close_day: number | null
  platform_share_payment_due_days: number
  created_at: string
  updated_at: string
}

export type FinanceTransactionRow = {
  id: string
  organization_id: string
  transaction_type: FinanceTransactionType
  category_id: string | null
  source_type: FinanceSourceType
  source_id: string | null
  title: string
  description: string | null
  amount: number
  paid_amount: number
  status: FinanceTransactionStatus
  payment_method: FinancePaymentMethod | null
  accrual_date: string
  paid_date: string | null
  recipient_or_supplier: string | null
  reference: string | null
  document_path: string | null
  affects_profit: boolean
  affects_cash_flow: boolean
  eligible_for_platform_share_deduction: boolean
  expense_approval_status: ExpenseApprovalStatus
  approval_requested_by: string | null
  approved_by: string | null
  approved_at: string | null
  created_by: string
  cancelled_by: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
}

export type RecurringExpenseRow = {
  id: string
  organization_id: string
  category_id: string
  title: string
  amount: number
  frequency: RecurringFrequency
  start_date: string
  next_generation_date: string
  end_date: string | null
  payment_method: FinancePaymentMethod | null
  recipient_or_supplier: string | null
  description: string | null
  affects_profit: boolean
  affects_cash_flow: boolean
  is_active: boolean
  last_generated_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export type FinancialPeriodRow = {
  id: string
  organization_id: string
  period_start: string
  period_end: string
  status: FinancialPeriodStatus
  revenue: number
  cogs: number
  gross_profit: number
  operating_expenses: number
  other_income: number
  net_profit_before_platform_share: number
  platform_share_percentage: number
  platform_share_amount: number
  organization_owner_amount: number
  cash_inflow: number
  cash_outflow: number
  submitted_by: string | null
  submitted_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_comment: string | null
  locked_at: string | null
  created_at: string
  updated_at: string
}

export type OrganizationPlatformShareRateRow = {
  id: string
  organization_id: string
  percentage: number
  effective_from: string
  effective_to: string | null
  created_by: string
  created_at: string
  comment: string | null
}

export type PlatformShareAccrualRow = {
  id: string
  organization_id: string
  financial_period_id: string
  percentage_snapshot: number
  net_profit_snapshot: number
  accrued_amount: number
  paid_amount: number
  outstanding_amount: number
  status: PlatformShareStatus
  due_date: string | null
  approved_at: string | null
  fully_paid_at: string | null
  created_at: string
  updated_at: string
}

export type PlatformSharePaymentRow = {
  id: string
  organization_id: string
  accrual_id: string
  amount: number
  payment_method: FinancePaymentMethod | null
  payment_date: string
  reference: string | null
  document_path: string | null
  marked_sent_by: string | null
  confirmed_received_by: string | null
  marked_sent_at: string | null
  confirmed_received_at: string | null
  status: 'reported_sent' | 'confirmed' | 'rejected'
  comment: string | null
  created_at: string
  updated_at: string
}

export type FinanceAuditLogRow = {
  id: string
  organization_id: string | null
  actor_user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  before_data: unknown
  after_data: unknown
  reason: string | null
  created_at: string
}

export type OrderFinancialSummaryRow = {
  organization_id: string
  order_id: string
  order_number: number
  payment_id: string
  order_payment_method: PaymentMethod
  finance_payment_method: FinancePaymentMethod
  paid_at: string | null
  business_date: string
  revenue: number
  cogs: number
  gross_profit: number
  closed_shift_id: string | null
  operational_day_id: string | null
}

export type FinanceDashboardSummaryRow = {
  organization_id: string
  total_income: number
  total_expenses: number
  total_purchases: number
  platform_share_outstanding: number
  pending_expense_approvals: number
  periods_waiting_review: number
}

export type FinancialPeriodSummary = {
  organization_id: string
  period_start: string
  period_end: string
  revenue: number
  cogs: number
  gross_profit: number
  operating_expenses: number
  other_income: number
  net_profit_before_platform_share: number
  platform_share_percentage: number
  platform_share_amount: number
  organization_owner_amount: number
  cash_inflow: number
  cash_outflow: number
}

export type OrganizationReadiness = {
  organization_id: string
  has_admin: boolean
  has_employee: boolean
  has_places: boolean
  has_timed_places: boolean
  has_products: boolean
  has_services: boolean
  has_shift_templates: boolean
  has_finance_categories: boolean
  has_share_rate: boolean
  telegram_configured: boolean
  migration_schema_readiness: boolean
  readiness_percentage: number
  blockers: string[]
  warnings: string[]
}

export type ShiftSummary = {
  shift_id: string
  organization_id: string
  operational_day_id: string
  employee_user_id: string
  status: ShiftStatus
  opened_at: string
  closed_at: string | null
  duration_minutes: number
  opening_cash_amount: number
  cash_sales_total: number
  card_transfer_sales_total: number
  paid_orders_total: number
  unpaid_orders_total: number
  payment_refused_total: number
  completed_orders_count: number
  payment_refused_count: number
  opened_orders_count: number
  open_orders_count: number
  active_sessions_count: number
  completed_sessions_count: number
  expected_cash_amount: number
  actual_cash_amount: number | null
  cash_variance: number | null
  cash_variance_status: CashVarianceStatus | null
}

export type CurrentShiftPayload = {
  shift: EmployeeShiftRow
  operational_day: OperationalDayRow
  template: ShiftTemplateRow | null
  summary: ShiftSummary
  accepted_handovers?: ShiftHandoverRow[]
}

export type ShiftOpenPayload = {
  shift: EmployeeShiftRow
  operational_day: OperationalDayRow
  accepted_handover: ShiftHandoverRow | null
  summary: ShiftSummary
}

export type ShiftClosePayload = {
  shift: EmployeeShiftRow
  summary: ShiftSummary
  handover: ShiftHandoverRow | null
}

export type EmployeeCurrentShiftViewRow = Pick<
  EmployeeShiftRow,
  | 'id'
  | 'organization_id'
  | 'operational_day_id'
  | 'shift_template_id'
  | 'employee_user_id'
  | 'status'
  | 'opened_at'
  | 'scheduled_start_at'
  | 'scheduled_end_at'
  | 'closed_at'
  | 'opening_cash_amount'
  | 'expected_cash_amount'
  | 'actual_cash_amount'
  | 'cash_variance'
  | 'cash_variance_status'
  | 'cash_sales_total'
  | 'card_transfer_sales_total'
  | 'paid_orders_total'
  | 'unpaid_orders_total'
  | 'payment_refused_total'
  | 'completed_orders_count'
  | 'payment_refused_count'
  | 'opened_orders_count'
  | 'transferred_orders_count'
  | 'created_at'
  | 'updated_at'
> & {
  business_date: string
  shift_template_name: string | null
}

export type AdminShiftReportRow = EmployeeShiftRow & {
  business_date: string
  shift_template_name: string | null
  employee_email: string | null
  employee_full_name: string | null
}

export type AdminOperationalDayReportRow = OperationalDayRow & {
  shifts: unknown
}

export type AvailableUserSearchResult = {
  user_id: string
  email: string | null
  full_name: string | null
  avatar_path: string | null
  membership_id: string | null
  membership_role: AppRole | null
  membership_is_active: boolean | null
}

export type AuthenticatedUserContext = {
  profile: ProfileRow
  role: AppRole
  organizationId: string | null
  currentOrganization: OrganizationRow | null
  memberships: OrganizationMembershipRow[]
  availableOrganizations: OrganizationRow[]
}

type TableDefinition<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles: TableDefinition<
        ProfileRow,
        Partial<ProfileRow> & Pick<ProfileRow, 'id'>,
        Partial<Omit<ProfileRow, 'id' | 'created_at'>>
      >
      organizations: TableDefinition<
        OrganizationRow,
        Partial<OrganizationRow> & Pick<OrganizationRow, 'name' | 'slug' | 'created_by'>,
        Partial<Omit<OrganizationRow, 'id' | 'created_by' | 'created_at'>>
      >
      platform_user_roles: TableDefinition<
        PlatformUserRoleRow,
        PlatformUserRoleRow,
        Partial<PlatformUserRoleRow>
      >
      organization_memberships: TableDefinition<
        OrganizationMembershipRow,
        Partial<OrganizationMembershipRow> &
          Pick<OrganizationMembershipRow, 'organization_id' | 'user_id' | 'role'>,
        Partial<Omit<OrganizationMembershipRow, 'id' | 'organization_id' | 'user_id' | 'created_at'>>
      >
      employee_lock_pins: TableDefinition<
        EmployeeLockPinRow,
        Partial<EmployeeLockPinRow> & Pick<EmployeeLockPinRow, 'membership_id'>,
        Partial<Omit<EmployeeLockPinRow, 'membership_id' | 'created_at'>>
      >
      catalog_categories: TableDefinition<
        CatalogCategoryRow,
        Partial<CatalogCategoryRow> &
          Pick<CatalogCategoryRow, 'organization_id' | 'type' | 'name' | 'created_by'>,
        Partial<Omit<CatalogCategoryRow, 'id' | 'organization_id' | 'created_by' | 'created_at'>>
      >
      places: TableDefinition<
        PlaceRow,
        Partial<PlaceRow> &
          Pick<PlaceRow, 'organization_id' | 'name' | 'type' | 'created_by'>,
        Partial<Omit<PlaceRow, 'id' | 'organization_id' | 'created_by' | 'created_at'>>
      >
      products: TableDefinition<
        ProductRow,
        Partial<ProductRow> &
          Pick<ProductRow, 'organization_id' | 'name' | 'sale_price' | 'created_by'>,
        Partial<Omit<ProductRow, 'id' | 'organization_id' | 'created_by' | 'created_at'>>
      >
      services: TableDefinition<
        ServiceRow,
        Partial<ServiceRow> &
          Pick<ServiceRow, 'organization_id' | 'name' | 'pricing_type' | 'created_by'>,
        Partial<Omit<ServiceRow, 'id' | 'organization_id' | 'created_by' | 'created_at'>>
      >
      stock_documents: TableDefinition<
        StockDocumentRow,
        Partial<StockDocumentRow> &
          Pick<StockDocumentRow, 'organization_id' | 'type' | 'created_by'>,
        Partial<Omit<StockDocumentRow, 'id' | 'organization_id' | 'created_by' | 'created_at'>>
      >
      stock_document_items: TableDefinition<
        StockDocumentItemRow,
        Partial<StockDocumentItemRow> &
          Pick<
            StockDocumentItemRow,
            'organization_id' | 'document_id' | 'product_id' | 'quantity'
          >,
        Partial<Omit<StockDocumentItemRow, 'id' | 'organization_id' | 'document_id' | 'created_at'>>
      >
      stock_movements: TableDefinition<StockMovementRow, StockMovementRow, never>
      combos: TableDefinition<
        ComboRow,
        Partial<ComboRow> & Pick<ComboRow, 'organization_id' | 'name' | 'sale_price' | 'created_by'>,
        Partial<Omit<ComboRow, 'id' | 'organization_id' | 'created_by' | 'created_at'>>
      >
      combo_components: TableDefinition<
        ComboComponentRow,
        Partial<ComboComponentRow> &
          Pick<ComboComponentRow, 'organization_id' | 'combo_id' | 'component_type' | 'quantity'>,
        Partial<Omit<ComboComponentRow, 'id' | 'organization_id' | 'combo_id' | 'created_at'>>
      >
      orders: TableDefinition<
        OrderRow,
        Partial<OrderRow> & Pick<OrderRow, 'organization_id' | 'opened_by'>,
        Partial<Omit<OrderRow, 'id' | 'organization_id' | 'opened_by' | 'opened_at' | 'created_at'>>
      >
      order_items: TableDefinition<
        OrderItemRow,
        Partial<OrderItemRow> &
          Pick<
            OrderItemRow,
            'organization_id' | 'order_id' | 'item_type' | 'name_snapshot' | 'quantity' | 'unit_price' | 'total_price' | 'added_by'
          >,
        Partial<Omit<OrderItemRow, 'id' | 'organization_id' | 'order_id' | 'added_by' | 'added_at' | 'created_at'>>
      >
      order_combo_components: TableDefinition<
        OrderComboComponentRow,
        Partial<OrderComboComponentRow> &
          Pick<OrderComboComponentRow, 'organization_id' | 'order_item_id' | 'component_type' | 'name_snapshot' | 'quantity'>,
        Partial<OrderComboComponentRow>
      >
      timed_sessions: TableDefinition<
        TimedSessionRow,
        Partial<TimedSessionRow> &
          Pick<
            TimedSessionRow,
            | 'organization_id'
            | 'order_id'
            | 'place_id'
            | 'place_name_snapshot'
            | 'hourly_rate_snapshot'
            | 'minimum_minutes_snapshot'
            | 'billing_step_minutes_snapshot'
            | 'started_by'
          >,
        Partial<Omit<TimedSessionRow, 'id' | 'organization_id' | 'order_id' | 'place_id' | 'started_by' | 'created_at'>>
      >
      stock_reservations: TableDefinition<
        StockReservationRow,
        Partial<StockReservationRow> &
          Pick<StockReservationRow, 'organization_id' | 'order_id' | 'order_item_id' | 'product_id' | 'quantity' | 'created_by'>,
        Partial<StockReservationRow>
      >
      order_place_history: TableDefinition<
        OrderPlaceHistoryRow,
        Partial<OrderPlaceHistoryRow> &
          Pick<OrderPlaceHistoryRow, 'organization_id' | 'order_id' | 'moved_by'>,
        Partial<OrderPlaceHistoryRow>
      >
      order_adjustment_requests: TableDefinition<
        OrderAdjustmentRequestRow,
        Partial<OrderAdjustmentRequestRow> &
          Pick<OrderAdjustmentRequestRow, 'organization_id' | 'order_id' | 'request_type' | 'reason' | 'requested_by'>,
        Partial<OrderAdjustmentRequestRow>
      >
      payments: TableDefinition<
        PaymentRow,
        Partial<PaymentRow> &
          Pick<PaymentRow, 'organization_id' | 'order_id' | 'method' | 'amount' | 'received_by'>,
        Partial<PaymentRow>
      >
      audit_logs: TableDefinition<
        AuditLogRow,
        Partial<AuditLogRow> & Pick<AuditLogRow, 'action' | 'entity_type'>,
        never
      >
      shift_templates: TableDefinition<
        ShiftTemplateRow,
        Partial<ShiftTemplateRow> &
          Pick<ShiftTemplateRow, 'organization_id' | 'name' | 'start_time' | 'end_time' | 'created_by'>,
        Partial<Omit<ShiftTemplateRow, 'id' | 'organization_id' | 'created_by' | 'created_at'>>
      >
      operational_days: TableDefinition<OperationalDayRow, OperationalDayRow, Partial<OperationalDayRow>>
      employee_shifts: TableDefinition<EmployeeShiftRow, EmployeeShiftRow, Partial<EmployeeShiftRow>>
      shift_handovers: TableDefinition<ShiftHandoverRow, ShiftHandoverRow, Partial<ShiftHandoverRow>>
      shift_handover_orders: TableDefinition<
        ShiftHandoverOrderRow,
        ShiftHandoverOrderRow,
        Partial<ShiftHandoverOrderRow>
      >
      organization_notification_settings: TableDefinition<
        OrganizationNotificationSettingsRow,
        Partial<OrganizationNotificationSettingsRow> & Pick<OrganizationNotificationSettingsRow, 'organization_id'>,
        Partial<Omit<OrganizationNotificationSettingsRow, 'id' | 'organization_id' | 'created_at'>>
      >
      notification_outbox: TableDefinition<
        NotificationOutboxRow,
        NotificationOutboxRow,
        Partial<NotificationOutboxRow>
      >
      finance_categories: TableDefinition<
        FinanceCategoryRow,
        Partial<FinanceCategoryRow> &
          Pick<FinanceCategoryRow, 'organization_id' | 'transaction_type' | 'name' | 'created_by'>,
        Partial<Omit<FinanceCategoryRow, 'id' | 'organization_id' | 'created_by' | 'created_at'>>
      >
      organization_finance_settings: TableDefinition<
        OrganizationFinanceSettingsRow,
        Partial<OrganizationFinanceSettingsRow> &
          Pick<OrganizationFinanceSettingsRow, 'organization_id'>,
        Partial<Omit<OrganizationFinanceSettingsRow, 'organization_id' | 'created_at'>>
      >
      finance_transactions: TableDefinition<
        FinanceTransactionRow,
        Partial<FinanceTransactionRow> &
          Pick<
            FinanceTransactionRow,
            | 'organization_id'
            | 'transaction_type'
            | 'source_type'
            | 'title'
            | 'amount'
            | 'accrual_date'
            | 'created_by'
          >,
        Partial<Omit<FinanceTransactionRow, 'id' | 'organization_id' | 'source_type' | 'source_id' | 'created_by' | 'created_at'>>
      >
      recurring_expenses: TableDefinition<
        RecurringExpenseRow,
        Partial<RecurringExpenseRow> &
          Pick<
            RecurringExpenseRow,
            'organization_id' | 'category_id' | 'title' | 'amount' | 'frequency' | 'start_date' | 'next_generation_date' | 'created_by'
          >,
        Partial<Omit<RecurringExpenseRow, 'id' | 'organization_id' | 'created_by' | 'created_at'>>
      >
      financial_periods: TableDefinition<FinancialPeriodRow, FinancialPeriodRow, Partial<FinancialPeriodRow>>
      organization_platform_share_rates: TableDefinition<
        OrganizationPlatformShareRateRow,
        OrganizationPlatformShareRateRow,
        Partial<OrganizationPlatformShareRateRow>
      >
      platform_share_accruals: TableDefinition<
        PlatformShareAccrualRow,
        PlatformShareAccrualRow,
        Partial<PlatformShareAccrualRow>
      >
      platform_share_payments: TableDefinition<
        PlatformSharePaymentRow,
        PlatformSharePaymentRow,
        Partial<PlatformSharePaymentRow>
      >
      finance_audit_logs: TableDefinition<FinanceAuditLogRow, FinanceAuditLogRow, never>
    }
    Views: {
      employee_categories: { Row: EmployeeCategoryRow; Relationships: [] }
      employee_places: { Row: EmployeePlaceRow; Relationships: [] }
      employee_products: { Row: EmployeeProductRow; Relationships: [] }
      employee_services: { Row: EmployeeServiceRow; Relationships: [] }
      product_stock_balances: { Row: ProductStockBalanceRow; Relationships: [] }
      combo_availability: { Row: ComboAvailabilityRow; Relationships: [] }
      employee_combos: { Row: EmployeeComboRow; Relationships: [] }
      employee_workspace_places: { Row: EmployeeWorkspacePlaceRow; Relationships: [] }
      employee_orders: { Row: EmployeeOrderRow; Relationships: [] }
      employee_order_items: { Row: EmployeeOrderItemRow; Relationships: [] }
      employee_timed_sessions: { Row: Omit<TimedSessionRow, 'cancellation_reason'>; Relationships: [] }
      employee_current_shift_view: { Row: EmployeeCurrentShiftViewRow; Relationships: [] }
      admin_shift_reports: { Row: AdminShiftReportRow; Relationships: [] }
      admin_operational_day_reports: { Row: AdminOperationalDayReportRow; Relationships: [] }
      order_financial_summary: { Row: OrderFinancialSummaryRow; Relationships: [] }
      finance_dashboard_summary: { Row: FinanceDashboardSummaryRow; Relationships: [] }
    }
    Functions: {
      create_organization_with_admin: {
        Args: {
          name: string
          slug: string
          description?: string | null
          logo_path?: string | null
          default_locale?: 'ru' | 'az' | 'en'
          timezone?: string
          currency_code?: string
          admin_user_id?: string | null
        }
        Returns: OrganizationRow
      }
      assign_organization_admin: {
        Args: {
          target_organization_id: string
          target_user_id: string
        }
        Returns: OrganizationMembershipRow
      }
      find_available_user_by_email: {
        Args: {
          target_email: string
          target_organization_id: string
        }
        Returns: AvailableUserSearchResult[]
      }
      assign_organization_employee: {
        Args: {
          target_organization_id: string
          target_user_id: string
          target_full_name?: string | null
          target_job_title?: string | null
          target_phone?: string | null
          target_notes?: string | null
        }
        Returns: OrganizationMembershipRow
      }
      update_organization_employee: {
        Args: {
          target_membership_id: string
          target_full_name: string | null
          target_job_title: string | null
          target_phone: string | null
          target_notes: string | null
          target_sort_order: number
        }
        Returns: OrganizationMembershipRow
      }
      set_organization_employee_active: {
        Args: {
          target_membership_id: string
          target_is_active: boolean
        }
        Returns: OrganizationMembershipRow
      }
      get_my_employee_lock_state: {
        Args: {
          target_organization_id: string
        }
        Returns: EmployeeLockStateRow[]
      }
      get_organization_employee_lock_states: {
        Args: {
          target_organization_id: string
        }
        Returns: EmployeeLockStateRow[]
      }
      set_employee_lock_pin: {
        Args: {
          target_membership_id: string
          target_pin: string
        }
        Returns: undefined
      }
      request_employee_lock_pin_change: {
        Args: {
          target_membership_id: string
          target_pin: string
        }
        Returns: undefined
      }
      approve_employee_lock_pin_change: {
        Args: {
          target_membership_id: string
        }
        Returns: undefined
      }
      reject_employee_lock_pin_change: {
        Args: {
          target_membership_id: string
        }
        Returns: undefined
      }
      verify_employee_lock_pin: {
        Args: {
          target_membership_id: string
          target_pin: string
        }
        Returns: boolean
      }
      set_category_status: {
        Args: {
          target_id: string
          target_status: CatalogItemStatus
        }
        Returns: CatalogCategoryRow
      }
      set_place_status: {
        Args: {
          target_id: string
          target_status: CatalogItemStatus
        }
        Returns: PlaceRow
      }
      set_product_status: {
        Args: {
          target_id: string
          target_status: CatalogItemStatus
        }
        Returns: ProductRow
      }
      delete_unused_product: {
        Args: {
          target_product_id: string
          target_reason?: string | null
        }
        Returns: ProductRow
      }
      set_service_status: {
        Args: {
          target_id: string
          target_status: CatalogItemStatus
        }
        Returns: ServiceRow
      }
      calculate_product_stock: {
        Args: {
          target_product_id: string
        }
        Returns: number
      }
      reconcile_product_stock: {
        Args: {
          target_product_id: string
        }
        Returns: ProductRow
      }
      post_stock_document: {
        Args: {
          target_document_id: string
        }
        Returns: StockDocumentRow
      }
      cancel_stock_document: {
        Args: {
          target_document_id: string
          target_reason: string
        }
        Returns: StockDocumentRow
      }
      create_opening_stock_document: {
        Args: {
          target_product_id: string
          target_quantity: number
          target_unit_cost?: number | null
          target_comment?: string | null
        }
        Returns: StockDocumentRow
      }
      set_combo_status: {
        Args: {
          target_id: string
          target_status: ComboStatus
        }
        Returns: ComboRow
      }
      current_user_primary_organization_id: {
        Args: Record<string, never>
        Returns: string | null
      }
      calculate_available_product_stock: {
        Args: {
          target_product_id: string
        }
        Returns: number
      }
      create_order: {
        Args: {
          target_place_id?: string | null
          target_customer_label?: string | null
          target_comment?: string | null
        }
        Returns: OrderRow
      }
      add_product_to_order: {
        Args: {
          target_order_id: string
          target_product_id: string
          target_quantity: number
        }
        Returns: OrderItemRow
      }
      add_service_to_order: {
        Args: {
          target_order_id: string
          target_service_id: string
          target_quantity?: number
        }
        Returns: OrderItemRow
      }
      add_combo_to_order: {
        Args: {
          target_order_id: string
          target_combo_id: string
          target_quantity?: number
        }
        Returns: OrderItemRow
      }
      start_timed_session: {
        Args: {
          target_place_id: string
          target_order_id?: string | null
        }
        Returns: TimedSessionRow
      }
      complete_timed_session: {
        Args: {
          target_session_id: string
        }
        Returns: TimedSessionRow
      }
      move_open_order_to_place: {
        Args: {
          target_order_id: string
          target_place_id: string
          target_comment?: string | null
        }
        Returns: OrderRow
      }
      request_order_adjustment: {
        Args: {
          target_order_id: string
          target_order_item_id?: string | null
          target_request_type?: AdjustmentRequestType
          target_reason?: string | null
          target_requested_quantity?: number | null
        }
        Returns: OrderAdjustmentRequestRow
      }
      review_order_adjustment: {
        Args: {
          target_request_id: string
          target_decision: 'approved' | 'rejected'
          target_comment?: string | null
        }
        Returns: OrderAdjustmentRequestRow
      }
      set_order_waiting_payment: {
        Args: {
          target_order_id: string
        }
        Returns: OrderRow
      }
      complete_order_payment: {
        Args: {
          target_order_id: string
          target_method: PaymentMethod
        }
        Returns: OrderRow
      }
      mark_order_payment_refused: {
        Args: {
          target_order_id: string
          target_comment: string
        }
        Returns: OrderRow
      }
      complete_empty_order: {
        Args: {
          target_order_id: string
        }
        Returns: OrderRow
      }
      cancel_order: {
        Args: {
          target_order_id: string
          target_reason: string
        }
        Returns: OrderRow
      }
      get_business_date: {
        Args: {
          target_organization_id: string
          target_moment?: string
        }
        Returns: string
      }
      current_employee_open_shift_id: {
        Args: {
          target_organization_id?: string | null
        }
        Returns: string | null
      }
      open_employee_shift: {
        Args: {
          target_shift_template_id?: string | null
          target_opening_cash_amount?: number
        }
        Returns: ShiftOpenPayload
      }
      get_current_employee_shift: {
        Args: Record<string, never>
        Returns: CurrentShiftPayload | null
      }
      calculate_shift_summary: {
        Args: {
          target_shift_id: string
        }
        Returns: ShiftSummary
      }
      close_employee_shift: {
        Args: {
          target_actual_cash_amount: number
          target_comment?: string | null
          target_handover_cash_amount?: number | null
        }
        Returns: ShiftClosePayload
      }
      force_close_employee_shift: {
        Args: {
          target_shift_id: string
          target_actual_cash_amount?: number | null
          target_reason: string
        }
        Returns: ShiftClosePayload
      }
      find_overdue_open_shifts: {
        Args: Record<string, never>
        Returns: EmployeeShiftRow[]
      }
      create_overdue_shift_notifications: {
        Args: Record<string, never>
        Returns: number
      }
      current_user_role: {
        Args: Record<string, never>
        Returns: AppRole | null
      }
      seed_standard_finance_categories: {
        Args: {
          target_organization_id?: string | null
        }
        Returns: number
      }
      sync_order_income: {
        Args: {
          target_order_id: string
        }
        Returns: FinanceTransactionRow | null
      }
      create_purchase_finance_transaction: {
        Args: {
          target_document_id: string
        }
        Returns: FinanceTransactionRow | null
      }
      create_manual_income: {
        Args: {
          target_organization_id: string
          target_title: string
          target_amount: number
          target_payment_method?: FinancePaymentMethod | null
          target_accrual_date?: string
          target_paid_date?: string | null
          target_category_id?: string | null
          target_description?: string | null
          target_reference?: string | null
        }
        Returns: FinanceTransactionRow
      }
      create_expense: {
        Args: {
          target_organization_id: string
          target_title: string
          target_amount: number
          target_category_id: string
          target_payment_method?: FinancePaymentMethod | null
          target_accrual_date?: string
          target_paid_date?: string | null
          target_recipient_or_supplier?: string | null
          target_description?: string | null
          target_document_path?: string | null
          target_source_type?: FinanceSourceType
          target_source_id?: string | null
        }
        Returns: FinanceTransactionRow
      }
      approve_expense: {
        Args: {
          target_transaction_id: string
          target_decision: 'approved' | 'rejected'
          target_comment?: string | null
        }
        Returns: FinanceTransactionRow
      }
      update_expense: {
        Args: {
          target_transaction_id: string
          target_title: string
          target_amount: number
          target_category_id: string
          target_payment_method?: FinancePaymentMethod | null
          target_accrual_date?: string
          target_paid_date?: string | null
          target_recipient_or_supplier?: string | null
          target_description?: string | null
        }
        Returns: FinanceTransactionRow
      }
      cancel_expense: {
        Args: {
          target_transaction_id: string
          target_reason: string
        }
        Returns: FinanceTransactionRow
      }
      generate_due_recurring_expenses: {
        Args: {
          target_organization_id: string
          target_until_date?: string
        }
        Returns: number
      }
      calculate_financial_period: {
        Args: {
          target_organization_id: string
          target_period_start: string
          target_period_end: string
        }
        Returns: FinancialPeriodSummary
      }
      submit_financial_period: {
        Args: {
          target_period_start: string
          target_period_end: string
        }
        Returns: FinancialPeriodRow
      }
      review_financial_period: {
        Args: {
          target_period_id: string
          target_decision: 'approved' | 'clarification_requested' | 'rejected'
          target_comment?: string | null
        }
        Returns: FinancialPeriodRow
      }
      set_platform_share_rate: {
        Args: {
          target_organization_id: string
          target_percentage: number
          target_effective_from: string
          target_comment?: string | null
        }
        Returns: OrganizationPlatformShareRateRow
      }
      report_platform_share_payment: {
        Args: {
          target_accrual_id: string
          target_amount: number
          target_payment_method: FinancePaymentMethod
          target_payment_date: string
          target_reference?: string | null
          target_document_path?: string | null
          target_comment?: string | null
        }
        Returns: PlatformSharePaymentRow
      }
      confirm_platform_share_payment: {
        Args: {
          target_payment_id: string
          target_decision: 'confirmed' | 'rejected'
          target_comment?: string | null
        }
        Returns: PlatformSharePaymentRow
      }
      get_organization_readiness: {
        Args: {
          target_organization_id: string
        }
        Returns: OrganizationReadiness
      }
      claim_notification_outbox: {
        Args: {
          target_batch_size?: number
          target_processing_timeout_minutes?: number
        }
        Returns: NotificationOutboxRow[]
      }
      finish_notification_outbox_item: {
        Args: {
          target_outbox_id: string
          target_success: boolean
          target_error?: string | null
          target_cancelled?: boolean
        }
        Returns: NotificationOutboxRow
      }
    }
    Enums: {
      app_role: AppRole
      organization_status: OrganizationStatus
      catalog_item_status: CatalogItemStatus
      place_type: PlaceType
      service_pricing_type: ServicePricingType
      catalog_category_type: CatalogCategoryType
      stock_movement_type: StockMovementType
      stock_document_status: StockDocumentStatus
      combo_status: ComboStatus
      combo_component_type: ComboComponentType
      combo_selection_mode: ComboSelectionMode
      order_status: OrderStatus
      order_item_type: OrderItemType
      order_item_status: OrderItemStatus
      timed_session_status: TimedSessionStatus
      payment_method: PaymentMethod
      payment_status: PaymentStatus
      adjustment_request_status: AdjustmentRequestStatus
      adjustment_request_type: AdjustmentRequestType
      stock_reservation_status: StockReservationStatus
      shift_status: ShiftStatus
      shift_handover_status: ShiftHandoverStatus
      cash_variance_status: CashVarianceStatus
      notification_outbox_status: NotificationOutboxStatus
      notification_type: NotificationType
      operational_day_status: OperationalDayStatus
      finance_transaction_type: FinanceTransactionType
      finance_transaction_status: FinanceTransactionStatus
      finance_payment_method: FinancePaymentMethod
      finance_source_type: FinanceSourceType
      financial_period_status: FinancialPeriodStatus
      platform_share_status: PlatformShareStatus
      recurring_frequency: RecurringFrequency
      expense_approval_status: ExpenseApprovalStatus
    }
    CompositeTypes: Record<string, never>
  }
}
