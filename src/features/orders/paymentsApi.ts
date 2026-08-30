import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type { PaymentMethod, PaymentRow, PlaceType } from '../../lib/supabase/database.types'

export function usePaymentMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async (orderId: string) => {
    await queryClient.invalidateQueries({ queryKey: ['employee', 'workspace', organizationId] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'orders', organizationId] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'order-detail', orderId] })
  }

  return {
    complete: useMutation({
      mutationFn: async ({ orderId, method }: { orderId: string; method: PaymentMethod }) => {
        const { data, error } = await supabase.rpc('complete_order_payment', {
          target_order_id: orderId,
          target_method: method,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (order) => invalidate(order.id),
    }),
    refuse: useMutation({
      mutationFn: async ({ orderId, comment }: { orderId: string; comment: string }) => {
        const { data, error } = await supabase.rpc('mark_order_payment_refused', {
          target_order_id: orderId,
          target_comment: comment,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (order) => invalidate(order.id),
    }),
  }
}

export function usePaymentsForDate(organizationId: string | null, date: string) {
  return useQuery({
    enabled: Boolean(organizationId && date),
    queryKey: ['payments', 'by-date', organizationId, date],
    queryFn: async () => {
      const start = `${date}T00:00:00Z`
      const next = new Date(date)
      next.setDate(next.getDate() + 1)
      const nextStr = `${next.toISOString().slice(0, 10)}T00:00:00Z`

      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('organization_id', organizationId!)
        .eq('status', 'completed')
        .gte('completed_at', start)
        .lt('completed_at', nextStr)

      if (error) throw new Error(error.message)
      return data as PaymentRow[]
    },
  })
}

function getDateRange(dateStart: string, dateEnd = dateStart) {
  const next = new Date(dateEnd)
  next.setDate(next.getDate() + 1)

  return {
    start: `${dateStart}T00:00:00Z`,
    end: `${next.toISOString().slice(0, 10)}T00:00:00Z`,
  }
}

const minutesBetween = (startMs: number, endMs: number) => Math.max(0, (endMs - startMs) / 60_000)

const getTimeGroup = (type: PlaceType | string | null | undefined) => {
  if (type === 'playstation' || type === 'vip_room' || type === 'private_room') return 'playstation'
  if (type === 'billiard') return 'billiard'
  if (type === 'table') return 'tables'
  return null
}

export type UsageHoursBreakdown = {
  playstation: number
  billiard: number
  tables: number
  total: number
}

const emptyUsageHours: UsageHoursBreakdown = { billiard: 0, playstation: 0, tables: 0, total: 0 }

export function useUsageHoursBreakdown(
  organizationId: string | null,
  dateStart: string | null,
  dateEnd: string | null,
) {
  return useQuery({
    enabled: Boolean(organizationId && dateStart && dateEnd),
    queryKey: ['usage-hours-breakdown', organizationId, dateStart, dateEnd],
    queryFn: async () => {
      const range = getDateRange(dateStart!, dateEnd!)
      const rangeStartMs = new Date(range.start).getTime()
      const rangeEndMs = new Date(range.end).getTime()
      const nowMs = Date.now()
      const effectiveRangeEndMs = Math.min(rangeEndMs, nowMs)

      const [sessionsResult, ordersResult, placesResult] = await Promise.all([
        supabase
          .from('timed_sessions')
          .select('place_id,started_at,ended_at,status,actual_minutes')
          .eq('organization_id', organizationId!)
          .lt('started_at', range.end)
          .or(`ended_at.gte.${range.start},ended_at.is.null`)
          .limit(10000),
        supabase
          .from('orders')
          .select('place_id,opened_at,closed_at,status')
          .eq('organization_id', organizationId!)
          .lt('opened_at', range.end)
          .or(`closed_at.gte.${range.start},closed_at.is.null`)
          .limit(10000),
        supabase
          .from('places')
          .select('id,type')
          .eq('organization_id', organizationId!)
          .limit(10000),
      ])

      if (sessionsResult.error) throw new Error(sessionsResult.error.message)
      if (ordersResult.error) throw new Error(ordersResult.error.message)
      if (placesResult.error) throw new Error(placesResult.error.message)

      const placeTypes = new Map((placesResult.data ?? []).map((place) => [place.id, place.type]))
      const result: UsageHoursBreakdown = { ...emptyUsageHours }

      for (const session of sessionsResult.data ?? []) {
        const group = getTimeGroup(placeTypes.get(session.place_id))
        if (group !== 'playstation' && group !== 'billiard') continue
        const startedMs = new Date(session.started_at).getTime()
        const endedMs = session.ended_at ? new Date(session.ended_at).getTime() : nowMs
        result[group] += minutesBetween(Math.max(startedMs, rangeStartMs), Math.min(endedMs, effectiveRangeEndMs)) / 60
      }

      for (const order of ordersResult.data ?? []) {
        if (!order.place_id || order.status === 'cancelled') continue
        const group = getTimeGroup(placeTypes.get(order.place_id))
        if (group !== 'tables') continue
        const openedMs = new Date(order.opened_at).getTime()
        const closedMs = order.closed_at ? new Date(order.closed_at).getTime() : nowMs
        result.tables += minutesBetween(Math.max(openedMs, rangeStartMs), Math.min(closedMs, effectiveRangeEndMs)) / 60
      }

      result.playstation = Number(result.playstation.toFixed(2))
      result.billiard = Number(result.billiard.toFixed(2))
      result.tables = Number(result.tables.toFixed(2))
      result.total = Number((result.playstation + result.billiard + result.tables).toFixed(2))
      return result
    },
  })
}

export function useUsageHoursBreakdownByShiftIds(organizationId: string | null, shiftIds: string[]) {
  const shiftKey = shiftIds.join(',')

  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['usage-hours-breakdown-by-shifts', organizationId, shiftKey],
    queryFn: async () => {
      if (!shiftIds.length) return { ...emptyUsageHours }

      const shiftFilter = `(${shiftIds.join(',')})`
      const [sessionsResult, ordersResult, placesResult] = await Promise.all([
        supabase
          .from('timed_sessions')
          .select('place_id,started_at,ended_at,status,started_shift_id,ended_shift_id')
          .eq('organization_id', organizationId!)
          .or(`started_shift_id.in.${shiftFilter},ended_shift_id.in.${shiftFilter}`)
          .limit(10000),
        supabase
          .from('orders')
          .select('place_id,opened_at,closed_at,status,opened_shift_id,closed_shift_id')
          .eq('organization_id', organizationId!)
          .or(`opened_shift_id.in.${shiftFilter},closed_shift_id.in.${shiftFilter}`)
          .limit(10000),
        supabase
          .from('places')
          .select('id,type')
          .eq('organization_id', organizationId!)
          .limit(10000),
      ])

      if (sessionsResult.error) throw new Error(sessionsResult.error.message)
      if (ordersResult.error) throw new Error(ordersResult.error.message)
      if (placesResult.error) throw new Error(placesResult.error.message)

      const nowMs = Date.now()
      const placeTypes = new Map((placesResult.data ?? []).map((place) => [place.id, place.type]))
      const result: UsageHoursBreakdown = { ...emptyUsageHours }

      for (const session of sessionsResult.data ?? []) {
        const group = getTimeGroup(placeTypes.get(session.place_id))
        if (group !== 'playstation' && group !== 'billiard') continue
        const startedMs = new Date(session.started_at).getTime()
        const endedMs = session.ended_at ? new Date(session.ended_at).getTime() : nowMs
        result[group] += minutesBetween(startedMs, endedMs) / 60
      }

      for (const order of ordersResult.data ?? []) {
        if (!order.place_id || order.status === 'cancelled') continue
        const group = getTimeGroup(placeTypes.get(order.place_id))
        if (group !== 'tables') continue
        const openedMs = new Date(order.opened_at).getTime()
        const closedMs = order.closed_at ? new Date(order.closed_at).getTime() : nowMs
        result.tables += minutesBetween(openedMs, closedMs) / 60
      }

      result.playstation = Number(result.playstation.toFixed(2))
      result.billiard = Number(result.billiard.toFixed(2))
      result.tables = Number(result.tables.toFixed(2))
      result.total = Number((result.playstation + result.billiard + result.tables).toFixed(2))
      return result
    },
  })
}

export type PaymentMethodSummary = {
  cash: number
  card: number
  total: number
}

const emptyPaymentMethodSummary: PaymentMethodSummary = { card: 0, cash: 0, total: 0 }

export function usePaymentMethodSummary(
  organizationId: string | null,
  dateStart: string,
  dateEnd: string,
) {
  return useQuery({
    enabled: Boolean(organizationId && dateStart && dateEnd),
    queryKey: ['payments', 'method-summary', organizationId, dateStart, dateEnd],
    queryFn: async () => {
      const range = getDateRange(dateStart, dateEnd)
      const { data, error } = await supabase
        .from('payments')
        .select('amount,method')
        .eq('organization_id', organizationId!)
        .eq('status', 'completed')
        .gte('completed_at', range.start)
        .lt('completed_at', range.end)
        .limit(10000)

      if (error) throw new Error(error.message)

      return (data ?? []).reduce<PaymentMethodSummary>(
        (summary, payment) => {
          const amount = payment.amount ?? 0
          summary.total += amount
          if (payment.method === 'cash') summary.cash += amount
          if (payment.method === 'card_transfer') summary.card += amount
          return summary
        },
        { card: 0, cash: 0, total: 0 },
      )
    },
  })
}

export function usePaymentMethodSummaryByShiftIds(
  organizationId: string | null,
  shiftIds: string[],
) {
  const shiftKey = shiftIds.join(',')

  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['payments', 'method-summary-by-shifts', organizationId, shiftKey],
    queryFn: async () => {
      if (!shiftIds.length) return emptyPaymentMethodSummary

      const { data, error } = await supabase
        .from('payments')
        .select('amount,method')
        .eq('organization_id', organizationId!)
        .eq('status', 'completed')
        .in('shift_id', shiftIds)
        .limit(10000)

      if (error) throw new Error(error.message)

      return (data ?? []).reduce<PaymentMethodSummary>(
        (summary, payment) => {
          const amount = payment.amount ?? 0
          summary.total += amount
          if (payment.method === 'cash') summary.cash += amount
          if (payment.method === 'card_transfer') summary.card += amount
          return summary
        },
        { ...emptyPaymentMethodSummary },
      )
    },
  })
}

export type PaymentsByPlaceRow = {
  playstation: number
  billiard: number
  tables: number
  goods: number
  other: number
  total: number
}

const RELATED_ROWS_CHUNK_SIZE = 100

function chunkValues<T>(values: T[], size = RELATED_ROWS_CHUNK_SIZE) {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function buildRevenueBreakdown(paymentRows: PaymentRow[]) {
  const orderIds = Array.from(
    new Set(paymentRows.map((p) => p.order_id).filter((id): id is string => Boolean(id))),
  )

  let orders: { id: string; place_id: string | null }[] = []
  if (orderIds.length) {
    for (const chunk of chunkValues(orderIds)) {
      const { data: ordersData, error: ordersErr } = await supabase
        .from('orders')
        .select('id,place_id')
        .in('id', chunk)

      if (ordersErr) throw new Error(ordersErr.message)
      orders.push(...(ordersData ?? []))
    }
  }

  const placeIds = Array.from(new Set(orders.map((o) => o.place_id).filter((id): id is string => Boolean(id))))

  let places: { id: string; type: string | null }[] = []
  if (placeIds.length) {
    for (const chunk of chunkValues(placeIds)) {
      const { data: placesData, error: placesErr } = await supabase
        .from('places')
        .select('id,type')
        .in('id', chunk)

      if (placesErr) throw new Error(placesErr.message)
      places.push(...(placesData ?? []))
    }
  }

  let orderItems: {
    order_id: string
    item_type: string
    status: string
    total_price: number | null
    total_cost_snapshot: number | null
  }[] = []
  if (orderIds.length) {
    for (const chunk of chunkValues(orderIds)) {
      const { data: itemsData, error: itemsErr } = await supabase
        .from('order_items')
        .select('order_id,item_type,status,total_price,total_cost_snapshot')
        .in('order_id', chunk)

      if (itemsErr) throw new Error(itemsErr.message)
      orderItems.push(...(itemsData ?? []))
    }
  }

  const orderToPlaceType = new Map<string, string | null>()
  orders.forEach((o) => {
    const place = places.find((p) => p.id === o.place_id)
    orderToPlaceType.set(o.id, place?.type ?? null)
  })

  const result: PaymentsByPlaceRow = {
    billiard: 0,
    goods: 0,
    other: 0,
    playstation: 0,
    tables: 0,
    total: paymentRows.reduce((sum, payment) => sum + (payment.amount ?? 0), 0),
  }

  const itemsByOrder = new Map<string, typeof orderItems>()
  for (const item of orderItems.filter((row) => row.status === 'active')) {
    const current = itemsByOrder.get(item.order_id) ?? []
    current.push(item)
    itemsByOrder.set(item.order_id, current)
  }

  for (const order of orders) {
    const placeType = orderToPlaceType.get(order.id) || null
    const orderRows = itemsByOrder.get(order.id) ?? []
    const paidAmount = paymentRows
      .filter((payment) => payment.order_id === order.id)
      .reduce((sum, payment) => sum + (payment.amount ?? 0), 0)

    if (!orderRows.length) {
      if (placeType === 'playstation') result.playstation += paidAmount
      else if (placeType === 'billiard') result.billiard += paidAmount
      else if (placeType === 'table' || placeType === 'vip_room') result.tables += paidAmount
      else result.other += paidAmount
      continue
    }

    let allocatedAmount = 0
    for (const item of orderRows) {
      const amount = item.total_price ?? 0
      const cost = item.total_cost_snapshot ?? 0
      allocatedAmount += amount

      if (item.item_type === 'product') result.goods += amount - cost
      if (placeType === 'table' || placeType === 'vip_room') result.tables += amount
      else if (item.item_type === 'product') continue
      else if (placeType === 'playstation') result.playstation += amount
      else if (placeType === 'billiard') result.billiard += amount
      else result.other += amount
    }

    if (paidAmount > allocatedAmount) {
      result.other += paidAmount - allocatedAmount
    }
  }

  return result
}

export function usePaymentsByPlace(organizationId: string | null, date: string) {
  return useRevenueBreakdown(organizationId, date, date)
}

export function useRevenueBreakdown(
  organizationId: string | null,
  dateStart: string | null,
  dateEnd: string | null,
) {
  return useQuery({
    enabled: Boolean(organizationId && dateStart && dateEnd),
    queryKey: ['payments', 'revenue-breakdown', organizationId, dateStart, dateEnd],
    queryFn: async () => {
      const range = getDateRange(dateStart!, dateEnd!)

      const { data: payments, error: paymentsErr } = await supabase
        .from('payments')
        .select('*')
        .eq('organization_id', organizationId!)
        .eq('status', 'completed')
        .gte('completed_at', range.start)
        .lt('completed_at', range.end)
        .limit(10000)

      if (paymentsErr) throw new Error(paymentsErr.message)
      return buildRevenueBreakdown((payments ?? []) as PaymentRow[])
    },
  })
}

export function useRevenueBreakdownByShiftIds(organizationId: string | null, shiftIds: string[]) {
  const shiftKey = shiftIds.join(',')

  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['payments', 'revenue-breakdown-by-shifts', organizationId, shiftKey],
    queryFn: async () => {
      if (!shiftIds.length) {
        return {
          billiard: 0,
          goods: 0,
          other: 0,
          playstation: 0,
          tables: 0,
          total: 0,
        } satisfies PaymentsByPlaceRow
      }

      const { data: payments, error } = await supabase
        .from('payments')
        .select('*')
        .eq('organization_id', organizationId!)
        .eq('status', 'completed')
        .in('shift_id', shiftIds)
        .limit(10000)

      if (error) throw new Error(error.message)
      return buildRevenueBreakdown((payments ?? []) as PaymentRow[])
    },
  })
}

