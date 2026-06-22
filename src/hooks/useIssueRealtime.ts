'use client'

import { useEffect, useRef } from 'react'
import type { Issue } from '@/app/tracker/page'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

interface Options {
  userDepartmentId: string | null
  onInsert: (issue: Issue) => void
  onUpdate: (issue: Issue) => void
  onDelete: (id: string) => void
}

export function useIssueRealtime({
  userDepartmentId,
  onInsert,
  onUpdate,
  onDelete,
}: Options) {
  const onInsertRef = useRef(onInsert)
  const onUpdateRef = useRef(onUpdate)
  const onDeleteRef = useRef(onDelete)

  useEffect(() => {
    onInsertRef.current = onInsert
    onUpdateRef.current = onUpdate
    onDeleteRef.current = onDelete
  })

  useEffect(() => {
    if (!userDepartmentId) return

    const supabase = createSupabaseBrowserClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let removed = false

    // JWT 預設 1 小時過期；token 更新時需重新授權 Realtime，
    // 否則伺服器端 RLS 會以過期 token 驗證失敗，事件靜默停止投遞
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'TOKEN_REFRESHED' && session?.access_token) {
          supabase.realtime.setAuth(session.access_token)
        }
      },
    )

    // @supabase/ssr 以 cookie 儲存 session，Realtime WebSocket 不會自動帶入 JWT；
    // 需明確呼叫 setAuth() 才能讓伺服器端 RLS 驗證通過並投遞事件
    supabase.auth.getSession().then(({ data }) => {
      if (removed) return

      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token)
      }

      channel = supabase
        .channel(`issues:dept:${userDepartmentId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'issues',
            filter: `department_id=eq.${userDepartmentId}`,
          },
          async (payload) => {
            const issueId =
              payload.eventType === 'DELETE'
                ? (payload.old as { id?: string })?.id
                : (payload.new as { id?: string })?.id

            if (!issueId) return

            if (payload.eventType === 'DELETE') {
              onDeleteRef.current(issueId)
              return
            }

            try {
              const res = await fetch(`/api/issues/${issueId}`, { cache: 'no-store' })
              if (!res.ok) return
              const issue: Issue = await res.json()

              if (payload.eventType === 'INSERT') {
                onInsertRef.current(issue)
              } else {
                onUpdateRef.current(issue)
              }
            } catch {
              // 靜默失敗
            }
          },
        )
        .subscribe()
    })

    return () => {
      removed = true
      authListener.subscription.unsubscribe()
      if (channel) supabase.removeChannel(channel)
    }
  }, [userDepartmentId])
}
