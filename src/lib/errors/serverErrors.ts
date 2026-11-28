import i18n from '../i18n/i18n'
import { getCurrentLocale } from '../i18n/translator'
import { getStoredSystemLanguage } from '../i18n/translations'
import { SERVER_ERROR_EXACT, SERVER_ERROR_GENERIC, SERVER_ERROR_PATTERNS } from './serverErrorCatalog'

/**
 * Перевод ошибок сервера (тексты из `raise exception` в базе, ошибки Postgres и сети)
 * на текущий язык интерфейса: AZ, RU или EN.
 * Неизвестная ошибка возвращается как есть.
 */

const formatParam = (value: string) => {
  const trimmed = value.trim()
  // Числа вида 0.000 или 12.500 показываем по-человечески: 0, 12,5
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return new Intl.NumberFormat(getCurrentLocale(), { maximumFractionDigits: 3 }).format(Number(trimmed))
  }
  return trimmed
}

export function translateServerError(rawMessage: string): string {
  const message = rawMessage.trim()
  if (!message) return rawMessage
  const lng = getStoredSystemLanguage()

  const exactKey = SERVER_ERROR_EXACT[message]
  if (exactKey && i18n.exists(exactKey, { lng })) {
    return String(i18n.t(exactKey, { lng }))
  }

  for (const [pattern, key] of SERVER_ERROR_PATTERNS) {
    const match = pattern.exec(message)
    if (!match) continue
    const params = Object.fromEntries(match.slice(1).map((value, index) => [`p${index + 1}`, formatParam(value)]))
    return String(i18n.t(key, { ...params, lng, interpolation: { escapeValue: false } }))
  }

  for (const [pattern, key] of SERVER_ERROR_GENERIC) {
    if (pattern.test(message)) return String(i18n.t(key, { lng }))
  }

  return rawMessage
}

/** Ошибка сервера: `message` уже переведён, исходный текст хранится в `rawMessage`. */
export class ServerError extends Error {
  readonly rawMessage: string

  constructor(rawMessage: string) {
    super(translateServerError(rawMessage))
    this.name = 'ServerError'
    this.rawMessage = rawMessage
  }
}

/** Использовать вместо `new Error(error.message)` для ошибок Supabase. */
export const toServerError = (error: { message: string }) => new ServerError(error.message)

/** Исходный (английский) текст ошибки — для проверок вида `includes('...')`. */
export const getRawErrorMessage = (error: unknown) =>
  error instanceof ServerError ? error.rawMessage : error instanceof Error ? error.message : ''
