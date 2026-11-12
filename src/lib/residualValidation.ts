// Step 53：設備殘值 輸入驗證（純函式，API 與前端匯入預檢共用，不得 import 伺服器專用模組）
import type { ResidualItemInput } from '@/types/residual'

export const RESIDUAL_LIMITS = {
  codeMax: 30,
  nameMax: 100,
  priceMax: 100_000_000,
  yearsMax: 600, // 單位是「月」，上限 50 年
  importMax: 1000,
} as const

const CODE_RE = /^[A-Za-z0-9_\-.]+$/

export type ResidualValidation =
  | { ok: true; value: ResidualItemInput }
  | { ok: false; error: string }

/** 空字串／null／undefined → null；數字或數字字串 → number；其他 → NaN（交給呼叫端判錯） */
function toNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') {
    const s = v.replace(/,/g, '').trim()
    if (s === '') return null
    return Number(s)
  }
  return typeof v === 'number' ? v : NaN
}

/** 驗證單筆品項輸入，回傳清理後的值。金額與年限必須同時填或同時留空（留空＝報價無資料）。 */
export function validateResidualInput(raw: unknown): ResidualValidation {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '資料格式錯誤' }
  const o = raw as Record<string, unknown>

  const code = typeof o.code === 'string' ? o.code.trim() : ''
  if (!code) return { ok: false, error: '請填品號' }
  if (code.length > RESIDUAL_LIMITS.codeMax) return { ok: false, error: `品號最多 ${RESIDUAL_LIMITS.codeMax} 字` }
  if (!CODE_RE.test(code)) return { ok: false, error: '品號只能包含英數字與 - _ .' }

  const name = typeof o.name === 'string' ? o.name.trim() : ''
  if (!name) return { ok: false, error: '請填品名' }
  if (name.length > RESIDUAL_LIMITS.nameMax) return { ok: false, error: `品名最多 ${RESIDUAL_LIMITS.nameMax} 字` }

  const price = toNullableNumber(o.price)
  const years = toNullableNumber(o.years)
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > RESIDUAL_LIMITS.priceMax)) {
    return { ok: false, error: '金額必須是 0 以上的數字' }
  }
  if (years !== null && (!Number.isInteger(years) || years < 1 || years > RESIDUAL_LIMITS.yearsMax)) {
    return { ok: false, error: `年限必須是 1～${RESIDUAL_LIMITS.yearsMax} 的整數（單位：月）` }
  }
  if ((price === null) !== (years === null)) {
    return { ok: false, error: '金額與年限要一起填；兩者都留空代表「報價無資料」' }
  }

  return { ok: true, value: { code, name, price, years } }
}
