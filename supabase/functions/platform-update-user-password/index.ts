import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const allowedOrigin = (origin: string | null) => {
  if (!origin) return '*'

  try {
    const hostname = new URL(origin).hostname.toLowerCase()
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === 'freedomplatform.cc' ||
      hostname.endsWith('.freedomplatform.cc') ||
      hostname.endsWith('.vercel.app')
    ) {
      return origin
    }
  } catch {
    return 'null'
  }

  return 'null'
}

const corsHeaders = (request: Request) => ({
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': allowedOrigin(request.headers.get('origin')),
  'Content-Type': 'application/json',
  Vary: 'Origin',
})

const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(request) })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(request) })
  }

  if (request.method !== 'POST') {
    return json(request, { error: 'Method not allowed.' }, 405)
  }

  const authorization = request.headers.get('authorization')
  const accessToken = authorization?.replace(/^Bearer\s+/i, '')
  if (!accessToken) {
    return json(request, { error: 'Authentication is required.' }, 401)
  }

  const {
    data: { user: caller },
    error: callerError,
  } = await supabaseAdmin.auth.getUser(accessToken)

  if (callerError || !caller) {
    return json(request, { error: 'Invalid authentication session.' }, 401)
  }

  const { data: platformRole, error: roleError } = await supabaseAdmin
    .from('platform_user_roles')
    .select('role')
    .eq('user_id', caller.id)
    .maybeSingle()

  if (roleError || platformRole?.role !== 'platform_owner') {
    return json(request, { error: 'Only the platform owner can change user passwords.' }, 403)
  }

  let payload: { target_user_id?: unknown; password?: unknown }
  try {
    payload = await request.json()
  } catch {
    return json(request, { error: 'Invalid request body.' }, 400)
  }

  const targetUserId = typeof payload.target_user_id === 'string' ? payload.target_user_id : ''
  const password = typeof payload.password === 'string' ? payload.password : ''
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  if (!uuidPattern.test(targetUserId)) {
    return json(request, { error: 'A valid target user ID is required.' }, 400)
  }

  if (password.length < 8 || password.length > 72) {
    return json(request, { error: 'Password must contain between 8 and 72 characters.' }, 400)
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('organization_memberships')
    .select('id')
    .eq('user_id', targetUserId)
    .limit(1)
    .maybeSingle()

  if (membershipError || !membership) {
    return json(request, { error: 'The selected user is not an organization member.' }, 404)
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
    password,
  })

  if (updateError) {
    return json(request, { error: updateError.message }, 400)
  }

  return json(request, { success: true })
})
