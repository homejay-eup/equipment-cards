import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from './supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function requireAdmin() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null

  const { data } = await getServiceClient()
    .from('allowed_emails')
    .select('role')
    .eq('email', user.email)
    .single()

  return data?.role === 'admin' ? user : null
}

export async function getUserRole(): Promise<'admin' | 'viewer' | null> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null

  const { data } = await getServiceClient()
    .from('allowed_emails')
    .select('role')
    .eq('email', user.email)
    .single()

  if (!data) return null
  return data.role as 'admin' | 'viewer'
}
