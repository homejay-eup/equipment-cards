# Step 39 規格：維修資訊管理——實測回饋修正

> 來源：2026-08-17 使用者正式站實測 Step 38 維修資訊管理功能後的回饋，逐項對焦收斂。承接 `_管理/01_equipment-cards/specs/step38-maintenance-info.md`。

---

## 背景與決策

使用者實測後回報 3 點問題，逐一討論收斂：

1. **「標示已確認最新」導致整個畫面重整、規則收合**：根因是 `MaintenanceInfoClient.tsx` 每次資料重新整理（含確認最新/新增/編輯/刪除規則）都會把 `vendorsLoading`/`rulesLoading` 切回 true，導致整個面板短暫換成 loading 畫面；且有一段 `useEffect` 每次 `rules` 陣列變動就從零重算 `expandedIds`，蓋掉使用者手動展開的分組。**決策**：只在「首次載入」或「切換廠商」時才顯示全畫面 loading／重算預設展開；同一廠商內的背景資料重新整理不應清空使用者的展開/收合狀態。
2. **保固起始日的日期選擇器風格跟其他地方不一致**：`RuleFormDialog.tsx` 誤用原生 `<input type="date">`，專案裡其實已有跟整體風格一致的 `src/components/DatePicker.tsx`（任務板到期日使用中）。**決策**：直接換成 `DatePicker.tsx`。
3. **欄位語意修正**：這個日期欄位實際代表「該設備從哪一批進貨日期開始後適用該維修規則」，不是「單一設備的保固起算日」。**決策**：UI 標籤改為「適用進貨日期（起）」+ 說明文字「此日期（含）之後到貨的設備才適用這條規則」。**底層資料庫欄位名稱 `warranty_start_date` 不變**（純 UI 文案調整，避免不必要的欄位重新命名遷移）。
4. **新增保固期間欄位**（使用者順帶提出的新需求）：新增「保固期間」欄位，輸入方式為一個數字欄位 + 月/年單位切換按鈕，統一換算成月數存入資料庫；顯示時自動換算成人類可讀格式（例如 18 個月顯示「1 年 6 個月」，24 個月顯示「2 年」，6 個月顯示「6 個月」）。**不**跟「適用進貨日期（起）」自動計算到期日或做過保提醒，單純顯示這個期間數字。

---

## 資料庫異動

新增 `_開發檔案/sql/step39-maintenance-warranty-period.sql`：

```sql
ALTER TABLE maintenance_rules ADD COLUMN IF NOT EXISTS warranty_period_months INT;
```

（沿用既有欄位 `warranty_start_date DATE`，不重新命名、不需要資料搬遷）

---

## 型別異動

`src/types/maintenance.ts`：`MaintenanceRule` 新增 `warranty_period_months: number | null`

---

## API 異動

- `POST /api/maintenance/rules`（`src/app/api/maintenance/rules/route.ts`）：body 新增選填 `warranty_period_months`（number | null），寫入時驗證為非負整數或 null
- `PATCH /api/maintenance/rules/[id]`（`src/app/api/maintenance/rules/[id]/route.ts`）：同上，允許更新此欄位

---

## 前端異動

### 1. `src/lib/maintenance.ts`（既有共用工具檔）
新增 `formatWarrantyPeriod(months: number | null | undefined): string | null`：
- `null`/`undefined` → 回傳 `null`（呼叫端據此決定是否顯示這行）
- `months < 12` → `"${months} 個月"`
- `months % 12 === 0` → `"${months/12} 年"`
- 其餘 → `"${Math.floor(months/12)} 年 ${months % 12} 個月"`

### 2. `src/components/maintenance/RuleFormDialog.tsx`
- 日期欄位改用 `import DatePicker from '@/components/DatePicker'`，取代原生 `<input type="date">`（`DatePicker` props 為 `{ value, onChange, disabled }`，`value`/`onChange` 皆為 `YYYY-MM-DD` 字串，介面比照現有 `warrantyStartDate` state 直接替換）
- 該欄位標籤文字改為「適用進貨日期（起）」，下方補一行說明文字「此日期（含）之後到貨的設備才適用這條規則，選填」
- 新增「保固期間」欄位：一個數字 `<input type="number" min="0">` + 月/年切換按鈕（比照類型下拉的視覺風格，兩個按鈕互斥高亮）；內部維持一個「輸入值＋單位」的暫存 state，換算成月數後才寫入送出的 `warranty_period_months`；編輯既有規則時，把資料庫的月數換算回「盡量用年顯示」的預設單位（例如 24 個月預設顯示「24」+「年」單位下應顯示「2」——請自行決定初始顯示邏輯，只要使用者體感自然即可，例如優先用「能整除 12 就用年」的單位帶入）
- 下方補一行說明文字「顯示時會自動換算，例如輸入 18 個月會顯示為「1 年 6 個月」」

