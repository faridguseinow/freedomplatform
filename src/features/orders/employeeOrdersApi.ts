import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type {
  AdjustmentRequestType,
  EmployeeOrderItemRow,
  EmployeeOrderRow,
  EmployeeWorkspacePlaceRow,
  PaymentMethod,
} from '../../lib/supabase/database.types'
import { readCachedWorkspacePlaces, toEmptyEmployeeWorkspacePlace } from '../places/workspacePlacesCache'

export const employeeOrderSelect =
  'id,organization_id,order_number,place_id,current_place_name_snapshot,status,customer_label,comment,subtotal,total_amount,paid_amount,unpaid_amount,opened_by,opened_at,closed_at,payment_refusal_comment,created_at,updated_at'
export const employeeOrderItemSelect =
  'id,organization_id,order_id,item_type,status,product_id,service_id,combo_id,timed_session_id,name_snapshot,description_snapshot,image_path_snapshot,quantity,unit_price,total_price,metadata,added_by,added_at,removed_at,removal_reason,created_at,updated_at'
const employeeWorkspacePlaceBaseSelect =
  'id,organization_id,category_id,name,type,custom_type_name,description,image_path,has_timer,hourly_rate,minimum_minutes,billing_step_minutes,capacity,sort_order,workspace_x,workspace_y,workspace_w,workspace_h,status'

const isMissingWorkspaceLayoutColumn = (message: string) =>
  message.includes('workspace_x') ||
  message.includes('workspace_y') ||
  message.includes('workspace_w') ||
  message.includes('workspace_h')

const toWorkspacePlace = (
  place: Partial<EmployeeWorkspacePlaceRow> & Pick<EmployeeWorkspacePlaceRow, 'id' | 'organization_id' | 'name' | 'type'>,
  orders: EmployeeOrderRow[],
  sessions: Array<Record<string, unknown>>,
): EmployeeWorkspacePlaceRow => {
  const activeOrder = orders.find((order) => order.place_id === place.id) ?? null
  const activeSession = sessions.find((session) => session.place_id === place.id) ?? null

  return {
    category_id: place.category_id ?? null,
    capacity: place.capacity ?? null,
    custom_type_name: place.custom_type_name ?? null,
    description: place.description ?? null,
    has_timer: place.has_timer ?? false,
    hourly_rate: place.hourly_rate ?? null,
    id: place.id,
    image_path: place.image_path ?? null,
    minimum_minutes: place.minimum_minutes ?? null,
    billing_step_minutes: place.billing_step_minutes ?? null,
    name: place.name,
    organization_id: place.organization_id,
    sort_order: place.sort_order ?? 0,
    status: place.status ?? 'active',
    type: place.type,
    workspace_x: place.workspace_x ?? null,
    workspace_y: place.workspace_y ?? null,
    workspace_w: place.workspace_w ?? null,
    workspace_h: place.workspace_h ?? null,
    active_order_id: activeOrder?.id ?? null,
    active_order_number: activeOrder?.order_number ?? null,
    active_order_opened_at: activeOrder?.opened_at ?? null,
    active_order_status: activeOrder?.status ?? null,
    active_order_total: activeOrder?.total_amount ?? null,
    active_order_item_count: 0,
    active_session_id: (activeSession?.id as string | undefined) ?? null,
    active_session_started_at: (activeSession?.started_at as string | undefined) ?? null,
    active_session_hourly_rate: (activeSession?.hourly_rate_snapshot as number | undefined) ?? null,
    active_session_minimum_minutes: (activeSession?.minimum_minutes_snapshot as number | undefined) ?? null,
    active_session_billing_step_minutes:
      (activeSession?.billing_step_minutes_snapshot as number | undefined) ?? null,
    active_session_planned_minutes: (activeSession?.planned_minutes as number | undefined) ?? null,
    vip_equipment_name: place.vip_equipment_name ?? null,
    vip_equipment_time: place.vip_equipment_time ?? null,
    vip_equipment_price: place.vip_equipment_price ?? null,
  }
}

