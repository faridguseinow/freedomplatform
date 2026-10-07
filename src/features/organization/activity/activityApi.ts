import { getCurrentLocale } from '../../../lib/i18n/translator'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase/client'
import type { AuditLogRow, FinanceAuditLogRow, ProfileRow } from '../../../lib/supabase/database.types'

type RawMetadata = Record<string, unknown>

export type ActivityEvent = {
  id: string
  source: 'operations' | 'finance'
  organizationId: string | null
  actorUserId: string | null
  actorName: string
  action: string
  actionLabel: string
  area: ActivityArea
  category: ActivityCategory
  entityType: string
  entityId: string | null
  relatedOrderId: string | null
  details: ActivityDetail[]
  createdAt: string
}

export type ActivityArea = 'admin' | 'workspace'

export type ActivityCategory =
  | 'admin'
  | 'finance'
  | 'orders'
  | 'payments'
  | 'places'
  | 'sessions'
  | 'shifts'
  | 'other'

export type ActivityDetail = {
  key: string
  value?: string | number
  from?: string | number
  to?: string | number
  translateValue?: boolean
}

const auditSelect = 'id,organization_id,actor_user_id,action,entity_type,entity_id,metadata,shift_id,created_at'
const financeAuditSelect =
  'id,organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,reason,created_at'

const sectionLabels: Record<string, string> = {
  '/admin': 'Обзор',
  '/admin/dashboard': 'Обзор',
  '/admin/employees': 'Сотрудники',
  '/admin/catalog': 'Каталог',
  '/admin/categories': 'Категории',
  '/admin/places': 'Места',
  '/admin/products': 'Товары',
  '/admin/services': 'Услуги',
  '/admin/inventory': 'Склад',
  '/admin/inventory/documents': 'Документы склада',
  '/admin/combos': 'Комбо',
  '/admin/orders': 'Заказы',
  '/admin/adjustment-requests': 'Исправления',
  '/admin/shifts': 'Смены',
  '/admin/shift-templates': 'Шаблоны смен',
  '/admin/operational-days': 'Операционные дни',
  '/admin/notification-settings': 'Уведомления',
  '/admin/finance': 'Финансы',
  '/admin/settings': 'Настройки',
  '/admin/activity': 'Журнал действий',
}

