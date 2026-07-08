import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { isEmailAllowedToLogin } from '@/lib/admin'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    // exchange 失敗（code 過期或已用）：直接跳回登入頁
    if (error || !data.user) {
      return NextResponse.redirect(`${origin}/login`)
    }

    // 非公司信箱且未被管理員加入 allowed_emails：登出並顯示錯誤
    const email = data.user.email
    if (!email || !(await isEmailAllowedToLogin(email))) {
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?error=unauthorized`)
    }
  }

  return NextResponse.redirect(`${origin}/`)
}
