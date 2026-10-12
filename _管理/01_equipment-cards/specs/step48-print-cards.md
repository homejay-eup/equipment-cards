# Step 48：列印料卡（A6 直式，手送台）

## 需求（已與使用者對焦確認）

- 每張料卡印成一頁 **A6 直式（105×148mm）**：上方主圖、下方品號（小字、等寬）＋品名（粗體、置中），版面參照料卡燈箱的圖在上/文字在下。
- 主圖**等比縮放完整顯示、不裁切**（object-fit: contain）。無主圖仍照印，圖區顯示「無照片」。
- 走瀏覽器列印視窗（window.print），頁面設定 `@page { size: A6 portrait; margin: 0 }`，多張＝多頁。進紙來源（手送台）由使用者在列印對話框選，網站不指定。
- 單選入口：料卡細節燈箱右上角、編輯筆旁加印表機圖示。
- 多選入口：重用現有「批次選取」模式，底部操作列「刪除」旁加「列印（N）」。
- 新增獨立權限 `print_cards`，角色管理可勾選，預設授予「管理員」。有列印權但沒有編輯權的人：選取模式只顯示列印，不顯示刪除，也看不到批次匯入/匯出 CSV/新增料卡。
- 多張順序依畫面目前篩選＋排序後的順序；每張固定 1 份；主圖用 Cloudinary 較高解析度版本；列印前等所有圖片載入完成。

## 【允許新建】

- `_開發檔案/sql/step48-print-cards-permission.sql`（比照 `step46b-standard-price-permissions.sql`，授予角色名稱「管理員」`print_cards`）
- `src/components/print/` 下的列印元件/函式（獨立 iframe 或獨立視窗列印，不得修改 `globals.css`）

## 【允許最小侵入修改】

- `src/app/api/roles/[id]/permissions/route.ts`：`VALID_PERMISSION_KEYS` 加 `print_cards`
- `src/components/RolesManager.tsx`：`PERM_LABELS` 加標籤、新增「列印」分組常數，**兩個渲染位置**（新增角色表單 sections 陣列、展開編輯區）都要加
- `src/components/PhotoWall.tsx`（核心保護，僅限以下）：
  - 新增 `canPrint = permissions.includes('print_cards')`
  - 選取模式/底部操作列/浮動按鈕區外層條件改為 `(isAdmin || canPrint) && activeTab === 'all'`
  - 底部操作列：「刪除」只給 `isAdmin`；新增「列印（N）」給 `canPrint`
  - 浮動按鈕選單：「批次選取」改 `canEditCard || canPrint` 可見；「批次匯入」「匯出 CSV」「新增料卡」仍只給 `canEditCard`
  - 傳 `onPrint` 給 `CardDetailDialog`（有 `print_cards` 才傳，所有分頁皆可）
- `src/components/CardDetailDialog.tsx`（核心保護，僅限以下）：新增可選 prop `onPrint?: () => void`（預設不顯示）；有傳才顯示印表機圖示。位置：有編輯鈕時在編輯鈕左側（約 `right-[7.25rem]`），沒有編輯鈕時佔編輯鈕位置（`right-[4.75rem]`），樣式與現有圓形按鈕一致。

## 【禁止觸碰】

`EquipmentCardItem.tsx`、`BatchImportDialog.tsx`、`CardFormDialog.tsx`、`src/app/page.tsx`、`GroupsPanel.tsx`、`packages/PackageListView.tsx`、`globals.css`、`ui/dialog.tsx`、`.env.local`，以及其餘所有未列出的既有檔案。

## 完成標準

- `npm run build` 通過；另對改動檔案跑繞過巢狀設定的 eslint（見 CLAUDE.md「worktree ESLint 盲點」）。
- 一般使用者（無 `print_cards`）畫面與行為完全不變。
- 有 `print_cards` 無編輯權：可進選取模式、只見列印、不見刪除與其他 FAB 項目。
- 刪除的後端 API 權限不改。
