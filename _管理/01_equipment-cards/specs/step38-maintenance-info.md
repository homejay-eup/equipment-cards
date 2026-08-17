# Step 38 規格：維修資訊管理

> 來源：2026-07-31 需求討論（腦力激盪階段，逐一收斂資料模型/過時判斷/頁面架構/權限）。
> 資料來源為 Google Sheets「廠商維修品送修資訊」（廠商送修特別事項／海外廠商地址／主機配件報廢條件 3 個分頁），已委派 agent 讀完整份表草擬成匯入草稿 `_開發檔案/scripts/step38-maintenance-info-draft.csv`（135 筆，含待確認註記待人工審核比對正式料號）。
> **本次範圍不含批次匯入功能**（使用者已明確暫緩，之後另開規格）。第一版資料建立方式為透過本規格的新增/編輯 UI 手動輸入。

---

## 背景與設計決策

原始 Google Sheet 是以「廠商代號＋廠商名稱」分組的自由文字表格，記錄各型號/配件的送修規則、保固說明、報廢條件，並穿插日期戳記的修正歷史（新規則用紅字更正舊規則）。系統的料卡以 `equipment_id`（料號）為主鍵，但 Sheet 裡的「項目」多為型號通稱，兩者不是乾淨的一對一對應。

| 項目 | 決策 |
|---|---|
| 瀏覽層級 | 廠商為主的獨立頁籤，廠商內先依**料號**分組（可展開/收合），展開料號後才看到底下掛的維修規則內容；沒掛料號的規則歸到「未指定料號的一般規則」 |
| 規則↔料號關聯 | 多對多（比照 Step30b `card_documents` 的模式），一筆規則可掛載 0～多筆料號，掛載後為「同一份內容共用」，編輯規則會同步影響所有掛載的料號。若某料號規則需要獨立，需先移除掛載（不影響規則本身）再另建一筆規則 |
| 報廢條件分頁 | 合併進 `maintenance_rules`，作為 `rule_type` 的其中一種類型，不獨立建表 |
| 海外廠商地址分頁 | 合併進 `maintenance_vendors` 當作廠商基本資料欄位（地址/聯絡人/電話） |
| 過時判斷 | 每筆規則有「最後更新時間+人」與「人工確認最新時間+人」兩個時間戳，取較新者；超過 **6 個月**未更新/未確認 → 顯示「建議覆核」徽章。可手動點「標示已確認最新」重置倒數，不需真的改內容 |
| 附件/嵌入參考資料 | 第一版不支援（原表的瑕疵照片、型號清單、分級表等，先在草稿 CSV 的待確認註記標註「未轉入」，之後視需要另開規格） |
| 外部連結表 | 原表連到另一份獨立 Google Sheet「一年三修紀錄表」的超連結，本次不整合內容，不需處理 |
| 進入方式 | 掛在 `PhotoWall.tsx` 頂部分頁列，比照「任務板」「人為配件報價」「文件管理」的 mount-once + CSS 顯示/隱藏模式（非獨立路由） |
| 料卡細節頁入口 | `CardDetailDialog` 新增一個最小連結入口「查看維修資訊」，點擊後跳轉維修資訊分頁並自動篩選出與該料號相關的規則（唯一觸碰核心保護元件之處，僅加連結，不改其他邏輯） |
| 權限 | 新增獨立 permission key `manage_maintenance_info`，有此權限才能新增/編輯/刪除廠商與規則、掛載/移除料號；一般人員唯讀（看得到頁籤與內容，看不到新增/編輯/刪除操作） |
| 匯入 | **本次不做**，第一版資料透過新增/編輯 UI 手動建立 |

---

## 資料庫 Schema（新增 3 張表）

