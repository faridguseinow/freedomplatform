import type { EmployeeWorkspacePlaceRow } from '../../../lib/supabase/database.types'
import { getCurrentLocale } from '../../../lib/i18n/translator'

/** Расчёт времени и стоимости сессий рабочего места (чистые функции, без React). */

export const BILLING_GRACE_MINUTES = 10
export const SESSION_LIMIT_WARNING_MINUTES = 10
export const formatElapsed = (startedAt: string | null, nowMs: number) => {
  if (!startedAt) return '00:00'
  const totalSeconds = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export const getTimedSessionElapsedMs = (place: EmployeeWorkspacePlaceRow, nowMs: number) => {
  if (!place.active_session_started_at) return 0
  const startedAtMs = new Date(place.active_session_started_at).getTime()
  const storedPausedMs = (place.active_session_total_paused_seconds ?? 0) * 1000
  const currentPauseMs = place.active_session_paused_at
    ? Math.max(0, nowMs - new Date(place.active_session_paused_at).getTime())
    : 0
  return Math.max(0, nowMs - startedAtMs - storedPausedMs - currentPauseMs)
}

export const formatTimedSessionElapsed = (place: EmployeeWorkspacePlaceRow, nowMs: number) => {
  const effectiveStartedAt = nowMs - getTimedSessionElapsedMs(place, nowMs)
  return formatElapsed(new Date(effectiveStartedAt).toISOString(), nowMs)
}

export const formatRemainingMs = (remainingMs: number) => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export const getSessionLimitInfo = (place: EmployeeWorkspacePlaceRow | null, nowMs: number) => {
  if (!place?.active_session_started_at || !place.active_session_planned_minutes) return null
  const remainingMs = place.active_session_planned_minutes * 60_000 - getTimedSessionElapsedMs(place, nowMs)
  return {
    endMs: nowMs + remainingMs,
    isExpired: remainingMs <= 0,
    isWarning: remainingMs > 0 && remainingMs <= SESSION_LIMIT_WARNING_MINUTES * 60_000,
    remainingMs,
    remainingText: formatRemainingMs(remainingMs),
  }
}

export const calculateCurrentSessionAmount = (
  place: EmployeeWorkspacePlaceRow,
  nowMs: number,
  includedMinutes = 0,
) => {
  if (!place.active_session_started_at || !place.active_session_hourly_rate) return 0
  const actualMinutes = Math.max(1, Math.ceil(getTimedSessionElapsedMs(place, nowMs) / 60_000))
  const minimum = place.active_session_minimum_minutes ?? 60
  const step = place.active_session_billing_step_minutes ?? 30
  const billable =
    actualMinutes <= minimum + BILLING_GRACE_MINUTES
      ? minimum
      : minimum + Math.ceil((actualMinutes - minimum - BILLING_GRACE_MINUTES) / step) * step
  const chargeableMinutes = Math.max(0, billable - includedMinutes)
  return (place.active_session_hourly_rate * chargeableMinutes) / 60
}

export const getSessionGraceNotice = (place: EmployeeWorkspacePlaceRow, nowMs: number) => {
  if (!place.active_session_started_at || !place.active_session_hourly_rate) return null
  const actualMinutes = Math.max(1, Math.ceil(getTimedSessionElapsedMs(place, nowMs) / 60_000))
  const minimum = place.active_session_minimum_minutes ?? 60
  const step = place.active_session_billing_step_minutes ?? 30

  if (actualMinutes <= minimum) return null

  const minutesAfterMinimum = actualMinutes - minimum
  const minutesAfterLastBoundary = ((minutesAfterMinimum - 1) % step) + 1

  return minutesAfterLastBoundary <= BILLING_GRACE_MINUTES ? BILLING_GRACE_MINUTES : null
}


export const formatMoney = (value: number | null | undefined) =>
  new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 2 }).format(value ?? 0)

export const formatAzn = (value: number | null | undefined) => `${formatMoney(value)} AZN`
