import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, RotateCcw, ShieldCheck, ShieldOff } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { useI18n } from '../../../lib/i18n/I18nContext'
import {
  fetchOrganizationMfaRequired,
  resetUserMfa,
  updateOrganizationMfaRequired,
} from '../mfaApi'

const mfaRequirementQueryKey = (organizationId: string) => [
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

/** Platform owner switch for the per-organization authenticator requirement. */
export function OrganizationMfaSettingCard({ organizationId }: { organizationId: string }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const requirementQuery = useOrganizationMfaRequired(organizationId)
  const [error, setError] = useState<string | null>(null)
  const isRequired = requirementQuery.data === true

  const updateMutation = useMutation({
    mutationFn: (nextValue: boolean) => updateOrganizationMfaRequired(organizationId, nextValue),
    onMutate: () => setError(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mfaRequirementQueryKey(organizationId) })
    },
    onError: (mutationError) =>
      setError(mutationError instanceof Error ? mutationError.message : t('auth.mfa.settingFailed')),
  })

  const toggle = () => {
    const nextValue = !isRequired
    const confirmed = window.confirm(
      nextValue ? t('auth.mfa.confirmEnable') : t('auth.mfa.confirmDisable'),
    )
    if (confirmed) updateMutation.mutate(nextValue)
  }

  if (requirementQuery.isError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        {t('auth.mfa.settingUnavailable')}
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={
            isRequired
              ? 'grid size-10 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700'
              : 'grid size-10 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-500'
          }
        >
          {isRequired ? (
            <ShieldCheck aria-hidden="true" className="size-5" />
          ) : (
            <ShieldOff aria-hidden="true" className="size-5" />
          )}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-950">{t('auth.mfa.settingTitle')}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {isRequired ? t('auth.mfa.settingOn') : t('auth.mfa.settingOff')}
          </p>
          {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
        </div>
      </div>
      <Button
        className="shrink-0"
        disabled={requirementQuery.isLoading || updateMutation.isPending}
        onClick={toggle}
        type="button"
        variant={isRequired ? 'secondary' : 'primary'}
      >
        {updateMutation.isPending || requirementQuery.isLoading ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : null}
        {isRequired ? t('auth.mfa.disable') : t('auth.mfa.enable')}
      </Button>
    </section>
  )
}

/** Removes a user's authenticator so they connect a new one on next sign-in. */
export function ResetUserMfaSection({
  organizationId,
  userId,
}: {
  organizationId: string
  userId: string
}) {
  const { t } = useI18n()
  const requirementQuery = useOrganizationMfaRequired(organizationId)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const resetMutation = useMutation({
    mutationFn: () => resetUserMfa(userId, organizationId),
    onMutate: () => setMessage(null),
    onSuccess: (removed) =>
      setMessage({
        tone: 'success',
        text: removed ? t('auth.mfa.resetDone') : t('auth.mfa.resetNothing'),
      }),
    onError: (mutationError) =>
      setMessage({
        tone: 'error',
        text: mutationError instanceof Error ? mutationError.message : t('auth.mfa.resetFailed'),
      }),
  })

  if (requirementQuery.data !== true) return null

  const reset = () => {
    if (window.confirm(t('auth.mfa.resetConfirm'))) resetMutation.mutate()
  }

  return (
    <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h4 className="text-sm font-semibold text-slate-950">{t('auth.mfa.resetTitle')}</h4>
        <p className="mt-1 text-sm leading-6 text-slate-600">{t('auth.mfa.resetDescription')}</p>
      </div>
      <Button
        className="w-full sm:w-fit"
        disabled={resetMutation.isPending}
        onClick={reset}
        type="button"
        variant="secondary"
      >
        {resetMutation.isPending ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <RotateCcw aria-hidden="true" className="size-4" />
        )}
        {t('auth.mfa.resetAction')}
      </Button>
      {message ? (
        <p className={message.tone === 'success' ? 'text-sm text-emerald-700' : 'text-sm text-red-700'}>
          {message.text}
        </p>
      ) : null}
    </section>
  )
}
