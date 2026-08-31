import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'
import { validateRichContent } from '@/lib/richContentValidation'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// ── GET /api/issues ───────────────────────────────────────────
// 查詢議題清單，支援篩選：type / status / priority / assignee=me
// 權限：view_tracker
export async function GET(req: NextRequest) {
  const user = await requirePermission('view_tracker')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 查詢 caller 的 department_id，用於部門隔離
  let callerDepartmentId: string | null = null
  try {
    const service = getSupabase()
    const { data: emailRow } = await service
      .from('allowed_emails')
      .select('role')
      .eq('email', user.email!)
      .single()
    if (emailRow?.role) {
      const { data: roleRow } = await service
        .from('roles')
        .select('department_id')
        .eq('name', emailRow.role)
        .single()
      callerDepartmentId = (roleRow as { department_id: string | null } | null)?.department_id ?? null
    }
  } catch {
    // 查詢失敗不阻斷，後面的 null 保護會回傳空陣列
  }

  // 無部門歸屬（含管理員未設部門）→ 直接回空
  if (callerDepartmentId === null) {
    return NextResponse.json([])
  }

  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const assignee = searchParams.get('assignee')

    const supabase = getSupabase()

    let query = supabase
      .from('issues')
      .select(`
        id, title, type, priority, status, due_date, description, tags,
        description_image_urls, description_table_data,
        created_by, created_at, updated_at, sort_order, is_pinned,
        issue_assignees(user_email),
        issue_updates(id, content, image_urls, table_data, created_by, created_at, updated_at)
      `)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })

    // 所有角色一律依 department_id 過濾
    query = query.eq('department_id', callerDepartmentId)

    if (type) query = query.eq('type', type)
    if (status) query = query.eq('status', status)
    if (priority) query = query.eq('priority', priority)

    const { data, error } = await query

    if (error) throw error

    // assignee=me：只回傳我有被指派的議題
    let result = data ?? []
    if (assignee === 'me') {
      const email = user.email ?? ''
      result = result.filter((issue) =>
        (issue.issue_assignees as { user_email: string }[]).some(
          (a) => a.user_email === email,
        ),
      )
    }

    // 轉換 assignees 為 email 前綴陣列，並補上完整 email 陣列
    const formatted = result.map((issue) => ({
      ...issue,
      sort_order: issue.sort_order ?? undefined,
      assignees: (issue.issue_assignees as { user_email: string }[]).map(
        (a) => a.user_email.split('@')[0],
      ),
      assignee_emails: (issue.issue_assignees as { user_email: string }[]).map(
        (a) => a.user_email,
      ),
      issue_assignees: undefined,
    }))

    return NextResponse.json(formatted)
  } catch (err) {
    console.error('[issues] list error', err)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}

// ── POST /api/issues ──────────────────────────────────────────
// 新增議題
// 權限：create_issues
export async function POST(req: NextRequest) {
  const user = await requirePermission('create_issues')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const {
      title, type, priority, status, due_date, description, tags, assignees,
      description_image_urls, description_table_data,
    } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: '標題為必填' }, { status: 400 })
    }
    if (!type?.trim()) {
      return NextResponse.json({ error: '類型為必填' }, { status: 400 })
    }

    // 共用驗證（跟 issue_updates 的貼圖/貼表格規則一致），套用在「說明」欄位。
    // 跟更新紀錄不同：這裡不要求三者至少一項非空，因為 description 整組本身是選填欄位
    // （title 已經是必填內容）。
    const descriptionValidation = validateRichContent({
      content: description,
      image_urls: description_image_urls,
      table_data: description_table_data,
    })
    if (!descriptionValidation.ok) {
      return NextResponse.json({ error: descriptionValidation.error }, { status: descriptionValidation.status })
    }

    const supabase = getSupabase()

    // 新卡片固定放在目標欄位最上方：取該欄現有最小 sort_order 再減 1000
    const targetStatus = status ?? '待處理'
    const { data: topIssue } = await supabase
      .from('issues')
      .select('sort_order')
      .eq('status', targetStatus)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    const newSortOrder = typeof topIssue?.sort_order === 'number' ? topIssue.sort_order - 1000 : 1000

    // 查詢建立者的 department_id（失敗不阻斷建立流程）
    let creatorDepartmentId: string | null = null
    try {
      const { data: emailRow } = await supabase
        .from('allowed_emails')
        .select('role')
        .eq('email', user.email!)
        .single()

      if (emailRow?.role) {
        const { data: roleRow } = await supabase
          .from('roles')
          .select('department_id')
          .eq('name', emailRow.role)
          .single()

        creatorDepartmentId = (roleRow as { department_id: string | null } | null)?.department_id ?? null
      }
    } catch {
      // 查詢失敗不阻斷，department_id 保持 null
    }

    const { data: issue, error: issueError } = await supabase
      .from('issues')
      .insert({
        title: title.trim(),
        type: type.trim(),
        priority: priority ?? 'medium',
        status: targetStatus,
        due_date: due_date ?? null,
        description: descriptionValidation.content,
        description_image_urls: descriptionValidation.images,
        description_table_data: descriptionValidation.table,
        tags: Array.isArray(tags) ? tags : [],
        created_by: user.email!,
        department_id: creatorDepartmentId,
        sort_order: newSortOrder,
      })
      .select()
      .single()

    if (issueError) throw issueError

    // 插入負責人
    if (Array.isArray(assignees) && assignees.length > 0) {
      const rows = assignees.map((email: string) => ({
        issue_id: issue.id,
        user_email: email,
      }))
      const { error: assigneeError } = await supabase
        .from('issue_assignees')
        .insert(rows)
      if (assigneeError) throw assigneeError
    }

    return NextResponse.json(issue, { status: 201 })
  } catch (err) {
    console.error('[issues] create error', err)
    return NextResponse.json({ error: '建立失敗' }, { status: 500 })
  }
}
