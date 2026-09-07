import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowLeft,
  BriefcaseBusiness,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { CatalogImage } from '../../../components/common/CatalogImage'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { useAuth } from '../../../hooks/useAuth'
import { getCurrentAppHost } from '../../../lib/routing/appHost'
import { getRoleHomePath, USER_ROLES } from '../../../types/roles'
import type { DemoRole, OrganizationLoginBrand } from '../AuthContext'

const loginSchema = z.object({
  login: z.string().trim().min(3, 'Введите логин или email.'),
  password: z.string().min(6, 'Пароль должен содержать минимум 6 символов.'),
})

type LoginFormValues = z.infer<typeof loginSchema>

type LoginBrandProps = {
  organization: OrganizationLoginBrand | null
  showDemoFallback?: boolean
}

function LoginBrand({ organization, showDemoFallback = false }: LoginBrandProps) {
  const name = organization?.name ?? 'Freedom Platform'

  return (
    <div className="flex items-center gap-3">
      {organization?.logo_path ? (
        <CatalogImage alt={name} className="size-12 rounded-xl" imagePath={organization.logo_path} />
      ) : showDemoFallback ? (
        <img
          alt={name}
          className="size-12 rounded-xl border border-slate-200 bg-white object-cover"
          src="/demo-assets/freedom-demo-logo.png"
        />
      ) : organization ? (
        <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-emerald-700 text-lg font-semibold text-white">
          {name.slice(0, 1).toUpperCase()}
        </div>
      ) : (
        <img
          alt="Freedom Platform"
          className="size-12 rounded-xl object-cover"
          src="/pwa/freedom-platform.svg"
        />
      )}
      <div>
        <p className="text-lg font-semibold text-slate-950">{name}</p>
        {organization ? <p className="text-sm text-slate-500">Freedom Platform</p> : null}
      </div>
    </div>
  )
}

