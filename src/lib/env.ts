type PublicEnv = {
  supabaseUrl: string
  supabaseAnonKey: string
}

type PublicEnvKey = 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'

export type EnvValidationResult =
  | { isValid: true; env: PublicEnv; missingKeys: [] }
  | { isValid: false; env: PublicEnv; missingKeys: PublicEnvKey[] }

const fallbackEnv: PublicEnv = {
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseAnonKey: 'missing-anon-key',
}

export function validatePublicEnv(): EnvValidationResult {
  const missingKeys: PublicEnvKey[] = []
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl) missingKeys.push('VITE_SUPABASE_URL')
  if (!supabaseAnonKey) missingKeys.push('VITE_SUPABASE_ANON_KEY')

  if (missingKeys.length) {
    if (import.meta.env.DEV) {
      console.error('[Freedom Platform] Missing public env keys:', missingKeys.join(', '))
    }

    return {
      isValid: false,
      env: {
        supabaseUrl: supabaseUrl || fallbackEnv.supabaseUrl,
        supabaseAnonKey: supabaseAnonKey || fallbackEnv.supabaseAnonKey,
      },
      missingKeys,
    }
  }

  return {
    isValid: true,
    env: {
      supabaseUrl,
      supabaseAnonKey,
    },
    missingKeys: [],
  }
}

export const publicEnv = validatePublicEnv()
