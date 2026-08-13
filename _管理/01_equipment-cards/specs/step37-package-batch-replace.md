# Step 37 — 設備套餐頁跨套餐批次替換料卡

## 背景

「我的關注」／「設備套餐」頁面組合情境太多太亂、難維護的架構優化討論（完整脈絡見 `_管理/00_方案紀錄.md`「[2026-08-12]」「[2026-08-13]」共三條條目）。最終討論收斂：標籤分類方案（11 個維度）與備註欄因人工維護成本抵銷效益而**全數擱置**；善用既有「複製套餐」功能取代模組化組裝**不需要新開發**；唯一要執行的是本 Step——補齊「設備套餐」頁面缺的跨套餐批次替換功能。

「我的關注」`GroupsPanel.tsx` 的替換料卡彈窗已有「此料卡同時存在於」勾選多個群組一次套用的功能（`ReplaceDialog` + `handleReplace` + `POST /api/groups/replace`），「設備套餐」目前沒有對等功能，本 Step 依樣比照補齊。

## 範圍

### 【允許新建】
- `src/components/packages/ReplacePackageItemDialog.tsx`
- `src/app/api/packages/replace/route.ts`

### 【允許修改】
- `src/hooks/usePackages.ts`
- `src/components/packages/PackageExplorer.tsx`
- `src/components/packages/PackageListView.tsx`
- `src/components/packages/EquipmentListView.tsx`

### 【禁止觸碰】
- `src/components/GroupsPanel.tsx`（只作為參考範本，不得修改）
- 所有核心保護元件：`src/components/PhotoWall.tsx`、`src/components/EquipmentCardItem.tsx`、`src/components/CardDetailDialog.tsx`、`src/components/CardFormDialog.tsx`、`src/components/BatchImportDialog.tsx`、`src/app/page.tsx`
- 不新增 permission key，沿用既有 `edit_own_packages`

## 設計細節

### API：`POST /api/packages/replace`

比照既有 `src/app/api/groups/replace/route.ts` 的邏輯（刪舊料卡、插新料卡、保留原數量與排序位置、bump `updated_at` 供對齊徽章判斷），改為：
- 權限：`requirePermission('edit_own_packages')`（比照 `src/app/api/packages/[id]/items/batch/route.ts`）
- 部門隸屬檢查：`getCallerDepartmentId(user.email!)`，查詢 `equipment_packages` 表確認所有 `package_ids` 的 `department_id` 都等於呼叫者部門，數量不符則回 403（比照 items/batch route 的寫法，但驗證整批而非單一 id）
- Body：`{ old_equipment_id: string, new_equipment_id: string, package_ids: string[] }`
- 邏輯：查詢這批 `package_ids` 中 `package_items` 表裡舊料卡目前的 `quantity`/`sort_order`（一次查詢，`in('package_id', package_ids).eq('equipment_id', old_equipment_id)`），逐一在每個 package 裡刪除舊料卡、插入新料卡（帶入保留的 quantity/sort_order），並更新該 `equipment_packages.updated_at`
- 回傳：`{ success: true }`（前端呼叫後用既有 `onChanged()` 整包重抓，不需回傳完整套餐資料）

### Hook：`usePackages.ts` 新增 `replaceItem`

```ts
async function replaceItem(oldEquipmentId: string, newEquipmentId: string, packageIds: string[]): Promise<void> {
  const res = await fetch('/api/packages/replace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_equipment_id: oldEquipmentId, new_equipment_id: newEquipmentId, package_ids: packageIds }),
  })
  await parseErrorOr<void>(res, '替換料卡失敗')
}
```
加入 return 物件。

### 元件：`ReplacePackageItemDialog.tsx`

比照 `GroupsPanel.tsx` 的 `ReplaceDialog`（樣式、Fuse 搜尋設定、版面配置盡量一致，維持視覺一致性）：

Props：
```ts
{
  equipmentId: string
  equipmentName: string
  allPackages: (EquipmentPackage | SharedEquipmentPackage)[]
  allCards: EquipmentCard[]
  onConfirm: (newCard: EquipmentCard, targetPackageIds: string[]) => Promise<void>
  onCancel: () => void
}
```
- 內部計算 `containingPackages = allPackages.filter(p => p.package_items.some(i => i.equipment_id === equipmentId))`
- 「此料卡同時存在於」勾選清單預設全部勾選（比照 `ReplaceDialog` 用 `containingGroups` 初始化 `targetGroups` 的邏輯）
- 搜尋新料卡：同樣的 Fuse 設定（`equipment_id`/`name`/`vendor` 加權，純數字查詢走 `includes`）
- confirm 按鈕 disabled 條件：未選新料卡、saving 中、或勾選套餐數為 0