const actionLabels: Record<string, string> = {
  'admin.section_viewed': 'открыл раздел',
  'order.created': 'создал заказ',
  'order.item_added': 'добавил позицию в заказ',
  'order.moved': 'переместил заказ',
  'order.cancelled': 'activity.action.orderCancelled',
  'order.completed_empty': 'activity.action.emptyOrderCompleted',
  'order.transferred': 'activity.action.orderTransferred',
  'order.merged': 'activity.action.ordersMerged',
  'order.merged_into': 'activity.action.ordersMerged',
  'order.customer_label_updated': 'activity.action.customerNameUpdated',
  'adjustment.applied': 'изменил заказ',
  'adjustment.requested': 'создал запрос на исправление',
  'adjustment.approved': 'одобрил исправление',
  'adjustment.rejected': 'отклонил исправление',
  'session.started': 'запустил сессию',
  'session.completed': 'завершил сессию',
  'session.paused': 'activity.action.sessionPaused',
  'session.resumed': 'activity.action.sessionResumed',
  'session.plan_extended': 'activity.action.sessionPlanExtended',
  'payment.completed': 'activity.action.orderCompleted',
  'payment.items_paid': 'activity.action.itemsPaid',
  'payment.prepaid': 'принял предоплату',
  'payment.tip_recorded': 'записал чаевые',
  'payment.refused': 'оформил отказ от оплаты',
  'shift.opened': 'открыл смену',
  'shift.closed': 'закрыл смену',
  'shift.cash_shortage': 'зафиксировал недостачу',
  'shift.cash_overage': 'зафиксировал излишек',
  'shift.force_closed': 'принудительно закрыл смену',
  'shift.handover_created': 'создал передачу смены',
  'shift.permanently_deleted': 'activity.action.shiftDeleted',
  'operational_day.completed': 'закрыл операционный день',
  'finance.order_income_synced': 'синхронизировал доход по заказу',
  'finance.purchase_synced': 'синхронизировал закупку',
  'finance.purchase_cancelled': 'activity.action.purchaseCancelled',
  'finance.manual_income_created': 'создал ручной доход',
  'finance.expense_created': 'создал расход',
  'finance.expense_updated': 'изменил расход',
  'finance.expense_cancelled': 'удалил расход',
  'finance.expense_approved': 'одобрил расход',
  'finance.expense_rejected': 'отклонил расход',
  'finance.period_submitted': 'отправил финансовый период на проверку',
  'finance.period_updated': 'изменил финансовый период',
  'finance.period_cancelled': 'удалил финансовый период',
  'finance.period_deleted': 'activity.action.periodDeleted',
  'finance.period_approved': 'одобрил финансовый период',
  'finance.period_rejected': 'отклонил финансовый период',
  'finance.period_clarification_requested': 'запросил уточнение по периоду',
  'finance.platform_share_rate_set': 'изменил оплату платформы',
  'finance.monthly_platform_fee_set': 'изменил ежемесячную оплату платформы',
  'finance.platform_share_payment_reported': 'сообщил об оплате платформы',
  'finance.platform_period_payment_recorded': 'сообщил об оплате платформы',
  'finance.platform_share_payment_confirmed': 'подтвердил оплату платформы',
  'finance.platform_share_payment_rejected': 'отклонил оплату платформы',
  'finance.expense_converted_to_platform_payment': 'activity.action.expenseConverted',
  'catalog.product_deleted': 'удалил товар',
  'place.created': 'activity.action.placeCreated',
  'place.updated': 'activity.action.placeUpdated',
  'place.status_updated': 'activity.action.placeStatusUpdated',
  'place.session_settings_updated': 'activity.action.placeSessionSettingsUpdated',
  'place.vip_equipment_updated': 'activity.action.placeEquipmentUpdated',
  'maintenance.test_orders_reset': 'очистил тестовые заказы',
}

const entityLabels: Record<string, string> = {
  admin_page: 'страница админки',
  order: 'заказ',
  order_item: 'позиция заказа',
  order_adjustment_request: 'запрос исправления',
  timed_session: 'сессия',
  employee_shift: 'смена',
  shift_handover: 'передача смены',
  operational_day: 'операционный день',
  finance_transaction: 'финансовая операция',
  financial_period: 'финансовый период',
  organization_platform_share_rate: 'настройка оплаты платформы',
  platform_share_payment: 'платёж платформе',
  product: 'товар',
  place: 'activity.entity.place',
  organization: 'организация',
}

function getActivityCategory(action: string, source: ActivityEvent['source']): ActivityCategory {
  if (source === 'finance' || action.startsWith('finance.')) return 'finance'
  if (action.startsWith('place.')) return 'places'
  if (action.startsWith('order.') || action.startsWith('adjustment.')) return 'orders'
  if (action.startsWith('payment.')) return 'payments'
  if (action.startsWith('session.')) return 'sessions'
  if (action.startsWith('shift.') || action.startsWith('operational_day.')) return 'shifts'
  if (action.startsWith('admin.')) return 'admin'
  return 'other'
}

function getActivityArea(action: string, source: ActivityEvent['source']): ActivityArea {
  if (source === 'finance') return 'admin'
  if (
    action.startsWith('order.') ||
    action.startsWith('payment.') ||
    action.startsWith('session.') ||
    action.startsWith('shift.')
  ) return 'workspace'
  return 'admin'
}

function asRecord(value: unknown): RawMetadata {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RawMetadata) : {}
}

function formatMoney(value: unknown) {
  if (typeof value !== 'number') return null
  return new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 2 }).format(value)
}

