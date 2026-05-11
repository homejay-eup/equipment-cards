'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

function LoginForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  async function signInWithGoogle() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="min-h-screen bg-[#faf6f0] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(122,82,48,.12)] border border-[rgba(122,82,48,.18)] p-8 w-full max-w-sm">
        {/* Logo / 標題 */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[rgba(122,82,48,.1)] mb-3">
            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-[#7a5230]" stroke="currentColor" strokeWidth="1.8">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#2c1e12]">設備料卡管理系統</h1>
          <p className="text-sm text-[#a08060] mt-1">請使用公司 Google 帳號登入</p>
        </div>

        {error === 'unauthorized' && (
          <div className="mb-4 text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-4 py-3">
            此帳號無存取權限，請使用公司 (@eup.com.tw) 帳號登入。
          </div>
        )}

        <button
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-3 bg-[#faf6f0] border border-[rgba(122,82,48,.25)] rounded-xl px-4 py-3 text-sm font-medium text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)] hover:border-[rgba(122,82,48,.4)] hover:shadow-[0_0_10px_rgba(122,82,48,.18)] active:bg-[rgba(122,82,48,.1)] transition-all"
        >
          <GoogleIcon />
          使用 Google 帳號登入
        </button>

        <p className="mt-4 text-center text-xs text-[#c0a882]">僅限 @eup.com.tw 帳號</p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#4285F4"
        d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"
      />
      <path
        fill="#34A853"
        d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"
      />
      <path
        fill="#FBBC05"
        d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"
      />
      <path
        fill="#EA4335"
        d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.31z"
      />
    </svg>
  )
}