### `maintenance_vendors`（廠商）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid, pk, default gen_random_uuid() | |
| vendor_code | text | 廠商代號，原表格式不一致（多為 7 位數，少數 6 位數或空白改用名稱），不加唯一性限制，允許重複/空白 |
| name | text, not null | 廠商名稱 |
| address | text, nullable | 地址（海外廠商用） |
| contact_name | text, nullable | 聯絡人 |
| contact_phone | text, nullable | 聯絡電話 |
| sort_order | int, default 0 | |
| created_at | timestamptz, default now() | |
| updated_at | timestamptz, default now() | |

### `maintenance_rules`（維修規則）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid, pk | |
| vendor_id | uuid, fk → maintenance_vendors(id), not null | |
| item | text, not null | 項目/型號名稱（自由文字） |
| rule_type | text, not null | 限定值：`送修規則`／`保固說明`／`報廢條件`／`其他` |
| content | text, not null | 規則內容 |
| warranty_start_date | date, nullable | 保固起始日 |
| last_updated_at | timestamptz, default now() | 每次編輯內容時更新 |
| last_updated_by | text | 更新人（email 或姓名） |
| confirmed_at | timestamptz, nullable | 人工標示「已確認最新」的時間 |
| confirmed_by | text, nullable | |
| sort_order | int, default 0 | |
| created_at | timestamptz, default now() | |

### `maintenance_rule_equipment`（規則↔料號多對多掛載）
| 欄位 | 型別 | 說明 |
|---|---|---|
| rule_id | uuid, fk → maintenance_rules(id) on delete cascade | |
| equipment_id | text, fk → equipment_cards(equipment_id) | |
| created_at | timestamptz, default now() | |
| | | primary key (rule_id, equipment_id) |

Schema SQL 放在 `_開發檔案/sql/step38-maintenance-info.sql`，需包含建表、必要索引（`maintenance_rules.vendor_id`、`maintenance_rule_equipment.equipment_id`）、RLS 政策（比照 documents：已登入使用者可讀，寫入需檢查 `manage_maintenance_info` 權限或於 API 層檢查即可，依現有專案慣例決定）。

---

## 新增 Permission Key

| permission_key | 說明 |
|---|---|
| `manage_maintenance_info` | 看得到「維修資訊」頁籤的新增/編輯/刪除操作（新增廠商、新增/編輯規則、掛載或移除料號、標示已確認最新）；無此權限者僅能瀏覽 |

需加入：
- `src/app/api/roles/[id]/permissions/route.ts` 的 `VALID_PERMISSION_KEYS` 陣列（目前結尾為 `view_own_packages, edit_own_packages, share_own_packages, view_shared_packages`，接著加入 `manage_maintenance_info`）
- `RolesManager.tsx`：`PERM_LABELS` 新增一行說明；仿照 `DOCUMENT_MGMT_PERMS = ['manage_documents'] as const`（第 119 行附近）新增 `MAINTENANCE_INFO_PERMS = ['manage_maintenance_info'] as const`；新建角色表單與編輯角色頁面兩處皆要加入對應勾選區塊，插在「文件管理」分組之後
- API 路由統一使用既有 `requirePermission()`（`@/lib/admin`），比照 `src/app/api/documents/route.ts` 的寫法

---

