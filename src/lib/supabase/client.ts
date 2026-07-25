import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const getRequiredEnv = (key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY') => {
  const value = import.meta.env[key]

  if (!value) {
    throw new Error(
      `[Freedom Platform] Не задана переменная ${key}. Создайте freedom-platform/.env.local и заполните Supabase URL и anon key.`,
    )
  }

  return value
}

export const supabase = createClient<Database>(
  getRequiredEnv('VITE_SUPABASE_URL'),
  getRequiredEnv('VITE_SUPABASE_ANON_KEY'),
)
