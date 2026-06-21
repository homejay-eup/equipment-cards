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
  // callbacks 存 ref，避免每次 render 重新訂閱
  const onInsertRef = useRef(onInsert)
  const onUpdateRef = useRef(onUpdate)
  const onDeleteRef = useRef(onDelete)

  useEffect(() => {
    onInsertRef.current = onInsert
    onUpdateRef.current = onUpdate
    onDeleteRef.current = onDelete
  })

  useEffect(() => {
    if (!userDepartmentId) {
      console.log('[Realtime] skipped: userDepartmentId is null/undefined')
      return
    }

    const supabase = createSupabaseBrowserClient()

    supabase.auth.getSession().then(({ data }) => {
      console.log('[Realtime] session present:', !!data.session, '| user:', data.session?.user?.email)
    })

    const channel = supabase
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
          console.log('[Realtime] event received:', payload.eventType, payload)
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
            const res = await fetch(`/api/issues/${issueId}`)
            if (!res.ok) return
            const issue: Issue = await res.json()

            if (payload.eventType === 'INSERT') {
              onInsertRef.current(issue)
            } else {
              onUpdateRef.current(issue)
            }
          } catch {
            // 靜默失敗，下次操作或刷新時自然補齊
          }
        },
      )
      .subscribe((status, err) => {
        console.log('[Realtime] subscribe status:', status, err ?? '')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userDepartmentId])
}
