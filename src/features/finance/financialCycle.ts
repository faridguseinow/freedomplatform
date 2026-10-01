type PeriodBoundary = {
  period_end: string
  status: string
}

const finalizedStatuses = new Set(['approved', 'locked'])
const activeStatuses = new Set(['open', 'submitted', 'clarification_requested', 'approved', 'locked'])

function parseDate(value: string) {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addCalendarDays(value: string, days: number) {
  const date = parseDate(value)
  date.setDate(date.getDate() + days)
  return formatDate(date)
}

export function getCalendarMonthStart(value: string) {
  const date = parseDate(value)
  return formatDate(new Date(date.getFullYear(), date.getMonth(), 1))
}

export function getCalendarMonthEnd(value: string) {
  const date = parseDate(value)
  return formatDate(new Date(date.getFullYear(), date.getMonth() + 1, 0))
}

function latestPeriodEnd(periods: PeriodBoundary[], statuses: Set<string>) {
  return periods
    .filter((period) => statuses.has(period.status))
    .reduce<string | null>(
      (latest, period) => (!latest || period.period_end > latest ? period.period_end : latest),
      null,
    )
}

export function getCurrentFinancialCycle(periods: PeriodBoundary[], currentDate: string) {
  const lastFinalizedEnd = latestPeriodEnd(periods, finalizedStatuses)
  const start = lastFinalizedEnd
    ? addCalendarDays(lastFinalizedEnd, 1)
    : getCalendarMonthStart(currentDate)

  return {
    end: getCalendarMonthEnd(start),
    start,
    toDate: currentDate < start ? start : currentDate,
  }
}

export function getNextFinancialPeriodRange(periods: PeriodBoundary[], currentDate: string) {
  const lastActiveEnd = latestPeriodEnd(periods, activeStatuses)
  const previousMonthDate = addCalendarDays(getCalendarMonthStart(currentDate), -1)
  const start = lastActiveEnd
    ? addCalendarDays(lastActiveEnd, 1)
    : getCalendarMonthStart(previousMonthDate)
  const end = getCalendarMonthEnd(start)

  return {
    end,
    isReady: end < currentDate,
    start,
  }
}
