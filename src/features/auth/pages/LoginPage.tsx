import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { useAuth } from '../../../hooks/useAuth'
import { getRoleHomePath } from '../../../types/roles'

const loginSchema = z.object({
  login: z.string().trim().min(3, 'Введите логин или email.'),
  password: z.string().min(6, 'Пароль должен содержать минимум 6 символов.'),
})

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { authError, isLoading, role, signIn, user } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      login: '',
      password: '',
    },
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
        navigate('/access-not-configured', { replace: true })
        return
      }

      navigate(requestedPath ?? getRoleHomePath(nextRole), { replace: true })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось войти.')
    }
  })

  if (user && role) {
    return <Navigate replace to={requestedPath ?? getRoleHomePath(role)} />
  }

  return (
    <main className="grid min-h-svh bg-slate-50 px-4 py-8 sm:px-6">
      <section className="mx-auto grid w-full max-w-md content-center gap-6">
        <header className="grid gap-2">
          <p className="text-sm font-semibold text-emerald-800">Freedom Platform</p>
          <h1 className="text-3xl font-semibold text-slate-950">Вход в систему</h1>
          <p className="text-sm leading-6 text-slate-600">
            Доступ открыт только для созданных пользователей платформы и организаций.
          </p>
        </header>

        <form
          className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          noValidate
          onSubmit={onSubmit}
        >
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
                autoComplete="current-password"
                className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 pr-12 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15 aria-[invalid=true]:border-red-300"
                id="password"
                placeholder="Введите пароль"
                type={showPassword ? 'text' : 'password'}
                aria-describedby={errors.password ? 'password-error' : undefined}
                aria-invalid={Boolean(errors.password)}
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
