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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const readAal = (accessToken: string) => {
  try {
    const [, payload] = accessToken.split('.')
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')))
    return typeof claims.aal === 'string' ? claims.aal : 'aal1'
  } catch {
    return 'aal1'
  }
}

// Removes every authenticator app factor of a user who lost access to it, so
// the user connects a new one on the next sign-in.
// Allowed for the platform owner (any organization member) and for an
// organization admin who signed in with an authenticator (aal2) for the
// employees of organizations they administer.
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

  let payload: { target_user_id?: unknown; organization_id?: unknown }
  try {
    payload = await request.json()
  } catch {
    return json(request, { error: 'Invalid request body.' }, 400)
  }

  const targetUserId = typeof payload.target_user_id === 'string' ? payload.target_user_id : ''
  const organizationId = typeof payload.organization_id === 'string' ? payload.organization_id : ''

  if (!uuidPattern.test(targetUserId)) {
    return json(request, { error: 'A valid target user ID is required.' }, 400)
  }

  const { data: platformRole, error: roleError } = await supabaseAdmin
    .from('platform_user_roles')
    .select('role')
    .eq('user_id', caller.id)
    .maybeSingle()

  if (roleError) {
    return json(request, { error: 'Could not verify permissions.' }, 500)
  }

  if (platformRole?.role === 'platform_owner') {
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('organization_memberships')
      .select('id')
      .eq('user_id', targetUserId)
      .limit(1)
      .maybeSingle()

    if (membershipError || !membership) {
      return json(request, { error: 'The selected user is not an organization member.' }, 404)
    }
  } else {
    if (!uuidPattern.test(organizationId)) {
      return json(request, { error: 'A valid organization ID is required.' }, 400)
    }

    if (targetUserId === caller.id) {
      return json(request, { error: 'You cannot reset your own authenticator.' }, 403)
    }

    const { data: organization } = await supabaseAdmin
      .from('organizations')
      .select('id,status,mfa_required')
      .eq('id', organizationId)
      .maybeSingle()

    if (!organization || organization.status !== 'active') {
      return json(request, { error: 'Organization is not available.' }, 404)
    }

    if (organization.mfa_required && readAal(accessToken) !== 'aal2') {
      return json(request, { error: 'Sign in with your authenticator first.' }, 403)
    }

    const { data: memberships, error: membershipsError } = await supabaseAdmin
      .from('organization_memberships')
      .select('user_id,role,is_active')
      .eq('organization_id', organizationId)
      .in('user_id', [caller.id, targetUserId])

    if (membershipsError) {
      return json(request, { error: 'Could not verify permissions.' }, 500)
    }

    const callerMembership = memberships?.find((item) => item.user_id === caller.id)
    const targetMembership = memberships?.find((item) => item.user_id === targetUserId)

    if (!callerMembership?.is_active || callerMembership.role !== 'organization_admin') {
      return json(request, { error: 'Only organization admins can reset authenticators.' }, 403)
    }

    if (!targetMembership || targetMembership.role !== 'employee') {
      return json(request, { error: 'Admins can reset authenticators of employees only.' }, 403)
    }
  }

  const { data: factors, error: listError } = await supabaseAdmin.auth.admin.mfa.listFactors({
    userId: targetUserId,
  })

  if (listError) {
    return json(request, { error: listError.message }, 400)
  }

  let removed = 0
  for (const factor of factors?.factors ?? []) {
    if (factor.factor_type !== 'totp') continue
    const { error: deleteError } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId: targetUserId,
    })
    if (deleteError) {
      return json(request, { error: deleteError.message }, 400)
    }
    removed += 1
  }

  return json(request, { success: true, removed })
})
