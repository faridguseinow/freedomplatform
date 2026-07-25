import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type { AdminOperationalDayReportRow } from '../../lib/supabase/database.types'

export function useOperationalDays(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ['admin', 'operational-days', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_operational_day_reports')
        .select('*')
        .eq('organization_id', organizationId!)
        .order('business_date', { ascending: false })
        .limit(120)

      if (error) throw new Error(error.message)
      return data as AdminOperationalDayReportRow[]
    },
  })
}
