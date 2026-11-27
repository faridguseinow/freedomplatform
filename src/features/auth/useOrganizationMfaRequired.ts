import { useQuery } from '@tanstack/react-query'
import { fetchOrganizationMfaRequired } from './mfaApi'

export const mfaRequirementQueryKey = (organizationId: string) => [
  'organizations',
  organizationId,
  'mfa-required',
]

export function useOrganizationMfaRequired(organizationId: string | null | undefined) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: mfaRequirementQueryKey(organizationId ?? ''),
    queryFn: () => fetchOrganizationMfaRequired(organizationId!),
    retry: false,
    staleTime: 60_000,
  })
}
