import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission, getUserRoleWithPermissions } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function normalizeIssue(raw: Record<string, unknown>) {
  const emails = ((raw.issue_assignees ?? []) as { user_email: string }[]).map(
    (a) => a.user_email,
  )
  return {
    ...raw,
    assignee_emails: emails,
    assignees: emails.map((e) => e.split('@')[0]),
  }
}

// ── GET /api/issues/[id] ──────────────────────────────────────
// 查詢單筆議題（含 assignees + updates）
// 權限：view_tracker
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requirePermission('view_tracker')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = getSupabase()

    const { data: issue, error } = await supabase
      .from('issues')
      .select(`
        id, title, type, priority, status, due_date, description, tags,
        created_by, created_at, updated_at, updated_by, sort_order,
        issue_assignees(user_email),
        issue_updates(id, content, created_by, created_at)
      `)
      .eq('id', params.id)
      .order('created_at', { referencedTable: 'issue_updates', ascending: false })
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: '找不到議題' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json(normalizeIssue(issue as Record<string, unknown>))
  } catch (err) {
    console.error('[issues] get error', err)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}

// ── PATCH /api/issues/[id] ────────────────────────────────────
// 更新議題欄位
// 權限：本人（created_by = 當前 email）或有 create_issues 權限
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // 一次取得 user + permissions，避免重複 DB 往返
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { permissions } = await getUserRoleWithPermissions()

  if (!permissions.includes('view_tracker')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const canCreateIssues = permissions.includes('create_issues')

  try {
    const adminClient = getSupabase()

    // 取得議題確認存在並檢查權限
    const { data: issue, error: fetchError } = await adminClient
      .from('issues')
      .select('id, created_by, status')
      .eq('id', params.id)
      .single()

    if (fetchError || !issue) {
      return NextResponse.json({ error: '找不到議題' }, { status: 404 })
    }

    const isAuthor = issue.created_by === user.email

    const body = await req.json()
    const { title, type, priority, status, due_date, description, tags, assignees } = body

    // 狀態更新（拖曳換欄）：有 view_tracker 即可，部門成員都能操作
    // 其他欄位更新：本人 或 有 create_issues
    const hasFullEdit = isAuthor || canCreateIssues
    const onlyStatusUpdate = status !== undefined &&
      title === undefined && type === undefined && priority === undefined &&
      due_date === undefined && description === undefined && tags === undefined &&
      assignees === undefined

    if (!onlyStatusUpdate && !hasFullEdit) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updateFields: Record<string, unknown> = {}
    if (hasFullEdit) {
      if (title !== undefined) updateFields.title = title.trim()
      if (type !== undefined) updateFields.type = type.trim()
      if (priority !== undefined) updateFields.priority = priority
      if (due_date !== undefined) updateFields.due_date = due_date ?? null
      if (description !== undefined) updateFields.description = description?.trim() ?? null
      if (tags !== undefined) updateFields.tags = Array.isArray(tags) ? tags : []
    }
    if (status !== undefined) {
      updateFields.status = status
    }

    if (Object.keys(updateFields).length > 0) {
      updateFields.updated_by = user.email
      const { error: updateError } = await adminClient
        .from('issues')
        .update(updateFields)
        .eq('id', params.id)

      if (updateError) throw updateError
    }

    // 更新負責人清單（僅 hasFullEdit 者可操作）
    if (hasFullEdit && Array.isArray(assignees)) {
      const { error: deleteError } = await adminClient
        .from('issue_assignees')
        .delete()
        .eq('issue_id', params.id)

      if (deleteError) {
        console.error('[issues] assignees delete error', deleteError)
        return NextResponse.json(
          { error: '議題已更新，但負責人同步失敗，請重新編輯', partial: true },
          { status: 500 },
        )
      }

      if (assignees.length > 0) {
        const rows = assignees.map((email: string) => ({
          issue_id: params.id,
          user_email: email,
        }))
        const { error: insertError } = await adminClient
          .from('issue_assignees')
          .insert(rows)

        if (insertError) {
          console.error('[issues] assignees insert error', insertError)
          return NextResponse.json(
            { error: '議題已更新，但負責人同步失敗，請重新編輯', partial: true },
            { status: 500 },
          )
        }
      }
    }

    // 回傳最新議題資料
    const { data: updated, error: refetchError } = await adminClient
      .from('issues')
      .select(`
        id, title, type, priority, status, due_date, description, tags,
        created_by, created_at, updated_at, updated_by, sort_order,
        issue_assignees(user_email),
        issue_updates(id, content, created_by, created_at)
      `)
      .eq('id', params.id)
      .order('created_at', { referencedTable: 'issue_updates', ascending: false })
      .single()

    if (refetchError) throw refetchError

    return NextResponse.json(normalizeIssue(updated as Record<string, unknown>))
  } catch (err) {
    console.error('[issues] update error', err)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }
}

// ── DELETE /api/issues/[id] ───────────────────────────────────
// 刪除議題（前端需通過 ConfirmDialog 確認後才呼叫）
// 權限：僅建立者（created_by = 當前 email）
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const adminClient = getSupabase()

    const { data: issue, error: fetchError } = await adminClient
      .from('issues')
      .select('id, created_by')
      .eq('id', params.id)
      .single()

    if (fetchError || !issue) {
      return NextResponse.json({ error: '找不到議題' }, { status: 404 })
    }

    const isAuthor = issue.created_by === user.email

    if (!isAuthor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // CASCADE 會自動刪除 issue_assignees 與 issue_updates
    const { error: deleteError } = await adminClient
      .from('issues')
      .delete()
      .eq('id', params.id)

    if (deleteError) throw deleteError

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[issues] delete error', err)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