export function useEmployeeWorkspaceData(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['employee', 'workspace', organizationId],
    refetchInterval: 45_000,
    queryFn: async () => {
      const [placesResult, ordersResult, sessionsResult] = await Promise.all([
        supabase
          .from('employee_workspace_places')
          .select('*')
          .eq('organization_id', organizationId!)
          .order('sort_order', { ascending: true }),
        supabase
          .from('employee_orders')
          .select(employeeOrderSelect)
          .eq('organization_id', organizationId!)
          .in('status', ['open', 'waiting_payment'])
          .order('opened_at', { ascending: false }),
        supabase
          .from('employee_timed_sessions')
          .select('*')
          .eq('organization_id', organizationId!)
          .eq('status', 'active'),
      ])

      if (ordersResult.error) throw new Error(ordersResult.error.message)
      if (sessionsResult.error) throw new Error(sessionsResult.error.message)

      const orders = ordersResult.data as EmployeeOrderRow[]
      const sessions = sessionsResult.data ?? []
      let places = placesResult.error ? [] : (placesResult.data as EmployeeWorkspacePlaceRow[])
      const activeOrderOpenedAtByPlaceId = new Map(
        orders
          .filter((order) => order.place_id)
          .map((order) => [order.place_id!, order.opened_at]),
      )

      places = places.map((place) => ({
        ...place,
        active_order_opened_at: activeOrderOpenedAtByPlaceId.get(place.id) ?? null,
      }))

      if (!places.length) {
        const directPlacesResult = await supabase
          .from('places')
          .select(employeeWorkspacePlaceBaseSelect)
          .eq('organization_id', organizationId!)
          .eq('status', 'active')
          .order('sort_order', { ascending: true })

        if (!directPlacesResult.error) {
          places = directPlacesResult.data.map((place) => toWorkspacePlace(place, orders, sessions))
        } else if (isMissingWorkspaceLayoutColumn(directPlacesResult.error.message)) {
          const fallbackPlacesResult = await supabase
            .from('places')
            .select(
              'id,organization_id,category_id,name,type,custom_type_name,description,image_path,has_timer,hourly_rate,minimum_minutes,billing_step_minutes,capacity,sort_order,status',
            )
            .eq('organization_id', organizationId!)
            .eq('status', 'active')
            .order('sort_order', { ascending: true })

          if (fallbackPlacesResult.error) throw new Error(fallbackPlacesResult.error.message)
          places = fallbackPlacesResult.data.map((place) => toWorkspacePlace(place, orders, sessions))
        } else {
          const employeePlacesResult = await supabase
            .from('employee_places')
            .select(
              'id,organization_id,category_id,name,type,custom_type_name,description,image_path,has_timer,hourly_rate,minimum_minutes,billing_step_minutes,capacity,sort_order,status',
            )
            .eq('organization_id', organizationId!)
            .order('sort_order', { ascending: true })

          if (employeePlacesResult.error) {
            const cachedPlaces = readCachedWorkspacePlaces(organizationId)
            if (cachedPlaces.length) {
              places = cachedPlaces.map((place) => toWorkspacePlace(toEmptyEmployeeWorkspacePlace(place), orders, sessions))
            } else {
              throw new Error(placesResult.error?.message ?? directPlacesResult.error.message)
            }
          } else {
            places = employeePlacesResult.data.map((place) => toWorkspacePlace(place, orders, sessions))
          }
        }
      }

      if (!places.length) {
        const cachedPlaces = readCachedWorkspacePlaces(organizationId)
        if (cachedPlaces.length) {
          places = cachedPlaces.map((place) => toWorkspacePlace(toEmptyEmployeeWorkspacePlace(place), orders, sessions))
        }
      }

      return {
        places,
        orders,
        sessions,
      }
    },
  })
}

export function useEmployeeOrderItems(orderId: string | null) {
  return useQuery({
    enabled: Boolean(orderId),
    queryKey: ['employee', 'order-items', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_order_items')
        .select(employeeOrderItemSelect)
        .eq('order_id', orderId!)
        .order('added_at', { ascending: true })

      if (error) throw new Error(error.message)
      return data as EmployeeOrderItemRow[]
    },
  })
}

