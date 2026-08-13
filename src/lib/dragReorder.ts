// 拖曳排序共用工具：依游標實際懸停在目標上/下半（或左/右半）判斷插入位置（before/after），
// 取代舊有「一律插在目標前面」或「依 fromIdx/toIdx 大小關係決定插入方向」的 splice pattern。
// 用於：TrackerClient.tsx（任務板）、QuotesClient.tsx（報價分類籤＋品項）、
// GroupsPanel.tsx（我的關注群組＋群組內料卡）、PackageExplorer.tsx／PackageListView.tsx（設備套餐＋套餐內料卡）。

import type { DragEvent } from 'react'

export type DropPosition = 'before' | 'after'

// 依游標在目標元素的上/下半（axis='vertical'，預設）或左/右半（axis='horizontal'）判斷插入位置
export function getDropPosition(
  e: DragEvent<HTMLElement>,
  axis: 'vertical' | 'horizontal' = 'vertical',
): DropPosition {
  const rect = e.currentTarget.getBoundingClientRect()
  if (axis === 'horizontal') {
    return (e.clientX - rect.left) < rect.width / 2 ? 'before' : 'after'
  }
  return (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after'
}

// 明確依 before/after 插入，取代依賴 fromIdx/toIdx 大小關係的排序邏輯。
// fromId 找不到、toId 找不到、或 fromId === toId 時回傳原陣列（呼叫端可用 `=== list` 判斷是否為 no-op）。
export function reorderByPosition<T>(
  list: T[],
  fromId: string,
  toId: string,
  position: DropPosition,
  getId: (item: T) => string,
): T[] {
  const fromIdx = list.findIndex(item => getId(item) === fromId)
  if (fromIdx === -1 || fromId === toId) return list
  const result = [...list]
  const [moved] = result.splice(fromIdx, 1)
  const toIdx = result.findIndex(item => getId(item) === toId)
  if (toIdx === -1) return list
  const insertIdx = position === 'after' ? toIdx + 1 : toIdx
  result.splice(insertIdx, 0, moved)
  return result
}
