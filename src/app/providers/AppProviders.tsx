import type { PropsWithChildren } from 'react'
import { AuthProvider } from '../../features/auth/AuthProvider'
import { I18nProvider } from '../../lib/i18n/I18nProvider'
import { QueryProvider } from '../../lib/query/QueryProvider'

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <I18nProvider>
      <QueryProvider>
        <AuthProvider>{children}</AuthProvider>
      </QueryProvider>
    </I18nProvider>
  )
}
