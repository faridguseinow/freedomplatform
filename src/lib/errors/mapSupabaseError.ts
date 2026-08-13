import { translateByCurrentLanguage } from '../i18n/translator'

type SupabaseLikeError = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

const technicalPatterns = [
  /schema/i,
  /relation "public\./i,
  /function public\./i,
  /SQL statement/i,
  /PL\/pgSQL/i,
  /violates row-level security/i,
]

const messageRules: Array<[RegExp, string]> = [
  [/not enough available stock|not enough stock/i, 'Недостаточно остатка на складе.'],
  [/place already has an active timed session|session already active/i, 'На этом месте уже запущена активная сессия.'],
  [/order already has completed payment|order already paid/i, 'Этот заказ уже оплачен.'],
  [/employee already has an open shift|shift already open/i, 'У сотрудника уже открыта смена.'],
  [/locked financial period|period locked|locked period/i, 'Финансовый период закрыт и не может быть изменён.'],
  [/duplicate notification|deduplication/i, 'Такое уведомление уже создано.'],
  [/row-level security|insufficient privilege|permission denied/i, 'Недостаточно прав для этого действия.'],
  [/foreign key/i, 'Связанная запись не найдена или недоступна.'],
  [/unique/i, 'Такая запись уже существует.'],
  [/check constraint|violates check/i, 'Проверьте значения в форме.'],
]

const codeMessages: Record<string, string> = {
  '23505': 'Такая запись уже существует.',
  '23503': 'Связанная запись не найдена или недоступна.',
  '23514': 'Проверьте значения в форме.',
  '42501': 'Недостаточно прав для этого действия.',
  PGRST301: 'Сессия истекла. Войдите снова.',
}

export function mapSupabaseError(error: unknown, fallback = 'Не удалось выполнить действие.') {
  const source = error as SupabaseLikeError
  const rawMessage = source?.message ?? (error instanceof Error ? error.message : '')
  const rawCode = source?.code

  if (import.meta.env.DEV) {
    console.error('[Freedom Platform] Supabase error:', error)
  }

  if (rawCode && codeMessages[rawCode]) {
    return translateByCurrentLanguage(codeMessages[rawCode])
  }

  for (const [pattern, message] of messageRules) {
    if (pattern.test(rawMessage)) return translateByCurrentLanguage(message)
  }

  if (!rawMessage || technicalPatterns.some((pattern) => pattern.test(rawMessage))) {
    return translateByCurrentLanguage(fallback)
  }

  return translateByCurrentLanguage(rawMessage.replace(/\([0-9a-f-]{36}\)/gi, '').trim())
}

export function throwMappedSupabaseError(error: unknown, fallback?: string): never {
  throw new Error(mapSupabaseError(error, fallback))
}
