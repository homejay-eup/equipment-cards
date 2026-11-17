// 「先顯示上次資料、背景更新」用的小快取（stale-while-revalidate）。
// 看過的清單資料存在這個瀏覽器的 localStorage；下次進網站先秒顯示，背景抓到新資料後再悄悄換掉。
// 只存清單類的唯讀資料；登出時一律清空（避免共用電腦看到上一位的資料）。
const PREFIX = 'swr:v1:'
const MAX_CHARS = 1_500_000   // 單筆超過就不存（localStorage 約 5MB）

export function readSwr<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch { return undefined }
}

export function writeSwr(key: string, value: unknown) {
  try {
    const s = JSON.stringify(value)
    if (s.length > MAX_CHARS) { localStorage.removeItem(PREFIX + key); return }
    localStorage.setItem(PREFIX + key, s)
  } catch { /* 空間滿了或被封鎖：沒快取也能正常用 */ }
}

export function clearSwr() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k))
  } catch { /* ignore */ }
}
