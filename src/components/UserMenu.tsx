'use client'

import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export default function UserMenu({ email }: { email: string }) {
  const router = useRouter()

  async function signOut() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-500 hidden sm:block truncate max-w-[200px]">
        {email}
      </span>
      <button
        onClick={signOut}
        className="text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors whitespace-nowrap"
      >
        登出
      </button>
    </div>
  )
}
