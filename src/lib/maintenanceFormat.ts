// Step 38/39：維修資訊管理 共用「純函式」工具（不依賴 server-only 模組，client component 可安全 import）
//
// 注意：這個檔案刻意跟 src/lib/maintenance.ts 的 isLoggedIn() 分開。
// isLoggedIn() 內部動態 import '@/lib/supabase-server'（依賴 next/headers），
// Next.js 對 client component 可 reach 到的模組會做 server/client 邊界靜態分析，
// 即使是動態 import() 也會被追蹤到，一旦有 client component 經由任何路徑 import 到
// maintenance.ts，build 就會因為「You're importing a component that needs next/headers」失敗。
// 因此純格式化/判斷函式獨立放這裡，client component（例如 RuleRow.tsx）直接從這裡 import。

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6

/**
 * 過時判斷：取 last_updated_at 與 confirmed_at 較新者，超過 6 個月即建議覆核。
 */
export function computeNeedsReview(
  lastUpdatedAt: string | null | undefined,
  confirmedAt: string | null | undefined,
): boolean {
  const lastUpdatedTime = lastUpdatedAt ? new Date(lastUpdatedAt).getTime() : 0
  const confirmedTime = confirmedAt ? new Date(confirmedAt).getTime() : 0
  const mostRecent = Math.max(lastUpdatedTime, confirmedTime)
  if (!mostRecent) return true
  return Date.now() - mostRecent > SIX_MONTHS_MS
}

/**
 * Step 39：保固期間上限（月數）＝ 100 年。純防呆用途，避免使用者誤填超大數字
 * 造成畫面顯示異常（例如「83333333 年 3 個月」）或資料庫存入無意義的極端值。
 * API route（POST/PATCH）與 RuleEditPanel 皆引用此常數，維持上限一致。
 */
export const MAX_WARRANTY_PERIOD_MONTHS = 1200

/**
 * Step 39：保固期間（月數）換算成人類可讀格式，例如 18 -> "1 年 6 個月"、24 -> "2 年"、6 -> "6 個月"。
 * null/undefined 回傳 null，呼叫端據此決定是否顯示這行。
 */
export function formatWarrantyPeriod(months: number | null | undefined): string | null {
  if (months === null || months === undefined) return null
  if (months < 12) return `${months} 個月`
  if (months % 12 === 0) return `${months / 12} 年`
  return `${Math.floor(months / 12)} 年 ${months % 12} 個月`
}

export type PeriodUnit = 'month' | 'year'

/** 月數 → 輸入框用的「數字＋單位」：能整除 12 就用年，否則用月（24 個月顯示 2 年、18 個月顯示 18 月）。 */
export function monthsToDisplay(months: number | null | undefined): { value: string; unit: PeriodUnit } {
  if (months === null || months === undefined) return { value: '', unit: 'month' }
  if (months > 0 && months % 12 === 0) return { value: String(months / 12), unit: 'year' }
  return { value: String(months), unit: 'month' }
}

/**
 * 輸入框的「數字＋單位」→ 月數。空白回傳 { months: null }；不合法回傳 { error }。
 * label 用於錯誤訊息（例如「保固期間」「年限」）。
 */
export function displayToMonths(
  value: string,
  unit: PeriodUnit,
  label: string,
): { months: number | null; error?: string } {
  const trimmed = value.trim()
  if (!trimmed) return { months: null }
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n < 0) return { months: null, error: `${label}必須為非負整數` }
  const months = unit === 'year' ? n * 12 : n
  if (months > MAX_WARRANTY_PERIOD_MONTHS) {
    return { months: null, error: `${label}不可超過 ${MAX_WARRANTY_PERIOD_MONTHS} 個月（100 年）` }
  }
  return { months }
}

// ── Step 49：回廠流程視角 ─────────────────────────────────────────

/** 流程區塊。「待歸類」為舊資料遷移後尚未分類的暫存區。 */
export const MAINTENANCE_STAGES = ['回廠', '檢測', '送修', '報廢', '待歸類'] as const

/** 各區塊允許的子類。待歸類可為 null（不帶子類）。 */
export const STAGE_SUBCATEGORIES: Record<(typeof MAINTENANCE_STAGES)[number], readonly string[]> = {
  '回廠': ['特殊情境'],
  '檢測': ['年限判斷', '是否檢測'],
  '送修': ['廠商送修'],
  '報廢': ['報廢規則'],
  '待歸類': [],
}

/** 年限起算依據、處理後去向選項的長度上限（防呆）。 */
export const MAX_AGE_LIMIT_BASIS_LENGTH = 50
export const MAX_EXIT_OPTION_LENGTH = 20
export const MAX_EXIT_OPTIONS_COUNT = 30

export function isValidStage(v: unknown): v is (typeof MAINTENANCE_STAGES)[number] {
  return typeof v === 'string' && (MAINTENANCE_STAGES as readonly string[]).includes(v)
}

/**
 * 區塊／子類改變時，該從舊區塊帶來、在新位置已不適用的欄位要一併清成 null，
 * 避免畫面仍顯示「保固／年限」卻在新區塊的編輯面板看不到也清不掉（髒資料）。
 * 廠商（vendor_id）刻意不清：批次「改廠商」可在任何區塊修改，且刪廠商會連動刪規則，不應靜默丟失關聯。
 * POST／PATCH／batch move_stage 三條路徑共用此函式，確保清除規則一致。
 */
export function clearInapplicableFields(
  prev: { stage: string; sub_category: string | null } | null,
  next: { stage: string; sub_category: string | null },
): Record<string, null> {
  const out: Record<string, null> = {}
  const isAge = (x: { stage: string; sub_category: string | null }) => x.stage === '檢測' && x.sub_category === '年限判斷'
  if (next.stage !== '送修' && (prev === null || prev.stage === '送修')) {
    out.warranty_period_months = null
    out.warranty_start_date = null
  }
  if (!isAge(next) && (prev === null || isAge(prev))) {
    out.age_limit_months = null
    out.age_limit_basis = null
  }
  return out
}

/** stage 與 sub_category 相容性檢查；相容回傳 null，否則回傳錯誤訊息。 */
export function checkStageSubCategory(stage: string, subCategory: string | null): string | null {
  if (!isValidStage(stage)) return `stage 必須為以下其中之一：${MAINTENANCE_STAGES.join('、')}`
  if (subCategory === null) {
    // 待歸類可為 null；其餘區塊也允許 null（尚未指定子類）
    return null
  }
  if (!STAGE_SUBCATEGORIES[stage].includes(subCategory)) {
    return stage === '待歸類'
      ? '待歸類不可指定 sub_category'
      : `${stage} 的 sub_category 必須為：${STAGE_SUBCATEGORIES[stage].join('、')}`
  }
  return null
}

/** 規則的「最後更新」/「已確認」時間顯示格式，統一用台北時區。 */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

/** email 去掉網域只顯示帳號前半，用於「最後更新／已確認」欄位的簡短署名。 */
export function emailPrefix(email: string | null | undefined): string | null {
  if (!email) return null
  return email.split('@')[0]
}