### 3. `src/components/maintenance/RuleCard.tsx`
- 移除原本的「保固起始日：{rule.warranty_start_date}」那行，改為兩行資訊（皆為選填，沒有值就不顯示該行）：
  - 適用進貨日期：使用貨車類圖示（例如 `TruckIcon`／`lucide-react` 找一個合適的，例如 `Truck`），文字「{date} 後到貨適用」
  - 保固期間：使用 `ShieldCheck`（`lucide-react` 已有其他地方用過同類圖示可參考風格），文字「保固 {formatWarrantyPeriod(rule.warranty_period_months)}」，`formatWarrantyPeriod` 回傳 `null` 時不顯示這行

### 4. `src/components/maintenance/MaintenanceInfoClient.tsx`（修正 UX bug，不改變其他行為）
- **全畫面 loading 判斷收斂為「只在真正首次載入」**：
  - 廠商清單：目前 `vendorsLoading ? spinner : 內容` 的判斷，改為只在 `vendors.length === 0 && vendorsLoading` 時顯示全畫面 spinner；已有資料時背景重新整理不應該讓整個面板消失
  - 規則清單：`VendorDetailPanel` 內的 `rulesLoading` 同樣道理，只在該廠商第一次載入（`rules.length === 0 && rulesLoading`）時顯示 loading 狀態，已有資料時的背景刷新不應該讓清單消失重繪
- **`expandedIds` 不再每次 `rules` 變動就整個重算**：改成只在「切換到不同廠商」時才計算一次預設展開集合（含 needs_review 分組 + `pendingFocusId`），可用 `useRef` 記錄「目前展開狀態是哪個 vendorId 算出來的」，`selectedVendorId` 改變時才重新計算並覆蓋 `expandedIds`；同一廠商內因為確認最新/新增/編輯/刪除規則觸發的 `refreshRules` 重新抓資料，**不得**覆蓋 `expandedIds`（維持使用者手動展開/收合的狀態）
- `pendingFocusId`（從 `CardDetailDialog` 跳轉進來要展開的料號）的處理邏輯需要保留，確保這個情境仍然正確展開對應分組

---

## 【允許新建】
- `_開發檔案/sql/step39-maintenance-warranty-period.sql`

## 【禁止觸碰】
- `PhotoWall.tsx`、`CardDetailDialog.tsx`、`CardFormDialog.tsx`、`EquipmentCardItem.tsx`、`BatchImportDialog.tsx`、`src/app/page.tsx`
- `maintenance_vendors`／`maintenance_rule_equipment` 表結構（本次只加 `maintenance_rules` 一個欄位）
- `VendorFormDialog.tsx`、`VendorListPanel.tsx`（跟本次修正範圍無關）

---

## 驗收標準

- [ ] 「標示已確認最新」點擊後，畫面不再整個閃爍重整，其他已展開的分組維持展開狀態
- [ ] 新增/編輯/刪除規則後，同廠商內其他分組的展開/收合狀態不受影響
- [ ] 切換到不同廠商時，展開狀態正確重算為該廠商的預設值（含 needs_review 分組）
- [ ] 從 `CardDetailDialog` 跳轉進來時，指定料號分組仍正確自動展開（回歸測試）
- [ ] 保固起始日欄位改用 `DatePicker`，視覺風格與任務板到期日一致
- [ ] 欄位標籤正確顯示為「適用進貨日期（起）」，說明文字正確
- [ ] 新增規則可填保固期間（數字+月/年切換），正確換算月數存入 `warranty_period_months`
- [ ] 編輯既有規則時，保固期間輸入框正確帶回既有值
- [ ] 規則卡片正確顯示換算後的保固期間文字（12/18/24/6 個月等邊界值皆正確）
- [ ] `npm run build` 通過，改動檔案額外跑 `npx eslint --no-eslintrc --config .eslintrc.json --parser-options=project:tsconfig.json` 確認 `No issues found`

---

## 執行狀態

- ⏳ 尚未開始執行，待委派 `frontend`（含 SQL 檔案與相關 API route 調整）→ `tester` → `reviewer`。
