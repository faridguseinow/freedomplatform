import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type { OrganizationNotificationSettingsRow } from '../../lib/supabase/database.types'

const select = 'id,organization_id,telegram_enabled,telegram_chat_id,notify_shift_opened,notify_shift_closed,notify_daily_summary,notify_cash_variance,notify_payment_refused,notify_adjustment_requests,notify_low_stock,created_at,updated_at'

export function useNotificationSettings(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'notification-settings', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_notification_settings')
        .select(select)
        .eq('organization_id', organizationId!)
        .maybeSingle()

      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useNotificationSettingsMutations(organizationId: string | null) {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'notification-settings', organizationId] })
  }

  return {
    upsert: useMutation({
      mutationFn: async (
        input: Partial<OrganizationNotificationSettingsRow> &
          Pick<OrganizationNotificationSettingsRow, 'organization_id'>,
      ) => {
        const { data, error } = await supabase
          .from('organization_notification_settings')
          .upsert(input, { onConflict: 'organization_id' })
          .select(select)
          .single()

        if (error) throw new Error(error.message)
        return data
      },
      onSuccess: invalidate,
    }),
  }
}
