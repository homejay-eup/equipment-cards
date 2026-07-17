import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/admin'
import { getUsageAnalyticsSummary, getUsageDailyHeatmap } from '@/lib/analytics'

// GET /api/admin/analytics — 使用統計彙總（登入次數／停留時長／功能使用次數，依 email 分組）
// 另附每日停留分鐘數（依日期分桶）供前端畫 GitHub 風格日曆熱點圖
export async function GET() {
  if (!await requirePermission('view_analytics')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const [rows, heatmap] = await Promise.all([
      getUsageAnalyticsSummary(),
      getUsageDailyHeatmap(),
    ])
    return NextResponse.json({ rows, heatmap })
  } catch (err) {
    console.error('[admin/analytics] error', err)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
