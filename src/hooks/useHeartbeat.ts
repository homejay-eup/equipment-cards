'use client'

import { useEffect } from 'react'
import { getOrCreateSessionId } from '@/lib/analyticsClient'

const HEARTBEAT_INTERVAL_MS = 60_000

// 掛載後每 60 秒打一次心跳（掛載時先立即打一次），分頁不可見時暫停，unmount 時清除
// 失敗一律吞掉，不影響任何 UI
export function useHeartbeat() {
  useEffect(() => {
    const sessionId = getOrCreateSessionId()
    if (!sessionId) return

    function sendHeartbeat() {
      try {
        fetch('/api/analytics/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        }).catch(() => {})
      } catch {
        // 吞掉，心跳失敗不影響使用者操作
      }
    }

    let intervalId: ReturnType<typeof setInterval> | null = null

    function startInterval() {
      if (intervalId) return
      intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)
    }

    function stopInterval() {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stopInterval()
      } else {
        sendHeartbeat()
        startInterval()
      }
    }

    // 掛載時先立即打一次
    sendHeartbeat()
    if (!document.hidden) startInterval()

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopInterval()
    }
  }, [])
}
