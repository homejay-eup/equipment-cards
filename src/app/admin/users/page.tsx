import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import UserManagementTable from '@/components/UserManagementTable'
import { ArrowLeft, Users, ShieldCheck } from 'lucide-react'

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

async function fetchRoles(): Promise<string[]> {
  try {
    const { data } = await getServiceClient()
      .from('roles')
      .select('name')
      .order('id', { ascending: true })
    if (data && data.length > 0) return data.map((r: { name: string }) => r.name)
  } catch {
    // roles 表不存在時的 fallback
  }
  return ['管理員', '一般使用者']
}

export default async function AdminUsersPage() {
  const admin = await requireAdmin()
  if (!admin) redirect('/')

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [users, roleNames] = await Promise.all([fetchAllowedEmails(), fetchRoles()])

  return (
    <main className="min-h-screen bg-[#faf6f0]">
      <header className="bg-[#faf6f0] border-b border-[rgba(122,82,48,.18)] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-[#a08060] hover:text-[#7a5230] transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <Users className="h-5 w-5 text-[#7a5230]" />
            <h1 className="text-xl font-bold text-[#7a5230]">帳號管理</h1>
          </div>
          <Link href="/admin/roles" className="flex items-center gap-2 text-sm text-[#7a5230] hover:text-[#9c6b42] transition-colors">
            <ShieldCheck className="h-4 w-4" />
            角色管理
          </Link>
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
