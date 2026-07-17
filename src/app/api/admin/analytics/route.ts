import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/admin'
import { getUsageAnalyticsSummary, getUsageGrowthTrend } from '@/lib/analytics'

// GET /api/admin/analytics — 使用統計彙總（登入次數／停留時長／功能使用次數，依 email 分組）
// 另附累計成長趨勢（依日期分桶的累計登入次數／累計停留分鐘數）供前端畫趨勢圖表
export async function GET() {
  if (!await requirePermission('view_analytics')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const [rows, trend] = await Promise.all([
      getUsageAnalyticsSummary(),
      getUsageGrowthTrend(),
    ])
    return NextResponse.json({ rows, trend })
  } catch (err) {
    console.error('[admin/analytics] error', err)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
