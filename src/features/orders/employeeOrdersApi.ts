import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type {
  AdjustmentRequestType,
  EmployeeOrderItemRow,
  EmployeeOrderRow,
  EmployeeWorkspacePlaceRow,
  PaymentMethod,
} from '../../lib/supabase/database.types'

export const employeeOrderSelect =
  'id,organization_id,order_number,place_id,current_place_name_snapshot,status,customer_label,comment,subtotal,total_amount,paid_amount,unpaid_amount,opened_by,opened_at,closed_at,payment_refusal_comment,created_at,updated_at'
export const employeeOrderItemSelect =
  'id,organization_id,order_id,item_type,status,product_id,service_id,combo_id,timed_session_id,name_snapshot,description_snapshot,image_path_snapshot,quantity,unit_price,total_price,metadata,added_by,added_at,removed_at,removal_reason,created_at,updated_at'

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
          .in('status', ['open', 'waiting_payment', 'payment_refused'])
          .order('opened_at', { ascending: false }),
        supabase
          .from('employee_timed_sessions')
          .select('*')
          .eq('organization_id', organizationId!)
          .eq('status', 'active'),
      ])

      if (placesResult.error) throw new Error(placesResult.error.message)
      if (ordersResult.error) throw new Error(ordersResult.error.message)
      if (sessionsResult.error) throw new Error(sessionsResult.error.message)

      return {
        places: placesResult.data as EmployeeWorkspacePlaceRow[],
        orders: ordersResult.data as EmployeeOrderRow[],
        sessions: sessionsResult.data,
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
      mutationFn: async ({ placeId, orderId }: { placeId: string; orderId?: string | null }) => {
        const { data, error } = await supabase.rpc('start_timed_session', {
          target_place_id: placeId,
          target_order_id: orderId ?? null,
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
