import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

type NotificationType =
  | 'shift_opened'
  | 'shift_closed'
  | 'shift_not_closed'
  | 'daily_summary'
  | 'cash_shortage'
  | 'cash_overage'
  | 'payment_refused'
  | 'adjustment_requested'
  | 'adjustment_reviewed'
  | 'low_stock'
  | 'custom'

type OutboxRow = {
  id: string
  organization_id: string
  type: NotificationType
  payload: Record<string, unknown>
  attempt_count: number
}

type NotificationSettings = {
  telegram_enabled: boolean
  telegram_chat_id: string | null
  notify_shift_opened: boolean
  notify_shift_closed: boolean
  notify_daily_summary: boolean
  notify_cash_variance: boolean
  notify_payment_refused: boolean
  notify_adjustment_requests: boolean
  notify_low_stock: boolean
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN')

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

const isEnabledForType = (settings: NotificationSettings, type: NotificationType) => {
  if (!settings.telegram_enabled || !settings.telegram_chat_id) return false
  if (type === 'shift_opened') return settings.notify_shift_opened
  if (type === 'shift_closed' || type === 'shift_not_closed') return settings.notify_shift_closed
  if (type === 'daily_summary') return settings.notify_daily_summary
  if (type === 'cash_shortage' || type === 'cash_overage') return settings.notify_cash_variance
  if (type === 'payment_refused') return settings.notify_payment_refused
  if (type === 'adjustment_requested' || type === 'adjustment_reviewed') {
    return settings.notify_adjustment_requests
  }
  if (type === 'low_stock') return settings.notify_low_stock
  return true
}

const pickValue = (value: unknown) => (value === null || value === undefined || value === '' ? '-' : String(value))

const limitTelegramMessage = (value: string) => value.slice(0, 3900)

const safeErrorMessage = (value: unknown) => {
  const message = value instanceof Error ? value.message : 'Unknown notification error'
  return message
    .replace(telegramToken ?? '', '[telegram-token]')
    .replace(/https:\/\/api\.telegram\.org\/bot[^/\s]+/g, 'https://api.telegram.org/bot[redacted]')
    .slice(0, 500)
}

const buildTelegramMessage = (row: OutboxRow) => {
  const payload = row.payload
  const summary = typeof payload.summary === 'object' && payload.summary ? payload.summary as Record<string, unknown> : {}
  const shift = typeof payload.shift === 'object' && payload.shift ? payload.shift as Record<string, unknown> : {}

  if (row.type === 'shift_opened') {
    return limitTelegramMessage([
      'Смена открыта',
      `Shift: ${pickValue(shift.id)}`,
      `Opening cash: ${pickValue(shift.opening_cash_amount)}`,
    ].join('\n'))
  }

  if (row.type === 'shift_closed') {
    return limitTelegramMessage([
      'Смена закрыта',
      `Shift: ${pickValue(shift.id)}`,
      `Paid: ${pickValue(summary.paid_orders_total)}`,
      `Cash: ${pickValue(summary.cash_sales_total)}`,
      `Card transfer: ${pickValue(summary.card_transfer_sales_total)}`,
      `Expected cash: ${pickValue(summary.expected_cash_amount)}`,
      `Actual cash: ${pickValue(shift.actual_cash_amount)}`,
      `Variance: ${pickValue(shift.cash_variance)}`,
    ].join('\n'))
  }

  if (row.type === 'daily_summary') {
    return limitTelegramMessage([
      'Итог операционного дня',
      `Date: ${pickValue(payload.business_date)}`,
      `Revenue: ${pickValue(payload.total_revenue)}`,
      `Cash: ${pickValue(payload.cash_revenue)}`,
      `Card transfer: ${pickValue(payload.card_transfer_revenue)}`,
      `Orders: ${pickValue(payload.total_orders)}`,
    ].join('\n'))
  }

  if (row.type === 'cash_shortage' || row.type === 'cash_overage') {
    return limitTelegramMessage([
      row.type === 'cash_shortage' ? 'Недостача наличных' : 'Излишек наличных',
      `Shift: ${pickValue(shift.id)}`,
      `Variance: ${pickValue(shift.cash_variance)}`,
    ].join('\n'))
  }

  if (row.type === 'shift_not_closed') {
    return limitTelegramMessage(['Смена не закрыта вовремя', `Shift: ${pickValue(shift.id)}`].join('\n'))
  }

  return limitTelegramMessage(
    [`Freedom Platform notification: ${row.type}`, JSON.stringify(payload, null, 2)].join('\n'),
  )
}

const sendTelegram = async (chatId: string, text: string) => {
  if (!telegramToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured.')
  }

  const response = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Telegram API error ${response.status}: ${body.slice(0, 300)}`)
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const { data: rows, error } = await supabase.rpc('claim_notification_outbox', {
    target_batch_size: 20,
    target_processing_timeout_minutes: 10,
  })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  let sent = 0
  let failed = 0

  for (const row of rows as OutboxRow[]) {
    try {
      const { data: settings, error: settingsError } = await supabase
        .from('organization_notification_settings')
        .select(
          'telegram_enabled,telegram_chat_id,notify_shift_opened,notify_shift_closed,notify_daily_summary,notify_cash_variance,notify_payment_refused,notify_adjustment_requests,notify_low_stock',
        )
        .eq('organization_id', row.organization_id)
        .maybeSingle()

      if (settingsError) throw new Error(settingsError.message)

      if (!settings || !isEnabledForType(settings as NotificationSettings, row.type)) {
        await supabase.rpc('finish_notification_outbox_item', {
          target_outbox_id: row.id,
          target_success: true,
          target_error: null,
          target_cancelled: true,
        })
        continue
      }

      await sendTelegram((settings as NotificationSettings).telegram_chat_id!, buildTelegramMessage(row))
      await supabase.rpc('finish_notification_outbox_item', {
        target_outbox_id: row.id,
        target_success: true,
        target_error: null,
        target_cancelled: false,
      })
      sent += 1
    } catch (nextError) {
      await supabase.rpc('finish_notification_outbox_item', {
        target_outbox_id: row.id,
        target_success: false,
        target_error: safeErrorMessage(nextError),
        target_cancelled: false,
      })
      failed += 1
    }
  }

  return Response.json({ processed: rows.length, sent, failed })
})
