import { Timer } from 'lucide-react'
import { memo, type CSSProperties } from 'react'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { useNow } from '../../../hooks/useNow'
import { useI18n } from '../../../lib/i18n/I18nContext'
import type { EmployeeWorkspacePlaceRow } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import { isTablePlace } from '../../places/workspaceLayout'
import {
  formatVipEquipmentSummary,
  getSlotClassName,
  getStatusIndicatorClassName,
  isVipEquipmentPlace,
  placeStatus,
} from './placeVisuals'
import {
  calculateCurrentSessionAmount,
  formatAzn,
  formatElapsed,
  formatTimedSessionElapsed,
  getSessionGraceNotice,
  getSessionLimitInfo,
} from './sessionTiming'

type WorkspacePlaceCardProps = {
  place: EmployeeWorkspacePlaceRow
  gridColumn: CSSProperties['gridColumn']
  gridRow: CSSProperties['gridRow']
  comboGiftMinutes: number
  hasSessionLimitAlert: boolean
  canOpenPlace: boolean
  customerLabel: string
  onActivate: (place: EmployeeWorkspacePlaceRow) => void
}

/**
 * Карточка места на рабочей схеме.
 * Подписана на часы только пока на месте идёт сессия или открыт стол,
 * поэтому свободные места не перерисовываются каждую секунду.
 */
export const WorkspacePlaceCard = memo(function WorkspacePlaceCard({
  canOpenPlace,
  comboGiftMinutes,
  customerLabel,
  gridColumn,
  gridRow,
  hasSessionLimitAlert,
  onActivate,
  place,
}: WorkspacePlaceCardProps) {
  const { t } = useI18n()
  const status = placeStatus(place)
  const isTable = isTablePlace(place)
  const hasActiveSession = Boolean(place.active_session_id)
  const hasActiveOrder = Boolean(place.active_order_id)
  const isSessionRunning = hasActiveSession && !place.active_session_paused_at
  const occupancyStartedAt = hasActiveSession
    ? place.active_session_started_at
    : isTable && hasActiveOrder
      ? place.active_order_opened_at
      : null
  const nowMs = useNow(Boolean(occupancyStartedAt))
  const sessionAmount = calculateCurrentSessionAmount(place, nowMs, comboGiftMinutes)
  const sessionGraceNotice = getSessionGraceNotice(place, nowMs)
  const sessionLimitInfo = getSessionLimitInfo(place, nowMs)
  const vipEquipmentSummary = isVipEquipmentPlace(place) ? formatVipEquipmentSummary(place) : null
  const isAttention = Boolean(hasSessionLimitAlert || sessionLimitInfo?.isWarning || sessionLimitInfo?.isExpired)

  return (
    <article
      className={cn(
        getSlotClassName(place, isAttention),
        'workspace-slot min-h-40 md:min-h-0 md:[grid-column:var(--workspace-grid-column)] md:[grid-row:var(--workspace-grid-row)]',
        canOpenPlace && 'cursor-pointer',
        (hasSessionLimitAlert || sessionLimitInfo?.isExpired) && 'workspace-slot-attention',
        hasActiveOrder || hasActiveSession ? 'order-first md:order-none' : 'order-last md:order-none',
      )}
      onClick={() => onActivate(place)}
      onKeyDown={(event) => {
        if (canOpenPlace && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onActivate(place)
        }
      }}
      role={canOpenPlace ? 'button' : undefined}
      style={{
        '--workspace-grid-column': gridColumn,
        '--workspace-grid-row': gridRow,
      } as CSSProperties}
      tabIndex={canOpenPlace ? 0 : undefined}
    >
      <div className="grid gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <CatalogImage alt={place.name} className="size-8 rounded-full" imagePath={place.image_path} placeType={place.type} />
            <h3 className="line-clamp-2 min-w-0 break-words text-xs font-semibold leading-tight text-slate-950 sm:text-sm">
              {place.name}
            </h3>
          </div>
          <span
            aria-label={status}
            className={cn(getStatusIndicatorClassName(status), isSessionRunning && 'status-dot-live')}
            role="img"
            title={status}
          />
        </div>

        <div className="grid gap-0.5 text-[11px] leading-4 text-slate-600 sm:text-xs">
          {vipEquipmentSummary ? (
            <span className="font-semibold text-emerald-800">{vipEquipmentSummary}</span>
          ) : null}
          {occupancyStartedAt ? (
            <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-red-900">
              <Timer className="size-3.5" />
              {hasActiveSession ? formatTimedSessionElapsed(place, nowMs) : formatElapsed(occupancyStartedAt, nowMs)}
              {place.active_session_paused_at ? ` · ${t('session.pausedShort')}` : null}
            </span>
          ) : (
            <span>{isTable ? 'Стол' : place.has_timer ? 'Сессия не начата' : 'Без таймера'}</span>
          )}
          <span>
            {hasActiveOrder
              ? `#${place.active_order_number} · ${t('order.itemCountShort', { count: place.active_order_item_count })}`
              : 'Заказ не открыт'}
          </span>
          <span className="font-semibold tabular-nums text-slate-950">
            {formatAzn((place.active_order_total ?? 0) + sessionAmount)}
          </span>
          {sessionGraceNotice ? (
            <span className="font-medium text-orange-700">{sessionGraceNotice}</span>
          ) : null}
          {hasSessionLimitAlert ? (
            <span className="text-[9px] font-semibold leading-[11px] text-red-800 sm:text-[10px]">
              {t('session.limitEndedAcknowledge')}
            </span>
          ) : sessionLimitInfo ? (
            <span
              className={cn(
                'font-semibold tabular-nums',
                sessionLimitInfo.isExpired ? 'text-red-800' : 'text-orange-700',
              )}
            >
              {sessionLimitInfo.isExpired
                ? t('ui.limit_istek_a337232')
                : comboGiftMinutes > 0
                  ? t('session.giftTimeRemaining', { time: sessionLimitInfo.remainingText })
                  : `${t('ui.ostalos_76a8eb1')}: ${sessionLimitInfo.remainingText}`}
            </span>
          ) : null}
        </div>
      </div>

      {customerLabel ? (
        <div
          className={cn(
            '-mx-2 -mb-2 mt-1 flex min-h-6 items-center justify-center border-t-2 px-2 py-0.5 text-center text-[10px] font-semibold leading-3 text-slate-800 sm:text-[11px]',
            place.active_order_status === 'waiting_payment'
              ? 'border-orange-400/50'
              : hasActiveOrder || hasActiveSession
                ? 'border-red-400/50'
                : 'border-slate-300/50',
          )}
          title={customerLabel}
        >
          <span className="min-w-0 truncate">{customerLabel}</span>
        </div>
      ) : null}
    </article>
  )
})
