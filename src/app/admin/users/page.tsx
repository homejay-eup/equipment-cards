import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import UserManagementTable from '@/components/UserManagementTable'
import { ArrowLeft, Users } from 'lucide-react'

async function fetchAllowedEmails() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data } = await supabase
    .from('allowed_emails')
    .select('email, role, created_at')
    .order('created_at', { ascending: true })

  return (data ?? []) as { email: string; role: 'admin' | 'viewer'; created_at: string }[]
}

export default async function AdminUsersPage() {
  const admin = await requireAdmin()
  if (!admin) redirect('/')

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const users = await fetchAllowedEmails()

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">帳號管理</h1>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <UserManagementTable
          initialUsers={users}
          currentUserEmail={user!.email!}
        />
      </div>
    </main>
  )
}
