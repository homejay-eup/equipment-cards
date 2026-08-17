import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/admin'
import { getServiceClient, getCallerDepartmentId } from '@/lib/departments'

// ── POST /api/packages/replace ─────────────────────────────────
// 跨組合批次替換料卡：刪舊料卡、插新料卡、保留原數量與排序位置
// body: { old_equipment_id: string, new_equipment_id: string, package_ids: string[] }
// 權限：edit_own_packages，且僅限呼叫者部門所屬的組合
export async function POST(req: NextRequest) {
  const user = await requirePermission('edit_own_packages')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const departmentId = await getCallerDepartmentId(user.email!)
  if (!departmentId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const oldEquipmentId: unknown = body?.old_equipment_id
    const newEquipmentId: unknown = body?.new_equipment_id
    const packageIds: unknown = body?.package_ids

    if (
      typeof oldEquipmentId !== 'string' || !oldEquipmentId ||
      typeof newEquipmentId !== 'string' || !newEquipmentId ||
      !Array.isArray(packageIds) || packageIds.length === 0 ||
      !packageIds.every((v) => typeof v === 'string' && v)
    ) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    // 新舊料卡相同視為無效操作：若照原邏輯處理（insert 因已存在而 no-op、
    // 之後 delete 卻仍會執行）會導致料卡被整個移除，是真實的資料遺失風險，直接擋掉
    if (oldEquipmentId === newEquipmentId) {
      return NextResponse.json({ error: '新舊料卡不可相同' }, { status: 400 })
    }

    const supabase = getServiceClient()

    // 確認所有 package_ids 都屬於呼叫者部門，防止跨部門亂改別人組合
    const { data: pkgs } = await supabase
      .from('equipment_packages')
      .select('id')
      .eq('department_id', departmentId)
      .in('id', packageIds)

    if (!pkgs || pkgs.length !== packageIds.length) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 先查這批組合裡舊料卡目前的數量與排序位置，替換時把兩者都帶過去
    // （數量不重置成 1；排序位置沿用同一個位置，不讓替換後的料卡跑到清單最後面）
    const { data: oldItems } = await supabase
      .from('package_items')
      .select('package_id, quantity, sort_order')
      .in('package_id', packageIds)
      .eq('equipment_id', oldEquipmentId)

    const oldItemByPackageId = new Map<string, { quantity: number; sort_order: number }>(
      (oldItems ?? []).map((i: { package_id: string; quantity: number; sort_order: number }) => [
        i.package_id,
        { quantity: i.quantity, sort_order: i.sort_order },
      ]),
    )

    // reviewer 註記：原寫法是「逐一組合 delete 舊料卡→insert 新料卡」的迴圈，且沒檢查
    // supabase-js 回傳的 error（DB 層錯誤不會拋例外，try/catch 抓不到），會有兩個問題：
    // ① 若某個組合 insert 失敗，該組合的舊料卡已經被 delete 掉，料卡整個從組合消失
    //    （比「沒替換成功」更嚴重的資料遺失，且組合可能分享給其他部門，波及範圍比
    //    「我的關注」這種個人專屬的清單更大）；② 迴圈中途失敗不會中斷，最終仍無條件回 success: true，
    //    前端無從得知只有部分組合真的替換成功。
    // 改為批次一次處理全部組合：insert/delete/update 各自只送一個 SQL 陳述式，
    // Postgres 對單一陳述式本身是原子的（要嘛全部組合都套用、要嘛都不套用，不會有
    // 「只有部分組合被改到」的中間狀態），同時檢查每一步的 error，任何一步失敗就
    // 回 500 並保留在原始狀態或最保守的中間狀態（insert 已成功但 delete 失敗，
    // 頂多是舊料卡還留著沒被移除，不會有料卡消失的情況）。
    // 每個 row 都給齊全部欄位（不像原本單筆 insert 時可以省略 quantity/sort_order 讓 DB 補預設值）：
    // 一次 upsert 多筆 row 時，物件形狀（key 集合）不一致對 PostgREST 的批次轉換是不必要的風險，
    // 加上 package_items.sort_order 是 NOT NULL 無 DEFAULT，缺這個欄位會直接整批失敗。
    // 正常情況下 packageIds 一定是「同時存在於」清單勾選出來的，oldItemByPackageId 必定命中；
    // 這裡的 fallback 只防禦極端的競態（送出前剛好被別的操作移除舊料卡）。
    const insertRows = packageIds.map((packageId) => {
      const oldItem = oldItemByPackageId.get(packageId)
      return {
        package_id: packageId,
        equipment_id: newEquipmentId,
        quantity: oldItem?.quantity ?? 1,
        sort_order: oldItem?.sort_order ?? 0,
      }
    })

    // Step 1：先把新料卡插入所有組合（新料卡本來就在組合裡時 ignoreDuplicates 視為無害 no-op，
    // 比照 items/batch route 的既有寫法）。先插入、後刪除舊料卡，確保插入失敗時舊料卡還在原地，
    // 不會出現「刪了卻沒插入」的資料遺失情境。
    const { error: insertError } = await supabase
      .from('package_items')
      .upsert(insertRows, { onConflict: 'package_id,equipment_id', ignoreDuplicates: true })

    if (insertError) {
      console.error('[packages/replace] insert new item failed', insertError)
      return NextResponse.json({ error: '替換料卡失敗' }, { status: 500 })
    }

    // Step 2：插入成功後才刪除所有組合裡的舊料卡
    const { error: deleteError } = await supabase
      .from('package_items')
      .delete()
      .in('package_id', packageIds)
      .eq('equipment_id', oldEquipmentId)

    if (deleteError) {
      console.error('[packages/replace] delete old item failed', deleteError)
      // 新料卡已插入成功，只是舊料卡沒移除——組合內容變多不是資料遺失，回錯誤讓使用者知道要重試即可
      return NextResponse.json({ error: '替換料卡失敗（新料卡已加入，但舊料卡尚未移除，請重新整理後再試一次）' }, { status: 500 })
    }

    // Step 3：供「設備組合」來源對齊機制比對，一次 bump 所有組合的 updated_at。
    // 這一步失敗不影響料卡內容是否替換成功（頂多對齊徽章沒即時反映），只記 log 不視為整體失敗。
    const { error: updateError } = await supabase
      .from('equipment_packages')
      .update({ updated_at: new Date().toISOString() })
      .in('id', packageIds)

    if (updateError) {
      console.error('[packages/replace] bump updated_at failed', updateError)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[packages/replace] error', err)
    return NextResponse.json({ error: '替換料卡失敗' }, { status: 500 })
  }
}
