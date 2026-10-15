import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.86.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type DemoRole = 'organization_admin' | 'employee'

const demoAccounts: Record<DemoRole, { email: string; fullName: string }> = {
  organization_admin: {
    email: 'demo-admin@users.freedomplatform.cc',
    fullName: 'Demo administrator',
  },
  employee: {
    email: 'demo-employee@users.freedomplatform.cc',
    fullName: 'Demo employee',
  },
}

const allowedOrigin = (origin: string | null) => {
  if (!origin) return '*'

  try {
    const hostname = new URL(origin).hostname.toLowerCase()
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === 'demo.freedomplatform.cc' ||
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

async function findUserByEmail(email: string) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error

    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase())
    if (user) return user
    if (data.users.length < 1000) return null
  }

  throw new Error('Demo user lookup exceeded the safe pagination limit.')
}

async function ensureDemoUser(role: DemoRole): Promise<User> {
  const account = demoAccounts[role]
  let user = await findUserByEmail(account.email)

  if (user && user.app_metadata.demo_account !== true) {
    throw new Error(`The reserved demo email ${account.email} belongs to a non-demo account.`)
  }

  if (!user) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: account.email,
      email_confirm: true,
      app_metadata: { demo_account: true, demo_role: role },
      user_metadata: { full_name: account.fullName },
    })

    if (error) {
      user = await findUserByEmail(account.email)
      if (!user || user.app_metadata.demo_account !== true) throw error
    } else {
      user = data.user
    }
  }

  const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    user.id,
    {
      email_confirm: true,
      app_metadata: { ...user.app_metadata, demo_account: true, demo_role: role },
      user_metadata: { ...user.user_metadata, full_name: account.fullName },
    },
  )
  if (updateError) throw updateError
  user = updatedUser.user

  const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
    id: user.id,
    email: account.email,
    full_name: account.fullName,
    is_active: true,
  })
  if (profileError) throw profileError

  const { error: membershipError } = await supabaseAdmin.rpc('provision_fixed_demo_membership', {
    target_user_id: user.id,
    target_role: role,
  })
  if (membershipError) throw membershipError

  return user
}

async function validateDemoCaller(request: Request) {
  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!accessToken) return null

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken)
  if (error || !user || user.app_metadata.demo_account !== true) return null

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('organization_id, organizations!inner(slug)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('organizations.slug', 'demo')
    .maybeSingle()

  return membership ? user : null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(request) })
  }

  if (request.method !== 'POST') {
    return json(request, { error: 'Method not allowed.' }, 405)
  }

  try {
    const payload = await request.json().catch(() => ({}))
    const action = payload.action === 'cleanup' ? 'cleanup' : 'login'

    if (action === 'cleanup') {
      const caller = await validateDemoCaller(request)
      if (!caller) return json(request, { error: 'Demo authentication is required.' }, 401)

      const { data, error } = await supabaseAdmin.rpc('cleanup_stale_demo_runtime')
      if (error) throw error
      return json(request, data ?? { reset: false })
    }

    const role = payload.role as DemoRole
    if (role !== 'organization_admin' && role !== 'employee') {
      return json(request, { error: 'Unsupported demo role.' }, 400)
    }

    const { data: demoOrganization, error: organizationError } = await supabaseAdmin
      .from('organizations')
      .select('id,status')
      .eq('slug', 'demo')
      .eq('status', 'active')
      .maybeSingle()
    if (organizationError || !demoOrganization) {
      return json(request, { error: 'Demo organization is unavailable.' }, 503)
    }

    const [adminUser, employeeUser] = await Promise.all([
      ensureDemoUser('organization_admin'),
      ensureDemoUser('employee'),
    ])

    const { data: consolidation, error: consolidationError } = await supabaseAdmin.rpc(
      'consolidate_demo_anonymous_users_strict',
      {
        target_admin_id: adminUser.id,
        target_employee_id: employeeUser.id,
      },
    )
    if (consolidationError) throw consolidationError

    await supabaseAdmin.rpc('cleanup_stale_demo_runtime')

    const selectedUser = role === 'organization_admin' ? adminUser : employeeUser
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: selectedUser.email!,
    })
    if (linkError) throw linkError

    return json(request, {
      token_hash: linkData.properties.hashed_token,
      role,
      consolidation,
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String(error.message)
          : 'Demo login failed.'
    return json(request, { error: message }, 500)
  }
})
