import { CheckCircle2, Clock3, LogOut, MousePointerClick, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { useAuth } from '../../hooks/useAuth'
import { useI18n } from '../../lib/i18n/I18nContext'
import { USER_ROLES } from '../../types/roles'
import { useCurrentEmployeeShift, useEmployeeShiftMutations } from '../shifts/shiftsApi'

const welcomeStoragePrefix = 'freedom-demo-welcome-v1'

export function DemoExperience() {
  const { currentOrganization, organizationId, role, user } = useAuth()
  const { t } = useI18n()
  const isDemoAccount =
    currentOrganization?.slug === 'demo' && user?.app_metadata.demo_account === true
  const isDemoEmployee = isDemoAccount && role === USER_ROLES.employee
  const demoEmployeeOrganizationId = isDemoEmployee ? organizationId : null
  const currentShiftQuery = useCurrentEmployeeShift(demoEmployeeOrganizationId)
  const shiftMutations = useEmployeeShiftMutations(demoEmployeeOrganizationId)
  const [openAttempts, setOpenAttempts] = useState(0)
  const [dismissedWelcomeKey, setDismissedWelcomeKey] = useState<string | null>(null)

  const welcomeStorageKey =
    isDemoAccount && user
      ? `${welcomeStoragePrefix}:${user.id}:${user.last_sign_in_at ?? 'current'}`
      : null
  const isWelcomeOpen = Boolean(
    welcomeStorageKey &&
      dismissedWelcomeKey !== welcomeStorageKey &&
      !window.sessionStorage.getItem(welcomeStorageKey),
  )

  useEffect(() => {
    if (
      !isDemoEmployee ||
      !demoEmployeeOrganizationId ||
      currentShiftQuery.isLoading ||
      currentShiftQuery.data?.shift ||
      shiftMutations.open.isPending ||
      openAttempts >= 3
    ) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setOpenAttempts((attempts) => attempts + 1)
      void shiftMutations.open
        .mutateAsync({
          shiftTemplateId: null,
          openingCashAmount: 0,
        })
        .then(() => setOpenAttempts(0))
        .catch(() => undefined)
    }, openAttempts === 0 ? 0 : 2_000)

    return () => window.clearTimeout(timeoutId)
  }, [
    currentShiftQuery.data?.shift,
    currentShiftQuery.isLoading,
    demoEmployeeOrganizationId,
    isDemoEmployee,
    openAttempts,
    shiftMutations.open,
    shiftMutations.open.isPending,
  ])

  if (!isWelcomeOpen || !isDemoAccount) return null

  const closeWelcome = () => {
    if (welcomeStorageKey) {
      window.sessionStorage.setItem(welcomeStorageKey, 'shown')
      setDismissedWelcomeKey(welcomeStorageKey)
    }
  }

  const isAdmin = role === USER_ROLES.organizationAdmin
  const steps = isAdmin
    ? [
        t('demo.welcome.adminStepOne'),
        t('demo.welcome.adminStepTwo'),
        t('demo.welcome.adminStepThree'),
      ]
    : [
        t('demo.welcome.employeeStepOne'),
        t('demo.welcome.employeeStepTwo'),
        t('demo.welcome.employeeStepThree'),
      ]

  return (
    <Modal ariaLabel={t('demo.welcome.title')} onClose={closeWelcome}>
      <section className="grid max-h-[100svh] w-full max-w-2xl overflow-y-auto bg-white shadow-2xl md:max-h-[calc(100svh-3rem)] md:rounded-xl">
        <header className="relative overflow-hidden bg-slate-950 px-5 py-6 text-white sm:px-7">
          <div className="absolute inset-y-0 right-0 w-48 bg-gradient-to-l from-emerald-500/20 to-transparent" />
          <button
            aria-label={t('demo.welcome.close')}
            className="absolute right-4 top-4 grid size-9 place-items-center rounded-md text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            onClick={closeWelcome}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
          <div className="relative pr-10">
            <span className="mb-4 grid size-11 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">
              <ShieldCheck aria-hidden="true" className="size-6" />
            </span>
            <h2 className="text-2xl font-semibold sm:text-3xl">{t('demo.welcome.title')}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              {isAdmin ? t('demo.welcome.adminIntro') : t('demo.welcome.employeeIntro')}
            </p>
          </div>
        </header>

        <div className="grid gap-5 p-5 sm:p-7">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
            <strong className="block">{t('demo.welcome.safeTitle')}</strong>
            <span>{t('demo.welcome.safeDescription')}</span>
          </div>

          <div className="grid gap-3">
            {steps.map((step, index) => (
              <div className="flex items-start gap-3" key={step}>
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                  {index + 1}
                </span>
                <p className="text-sm leading-6 text-slate-700">{step}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <MousePointerClick aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-700" />
              {t('demo.welcome.tryAnything')}
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-700" />
              {t('demo.welcome.autoReset')}
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <LogOut aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-700" />
              {t('demo.welcome.switchRole')}
            </div>
          </div>

          <Button className="w-full sm:ml-auto sm:w-auto" onClick={closeWelcome} type="button">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            {t('demo.welcome.start')}
          </Button>
        </div>
      </section>
    </Modal>
  )
}
