import { useContext } from 'react'
import { AuthContext } from '../features/auth/AuthContext'

export function useAuth() {
  const value = useContext(AuthContext)

  if (!value) {
    throw new Error('useAuth должен использоваться внутри AuthProvider.')
  }

  return value
}
