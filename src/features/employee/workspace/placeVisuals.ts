import type { EmployeeWorkspacePlaceRow } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { normalizePlaceName } from '../../places/workspaceLayout'

/** Статус и оформление карточки места на рабочей схеме. */

export const isVipEquipmentPlace = (place: EmployeeWorkspacePlaceRow | null) => {
  if (!place) return false
  const name = normalizePlaceName(place.name)
  return place.type === 'vip_room' || place.type === 'private_room' || name.includes('vip')
}

export const formatVipEquipmentSummary = (place: EmployeeWorkspacePlaceRow | null) => {
  if (!place?.vip_equipment_name && !place?.vip_equipment_time && !place?.vip_equipment_price) return null
  return [place.vip_equipment_name, place.vip_equipment_time, place.vip_equipment_price].filter(Boolean).join(' · ')
}

export const placeStatus = (place: EmployeeWorkspacePlaceRow) => {
  if (place.status !== 'active') return 'Недоступно'
  if (place.active_order_status === 'waiting_payment') return 'Ожидает оплаты'
  if (place.active_order_id || place.active_session_id) return 'Занято'
  return 'Свободно'
}

export const getStatusIndicatorClassName = (status: ReturnType<typeof placeStatus>) =>
  cn(
    'size-2.5 shrink-0 rounded-full ring-2',
    status === 'Свободно' && 'bg-emerald-500 ring-emerald-100',
    status === 'Занято' && 'bg-red-500 ring-red-100',
    status === 'Ожидает оплаты' && 'bg-orange-500 ring-orange-100',
    status === 'Недоступно' && 'bg-slate-400 ring-slate-100',
  )

export const getSlotClassName = (place: EmployeeWorkspacePlaceRow, hasSessionLimitAlert = false) =>
  cn(
    'group relative grid min-h-0 content-between overflow-hidden rounded-lg border p-2 text-left shadow-sm transition',
    'focus-within:ring-2 focus-within:ring-emerald-700 hover:brightness-[0.98]',
    place.active_order_id || place.active_session_id
      ? 'workspace-slot-occupied border-red-200 bg-red-50/70'
      : 'border-slate-200 bg-white hover:border-emerald-200',
    place.active_order_status === 'waiting_payment' && 'workspace-slot-waiting border-orange-200 bg-orange-50',
    hasSessionLimitAlert && 'workspace-slot-alert border-red-400 bg-red-100 ring-2 ring-red-200',
    place.status !== 'active' && 'border-slate-200 bg-slate-100 opacity-70',
  )