export function LoginPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    authError,
    hostOrganization,
    isLoading,
    role,
    signIn,
    signInDemo,
    user,
  } = useAuth()
  const appHost = getCurrentAppHost()
  const isDemoHost = appHost.mode === 'tenant' && appHost.slug === 'demo'
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [demoStep, setDemoStep] = useState<'intro' | 'roles'>('intro')
  const [pendingDemoRole, setPendingDemoRole] = useState<DemoRole | null>(null)

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { login: '', password: '' },
  })

  const requestedPath =
    typeof location.state === 'object' &&
    location.state !== null &&
    'from' in location.state &&
    typeof location.state.from === 'object' &&
    location.state.from !== null &&
    'pathname' in location.state.from &&
    typeof location.state.from.pathname === 'string'
      ? `${location.state.from.pathname}${'search' in location.state.from && typeof location.state.from.search === 'string' ? location.state.from.search : ''}`
      : null

  useEffect(() => {
    if (user && role) {
      navigate(requestedPath ?? getRoleHomePath(role), { replace: true })
    }
  }, [navigate, requestedPath, role, user])

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)

    try {
      const nextRole = await signIn(values)

      if (!nextRole) {
        navigate(
          appHost.mode === 'platform-admin' ? '/access-denied' : '/access-not-configured',
          { replace: true },
        )
        return
      }

      navigate(requestedPath ?? getRoleHomePath(nextRole), { replace: true })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось войти.')
    }
  })

  const openDemoWorkspace = async (demoRole: DemoRole) => {
    setFormError(null)
    setPendingDemoRole(demoRole)

    try {
      const nextRole = await signInDemo(demoRole)
      if (!nextRole) throw new Error('Не удалось определить демо-пространство.')
      navigate(getRoleHomePath(nextRole, 'demo'), { replace: true })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось открыть демо-режим.')
    } finally {
      setPendingDemoRole(null)
    }
  }

  if (user && role) {
    return <Navigate replace to={requestedPath ?? getRoleHomePath(role)} />
  }

  if (isDemoHost) {
    return (
      <main className="grid min-h-svh bg-slate-50 px-4 py-8 sm:px-6">
        <section className="mx-auto grid w-full max-w-lg content-center gap-6">
          <LoginBrand organization={hostOrganization} showDemoFallback />

          {demoStep === 'intro' ? (
            <div className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-2">
                <h1 className="text-2xl font-semibold text-slate-950">Попробуйте Freedom Platform</h1>
                <p className="text-sm leading-6 text-slate-600">
                  Посмотрите, как устроена ежедневная работа организации. Вы сможете выбрать роль и открыть готовое демо-пространство без регистрации.
                </p>
              </div>

              <div className="grid gap-2 text-sm leading-6 text-slate-600">
                <p>Внутри уже подготовлены рабочие места, каталог, заказы и примеры операций.</p>
                <p>Изменения выполняются только в демонстрационной организации.</p>
              </div>

              <Button className="w-full" onClick={() => setDemoStep('roles')} type="button">
                <LogIn aria-hidden="true" className="size-4" />
                Открыть демо
              </Button>
              <p className="text-center text-xs leading-5 text-slate-500">
                Продолжая, вы соглашаетесь использовать демонстрационные данные только для знакомства с платформой.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-2">
                <button
                  className="flex w-fit items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
                  onClick={() => setDemoStep('intro')}
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  Назад
                </button>
                <h1 className="text-2xl font-semibold text-slate-950">Выберите рабочее пространство</h1>
                <p className="text-sm leading-6 text-slate-600">
                  Можно вернуться и открыть вторую роль после завершения просмотра.
                </p>
              </div>

              <div className="grid gap-3">
                <button
                  className="grid gap-2 rounded-xl border border-slate-200 p-4 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60"
                  disabled={isLoading || pendingDemoRole !== null}
                  onClick={() => void openDemoWorkspace(USER_ROLES.employee)}
                  type="button"
                >
                  <span className="flex items-center gap-2 font-semibold text-slate-950">
                    {pendingDemoRole === USER_ROLES.employee ? (
                      <Loader2 aria-hidden="true" className="size-5 animate-spin text-emerald-700" />
                    ) : (
                      <UserRound aria-hidden="true" className="size-5 text-emerald-700" />
                    )}
                    Пространство сотрудника
                  </span>
                  <span className="text-sm leading-6 text-slate-600">
                    Рабочая смена, места, заказы, меню и ежедневные операции.
                  </span>
                </button>

                <button
                  className="grid gap-2 rounded-xl border border-slate-200 p-4 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-60"
                  disabled={isLoading || pendingDemoRole !== null}
                  onClick={() => void openDemoWorkspace(USER_ROLES.organizationAdmin)}
                  type="button"
                >
                  <span className="flex items-center gap-2 font-semibold text-slate-950">
                    {pendingDemoRole === USER_ROLES.organizationAdmin ? (
                      <Loader2 aria-hidden="true" className="size-5 animate-spin text-emerald-700" />
                    ) : (
                      <BriefcaseBusiness aria-hidden="true" className="size-5 text-emerald-700" />
                    )}
                    Кабинет администратора
                  </span>
                  <span className="text-sm leading-6 text-slate-600">
                    Управление организацией, сотрудниками, каталогом, финансами и настройками.
                  </span>
                </button>
              </div>

              {formError || authError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">
                  {formError ?? authError}
                </div>
              ) : null}

              <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                Демо-доступ изолирован от данных других организаций.
              </div>
            </div>
          )}
        </section>
      </main>
    )
  }

  return (
    <main className="grid min-h-svh bg-slate-50 px-4 py-8 sm:px-6">
      <section className="mx-auto grid w-full max-w-md content-center gap-6">
        <LoginBrand organization={hostOrganization} />

        <form
          className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          noValidate
          onSubmit={onSubmit}
        >
          <h1 className="text-xl font-semibold text-slate-950">Вход</h1>

          <Input
            autoComplete="username"
            error={errors.login?.message}
            id="login"
            label="Логин или email"
            placeholder="name@company.com"
            type="text"
            {...register('login')}
          />

          <div className="grid gap-1.5 text-sm font-medium text-slate-700">
            <label htmlFor="password">Пароль</label>
            <div className="relative">
              <input
                aria-describedby={errors.password ? 'password-error' : undefined}
                aria-invalid={Boolean(errors.password)}
                autoComplete="current-password"
                className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 pr-12 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 aria-[invalid=true]:border-red-300"
                id="password"
                placeholder="Введите пароль"
                type={showPassword ? 'text' : 'password'}
                {...register('password')}
              />
              <button
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                onClick={() => setShowPassword((value) => !value)}
                type="button"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="size-4" />
                ) : (
                  <Eye aria-hidden="true" className="size-4" />
                )}
              </button>
            </div>
            {errors.password ? (
              <span className="text-xs font-normal text-red-700" id="password-error">
                {errors.password.message}
              </span>
            ) : null}
          </div>

          {formError || authError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">
              {formError ?? authError}
            </div>
          ) : null}

          <Button className="w-full" disabled={isSubmitting || isLoading} type="submit">
            {isSubmitting || isLoading ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <LogIn aria-hidden="true" className="size-4" />
            )}
            Войти
          </Button>
        </form>
      </section>
    </main>
  )
}