export type HourlyPaymentPoint = {
  hour: number
  amount: number
  count: number
  trafficScore: number
}

export type PaymentTrafficAnalytics = {
  points: HourlyPaymentPoint[]
  peakHour: HourlyPaymentPoint | null
  peakMinute: number | null
  totalAmount: number
  totalCount: number
}

export function usePaymentTrafficAnalytics(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['payments', 'traffic-analytics', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('amount,completed_at')
        .eq('organization_id', organizationId!)
        .eq('status', 'completed')
        .not('completed_at', 'is', null)
        .lte('completed_at', new Date().toISOString())
        .limit(10000)

      if (error) throw new Error(error.message)

      const points = Array.from({ length: 24 }, (_, hour) => ({
        amount: 0,
        count: 0,
        hour,
        trafficScore: 0,
      }))
      const minuteCounts = Array.from({ length: 60 }, () => 0)

      for (const payment of data ?? []) {
        if (!payment.completed_at) continue

        const completedAt = new Date(payment.completed_at)
        const point = points[completedAt.getHours()]
        if (!point) continue
        point.amount += payment.amount ?? 0
        point.count += 1
        const minute = completedAt.getMinutes()
        minuteCounts[minute] = (minuteCounts[minute] ?? 0) + 1
      }

      const maxCount = Math.max(...points.map((point) => point.count), 0)
      for (const point of points) {
        point.trafficScore = maxCount > 0 && point.count > 0 ? Math.ceil((point.count / maxCount) * 10) : 0
      }

      const peakHour = points.reduce<HourlyPaymentPoint | null>((current, point) => {
        if (!current) return point.count > 0 ? point : null
        if (point.count > current.count) return point
        if (point.count === current.count && point.amount > current.amount) return point
        return current
      }, null)
      const peakMinuteCount = Math.max(...minuteCounts)
      const peakMinute = peakMinuteCount > 0 ? minuteCounts.findIndex((count) => count === peakMinuteCount) : null

      return {
        peakHour,
        peakMinute,
        points,
        totalAmount: points.reduce((sum, point) => sum + point.amount, 0),
        totalCount: points.reduce((sum, point) => sum + point.count, 0),
      } satisfies PaymentTrafficAnalytics
    },
  })
}
