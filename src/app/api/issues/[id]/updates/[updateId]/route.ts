import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission, getUserRoleWithPermissions } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// ── PATCH /api/issues/[id]/updates/[updateId] ────────────────
// 編輯更新紀錄內容
// 權限：更新的建立者 OR 擁有 create_issues 權限
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; updateId: string } },
) {
  const user = await requirePermission('view_tracker')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { content } = body

    if (!content?.trim()) {
      return NextResponse.json({ error: '更新內容為必填' }, { status: 400 })
    }

    const supabase = getSupabase()

    // 取得既有更新紀錄
    const { data: update, error: fetchError } = await supabase
      .from('issue_updates')
      .select('id, created_by, issue_id')
      .eq('id', params.updateId)
      .single()

    if (fetchError || !update) {
      return NextResponse.json({ error: '找不到更新紀錄' }, { status: 404 })
    }

    // 確認 updateId 屬於指定 issue
    if (update.issue_id !== params.id) {
      return NextResponse.json({ error: '更新紀錄不屬於此議題' }, { status: 400 })
    }

    // 權限檢查：建立者本人 OR 擁有 create_issues 權限
    const isOwner = update.created_by === user.email
    if (!isOwner) {
      const { permissions } = await getUserRoleWithPermissions()
      if (!permissions.includes('create_issues')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const { data, error } = await supabase
      .from('issue_updates')
      .update({ content: content.trim() })
      .eq('id', params.updateId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (err) {
    console.error('[issues/updates/[updateId]] patch error', err)
    return NextResponse.json({ error: '編輯更新紀錄失敗' }, { status: 500 })
  }
}

// ── DELETE /api/issues/[id]/updates/[updateId] ───────────────
// 刪除更新紀錄
// 權限：更新的建立者 OR 擁有 create_issues 權限
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; updateId: string } },
) {
  const user = await requirePermission('view_tracker')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = getSupabase()

    // 取得既有更新紀錄
    const { data: update, error: fetchError } = await supabase
      .from('issue_updates')
      .select('id, created_by, issue_id')
      .eq('id', params.updateId)
      .single()

    if (fetchError || !update) {
      return NextResponse.json({ error: '找不到更新紀錄' }, { status: 404 })
    }

    // 確認 updateId 屬於指定 issue
    if (update.issue_id !== params.id) {
      return NextResponse.json({ error: '更新紀錄不屬於此議題' }, { status: 400 })
    }

    // 權限檢查：建立者本人 OR 擁有 create_issues 權限
    const isOwner = update.created_by === user.email
    if (!isOwner) {
      const { permissions } = await getUserRoleWithPermissions()
      if (!permissions.includes('create_issues')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const { error } = await supabase
      .from('issue_updates')
      .delete()
      .eq('id', params.updateId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[issues/updates/[updateId]] delete error', err)
    return NextResponse.json({ error: '刪除更新紀錄失敗' }, { status: 500 })
  }
}
