import { Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { getTenantRoutePath } from '../../../lib/routing/appHost'
import { useFinancePinState, useVerifyFinancePin } from '../financeAccessApi'

const pinPattern = /^\d{4}$/
const unlockDurationMs = 15 * 60 * 1000
const activityRefreshIntervalMs = 30 * 1000

type StoredFinanceUnlock = {
  expiresAt: number
  pinSetAt: string | null
}

const readStoredUnlock = (key: string | null) => {
  if (!key) return null
  try {
    return JSON.parse(window.sessionStorage.getItem(key) ?? 'null') as StoredFinanceUnlock | null
  } catch {
    window.sessionStorage.removeItem(key)
    return null
  }
}

export function FinanceAccessGuard() {
  const { currentOrganization, organizationId, user } = useAuth()
  const storageKey = useMemo(
    () => organizationId && user?.id ? `freedom.financeUnlock.v1.${organizationId}.${user.id}` : null,
    [organizationId, user?.id],
  )

  return (
    <FinanceAccessGate
      key={storageKey ?? 'finance-access-without-account'}
      organizationId={organizationId}
      organizationSlug={currentOrganization?.slug}
      storageKey={storageKey}
    />
  )
}

type FinanceAccessGateProps = {
  organizationId: string | null
  organizationSlug: string | undefined
  storageKey: string | null
}

function FinanceAccessGate({ organizationId, organizationSlug, storageKey }: FinanceAccessGateProps) {
  const { t } = useI18n()
  const stateQuery = useFinancePinState(organizationId)
  const verifyMutation = useVerifyFinancePin(organizationId)
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [unlockedPinSetAt, setUnlockedPinSetAt] = useState<string | null>(null)
  const [unlockedUntil, setUnlockedUntil] = useState(0)
  const pinState = stateQuery.data ?? null
  const isUnlocked = Boolean(
    pinState?.has_pin
      && unlockedPinSetAt
      && unlockedPinSetAt === pinState.pin_set_at,
  )

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const stored = readStoredUnlock(storageKey)
      if (!stored || stored.expiresAt <= Date.now()) {
        if (storageKey) window.sessionStorage.removeItem(storageKey)
        return
      }
      setUnlockedPinSetAt(stored.pinSetAt)
      setUnlockedUntil(stored.expiresAt)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [storageKey])

  useEffect(() => {
    if (!pinState || stateQuery.isLoading) return
    const stored = readStoredUnlock(storageKey)
    if (!pinState.has_pin || stored?.pinSetAt !== pinState.pin_set_at) {
      if (storageKey) window.sessionStorage.removeItem(storageKey)
    }
  }, [pinState, stateQuery.isLoading, storageKey])

  useEffect(() => {
    if (!isUnlocked || !storageKey) return

    let lastRefreshAt = Date.now()
    const refreshUnlock = () => {
      const now = Date.now()
      if (now - lastRefreshAt < activityRefreshIntervalMs) return
      lastRefreshAt = now
      const expiresAt = now + unlockDurationMs
      window.sessionStorage.setItem(storageKey, JSON.stringify({ expiresAt, pinSetAt: pinState?.pin_set_at ?? null }))
      setUnlockedUntil(expiresAt)
    }
    const checkExpiry = () => {
      const stored = readStoredUnlock(storageKey)
      if (!stored || stored.expiresAt <= Date.now()) {
        window.sessionStorage.removeItem(storageKey)
        setUnlockedUntil(0)
      }
    }

    window.addEventListener('pointerdown', refreshUnlock, { passive: true })
    window.addEventListener('keydown', refreshUnlock)
    window.addEventListener('touchstart', refreshUnlock, { passive: true })
    const timeoutId = window.setTimeout(checkExpiry, Math.max(0, unlockedUntil - Date.now()))

    return () => {
      window.removeEventListener('pointerdown', refreshUnlock)
      window.removeEventListener('keydown', refreshUnlock)
      window.removeEventListener('touchstart', refreshUnlock)
      window.clearTimeout(timeoutId)
    }
  }, [isUnlocked, pinState?.pin_set_at, storageKey, unlockedUntil])

  const submitPin = async () => {
    if (!pinPattern.test(pin)) {
      setMessage(t('financeAccess.enterFourDigits'))
      return
    }

    setMessage(null)
    try {
      const result = await verifyMutation.mutateAsync(pin)
      if (!result.is_valid) {
        setPin('')
        setMessage(result.locked_until
          ? t('financeAccess.tooManyAttempts')
          : t('financeAccess.invalidPin'))
        return
      }

      const expiresAt = Date.now() + unlockDurationMs
      if (storageKey) {
        window.sessionStorage.setItem(storageKey, JSON.stringify({ expiresAt, pinSetAt: pinState?.pin_set_at ?? null }))
      }
      setUnlockedUntil(expiresAt)
      setUnlockedPinSetAt(pinState?.pin_set_at ?? null)
      setPin('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('financeAccess.verifyFailed'))
    }
  }

  if (stateQuery.isLoading) {
    return (
      <div className="grid min-h-[60svh] place-items-center">
        <div className="inline-flex items-center gap-3 text-sm font-medium text-slate-600">
          <Loader2 className="size-5 animate-spin text-emerald-700" /> {t('financeAccess.checking')}
        </div>
      </div>
    )
  }

  if (stateQuery.isError) {
    return (
      <section className="mx-auto grid min-h-[60svh] w-full max-w-md place-content-center gap-4 text-center">
        <LockKeyhole className="mx-auto size-10 text-red-600" />
        <div>
          <h2 className="text-xl font-semibold text-slate-950">{t('financeAccess.errorTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{stateQuery.error.message}</p>
        </div>
        <Button onClick={() => stateQuery.refetch()} type="button">{t('financeAccess.retry')}</Button>
      </section>
    )
  }

  if (!pinState?.has_pin) {
    return (
      <section className="mx-auto grid min-h-[60svh] w-full max-w-md place-content-center gap-4 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-800">
          <LockKeyhole className="size-7" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-950">{t('financeAccess.setupTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('financeAccess.setupDescription')}</p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          to={getTenantRoutePath('/admin/settings', organizationSlug)}
        >
          {t('financeAccess.openSettings')}
        </Link>
      </section>
    )
  }

  if (isUnlocked) return <Outlet />

  return (
    <section className="mx-auto grid min-h-[60svh] w-full max-w-sm place-content-center gap-5 px-2 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-800">
        <LockKeyhole className="size-7" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-slate-950">{t('financeAccess.lockedTitle')}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{t('financeAccess.lockedDescription')}</p>
      </div>
      <label className="grid gap-2 text-left text-sm font-medium text-slate-700">
        <span>{t('financeAccess.pinLabel')}</span>
        <input
          autoFocus
          autoComplete="off"
          className="min-h-14 w-full rounded-md border border-slate-200 bg-white px-4 text-center text-2xl font-semibold tracking-[0.5em] text-slate-950 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
          inputMode="numeric"
          maxLength={4}
          onChange={(event) => {
            setMessage(null)
            setPin(event.target.value.replace(/\D/g, '').slice(0, 4))
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void submitPin()
            }
          }}
          pattern="[0-9]*"
          placeholder="••••"
          type="password"
          value={pin}
        />
      </label>
      {message ? <p className="text-sm font-medium text-red-700">{message}</p> : null}
      <Button className="min-h-12 w-full" disabled={verifyMutation.isPending} onClick={() => void submitPin()} type="button">
        {verifyMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        {t('financeAccess.unlock')}
      </Button>
    </section>
  )
}

