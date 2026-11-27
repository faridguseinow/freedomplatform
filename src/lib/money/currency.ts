import { getCurrentLocale } from '../i18n/translator'

export const DEFAULT_CURRENCY_CODE = 'AZN'

let currentCurrencyCode = DEFAULT_CURRENCY_CODE

const normalizeCurrencyCode = (value: string | null | undefined) => {
  const code = String(value ?? '').trim().toUpperCase()
  return code || DEFAULT_CURRENCY_CODE
}

/** Sets the currency of the organization the user is currently working in. */
export function setCurrentCurrencyCode(value: string | null | undefined) {
  currentCurrencyCode = normalizeCurrencyCode(value)
}

export function getCurrentCurrencyCode() {
  return currentCurrencyCode
}

export function formatAmount(value: number | string | null | undefined) {
  const amount = Number(value ?? 0)
  try {
    return new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 2 }).format(
      Number.isFinite(amount) ? amount : 0,
    )
  } catch {
    return String(value ?? 0)
  }
}

/** Formats an amount with the current organization's currency code, e.g. "12,5 AZN". */
export function formatCurrency(value: number | string | null | undefined, currencyCode?: string | null) {
  return `${formatAmount(value)} ${currencyCode ? normalizeCurrencyCode(currencyCode) : currentCurrencyCode}`
}
