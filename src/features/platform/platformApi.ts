import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase/client'
import type { OrganizationRow } from '../../lib/supabase/database.types'
import { toServerError } from '../../lib/errors/serverErrors'

export const organizationSelect =
  'id,name,slug,description,logo_path,status,default_locale,timezone,currency_code,created_by,created_at,updated_at,archived_at'

export function usePlatformOrganizations() {
  return useQuery({
    queryKey: ['platform', 'organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select(organizationSelect)
        .order('created_at', { ascending: false })

      if (error) throw toServerError(error)
      return data as OrganizationRow[]
    },
  })
}
