import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAllowedDomain } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// 取得目前登入者的角色資訊（level）
async function getCallerRoleInfo(): Promise<{ level: string } | null> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email || !isAllowedDomain(user.email)) return null

  const service = getSupabase()
  const { data: emailData } = await service
    .from('allowed_emails')
    .select('role')
    .eq('email', user.email)
    .single()

  if (!emailData?.role) return null

  const { data: roleData } = await service
    .from('roles')
    .select('level')
    .eq('name', emailData.role)
    .single()

  if (!roleData) return null
  return roleData as { level: string }
}

// POST /api/admin/sync-users — 掃描 Supabase Auth 使用者，將公司網域帳號同步進 allowed_emails
export async function POST() {
  const callerRole = await getCallerRoleInfo()
  if (!callerRole) {
    return NextResponse.json({ error: '無法驗證操作者角色' }, { status: 403 })
  }
  if (callerRole.level !== 'super_admin') {
    return NextResponse.json({ error: '僅限最高管理員操作' }, { status: 403 })
  }

  const service = getSupabase()

  // 分頁抓出所有 Auth 使用者
  const allUsers: { email?: string | null }[] = []
  let page = 1
  const perPage = 1000
  while (true) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const users = data?.users ?? []
    if (users.length === 0) break
    allUsers.push(...users)
    if (users.length < perPage) break
    page += 1
  }

  // 篩出公司網域 email
  const companyEmails = Array.from(
    new Set(
      allUsers
        .map((u) => u.email?.toLowerCase().trim())
        .filter((email): email is string => !!email && isAllowedDomain(email))
    )
  )

  // 查現有 allowed_emails，算出尚未加入的帳號
  const { data: existingRows, error: existingError } = await service
    .from('allowed_emails')
    .select('email')

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  const existingEmails = new Set((existingRows ?? []).map((r) => r.email.toLowerCase()))
  const newEmails = companyEmails.filter((email) => !existingEmails.has(email))

  if (newEmails.length === 0) {
    return NextResponse.json({ added: [] })
  }

  const { data: inserted, error: insertError } = await service
    .from('allowed_emails')
    .upsert(
      newEmails.map((email) => ({ email, role: '一般使用者' })),
      { onConflict: 'email', ignoreDuplicates: true },
    )
    .select('email, role, created_at')

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ added: inserted ?? [] })
}
