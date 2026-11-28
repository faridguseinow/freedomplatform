import { Hourglass, Timer } from 'lucide-react'
import { memo } from 'react'
import { useNow } from '../../../hooks/useNow'
import { useI18n } from '../../../lib/i18n/I18nContext'
import type { EmployeeWorkspacePlaceRow } from '../../../lib/supabase/database.types'
import { cn } from '../../../lib/utils/cn'
import {
  calculateCurrentSessionAmount,
  formatAzn,
  formatElapsed,
  formatTimedSessionElapsed,
  getSessionGraceNotice,
  getSessionLimitInfo,
} from './sessionTiming'

/*
 * Маленькие «живые» блоки с таймером. Каждую секунду перерисовываются только они,
 * а не вся карточка заказа с каталогом и оплатой.
 */

const timeBoxClass =
  'ml-auto shrink-0 rounded-md border border-cyan-100 bg-cyan-50 px-2 py-1 text-right text-xs text-cyan-900 md:px-2.5 md:py-1.5 md:text-sm'

type LiveSessionTimeBoxProps = {
  place: EmployeeWorkspacePlaceRow
  comboGiftMinutes: number
  isSessionPaused: boolean
}

export const LiveSessionTimeBox = memo(function LiveSessionTimeBox({
  comboGiftMinutes,
  isSessionPaused,
  place,
}: LiveSessionTimeBoxProps) {
  const { t } = useI18n()
  const nowMs = useNow(true)
  const hasComboGiftTime = comboGiftMinutes > 0
  const graceNotice = getSessionGraceNotice(place, nowMs)
  const limitInfo = getSessionLimitInfo(place, nowMs)

  return (
    <div className={timeBoxClass}>
      {hasComboGiftTime && limitInfo ? (
        <div
          className={cn(
            'flex items-center justify-end gap-1.5 font-semibold tabular-nums',
            limitInfo.isExpired ? 'text-red-800' : 'text-emerald-800',
          )}
        >
          <Hourglass className="size-3.5 md:size-4" />
          {limitInfo.isExpired
            ? t('ui.limit_istek_a337232')
            : t('session.giftTimeRemaining', { time: limitInfo.remainingText })}
        </div>
      ) : (
        <div className="flex items-center justify-end gap-1.5 font-semibold tabular-nums">
          <Timer className="size-3.5 md:size-4" />
          {formatTimedSessionElapsed(place, nowMs)}
        </div>
      )}
      <div className="mt-0.5 hidden text-xs tabular-nums md:block">
        {hasComboGiftTime ? `${t('session.elapsed', { time: formatTimedSessionElapsed(place, nowMs) })} · ` : null}
        {isSessionPaused ? t('session.paused') : t('session.currentAmount')}:{' '}
        {formatAzn(calculateCurrentSessionAmount(place, nowMs, comboGiftMinutes))}
      </div>
      {graceNotice ? (
        <div className="mt-0.5 hidden text-xs font-semibold text-orange-700 md:block">
          {t('session.graceRemaining', { minutes: graceNotice })}
        </div>
      ) : null}
      {limitInfo && !hasComboGiftTime ? (
        <div
          className={cn(
            'mt-0.5 hidden text-xs font-semibold tabular-nums md:block',
            limitInfo.isExpired ? 'text-red-800' : 'text-orange-700',
          )}
        >
          {limitInfo.isExpired
            ? t('ui.limit_istek_a337232')
            : `${t('ui.ostalos_76a8eb1')}: ${limitInfo.remainingText}`}
        </div>
      ) : null}
    </div>
  )
})

export const LiveTableTimeBox = memo(function LiveTableTimeBox({ openedAt }: { openedAt: string }) {
  const { t } = useI18n()
  const nowMs = useNow(true)

  return (
    <div className={timeBoxClass}>
      <div className="flex items-center justify-end gap-1.5 font-semibold tabular-nums">
        <Timer className="size-3.5 md:size-4" />
        {formatElapsed(openedAt, nowMs)}
      </div>
      <div className="mt-0.5 hidden text-xs md:block">{t('session.tableOpen')}</div>
    </div>
  )
})

/** Сумма заказа места вместе с текущей стоимостью сессии. */
export const LivePlaceTotal = memo(function LivePlaceTotal({
  className,
  place,
}: {
  className?: string
  place: EmployeeWorkspacePlaceRow
}) {
  const nowMs = useNow(Boolean(place.active_session_id))
  return (
    <span className={cn('tabular-nums', className)}>
      {formatAzn((place.active_order_total ?? 0) + calculateCurrentSessionAmount(place, nowMs))}
    </span>
  )
})
