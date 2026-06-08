import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import UserManagementTable from '@/components/UserManagementTable'
import { ArrowLeft, Users } from 'lucide-react'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function fetchAllowedEmails() {
  const { data } = await getServiceClient()
    .from('allowed_emails')
    .select('email, role, created_at')
    .order('created_at', { ascending: true })

  return (data ?? []) as { email: string; role: string; created_at: string }[]
}

async function fetchAssignableRoles(): Promise<string[]> {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) return ['管理員', '一般使用者']

    const service = getServiceClient()

    // 取得目前使用者的角色名稱
    const { data: emailData } = await service
      .from('allowed_emails')
      .select('role')
      .eq('email', user.email)
      .single()

    if (!emailData?.role) return []

    // 取得該角色的 dept_group + level + assignable_role_names
    const { data: roleData, error: roleError } = await service
      .from('roles')
      .select('id, name, is_system, dept_group, level, assignable_role_names')
      .eq('name', emailData.role)
      .single()

    if (roleError || !roleData) return []

    const { level, dept_group, assignable_role_names } = roleData as {
      id: string
      name: string
      is_system: boolean
      dept_group: string | null
      level: string
      assignable_role_names: string[] | null
    }

    // 若 assignable_role_names 有明確設定，直接使用
    if (assignable_role_names && assignable_role_names.length > 0) {
      const { data, error } = await service
        .from('roles')
        .select('name')
        .in('name', assignable_role_names)
        .order('id', { ascending: true })
      if (error) return ['管理員', '一般使用者']
      return (data ?? []).map((r: { name: string }) => r.name)
    }

    // Fallback：以 level 判斷
    if (level === 'super_admin') {
      const { data, error } = await service
        .from('roles')
        .select('name')
        .order('created_at', { ascending: true })
      if (error) return ['管理員', '一般使用者']
      return (data ?? []).map((r: { name: string }) => r.name)
    }

    if (level === 'dept_admin') {
      if (!dept_group) return []
      const { data, error } = await service
        .from('roles')
        .select('name')
        .eq('dept_group', dept_group)
        .in('level', ['member', 'viewer'])
        .order('created_at', { ascending: true })
      if (error) return ['管理員', '一般使用者']
      return (data ?? []).map((r: { name: string }) => r.name)
    }

    return []
  } catch {
    return ['管理員', '一般使用者']
  }
}

export default async function AdminUsersPage() {
  const supabase = createSupabaseServerClient()

  // 平行：權限驗證 + 頁面資料一起抓
  const [admin, { data: { user } }, users, roleNames] = await Promise.all([
    requireAdmin(),
    supabase.auth.getUser(),
    fetchAllowedEmails(),
    fetchAssignableRoles(),
  ])

  if (!admin) redirect('/')

  return (
    <main className="min-h-screen bg-[#faf6f0]">
      <header className="bg-[#faf6f0] border-b border-[rgba(122,82,48,.18)] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-[#a08060] hover:text-[#7a5230] transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#7a5230]" />
            <h1 className="text-xl font-bold text-[#7a5230]">帳號管理</h1>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <UserManagementTable
          initialUsers={users}
          currentUserEmail={user!.email!}
          availableRoles={roleNames}
        />
      </div>
    </main>
  )
}
