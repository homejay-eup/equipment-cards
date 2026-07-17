import { createClient } from '@supabase/supabase-js'
import { format, addDays } from 'date-fns'

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

  const [loginResult, sessionResult, eventResult] = await Promise.all([
    service.from('login_events').select('email'),
    service.from('usage_sessions').select('email, started_at, last_ping_at'),
    service.from('usage_events').select('email, event_type'),
  ])

  if (loginResult.error) throw loginResult.error
  if (sessionResult.error) throw sessionResult.error
  if (eventResult.error) throw eventResult.error

  const loginRows = (loginResult.data ?? []) as LoginEventRow[]
  const sessionRows = (sessionResult.data ?? []) as UsageSessionRow[]
  const eventRows = (eventResult.data ?? []) as UsageEventRow[]

  const emails = new Set<string>()
  loginRows.forEach((r) => emails.add(r.email))
  sessionRows.forEach((r) => emails.add(r.email))
  eventRows.forEach((r) => emails.add(r.email))

  const loginCountByEmail = new Map<string, number>()
  for (const row of loginRows) {
    loginCountByEmail.set(row.email, (loginCountByEmail.get(row.email) ?? 0) + 1)
  }

  const durationsByEmail = new Map<string, number[]>()
  for (const row of sessionRows) {
    const started = new Date(row.started_at).getTime()
    const lastPing = new Date(row.last_ping_at).getTime()
    if (Number.isNaN(started) || Number.isNaN(lastPing)) continue
    const durationSeconds = Math.max(0, (lastPing - started) / 1000)
    const list = durationsByEmail.get(row.email) ?? []
    list.push(durationSeconds)
    durationsByEmail.set(row.email, list)
  }

  const eventCountsByEmail = new Map<string, Record<string, number>>()
  for (const row of eventRows) {
    const counts = eventCountsByEmail.get(row.email) ?? {}
    counts[row.event_type] = (counts[row.event_type] ?? 0) + 1
    eventCountsByEmail.set(row.email, counts)
  }

  const results: UsageAnalyticsRow[] = Array.from(emails).map((email) => {
    const durations = durationsByEmail.get(email) ?? []
    const totalDurationSeconds = durations.reduce((sum, d) => sum + d, 0)
    const averageDurationSeconds = durations.length > 0 ? totalDurationSeconds / durations.length : 0

    return {
      email,
      loginCount: loginCountByEmail.get(email) ?? 0,
      totalDurationSeconds,
      averageDurationSeconds,
      eventCounts: eventCountsByEmail.get(email) ?? {},
    }
  })

  results.sort((a, b) => b.loginCount - a.loginCount)

  return results
}

export interface UsageGrowthPoint {
  date: string
  cumulativeLogins: number
  cumulativeMinutes: number
}

interface LoginEventCreatedAtRow {
  created_at: string
}

interface UsageSessionTimestampsRow {
  started_at: string
  last_ping_at: string
}

// 依日期分桶（保留時間戳），計算「累計登入次數」與「累計停留分鐘數」隨時間成長的趨勢序列，
// 從最早一筆資料的日期補到今天，中間沒有資料的日期延續前一天的累計值（不斷線、不歸零）
export async function getUsageGrowthTrend(): Promise<UsageGrowthPoint[]> {
  const service = getServiceClient()

  const [loginResult, sessionResult] = await Promise.all([
    service.from('login_events').select('created_at'),
    service.from('usage_sessions').select('started_at, last_ping_at'),
  ])

  if (loginResult.error) throw loginResult.error
  if (sessionResult.error) throw sessionResult.error

  const loginRows = (loginResult.data ?? []) as LoginEventCreatedAtRow[]
  const sessionRows = (sessionResult.data ?? []) as UsageSessionTimestampsRow[]

  if (loginRows.length === 0 && sessionRows.length === 0) {
    return []
  }

  const dateKey = (d: Date) => format(d, 'yyyy-MM-dd')

  const dailyLoginCounts = new Map<string, number>()
  for (const row of loginRows) {
    const created = new Date(row.created_at)
    if (Number.isNaN(created.getTime())) continue
    const key = dateKey(created)
    dailyLoginCounts.set(key, (dailyLoginCounts.get(key) ?? 0) + 1)
  }

  const dailyMinutes = new Map<string, number>()
  for (const row of sessionRows) {
    const started = new Date(row.started_at)
    const lastPing = new Date(row.last_ping_at)
    if (Number.isNaN(started.getTime()) || Number.isNaN(lastPing.getTime())) continue
    const durationMinutes = Math.max(0, (lastPing.getTime() - started.getTime()) / 60000)
    const key = dateKey(started)
    dailyMinutes.set(key, (dailyMinutes.get(key) ?? 0) + durationMinutes)
  }

  const allKeys = [...Array.from(dailyLoginCounts.keys()), ...Array.from(dailyMinutes.keys())]
  allKeys.sort()

  if (allKeys.length === 0) {
    return []
  }

  const earliestKey = allKeys[0]
  const [ey, em, ed] = earliestKey.split('-').map(Number)
  let cursor = new Date(ey, em - 1, ed)
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const trend: UsageGrowthPoint[] = []
  let cumulativeLogins = 0
  let cumulativeMinutes = 0

  while (cursor.getTime() <= todayStart.getTime()) {
    const key = dateKey(cursor)
    cumulativeLogins += dailyLoginCounts.get(key) ?? 0
    cumulativeMinutes += dailyMinutes.get(key) ?? 0

    trend.push({
      date: key,
      cumulativeLogins,
      cumulativeMinutes,
    })

    cursor = addDays(cursor, 1)
  }

  return trend
}