function getProfileName(profile: Pick<ProfileRow, 'email' | 'full_name'> | undefined, actorUserId: string | null) {
  return profile?.full_name || profile?.email || (actorUserId ? `User ${actorUserId.slice(0, 8)}` : 'Система')
}

function getSectionLabel(path: unknown) {
  if (typeof path !== 'string') return null
  return sectionLabels[path] ?? path
}

function buildDetails(metadata: RawMetadata) {
  const details: ActivityDetail[] = []
  const section = getSectionLabel(metadata.path)
  const amount = formatMoney(metadata.amount)
  const tipAmount = formatMoney(metadata.tip_amount)
  const totalAmount = formatMoney(metadata.total_amount)
  const paymentMethodLabels: Record<string, string> = {
    cash: 'Наличными',
    card_transfer: 'Перевод на карту',
  }

  const before = asRecord(metadata.before)
  const after = asRecord(metadata.after)
  const pushChange = (key: string, beforeValue: unknown, afterValue: unknown) => {
    if (beforeValue === afterValue) return
    const from = beforeValue === null ? '—' : beforeValue
    const to = afterValue === null ? '—' : afterValue
    if ((typeof from !== 'string' && typeof from !== 'number') ||
      (typeof to !== 'string' && typeof to !== 'number')) return
    details.push({ key, from, to })
  }

  if (section) details.push({ key: 'activity.detail.section', value: section, translateValue: true })
  if (typeof metadata.place_name === 'string') details.push({ key: 'activity.detail.place', value: metadata.place_name })
  if (typeof metadata.order_number === 'number') details.push({ key: 'activity.detail.order', value: metadata.order_number })
  if (typeof metadata.type === 'string') details.push({ key: 'activity.detail.type', value: metadata.type })
  if (typeof metadata.method === 'string') details.push({ key: 'activity.detail.paymentMethod', value: paymentMethodLabels[metadata.method] ?? metadata.method, translateValue: true })
  if (amount) details.push({ key: 'activity.detail.amount', value: amount })
  if (tipAmount) details.push({ key: 'activity.detail.tip', value: tipAmount })
  if (totalAmount) details.push({ key: 'activity.detail.orderAmount', value: totalAmount })
  if (typeof metadata.quantity === 'number') details.push({ key: 'activity.detail.quantity', value: metadata.quantity })
  if (typeof metadata.items_count === 'number') details.push({ key: 'activity.detail.itemsCount', value: metadata.items_count })
  const remainingAmount = formatMoney(metadata.remaining)
  if (remainingAmount) details.push({ key: 'activity.detail.remainingAmount', value: remainingAmount })
  const refundedAmount = formatMoney(metadata.refunded_amount)
  if (refundedAmount) details.push({ key: 'activity.detail.refundedAmount', value: refundedAmount })
  if (typeof metadata.billable_minutes === 'number') details.push({ key: 'activity.detail.minutes', value: metadata.billable_minutes })
  if (typeof metadata.reason === 'string') details.push({ key: 'activity.detail.reason', value: metadata.reason })
  if (typeof metadata.comment === 'string') details.push({ key: 'activity.detail.comment', value: metadata.comment })
  if (typeof metadata.name === 'string') details.push({ key: 'activity.detail.name', value: metadata.name })
  if (typeof metadata.sku === 'string') details.push({ key: 'activity.detail.sku', value: metadata.sku })
  if (typeof metadata.orders_deleted === 'number') details.push({ key: 'activity.detail.deletedOrders', value: metadata.orders_deleted })
  if (typeof metadata.payments_deleted === 'number') details.push({ key: 'activity.detail.deletedPayments', value: metadata.payments_deleted })
  if (typeof metadata.shifts_deleted === 'number') details.push({ key: 'activity.detail.deletedShifts', value: metadata.shifts_deleted })
  if (typeof metadata.affected_products === 'number') details.push({ key: 'activity.detail.recalculatedProducts', value: metadata.affected_products })
  if (typeof before.has_timer === 'boolean' && typeof after.has_timer === 'boolean' && before.has_timer !== after.has_timer) {
    details.push({ key: after.has_timer ? 'activity.detail.timerEnabled' : 'activity.detail.timerDisabled' })
  }
  pushChange('activity.detail.hourlyRateChanged', before.hourly_rate, after.hourly_rate)
  pushChange('activity.detail.minimumChanged', before.minimum_minutes, after.minimum_minutes)
  pushChange('activity.detail.billingStepChanged', before.billing_step_minutes, after.billing_step_minutes)
  if (typeof metadata.before_status === 'string' && typeof metadata.after_status === 'string') {
    details.push({ key: 'activity.detail.statusChanged', from: metadata.before_status, to: metadata.after_status })
  }

  return details
}

