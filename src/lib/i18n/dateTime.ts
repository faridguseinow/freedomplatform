import { getCurrentLocale } from './translator'

type DateValue = Date | string | number

function getParts(
  value: DateValue,
  options: Intl.DateTimeFormatOptions,
) {
  const parts = new Intl.DateTimeFormat(getCurrentLocale(), options).formatToParts(new Date(value))
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

export function formatNumericDate(value: DateValue, timeZone?: string) {
  const parts = getParts(value, {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  })
  return `${parts.day}.${parts.month}.${parts.year}`
}

export function formatNumericDateTime(value: DateValue, timeZone?: string) {
  const parts = getParts(value, {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  })
  return `${parts.day}.${parts.month}.${parts.year}, ${parts.hour}:${parts.minute}`
}

export function formatNumericTime(value: DateValue, timeZone?: string) {
  const parts = getParts(value, {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone,
  })
  return `${parts.hour}:${parts.minute}`
}

export function formatNumericMonthDay(value: DateValue, timeZone?: string) {
  const parts = getParts(value, { day: '2-digit', month: '2-digit', timeZone })
  return `${parts.day}.${parts.month}`
}

export function formatNumericMonthYear(value: DateValue, timeZone?: string) {
  const parts = getParts(value, { month: '2-digit', timeZone, year: 'numeric' })
  return `${parts.month}.${parts.year}`
}
