'use client'

import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { clearSessionId } from '@/lib/analyticsClient'

interface UserMenuProps {
  email: string
}

export default function UserMenu({ email }: UserMenuProps) {
  const router = useRouter()

  async function signOut() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    clearSessionId()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-[#a08060] hidden sm:block truncate max-w-[200px]">
        {email}
      </span>
      <button
        onClick={signOut}
        className="text-sm text-[#7a5230] border border-[rgba(122,82,48,.25)] bg-[rgba(122,82,48,.05)] rounded-md px-3 py-1.5 hover:bg-[rgba(122,82,48,.12)] transition-colors whitespace-nowrap"
      >
        登出
      </button>
    </div>
  )
}
