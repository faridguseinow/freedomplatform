import type { PropsWithChildren } from 'react'
import { AuthProvider } from '../../features/auth/AuthProvider'
import { I18nProvider } from '../../lib/i18n/I18nProvider'
import { PwaManager } from '../../lib/pwa/PwaManager'
import { QueryProvider } from '../../lib/query/QueryProvider'
import { ThemeProvider } from '../../lib/theme/ThemeProvider'

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <QueryProvider>
          <AuthProvider>
            <PwaManager />
            {children}
          </AuthProvider>
        </QueryProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