## API Routes（新建）

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/maintenance/vendors` | 回傳全部廠商（含每家的料號數、規則數、待覆核筆數，用於頁籤首頁列表） |
| POST | `/api/maintenance/vendors` | 新增廠商，需 `manage_maintenance_info` |
| PATCH | `/api/maintenance/vendors/[id]` | 編輯廠商基本資料，需 `manage_maintenance_info` |
| DELETE | `/api/maintenance/vendors/[id]` | 刪除廠商，需先確認底下無規則（有規則則拒絕並回傳筆數，前端走 `ConfirmDialog` 提示需先處理規則），需 `manage_maintenance_info` |
| GET | `/api/maintenance/rules?vendor_id=` | 回傳該廠商底下所有規則，每筆帶出掛載的 `equipment_id` 清單（含料號名稱） |
| POST | `/api/maintenance/rules` | 新增規則（含掛載料號清單），需 `manage_maintenance_info`；寫入時設定 `last_updated_at/by` |
| PATCH | `/api/maintenance/rules/[id]` | 編輯規則內容/類型/保固起始日，需 `manage_maintenance_info`；更新 `last_updated_at/by` |
| DELETE | `/api/maintenance/rules/[id]` | 刪除規則（連動清掉 `maintenance_rule_equipment`），需 `manage_maintenance_info` |
| POST | `/api/maintenance/rules/[id]/link` | 掛載料號（body: `equipment_ids: string[]`），需 `manage_maintenance_info` |
| DELETE | `/api/maintenance/rules/[id]/link` | 移除掛載（body: `equipment_ids: string[]`，不影響規則本身），需 `manage_maintenance_info` |
| POST | `/api/maintenance/rules/[id]/confirm` | 標示「已確認最新」，寫入 `confirmed_at/by`，需 `manage_maintenance_info` |
| GET | `/api/maintenance/rules/by-equipment?equipment_id=` | 回傳與該料號相關的規則清單，供 `CardDetailDialog` 入口使用 |

---

## 前端異動

### 1. 新建 `src/components/maintenance/MaintenanceInfoClient.tsx`
- 廠商清單（緊湊列表，非卡片格）：代號/名稱/料號數/待覆核數，可搜尋廠商代號或名稱
- 點選廠商 → 顯示該廠商基本資料 + 底下依料號分組的規則列表（可展開/收合，預設收合、自動展開有待覆核規則的料號）、廠商內搜尋框、全部收合按鈕
- 每筆規則卡片：類型標籤、內容、掛載料號 chips、最後更新時間+人、確認狀態徽章（建議覆核／已確認最新）、標示已確認最新按鈕
- 新增廠商 Dialog、新增/編輯規則 Dialog（含 `EquipmentQuickPick` 掛載料號、共用規則編輯提示文字）
- 支援 URL query（`?vendor=&equipment=`）供 `CardDetailDialog` 入口跳轉時自動篩選

### 2. 新建 `src/components/maintenance/` 底下子元件
比照 `src/components/documents/` 的拆分方式（`EquipmentQuickPick` 可直接重用），視實作複雜度拆分廠商清單/規則列表/規則表單等子元件，避免單檔過大。

### 3. `src/components/PhotoWall.tsx`（**核心保護元件**，本次規格允許的最小侵入）
- `activeTab` 型別（現況：`'all' | 'bookmarks' | 'tracker' | 'quotes' | 'documents' | 'packages'`，src/components/PhotoWall.tsx:122）新增 `'maintenance'`
- 新增 `maintenanceMounted` state + `useEffect`，比照現有 `documentsMounted`／`packagesMounted` 寫法（mount-once + CSS hide/show，且要比照 Step30b「分頁內嵌化副作用修正」的 `isActive` prop 模式，讓元件在切回這個分頁時能重新抓最新資料，而不是只 mount 一次）
- 頂部分頁列新增按鈕「維修資訊」：所有登入使用者皆可見（一般人員唯讀），不像 `manage_documents` 那樣整個頁籤都要權限才顯示；頁籤內的新增/編輯/刪除操作按鈕才依 `permissions.includes('manage_maintenance_info')` 隱藏
- 新增 `maintenanceFilter` state（`{ equipmentId: string } | null`），供 `CardDetailDialog` 入口點擊後設定，`MaintenanceInfoClient` 接收此 prop 做初始篩選
- 搜尋列/篩選列/卡片網格的隱藏條件擴充納入 `activeTab === 'maintenance'`
- 未變動任何既有 state、handler、既有分頁的邏輯與版面

### 4. `src/components/CardDetailDialog.tsx`（**核心保護元件**，本次規格允許的最小侵入；經 Grep 確認全專案唯一呼叫點是 `PhotoWall.tsx`，故只需同步改這一處）
- `Props` 新增一個可選 callback：`onViewMaintenanceInfo?: (equipmentId: string) => void`（比照現有 `onEdit`/`onBookmarkNotesChange` 的可選 prop 慣例，預設 undefined 不影響其他呼叫端——目前僅有 `PhotoWall.tsx` 一處呼叫）
- Dialog 開啟時（比照現有 `logUsageEvent` 的 `useEffect` 寫法）呼叫 `GET /api/maintenance/rules/by-equipment?equipment_id=` 取得筆數；筆數為 0 時不顯示入口，避免無效連結
- 筆數 > 0 時顯示連結「查看維修資訊（N 筆與此料號相關）」，點擊呼叫 `onViewMaintenanceInfo?.(card.equipment_id)`
- `PhotoWall.tsx` 傳入此 prop 時，實作為：`setActiveTab('maintenance')` + `setMaintenanceFilter({ equipmentId })` + 觸發 `onClose()` 關閉 Dialog
- 不改動 `CardDetailDialog` 其他既有邏輯

### 5. `src/components/RolesManager.tsx`（既有，非核心保護清單內）
- `PERM_LABELS` 新增 `manage_maintenance_info` 說明
- 新增 `MAINTENANCE_INFO_PERMS` 常數，新建角色表單 + 編輯角色頁面皆插入「維修資訊」勾選區塊

---

## 【允許新建】

- `_開發檔案/sql/step38-maintenance-info.sql`
- `src/app/api/maintenance/vendors/route.ts`
- `src/app/api/maintenance/vendors/[id]/route.ts`
- `src/app/api/maintenance/rules/route.ts`
- `src/app/api/maintenance/rules/[id]/route.ts`
- `src/app/api/maintenance/rules/[id]/link/route.ts`
- `src/app/api/maintenance/rules/[id]/confirm/route.ts`
- `src/app/api/maintenance/rules/by-equipment/route.ts`
- `src/components/maintenance/MaintenanceInfoClient.tsx` 及其底下子元件
- `src/types/equipment.ts` 或新建 `src/types/maintenance.ts`（維修資訊相關型別）

## 【禁止觸碰】

- `PhotoWall.tsx`／`CardDetailDialog.tsx` 僅限本規格明確列出的最小侵入項目，其餘既有邏輯/版面/state 不得更動
- `CardFormDialog.tsx`、`EquipmentCardItem.tsx`、`BatchImportDialog.tsx`、`src/app/page.tsx` 完全不得觸碰
- 既有 `documents`／`card_documents`／`equipment_packages` 相關表與 API 不得更動

---

## 驗收標準

- [ ] 廠商清單正確顯示代號/名稱/料號數/待覆核數，可搜尋
- [ ] 廠商內依料號分組正確，展開/收合正常，預設只展開有待覆核規則的料號
- [ ] 新增/編輯廠商、新增/編輯規則（含掛載料號）功能正常，`manage_maintenance_info` 權限正確限制操作按鈕
- [ ] 一筆規則掛載多個料號時，編輯內容會同步反映在所有掛載料號的顯示上
- [ ] 移除掛載不影響規則本身內容，規則可以在 0 個掛載狀態下存在（歸為一般規則）
- [ ] 刪除廠商前正確檢查底下是否有規則，有則阻擋並提示
- [ ] 超過 6 個月未更新/未確認的規則正確顯示「建議覆核」，點擊「標示已確認最新」後正確重置
- [ ] `CardDetailDialog` 正確顯示/隱藏「查看維修資訊」入口，點擊後正確跳轉並篩選
- [ ] 無 `manage_maintenance_info` 權限者可瀏覽但看不到新增/編輯/刪除操作
- [ ] 現有料卡照片牆（全部料卡/我的關注/任務板/人為配件報價/文件管理）功能與版面無迴歸
- [ ] `npm run build` 通過，並針對本次新增/修改檔案額外跑一次繞過巢狀 eslintrc 設定的 lint 確認 `No issues found`

---

## 執行狀態

- ⏳ 尚未開始執行。批次匯入功能已明確排除在本次範圍外（暫緩）。待委派 `data` → `frontend` → `tester` → `reviewer`。