export function useEmployeeOrderMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async (orderId?: string | null) => {
    await queryClient.invalidateQueries({ queryKey: ['employee', 'workspace', organizationId] })
    if (orderId) {
      await queryClient.invalidateQueries({ queryKey: ['employee', 'order-items', orderId] })
    }
    await queryClient.invalidateQueries({ queryKey: ['admin', 'orders', organizationId] })
  }

  return {
    createOrder: useMutation({
      mutationFn: async ({
        placeId,
        customerLabel,
        comment,
      }: {
        placeId?: string | null
        customerLabel?: string | null
        comment?: string | null
      }) => {
        const { data, error } = await supabase.rpc('create_order', {
          target_place_id: placeId ?? null,
          target_customer_label: customerLabel ?? null,
          target_comment: comment ?? null,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (order) => invalidate(order.id),
    }),
    updateCustomerLabel: useMutation({
      mutationFn: async ({ orderId, customerLabel }: { orderId: string; customerLabel?: string | null }) => {
        // Prefer RPC which enforces access rules; if the RPC is not present (migration not applied),
        // fall back to a direct update as a best-effort (may fail due to RLS/permissions).
        try {
          const { data, error } = await supabase.rpc('update_order_customer_label', {
            target_order_id: orderId,
            target_customer_label: customerLabel ?? null,
          })
          if (error) throw new Error(error.message)
          return data
        } catch (rpcErr) {
          const msg = rpcErr instanceof Error ? rpcErr.message : String(rpcErr)
          if (msg.includes('could not find function') || msg.includes('function public.update_order_customer_label')) {
            // Migration may not be applied; attempt a direct update to preserve UX.
            const { data, error } = await supabase
              .from('orders')
              .update({ customer_label: customerLabel ?? null, updated_at: new Date().toISOString() })
              .eq('id', orderId)
              .select()
              .single()

            if (error) throw new Error(error.message)
            return data
          }

          throw rpcErr
        }
      },
      onSuccess: (order) => invalidate(order.id),
    }),
    updateVipEquipment: useMutation({
      mutationFn: async ({
        placeId,
        equipmentName,
        equipmentTime,
        equipmentPrice,
      }: {
        placeId: string
        equipmentName?: string | null
        equipmentTime?: string | null
        equipmentPrice?: string | null
      }) => {
        const { data, error } = await supabase.rpc('update_place_vip_equipment', {
          target_place_id: placeId,
          target_equipment_name: equipmentName ?? null,
          target_equipment_time: equipmentTime ?? null,
          target_equipment_price: equipmentPrice ?? null,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: () => invalidate(),
    }),
    addProduct: useMutation({
      mutationFn: async ({
        orderId,
        productId,
        quantity,
      }: {
        orderId: string
        productId: string
        quantity: number
      }) => {
        const { data, error } = await supabase.rpc('add_product_to_order', {
          target_order_id: orderId,
          target_product_id: productId,
          target_quantity: quantity,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (item) => invalidate(item.order_id),
    }),
    addService: useMutation({
      mutationFn: async ({
        orderId,
        serviceId,
        quantity,
      }: {
        orderId: string
        serviceId: string
        quantity: number
      }) => {
        const { data, error } = await supabase.rpc('add_service_to_order', {
          target_order_id: orderId,
          target_service_id: serviceId,
          target_quantity: quantity,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (item) => invalidate(item.order_id),
    }),
    addCombo: useMutation({
      mutationFn: async ({
        orderId,
        comboId,
        quantity,
      }: {
        orderId: string
        comboId: string
        quantity: number
      }) => {
        const { data, error } = await supabase.rpc('add_combo_to_order', {
          target_order_id: orderId,
          target_combo_id: comboId,
          target_quantity: quantity,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (item) => invalidate(item.order_id),
    }),
    startSession: useMutation({
      mutationFn: async ({
        placeId,
        orderId,
        plannedMinutes,
      }: {
        placeId: string
        orderId?: string | null
        plannedMinutes?: number | null
      }) => {
        const { data, error } = await supabase.rpc('start_timed_session', {
          target_place_id: placeId,
          target_order_id: orderId ?? null,
          target_planned_minutes: plannedMinutes ?? null,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (session) => invalidate(session.order_id),
    }),
    completeSession: useMutation({
      mutationFn: async (sessionId: string) => {
        const { data, error } = await supabase.rpc('complete_timed_session', {
          target_session_id: sessionId,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (session) => invalidate(session.order_id),
    }),
    waitPayment: useMutation({
      mutationFn: async (orderId: string) => {
        const { data, error } = await supabase.rpc('set_order_waiting_payment', {
          target_order_id: orderId,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (order) => invalidate(order.id),
    }),
    completePayment: useMutation({
      mutationFn: async ({
        orderId,
        method,
        comment,
      }: {
        orderId: string
        method: PaymentMethod
        comment?: string | null
      }) => {
        const { data, error } = await supabase.rpc('complete_order_payment', {
          target_order_id: orderId,
          target_method: method,
          target_comment: comment ?? null,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (order) => invalidate(order.id),
    }),
    completePaymentWithTip: useMutation({
      mutationFn: async ({
        orderId,
        method,
        tipAmount,
        comment,
      }: {
        orderId: string
        method: PaymentMethod
        tipAmount: number
        comment?: string | null
      }) => {
        const { data, error } = await supabase.rpc('complete_order_payment_with_tip', {
          target_order_id: orderId,
          target_method: method,
          target_tip_amount: tipAmount,
          target_comment: comment ?? null,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (order) => invalidate(order.id),
    }),
    completeSplitPayment: useMutation({
      mutationFn: async ({
        orderId,
        cashAmount,
        cardAmount,
        comment,
      }: {
        orderId: string
        cashAmount: number
        cardAmount: number
        comment?: string | null
      }) => {
        const { data, error } = await supabase.rpc('complete_order_split_payment', {
          target_order_id: orderId,
          target_cash_amount: cashAmount,
          target_card_amount: cardAmount,
          target_comment: comment ?? null,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (order) => invalidate(order.id),
    }),
    completeOpeningDayPayment: useMutation({
      mutationFn: async ({
        orderId,
        method,
        amount,
        comment,
      }: {
        orderId: string
        method: PaymentMethod
        amount: number
        comment?: string | null
      }) => {
        const { data, error } = await supabase.rpc('complete_opening_day_order_payment', {
          target_order_id: orderId,
          target_method: method,
          target_amount: amount,
          target_comment: comment ?? null,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (order) => invalidate(order.id),
    }),
    refusePayment: useMutation({
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
    completeEmptyOrder: useMutation({
      mutationFn: async ({ orderId, comment }: { orderId: string; comment?: string | null }) => {
        const { data, error } = await supabase.rpc('complete_empty_order', {
          target_order_id: orderId,
          target_comment: comment ?? null,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (order) => invalidate(order.id),
    }),
    cancelOrder: useMutation({
      mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
        const { data, error } = await supabase.rpc('cancel_order', {
          target_order_id: orderId,
          target_reason: reason,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (order) => invalidate(order.id),
    }),
    requestAdjustment: useMutation({
      mutationFn: async ({
        orderId,
        orderItemId,
        requestType,
        reason,
        requestedQuantity,
      }: {
        orderId: string
        orderItemId?: string | null
        requestType: AdjustmentRequestType
        reason: string
        requestedQuantity?: number | null
      }) => {
        const { data, error } = await supabase.rpc('request_order_adjustment', {
          target_order_id: orderId,
          target_order_item_id: orderItemId ?? null,
          target_request_type: requestType,
          target_reason: reason,
          target_requested_quantity: requestedQuantity ?? null,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (request) => invalidate(request.order_id),
    }),
  }
}

export const orderStatusLabel: Record<string, string> = {
  open: 'Открыт',
  waiting_payment: 'Ожидает оплату',
  paid: 'Оплачен',
  unpaid: 'Не оплачен',
  payment_refused: 'Отказ от оплаты',
  cancelled: 'Отменен',
}
