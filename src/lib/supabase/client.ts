import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { publicEnv } from '../env'

export const supabase = createClient<Database>(
  publicEnv.env.supabaseUrl,
  publicEnv.env.supabaseAnonKey,
)
