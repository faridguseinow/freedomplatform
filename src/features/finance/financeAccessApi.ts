import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'

export type FinancePinState = {
  has_pin: boolean
  pin_set_at: string | null
  locked_until: string | null
}

export type FinancePinVerification = {
  is_valid: boolean
  locked_until: string | null
}

export const financePinStateKey = (organizationId: string | null) =>
  ['organization', organizationId, 'finance-pin-state'] as const

export function useFinancePinState(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: financePinStateKey(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_finance_pin_state', {
        target_organization_id: organizationId!,
      })

      if (error) throw new Error(error.message)
      return (data[0] ?? null) as FinancePinState | null
    },
  })
}

export function useVerifyFinancePin(organizationId: string | null) {
  return useMutation({
    mutationFn: async (pin: string) => {
      if (!organizationId) throw new Error('Organization is not selected.')

      const { data, error } = await supabase.rpc('verify_finance_pin', {
        target_organization_id: organizationId,
        target_pin: pin,
      })

      if (error) throw new Error(error.message)
      return (data[0] ?? { is_valid: false, locked_until: null }) as FinancePinVerification
    },
  })
}

export function useSetFinancePin(organizationId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ password, pin }: { password: string; pin: string }) => {
      if (!organizationId) throw new Error('Organization is not selected.')

      const { error } = await supabase.rpc('set_finance_pin', {
        target_account_password: password,
        target_organization_id: organizationId,
        target_pin: pin,
      })

      if (error) throw new Error(error.message)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financePinStateKey(organizationId) })
    },
  })
}

