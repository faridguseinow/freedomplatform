import { supabase } from '../../lib/supabase/client'
import type { MfaStatus } from './AuthContext'

export type TotpEnrollment = {
  factorId: string
  qrCode: string
  secret: string
  uri: string
}

export class MfaInvalidCodeError extends Error {
  constructor() {
    super('mfa_invalid_code')
  }
}

const toQrImageSource = (qrCode: string) =>
  qrCode.startsWith('data:') ? qrCode : `data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`

const isInvalidCodeError = (error: { code?: string | undefined; message?: string | undefined }) =>
  error.code === 'mfa_verification_failed' ||
  /invalid totp code|invalid code|verification failed/i.test(error.message ?? '')

/**
 * Decides whether the signed in user has to pass the authenticator step.
 * A session that already has aal2 needs no network call. Otherwise the
 * database tells whether any of the user's organizations requires it.
 * If the requirement cannot be read (for example before the migration is
 * applied), sign-in continues as before and the database rules still apply.
 */
export async function resolveMfaStatus(): Promise<MfaStatus> {
  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

  if (!assuranceError && assurance.currentLevel === 'aal2') {
    return 'verified'
  }

  const { data: isRequired, error } = await supabase.rpc('get_my_mfa_requirement')

  if (error || !isRequired) {
    return 'not-required'
  }

  return assurance?.nextLevel === 'aal2' ? 'challenge' : 'enroll'
}

export async function getVerifiedTotpFactorId() {
  const { data, error } = await supabase.auth.mfa.listFactors()

  if (error) throw new Error(error.message)

  return data.totp[0]?.id ?? null
}

export async function startTotpEnrollment(): Promise<TotpEnrollment> {
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()

  if (listError) throw new Error(listError.message)

  // A previous attempt that was not finished leaves an unverified factor.
  for (const factor of factors.all) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Freedom Platform ${new Date().toISOString().slice(0, 16)}`,
    issuer: 'Freedom Platform',
  })

  if (error) throw new Error(error.message)

  return {
    factorId: data.id,
    qrCode: toQrImageSource(data.totp.qr_code),
    secret: data.totp.secret,
    uri: data.totp.uri,
  }
}

export async function verifyTotpCode(factorId: string, code: string) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })

  if (error) {
    if (isInvalidCodeError(error)) throw new MfaInvalidCodeError()
    throw new Error(error.message)
  }
}

export async function fetchOrganizationMfaRequired(organizationId: string) {
  const { data, error } = await supabase
    .from('organizations')
    .select('mfa_required')
    .eq('id', organizationId)
    .single()

  if (error) throw new Error(error.message)

  return Boolean(data.mfa_required)
}

export async function updateOrganizationMfaRequired(organizationId: string, isRequired: boolean) {
  const { error } = await supabase
    .from('organizations')
    .update({ mfa_required: isRequired })
    .eq('id', organizationId)

  if (error) throw new Error(error.message)
}

export async function resetUserMfa(targetUserId: string, organizationId: string) {
  const { data, error, response } = await supabase.functions.invoke<{
    success?: boolean
    removed?: number
    error?: string
  }>('reset-user-mfa', {
    body: { target_user_id: targetUserId, organization_id: organizationId },
  })

  if (error) {
    if (response && typeof response.json === 'function') {
      const payload = (await response.json().catch(() => null)) as { error?: unknown } | null
      if (typeof payload?.error === 'string') throw new Error(payload.error)
    }
    throw new Error(error.message)
  }

  return data?.removed ?? 0
}