function buildFinanceDetails(log: FinanceAuditLogRow) {
  const details: ActivityDetail[] = []
  const afterData = asRecord(log.after_data)
  const amount = formatMoney(afterData.amount ?? afterData.accrued_amount ?? afterData.paid_amount)
  const statusLabels: Record<string, string> = {
    paid: 'Оплачено',
    unpaid: 'Не оплачено',
    pending: 'Ожидает оплату',
    approved: 'Одобрено',
    rejected: 'Отклонено',
    cancelled: 'Отменено',
    locked: 'Закрыт',
    draft: 'Черновик',
  }
  const transactionTypeLabels: Record<string, string> = {
    income: 'Доход',
    expense: 'Расход',
    purchase: 'Закупка',
    platform_share_payment: 'Оплата платформы',
  }

  if (amount) details.push({ key: 'activity.detail.amount', value: amount })
  if (typeof afterData.title === 'string') details.push({ key: 'activity.detail.name', value: afterData.title })
  if (typeof afterData.status === 'string') details.push({ key: 'activity.detail.status', value: statusLabels[afterData.status] ?? afterData.status, translateValue: true })
  if (typeof afterData.transaction_type === 'string') {
    details.push({ key: 'activity.detail.transactionType', value: transactionTypeLabels[afterData.transaction_type] ?? afterData.transaction_type, translateValue: true })
  }
  if (log.reason) details.push({ key: 'activity.detail.comment', value: log.reason })

  return details
}

function toActivityEvent(
  log: AuditLogRow,
  profiles: Map<string, Pick<ProfileRow, 'email' | 'full_name'>>,
): ActivityEvent {
  const metadata = asRecord(log.metadata)
  const actionLabel = actionLabels[log.action] ?? log.action
  const entityLabel = entityLabels[log.entity_type] ?? log.entity_type
  const relatedOrderId = typeof metadata.order_id === 'string'
    ? metadata.order_id
    : log.entity_type === 'order' ? log.entity_id : null
  return {
    id: `audit-${log.id}`,
    source: 'operations',
    organizationId: log.organization_id,
    actorUserId: log.actor_user_id,
    actorName: getProfileName(log.actor_user_id ? profiles.get(log.actor_user_id) : undefined, log.actor_user_id),
    action: log.action,
    actionLabel,
    area: getActivityArea(log.action, 'operations'),
    category: getActivityCategory(log.action, 'operations'),
    entityType: entityLabel,
    entityId: log.entity_id,
    relatedOrderId,
    details: buildDetails(metadata),
    createdAt: log.created_at,
  }
}

function toFinanceActivityEvent(
  log: FinanceAuditLogRow,
  profiles: Map<string, Pick<ProfileRow, 'email' | 'full_name'>>,
): ActivityEvent {
  const actionLabel = actionLabels[log.action] ?? log.action
  const actorName = getProfileName(log.actor_user_id ? profiles.get(log.actor_user_id) : undefined, log.actor_user_id)

  return {
    id: `finance-${log.id}`,
    source: 'finance',
    organizationId: log.organization_id,
    actorUserId: log.actor_user_id,
    actorName,
    action: log.action,
    actionLabel,
    area: getActivityArea(log.action, 'finance'),
    category: getActivityCategory(log.action, 'finance'),
    entityType: entityLabels[log.entity_type] ?? log.entity_type,
    entityId: log.entity_id,
    relatedOrderId: null,
    details: buildFinanceDetails(log),
    createdAt: log.created_at,
  }
}

