import { AlertTriangle, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'

export function AccessNotConfiguredPage() {
  const navigate = useNavigate()
  const { authError, signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <main className="grid min-h-svh place-items-center bg-slate-50 px-4 py-10">
      <section className="grid w-full max-w-md gap-5 rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <span className="mx-auto inline-flex size-11 items-center justify-center rounded-md bg-amber-50 text-amber-700">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>
        <div className="grid gap-2">
          <h1 className="text-xl font-semibold text-slate-950">Доступ не настроен</h1>
          <p className="text-sm leading-6 text-slate-600">
            {authError ??
              'Ваш аккаунт создан, но доступ к организации еще не настроен. Обратитесь к владельцу Freedom Platform.'}
          </p>
        </div>
        <Button className="w-full" onClick={handleSignOut} type="button" variant="secondary">
          <LogOut aria-hidden="true" className="size-4" />
          Выйти
        </Button>
      </section>
    </main>
  )
}
