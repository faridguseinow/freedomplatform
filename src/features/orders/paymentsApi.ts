import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type { PaymentMethod, PaymentRow } from '../../lib/supabase/database.types'

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

export type PaymentsByPlaceRow = {
  playstation: number
  billiard: number
  tables: number
  goods: number
  other: number
}

export function usePaymentsByPlace(organizationId: string | null, date: string) {
  return useQuery({
    enabled: Boolean(organizationId && date),
    queryKey: ['payments', 'by-place', organizationId, date],
    queryFn: async () => {
      const start = `${date}T00:00:00Z`
      const next = new Date(date)
      next.setDate(next.getDate() + 1)
      const nextStr = `${next.toISOString().slice(0, 10)}T00:00:00Z`

      const { data: payments, error: paymentsErr } = await supabase
        .from('payments')
        .select('*')
        .eq('organization_id', organizationId!)
        .eq('status', 'completed')
        .gte('completed_at', start)
        .lt('completed_at', nextStr)

      if (paymentsErr) throw new Error(paymentsErr.message)
      const paymentRows = (payments ?? []) as PaymentRow[]

      const orderIds = Array.from(new Set(paymentRows.map((p) => p.order_id).filter(Boolean)))

      let orders: { id: string; place_id: string | null }[] = []
      if (orderIds.length) {
        const { data: ordersData, error: ordersErr } = await supabase
          .from('orders')
          .select('id,place_id')
          .in('id', orderIds)

        if (ordersErr) throw new Error(ordersErr.message)
        orders = ordersData ?? []
      }

      const placeIds = Array.from(new Set(orders.map((o) => o.place_id).filter(Boolean)))

      let places: { id: string; type: string | null }[] = []
      if (placeIds.length) {
        const { data: placesData, error: placesErr } = await supabase
          .from('places')
          .select('id,type')
          .in('id', placeIds)

        if (placesErr) throw new Error(placesErr.message)
        places = placesData ?? []
      }

      let orderItems: { order_id: string; item_type: string }[] = []
      if (orderIds.length) {
        const { data: itemsData, error: itemsErr } = await supabase
          .from('order_items')
          .select('order_id,item_type')
          .in('order_id', orderIds)

        if (itemsErr) throw new Error(itemsErr.message)
        orderItems = itemsData ?? []
      }

      const orderToPlaceType = new Map<string, string | null>()
      orders.forEach((o) => {
        const place = places.find((p) => p.id === o.place_id)
        orderToPlaceType.set(o.id, place?.type ?? null)
      })

      const orderHasProduct = new Map<string, boolean>()
      orderItems.forEach((it) => {
        if (it.item_type === 'product') orderHasProduct.set(it.order_id, true)
        else if (!orderHasProduct.has(it.order_id)) orderHasProduct.set(it.order_id, false)
      })

      const result: PaymentsByPlaceRow = {
        playstation: 0,
        billiard: 0,
        tables: 0,
        goods: 0,
        other: 0,
      }

      for (const p of paymentRows) {
        const orderId = p.order_id
        const placeType = orderToPlaceType.get(orderId) || null
        const hasProduct = orderHasProduct.get(orderId) ?? false
        const amt = p.amount ?? 0

        if (placeType === 'playstation') result.playstation += amt
        else if (placeType === 'billiard') result.billiard += amt
        else if (placeType === 'table' || placeType === 'vip_room') result.tables += amt
        else if (hasProduct) result.goods += amt
        else result.other += amt
      }

      return result
    },
  })
}
