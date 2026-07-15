'use client'

// 前端專用：使用統計 fire-and-forget 呼叫函式
// 注意：這個檔案跟 src/lib/analytics.ts（後端彙總邏輯，data agent 負責）是兩個不同檔案，
// 不要互相覆寫。這裡只放 client component 會用到的輔助函式。

const SESSION_ID_KEY = 'usage_session_id'

// 取得（或建立）本次分頁的 session id，存在 sessionStorage，分頁關閉即失效
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return ''
  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    window.sessionStorage.setItem(SESSION_ID_KEY, id)
    return id
  } catch {
    // sessionStorage 不可用（如隱私模式）時退回產生一次性 id，不快取
    return crypto.randomUUID()
  }
}

// 登出時清除本次分頁的 session id，避免同一分頁換帳號登入時沿用到上一位使用者的 session
export function clearSessionId(): void {
  try { window.sessionStorage.removeItem(SESSION_ID_KEY) } catch {}
}

// 記錄功能使用事件，fire-and-forget，失敗完全吞掉，不影響呼叫端任何邏輯
export function logUsageEvent(eventType: string, metadata?: object): void {
  try {
    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: eventType, metadata }),
    }).catch(() => {})
  } catch {
    // 完全吞掉，輔助記錄功能不能影響使用者操作
  }
}
