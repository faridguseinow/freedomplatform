import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type {
  AdminShiftReportRow,
  EmployeeShiftRow,
  ShiftStatus,
} from '../../lib/supabase/database.types'

export function useCurrentEmployeeShift(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['employee', 'current-shift', organizationId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_current_employee_shift')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useEmployeeShiftMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['employee', 'current-shift', organizationId] })
    await queryClient.invalidateQueries({ queryKey: ['employee', 'workspace', organizationId] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'shifts', organizationId] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'operational-days', organizationId] })
  }

  return {
    open: useMutation({
      mutationFn: async ({
        shiftTemplateId,
        openingCashAmount,
      }: {
        shiftTemplateId?: string | null
        openingCashAmount: number
      }) => {
        const { data, error } = await supabase.rpc('open_employee_shift', {
          target_shift_template_id: shiftTemplateId ?? null,
          target_opening_cash_amount: openingCashAmount,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: invalidate,
    }),
    close: useMutation({
      mutationFn: async ({
        actualCashAmount,
        comment,
        handoverCashAmount,
      }: {
        actualCashAmount: number
        comment?: string | null
        handoverCashAmount?: number | null
      }) => {
        const { data, error } = await supabase.rpc('close_employee_shift', {
          target_actual_cash_amount: actualCashAmount,
          target_comment: comment ?? null,
          target_handover_cash_amount: handoverCashAmount ?? null,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: invalidate,
    }),
  }
}

export function useAdminShifts(
  organizationId: string | null,
  status: ShiftStatus | 'all' = 'all',
) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'shifts', organizationId, status],
    queryFn: async () => {
      let query = supabase
        .from('admin_shift_reports')
        .select('*')
        .eq('organization_id', organizationId!)
        .order('opened_at', { ascending: false })
        .limit(200)

      if (status !== 'all') {
        query = query.eq('status', status)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data as AdminShiftReportRow[]
    },
  })
}

export function useAdminShiftDetail(shiftId: string | null) {
  return useQuery({
    enabled: Boolean(shiftId),
    queryKey: ['admin', 'shift-detail', shiftId],
    queryFn: async () => {
      const [shiftResult, handoversResult, ordersResult, paymentsResult, sessionsResult] =
        await Promise.all([
          supabase.from('admin_shift_reports').select('*').eq('id', shiftId!).single(),
          supabase.from('shift_handovers').select('*').eq('from_shift_id', shiftId!),
          supabase.from('orders').select('*').or(`opened_shift_id.eq.${shiftId},closed_shift_id.eq.${shiftId}`),
          supabase.from('payments').select('*').eq('shift_id', shiftId!),
          supabase.from('timed_sessions').select('*').or(`started_shift_id.eq.${shiftId},ended_shift_id.eq.${shiftId}`),
        ])

      if (shiftResult.error) throw new Error(shiftResult.error.message)
      if (handoversResult.error) throw new Error(handoversResult.error.message)
      if (ordersResult.error) throw new Error(ordersResult.error.message)
      if (paymentsResult.error) throw new Error(paymentsResult.error.message)
      if (sessionsResult.error) throw new Error(sessionsResult.error.message)

      return {
        shift: shiftResult.data as AdminShiftReportRow,
        handovers: handoversResult.data,
        orders: ordersResult.data,
        payments: paymentsResult.data,
        sessions: sessionsResult.data,
      }
    },
  })
}

export function useAdminShiftMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async (shiftId?: string) => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'shifts', organizationId] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'operational-days', organizationId] })
    if (shiftId) {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'shift-detail', shiftId] })
    }
  }

  return {
    forceClose: useMutation({
      mutationFn: async ({
        shiftId,
        actualCashAmount,
        reason,
      }: {
        shiftId: string
        actualCashAmount?: number | null
        reason: string
      }) => {
        const { data, error } = await supabase.rpc('force_close_employee_shift', {
          target_shift_id: shiftId,
          target_actual_cash_amount: actualCashAmount ?? null,
          target_reason: reason,
        })
        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: (payload) => invalidate((payload.shift as EmployeeShiftRow).id),
    }),
  }
}

export const shiftStatusLabel: Record<ShiftStatus, string> = {
  open: 'Открыта',
  closing: 'Закрывается',
  closed: 'Закрыта',
  force_closed: 'Закрыта админом',
}
