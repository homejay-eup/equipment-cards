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

const ALLOWED_DOMAIN = '@eup.com.tw'

export async function getUserRole(): Promise<'admin' | 'viewer' | null> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null

  // 非公司信箱：無權限
  if (!user.email.endsWith(ALLOWED_DOMAIN)) return null

  const { data } = await getServiceClient()
    .from('allowed_emails')
    .select('role')
    .eq('email', user.email)
    .single()

  // allowed_emails 有記錄就用指定角色，否則公司信箱預設 viewer
  if (data?.role === 'admin') return 'admin'
  return 'viewer'
}
