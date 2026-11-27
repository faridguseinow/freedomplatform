import { getCurrentCurrencyCode } from '../../../../lib/money/currency'
import { getCurrentLocale } from '../../../../lib/i18n/translator'
export const formatAzn = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-'
  try {
    return new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 2 }).format(value) + ' ' + getCurrentCurrencyCode()
  } catch {
    return String(value)
  }
}

export default formatAzn
