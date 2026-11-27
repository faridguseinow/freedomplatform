import { Check, Copy, KeyRound, Loader2, LogOut, ShieldCheck, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { LanguageSwitcher } from '../../../components/common/LanguageSwitcher'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import {
  getVerifiedTotpFactorId,
  MfaInvalidCodeError,
  startTotpEnrollment,
  verifyTotpCode,
  type TotpEnrollment,
} from '../mfaApi'

const formatSecret = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim()

export function MfaPage() {
  const { completeMfa, hostOrganization, mfaStatus, signOut, user } = useAuth()
  const { t } = useI18n()
  const isEnrollment = mfaStatus === 'enroll'
  const [factorId, setFactorId] = useState<string | null>(null)
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [isPreparing, setIsPreparing] = useState(true)
  const [isVerifying, setIsVerifying] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSecretCopied, setIsSecretCopied] = useState(false)
  const preparedForRef = useRef<string | null>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)

  const prepare = useCallback(async () => {
    setIsPreparing(true)
    setError(null)

    try {
      if (isEnrollment) {
        const nextEnrollment = await startTotpEnrollment()
        setEnrollment(nextEnrollment)
        setFactorId(nextEnrollment.factorId)
      } else {
        const nextFactorId = await getVerifiedTotpFactorId()
        if (!nextFactorId) throw new Error(t('auth.mfa.noFactor'))
        setFactorId(nextFactorId)
      }
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : t('auth.mfa.prepareFailed'))
    } finally {
      setIsPreparing(false)
    }
  }, [isEnrollment, t])

  useEffect(() => {
    const preparationKey = `${user?.id ?? ''}:${mfaStatus}`
    if (preparedForRef.current === preparationKey) return
    preparedForRef.current = preparationKey
    void prepare()
  }, [mfaStatus, prepare, user?.id])

  useEffect(() => {
    if (!isPreparing) codeInputRef.current?.focus()
  }, [isPreparing])

  const verify = async (value: string) => {
    if (!factorId || isVerifying) return

    if (!/^\d{6}$/.test(value)) {
      setError(t('auth.mfa.codeFormat'))
      return
    }

    setIsVerifying(true)
    setError(null)

    try {
      await verifyTotpCode(factorId, value)
      await completeMfa()
    } catch (verifyError) {
      setCode('')
      setError(
        verifyError instanceof MfaInvalidCodeError
          ? t('auth.mfa.invalidCode')
          : verifyError instanceof Error
            ? verifyError.message
            : t('auth.mfa.verifyFailed'),
      )
      codeInputRef.current?.focus()
    } finally {
      setIsVerifying(false)
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void verify(code)
  }

  const onCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (digits.length === 6) void verify(digits)
  }

  const copySecret = async () => {
    if (!enrollment) return
    try {
      await navigator.clipboard.writeText(enrollment.secret)
      setIsSecretCopied(true)
      window.setTimeout(() => setIsSecretCopied(false), 1400)
    } catch {
      setIsSecretCopied(false)
    }
  }

  return (
    <main className="grid min-h-svh bg-slate-50 px-4 py-8 sm:px-6">
      <section className="mx-auto grid w-full max-w-md content-center gap-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white">
              <ShieldCheck aria-hidden="true" className="size-6" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-slate-950">
                {hostOrganization?.name ?? 'Freedom Platform'}
              </p>
              <p className="truncate text-sm text-slate-500">{user?.email}</p>
            </div>
          </div>
          <LanguageSwitcher />
        </div>

        <form
          className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          noValidate
          onSubmit={onSubmit}
        >
          <div className="grid gap-2">
            <h1 className="text-xl font-semibold text-slate-950">
              {isEnrollment ? t('auth.mfa.enrollTitle') : t('auth.mfa.challengeTitle')}
            </h1>
            <p className="text-sm leading-6 text-slate-600">
              {isEnrollment ? t('auth.mfa.enrollIntro') : t('auth.mfa.challengeIntro')}
            </p>
          </div>

          {isPreparing ? (
            <div className="inline-flex min-h-24 items-center justify-center gap-3 text-sm font-medium text-slate-600">
              <Loader2 aria-hidden="true" className="size-4 animate-spin text-emerald-700" />
              {t('auth.mfa.preparing')}
            </div>
          ) : null}

          {isEnrollment && enrollment ? (
            <div className="grid gap-4">
              <ol className="grid list-decimal gap-1 pl-5 text-sm leading-6 text-slate-600">
                <li>{t('auth.mfa.stepInstall')}</li>
                <li>{t('auth.mfa.stepScan')}</li>
                <li>{t('auth.mfa.stepCode')}</li>
              </ol>
              <div className="grid place-items-center rounded-xl border border-slate-200 bg-white p-3">
                <img
                  alt={t('auth.mfa.qrAlt')}
                  className="size-48 bg-white"
                  src={enrollment.qrCode}
                />
              </div>
              <a
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 sm:hidden"
                href={enrollment.uri}
              >
                <Smartphone aria-hidden="true" className="size-4" />
                {t('auth.mfa.openApp')}
              </a>
              <div className="grid gap-1.5">
                <p className="text-xs leading-5 text-slate-500">{t('auth.mfa.manualKey')}</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-md bg-slate-100 px-3 py-2 font-mono text-xs text-slate-800">
                    {formatSecret(enrollment.secret)}
                  </code>
                  <Button
                    aria-label={t('auth.mfa.copyKey')}
                    className="shrink-0 px-3"
                    onClick={() => void copySecret()}
                    type="button"
                    variant="secondary"
                  >
                    {isSecretCopied ? (
                      <Check aria-hidden="true" className="size-4" />
                    ) : (
                      <Copy aria-hidden="true" className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {!isPreparing && factorId ? (
            <label className="grid gap-1.5 text-sm font-medium text-slate-700" htmlFor="mfa_code">
              <span>{t('auth.mfa.codeLabel')}</span>
              <input
                autoComplete="one-time-code"
                className="min-h-12 w-full rounded-md border border-slate-200 bg-white px-3 text-center font-mono text-2xl tracking-[0.4em] text-slate-950 outline-none transition-colors placeholder:text-slate-300 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                disabled={isVerifying}
                id="mfa_code"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => onCodeChange(event.target.value)}
                pattern="[0-9]*"
                placeholder="000000"
                ref={codeInputRef}
                value={code}
              />
            </label>
          ) : null}

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">
              {error}
            </div>
          ) : null}

          {!isPreparing && !factorId ? (
            <Button onClick={() => void prepare()} type="button" variant="secondary">
              {t('auth.mfa.retry')}
            </Button>
          ) : null}

          {factorId ? (
            <Button className="w-full" disabled={isVerifying || isPreparing} type="submit">
              {isVerifying ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <KeyRound aria-hidden="true" className="size-4" />
              )}
              {isEnrollment ? t('auth.mfa.enrollSubmit') : t('auth.mfa.challengeSubmit')}
            </Button>
          ) : null}

          <p className="text-xs leading-5 text-slate-500">
            {isEnrollment ? t('auth.mfa.enrollHelp') : t('auth.mfa.lostDevice')}
          </p>

          <Button onClick={() => void signOut()} type="button" variant="ghost">
            <LogOut aria-hidden="true" className="size-4" />
            {t('auth.mfa.signOut')}
          </Button>
        </form>
      </section>
    </main>
  )
}

export function MfaGate({ children }: { children: ReactNode }) {
  const { mfaStatus, user } = useAuth()

  if (user && (mfaStatus === 'challenge' || mfaStatus === 'enroll')) {
    return <MfaPage />
  }

  return children
}
