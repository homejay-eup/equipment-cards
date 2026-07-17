import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export interface UsageAnalyticsRow {
  email: string
  loginCount: number
  totalDurationSeconds: number
  averageDurationSeconds: number
  eventCounts: Record<string, number>
}

interface LoginEventRow {
  email: string
}

interface UsageSessionRow {
  email: string
  started_at: string
  last_ping_at: string
}

interface UsageEventRow {
  email: string
  event_type: string
}

// 依 email 分組彙總三張使用統計表：登入次數、總/平均停留時長（秒）、各 event_type 次數
// 目前資料量僅 30-50 人規模，直接撈全表在程式碼層面彙總即可，不需要 SQL 層彙總
export async function getUsageAnalyticsSummary(): Promise<UsageAnalyticsRow[]> {
  const service = getServiceClient()

  const [loginResult, sessionResult, eventResult, rosterResult] = await Promise.all([
    service.from('login_events').select('email'),
    service.from('usage_sessions').select('email, started_at, last_ping_at'),
    service.from('usage_events').select('email, event_type'),
    service.from('allowed_emails').select('email'),
  ])

  if (loginResult.error) throw loginResult.error
  if (sessionResult.error) throw sessionResult.error
  if (eventResult.error) throw eventResult.error
  if (rosterResult.error) throw rosterResult.error

  const loginRows = (loginResult.data ?? []) as LoginEventRow[]
  const sessionRows = (sessionResult.data ?? []) as UsageSessionRow[]
  const eventRows = (eventResult.data ?? []) as UsageEventRow[]
  const rosterRows = (rosterResult.data ?? []) as { email: string }[]

  // 用小寫 email 當比對 key，避免帳號名單與統計事件表大小寫不一致造成同一人被拆成兩筆
  const displayEmailByKey = new Map<string, string>()
  const registerEmail = (email: string) => {
    const key = email.toLowerCase()
    if (!displayEmailByKey.has(key)) displayEmailByKey.set(key, email)
    return key
  }

  const loginCountByEmail = new Map<string, number>()
  for (const row of loginRows) {
    const key = registerEmail(row.email)
    loginCountByEmail.set(key, (loginCountByEmail.get(key) ?? 0) + 1)
  }

  const durationsByEmail = new Map<string, number[]>()
  for (const row of sessionRows) {
    const started = new Date(row.started_at).getTime()
    const lastPing = new Date(row.last_ping_at).getTime()
    if (Number.isNaN(started) || Number.isNaN(lastPing)) continue
    const durationSeconds = Math.max(0, (lastPing - started) / 1000)
    const key = registerEmail(row.email)
    const list = durationsByEmail.get(key) ?? []
    list.push(durationSeconds)
    durationsByEmail.set(key, list)
  }

  const eventCountsByEmail = new Map<string, Record<string, number>>()
  for (const row of eventRows) {
    const key = registerEmail(row.email)
    const counts = eventCountsByEmail.get(key) ?? {}
    counts[row.event_type] = (counts[row.event_type] ?? 0) + 1
    eventCountsByEmail.set(key, counts)
  }

  // 能出現在 allowed_emails 名單就代表至少成功登入過一次（同步公司帳號的來源就是 Supabase Auth 使用者）。
  // 用這個名單補足登入次數下限，彌補使用統計功能上線前沒有 login_events 紀錄的舊登入。
  const rosterKeys = new Set<string>()
  for (const row of rosterRows) {
    rosterKeys.add(registerEmail(row.email))
  }

  const results: UsageAnalyticsRow[] = Array.from(displayEmailByKey.entries()).map(([key, email]) => {
    const durations = durationsByEmail.get(key) ?? []
    const totalDurationSeconds = durations.reduce((sum, d) => sum + d, 0)
    const averageDurationSeconds = durations.length > 0 ? totalDurationSeconds / durations.length : 0
    const recordedLoginCount = loginCountByEmail.get(key) ?? 0
    const loginCount = rosterKeys.has(key) ? Math.max(recordedLoginCount, 1) : recordedLoginCount

    return {
      email,
      loginCount,
      totalDurationSeconds,
      averageDurationSeconds,
      eventCounts: eventCountsByEmail.get(key) ?? {},
    }
  })

  results.sort((a, b) => b.loginCount - a.loginCount)

  return results
}

export interface UsageHeatmapPoint {
  date: string        // 'yyyy-MM-dd'
  totalMinutes: number
}

interface UsageSessionTimestampsRow {
  started_at: string
  last_ping_at: string
}

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// 把 UTC 時間戳換算成「台灣時區當地日曆日」的整數天數（自 epoch 起算的天數，非台灣當地時刻）。
// 全程只用 getUTC*/Date.UTC 運算，刻意不用伺服器本地時區的 getter（如 getDate()/format() 預設值）——
// Vercel serverless 預設跑 UTC，若用本地時區運算，台灣時間 00:00–07:59 的資料會被歸到前一天，
// 「今天」的判斷也會落後最多 8 小時，導致熱點圖日期跟資料庫實際（台灣）日期對不上。
function taipeiDayNumber(d: Date): number {
  return Math.floor((d.getTime() + TAIPEI_OFFSET_MS) / DAY_MS)
}

function dayNumberToKey(dayNumber: number): string {
  const ms = dayNumber * DAY_MS
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function keyToDayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS)
}

// 依日期分桶（保留時間戳），計算「每日停留分鐘數」給前端畫 GitHub 風格日曆熱點圖，
// 從最早一筆資料的日期補到今天，沒有資料的日期填 0（不是累計，每天就是當天的原始總分鐘數）
export async function getUsageDailyHeatmap(): Promise<UsageHeatmapPoint[]> {
  const service = getServiceClient()

  const sessionResult = await service.from('usage_sessions').select('started_at, last_ping_at')

  if (sessionResult.error) throw sessionResult.error

  const sessionRows = (sessionResult.data ?? []) as UsageSessionTimestampsRow[]

  if (sessionRows.length === 0) {
    return []
  }

  const dailyMinutes = new Map<string, number>()
  for (const row of sessionRows) {
    const started = new Date(row.started_at)
    const lastPing = new Date(row.last_ping_at)
    if (Number.isNaN(started.getTime()) || Number.isNaN(lastPing.getTime())) continue
    const durationMinutes = Math.max(0, (lastPing.getTime() - started.getTime()) / 60000)
    const key = dayNumberToKey(taipeiDayNumber(started))
    dailyMinutes.set(key, (dailyMinutes.get(key) ?? 0) + durationMinutes)
  }

  const allKeys = Array.from(dailyMinutes.keys())
  allKeys.sort()

  if (allKeys.length === 0) {
    return []
  }

  const earliestDayNumber = keyToDayNumber(allKeys[0])
  const todayDayNumber = taipeiDayNumber(new Date())

  const heatmap: UsageHeatmapPoint[] = []

  for (let dn = earliestDayNumber; dn <= todayDayNumber; dn++) {
    const key = dayNumberToKey(dn)
    heatmap.push({
      date: key,
      totalMinutes: dailyMinutes.get(key) ?? 0,
    })
  }

  return heatmap
}
