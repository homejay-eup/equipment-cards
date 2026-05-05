import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import UserManagementTable from '@/components/UserManagementTable'
import { ArrowLeft, Users } from 'lucide-react'

async function fetchUsers() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const [{ data: authData }, { data: profiles }] = await Promise.all([
    supabase.auth.admin.listUsers(),
    supabase.from('profiles').select('id, role'),
  ])

  const roleMap = new Map(profiles?.map(p => [p.id, p.role]) ?? [])

  const users = (authData?.users ?? []).map(u => ({
    id: u.id,
    email: u.email ?? '',
    role: (roleMap.get(u.id) ?? 'viewer') as 'admin' | 'viewer',
    last_sign_in_at: u.last_sign_in_at ?? null,
    created_at: u.created_at,
  }))

  users.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  return users
}

export default async function AdminUsersPage() {
  const admin = await requireAdmin()
  if (!admin) redirect('/')

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const users = await fetchUsers()

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link
            href="/"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">帳號管理</h1>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <UserManagementTable
          initialUsers={users}
          currentUserId={user!.id}
        />
      </div>
    </main>
  )
}