### `PackageExplorer.tsx` 修改

- 新增 state：`replaceTarget: { equipmentId: string; equipmentName: string } | null`
- 新增 handler：
```ts
const handleReplace = useCallback(async (newCard: EquipmentCard, targetPackageIds: string[]) => {
  if (!replaceTarget) return
  setActionError(null)
  try {
    await pkgApi.replaceItem(replaceTarget.equipmentId, newCard.equipment_id, targetPackageIds)
    await onChanged()
  } catch (e) {
    setActionError(e instanceof Error ? e.message : '替換料卡失敗')
  }
  setReplaceTarget(null)
}, [replaceTarget, pkgApi, onChanged])
```
  （跟這個檔案其他 handler 一樣走 `onChanged()` 整包重抓，不做本地樂觀更新——`PackageExplorer` 的 `packages` 是外部傳入的 prop，不像 `GroupsPanel` 自己管理 state，維持跟 `handleAddManyToPackage`/`handleBatchUnlink` 一致的模式）
- 傳入 `onReplace={(equipmentId, equipmentName) => setReplaceTarget({ equipmentId, equipmentName })}` 給 `PackageListView` 與 `EquipmentListView`
- 渲染彈窗（放在其他 dialog 旁邊）：
```tsx
{replaceTarget && (
  <ReplacePackageItemDialog
    equipmentId={replaceTarget.equipmentId}
    equipmentName={replaceTarget.equipmentName}
    allPackages={packages}
    allCards={allCards}
    onConfirm={handleReplace}
    onCancel={() => setReplaceTarget(null)}
  />
)}
```

### `PackageListView.tsx` 修改

- 新增 prop：`onReplace: (equipmentId: string, equipmentName: string) => void`
- 在清單模式的料卡列（`sortedItems.map` 內）新增「替換」圖示按鈕（`ArrowLeftRight`，需新增 import），放在 `quantity`/`取消掛載` 那個 `<span className="flex items-center gap-3 flex-shrink-0">` 內
- **⚠️ 必須加 `stopPropagation`**：整列是 `<label>`（綁定尾端的取消掛載 checkbox），比照 `QuantityStepper.tsx` 檔頭註解提到的既有防呆模式，避免點擊替換按鈕誤觸 checkbox 切換
- 只在 `!isShared && canEdit` 時顯示，disabled 邏輯比照其他動作按鈕（`isBusy` 時disable）

### `EquipmentListView.tsx` 修改

- 新增 prop：`onReplace: (equipmentId: string, equipmentName: string) => void`
- 在群組標題列（`{g.packages.length} 份套餐` 附近）新增「替換料卡」按鈕，只在 `!isShared && canEdit` 時顯示
- 這裡的標題列不是 `<label>`，不需要 stopPropagation 防呆
- 點擊後開啟同一個 `ReplacePackageItemDialog`，預設帶出該料號所在的**全部**套餐（彈窗內部邏輯已處理，呼叫端只需傳 `equipmentId`/`equipmentName`）

## 完成標準

- `npm run build` 通過
- 針對本次新增/修改的檔案額外跑一次繞過巢狀 eslintrc 設定的 lint（worktree 已知盲點，見 CLAUDE.md「已知問題」）：
  `npx eslint <改動的檔案...> --no-eslintrc --config .eslintrc.json --parser-options=project:tsconfig.json`
- 情境測試（`tester` 負責）：
  - 依套餐視圖：點單一料卡「替換」，勾選/取消其他也含此料卡的套餐，確認替換後所有勾選的套餐都正確替換、未勾選的套餐維持原狀
  - 依料號視圖：點群組「替換料卡」，確認預設全部套餐勾選、替換後跨套餐生效
  - 數量/排序位置在替換後應該保留（不重置成 1／不跑到清單最後）
  - 「來源已更新」對齊徽章：替換後應正確反映套餐內容已變動（`updated_at` 有 bump）
  - 權限：`shared` 視圖（其他部門分享給我的套餐）不應出現替換按鈕；跨部門套餐 ID 不應通過後端驗證（403）
  - 邊界：只勾 0 個套餐時 confirm 按鈕應 disabled