function compactActivityEvents(events: ActivityEvent[]) {
  const compacted = events.map((event) => ({ ...event, details: [...event.details] }))
  const completedPayments = compacted.filter((event) => event.action === 'payment.completed' && event.relatedOrderId)
  const findCompletedPayment = (event: ActivityEvent) => completedPayments.find((payment) =>
    payment.relatedOrderId === event.relatedOrderId &&
    Math.abs(new Date(payment.createdAt).getTime() - new Date(event.createdAt).getTime()) <= 5 * 60_000,
  )
  const hiddenIds = new Set<string>()

  for (const event of compacted) {
    if (event.action === 'admin.section_viewed' || event.action === 'finance.order_income_synced') {
      hiddenIds.add(event.id)
      continue
    }

    if (event.action === 'payment.tip_recorded' || event.action === 'session.completed') {
      const payment = findCompletedPayment(event)
      if (!payment) continue
      for (const detail of event.details) {
        if (!payment.details.some((candidate) => candidate.key === detail.key)) payment.details.push(detail)
      }
      hiddenIds.add(event.id)
    }
  }

  const seenMoves = new Set<string>()
  return compacted.filter((event) => {
    if (hiddenIds.has(event.id)) return false
    if (event.action !== 'order.moved' && event.action !== 'order.transferred') return true
    const key = `${event.actorUserId ?? 'system'}:${event.relatedOrderId ?? event.entityId}:${event.createdAt.slice(0, 19)}`
    if (seenMoves.has(key)) return false
    seenMoves.add(key)
    return true
  })
}

export async function logAdminSectionView({
  organizationId,
  path,
  title,
}: {
  organizationId: string
  path: string
  title: string
}) {
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>

  const { error } = await rpc('log_audit', {
    target_organization_id: organizationId,
    target_action: 'admin.section_viewed',
    target_entity_type: 'admin_page',
    target_entity_id: null,
    target_metadata: { path, title },
  })

  if (error) throw new Error(error.message)
}

export function useAdminActivityEvents(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'activity', organizationId],
    queryFn: async () => {
      const [auditResult, financeResult] = await Promise.all([
        supabase
          .from('audit_logs')
          .select(auditSelect)
          .eq('organization_id', organizationId!)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('finance_audit_logs')
          .select(financeAuditSelect)
          .eq('organization_id', organizationId!)
          .order('created_at', { ascending: false })
          .limit(500),
      ])

      if (auditResult.error) throw new Error(auditResult.error.message)
      if (financeResult.error) throw new Error(financeResult.error.message)

      const auditLogs = auditResult.data as AuditLogRow[]
      const financeLogs = financeResult.data as FinanceAuditLogRow[]
      const actorIds = [
        ...new Set(
          [...auditLogs, ...financeLogs]
            .map((log) => log.actor_user_id)
            .filter((actorId): actorId is string => Boolean(actorId)),
        ),
      ]

      const profiles = new Map<string, Pick<ProfileRow, 'email' | 'full_name'>>()
      if (actorIds.length) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id,email,full_name')
          .in('id', actorIds)

        if (error) throw new Error(error.message)

        for (const profile of data as Pick<ProfileRow, 'id' | 'email' | 'full_name'>[]) {
          profiles.set(profile.id, profile)
        }
      }

      return compactActivityEvents([
        ...auditLogs.map((log) => toActivityEvent(log, profiles)),
        ...financeLogs.map((log) => toFinanceActivityEvent(log, profiles)),
      ].sort((left, right) => right.createdAt.localeCompare(left.createdAt)))
        .slice(0, 750)
    },
  })
}
