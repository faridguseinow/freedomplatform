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
  entityType: string
  entityId: string | null
  title: string
  details: string[]
  createdAt: string
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
  'adjustment.applied': 'изменил заказ',
  'adjustment.requested': 'создал запрос на исправление',
  'adjustment.approved': 'одобрил исправление',
  'adjustment.rejected': 'отклонил исправление',
  'session.started': 'запустил сессию',
  'session.completed': 'завершил сессию',
  'payment.completed': 'принял оплату',
  'payment.refused': 'оформил отказ от оплаты',
  'shift.opened': 'открыл смену',
  'shift.closed': 'закрыл смену',
  'shift.cash_shortage': 'зафиксировал недостачу',
  'shift.cash_overage': 'зафиксировал излишек',
  'shift.force_closed': 'принудительно закрыл смену',
  'shift.handover_created': 'создал передачу смены',
  'operational_day.completed': 'закрыл операционный день',
  'finance.order_income_synced': 'синхронизировал доход по заказу',
  'finance.purchase_synced': 'синхронизировал закупку',
  'finance.manual_income_created': 'создал ручной доход',
  'finance.expense_created': 'создал расход',
  'finance.expense_updated': 'изменил расход',
  'finance.expense_cancelled': 'удалил расход',
  'finance.expense_approved': 'одобрил расход',
  'finance.expense_rejected': 'отклонил расход',
  'finance.period_submitted': 'отправил финансовый период на проверку',
  'finance.period_approved': 'одобрил финансовый период',
  'finance.period_rejected': 'отклонил финансовый период',
  'finance.period_clarification_requested': 'запросил уточнение по периоду',
  'finance.platform_share_rate_set': 'установил ставку доли платформы',
  'finance.platform_share_payment_reported': 'сообщил об оплате доли платформы',
  'finance.platform_share_payment_confirmed': 'подтвердил оплату доли платформы',
  'finance.platform_share_payment_rejected': 'отклонил оплату доли платформы',
  'catalog.product_deleted': 'удалил товар',
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
  organization_platform_share_rate: 'ставка доли платформы',
  platform_share_payment: 'платёж доли платформы',
  product: 'товар',
}

function asRecord(value: unknown): RawMetadata {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RawMetadata) : {}
}

function formatMoney(value: unknown) {
  if (typeof value !== 'number') return null
  return new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value)
}

function getProfileName(profile: Pick<ProfileRow, 'email' | 'full_name'> | undefined, actorUserId: string | null) {
  return profile?.full_name || profile?.email || (actorUserId ? `Пользователь ${actorUserId.slice(0, 8)}` : 'Система')
}

function getSectionLabel(path: unknown) {
  if (typeof path !== 'string') return null
  return sectionLabels[path] ?? path
}

function buildDetails(metadata: RawMetadata) {
  const details: string[] = []
  const section = getSectionLabel(metadata.path)
  const amount = formatMoney(metadata.amount)

  if (section) details.push(`Раздел: ${section}`)
  if (typeof metadata.order_number === 'number') details.push(`Заказ #${metadata.order_number}`)
  if (typeof metadata.type === 'string') details.push(`Тип: ${metadata.type}`)
  if (typeof metadata.method === 'string') details.push(`Метод оплаты: ${metadata.method}`)
  if (amount) details.push(`Сумма: ${amount}`)
  if (typeof metadata.quantity === 'number') details.push(`Количество: ${metadata.quantity}`)
  if (typeof metadata.billable_minutes === 'number') details.push(`Минуты: ${metadata.billable_minutes}`)
  if (typeof metadata.reason === 'string') details.push(`Причина: ${metadata.reason}`)
  if (typeof metadata.comment === 'string') details.push(`Комментарий: ${metadata.comment}`)
  if (typeof metadata.name === 'string') details.push(`Название: ${metadata.name}`)
  if (typeof metadata.sku === 'string') details.push(`SKU: ${metadata.sku}`)

  return details
}

function buildFinanceDetails(log: FinanceAuditLogRow) {
  const details: string[] = []
  const afterData = asRecord(log.after_data)
  const amount = formatMoney(afterData.amount ?? afterData.accrued_amount ?? afterData.paid_amount)

  if (amount) details.push(`Сумма: ${amount}`)
  if (typeof afterData.title === 'string') details.push(`Название: ${afterData.title}`)
  if (typeof afterData.status === 'string') details.push(`Статус: ${afterData.status}`)
  if (typeof afterData.transaction_type === 'string') details.push(`Тип операции: ${afterData.transaction_type}`)
  if (log.reason) details.push(`Комментарий: ${log.reason}`)

  return details
}

function toActivityEvent(
  log: AuditLogRow,
  profiles: Map<string, Pick<ProfileRow, 'email' | 'full_name'>>,
): ActivityEvent {
  const metadata = asRecord(log.metadata)
  const actionLabel = actionLabels[log.action] ?? log.action
  const section = getSectionLabel(metadata.path)
  const entityLabel = entityLabels[log.entity_type] ?? log.entity_type
  const title =
    log.action === 'admin.section_viewed' && section
      ? `${getProfileName(log.actor_user_id ? profiles.get(log.actor_user_id) : undefined, log.actor_user_id)} открыл раздел “${section}”`
      : `${getProfileName(log.actor_user_id ? profiles.get(log.actor_user_id) : undefined, log.actor_user_id)} ${actionLabel}`

  return {
    id: `audit-${log.id}`,
    source: 'operations',
    organizationId: log.organization_id,
    actorUserId: log.actor_user_id,
    actorName: getProfileName(log.actor_user_id ? profiles.get(log.actor_user_id) : undefined, log.actor_user_id),
    action: log.action,
    entityType: entityLabel,
    entityId: log.entity_id,
    title,
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
    entityType: entityLabels[log.entity_type] ?? log.entity_type,
    entityId: log.entity_id,
    title: `${actorName} ${actionLabel}`,
    details: buildFinanceDetails(log),
    createdAt: log.created_at,
  }
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
          .limit(150),
        supabase
          .from('finance_audit_logs')
          .select(financeAuditSelect)
          .eq('organization_id', organizationId!)
          .order('created_at', { ascending: false })
          .limit(150),
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

      return [...auditLogs.map((log) => toActivityEvent(log, profiles)), ...financeLogs.map((log) => toFinanceActivityEvent(log, profiles))]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 200)
    },
  })
}
