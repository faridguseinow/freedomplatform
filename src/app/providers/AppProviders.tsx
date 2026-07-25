import type { PropsWithChildren } from 'react'
import { AuthProvider } from '../../features/auth/AuthProvider'
import { QueryProvider } from '../../lib/query/QueryProvider'

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  )
}
