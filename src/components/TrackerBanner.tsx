'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X, Bell } from 'lucide-react'

interface Props {
  pendingCount: number
}

export default function TrackerBanner({ pendingCount }: Props) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || pendingCount === 0) return null

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-2 bg-[#7a5230] text-white text-sm shadow-md">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 shrink-0" />
        <span>
          你有{' '}
          <strong>{pendingCount}</strong>{' '}
          件待處理議題
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/tracker?tab=my"
          className="text-xs font-semibold underline underline-offset-2 hover:no-underline transition-all"
        >
          前往追蹤板
        </Link>
        <button
          onClick={() => setDismissed(true)}
          aria-label="關閉"
          className="p-0.5 rounded hover:bg-white/20 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
