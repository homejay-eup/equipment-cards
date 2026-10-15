# Step 49 規格：維修資訊頁面改為「回廠流程」視角

> 來源：2026-10-15 需求討論（腦力激盪階段逐題收斂，並以可互動預覽確認版面與操作）。
> 互動預覽原型：`_管理/01_equipment-cards/specs/step49-preview-mockup.html`（執行時對照版面、配色、互動；預覽內的資料為示範用）。
> 取代 Step 38／38b／39／44 的「依廠商／依料號」兩頁籤架構；Step 38 的資料表、過時判斷、權限、料號掛載機制沿用。

---

## 一、需求摘要

公司回廠流程為：收到技師寄回的設備 → 回廠作業（一般／特殊情境）→ 檢測作業（年限判斷是否報廢 → 是否檢測）→ 送修作業（依廠商規則執行）→ 報廢作業（獨立一套規則）。頁面要「簡單明瞭、好查詢、好維護、可批次更新、看得出資訊是否過時」，且能清楚知道各料號在各流程階段的資訊。

## 二、已定案的設計決策

| 項目 | 決策 |
|---|---|
| 頁面架構 | 拿掉「依廠商／依料號」兩個頁籤，整頁統一為一個流程視角：搜尋列 → 流程圖（4 個區塊）→ 選中區塊的規則清單 |
| 4 個區塊 | **回廠**（收件、分流）、**檢測**（年限判斷、是否檢測）、**送修**（廠商規則）、**報廢**（成本、國稅局；規則內容之後再新增，本次只預留區塊與空狀態說明）。名稱不加「作業」二字，送修副標題不含「保固」 |
| 回廠區塊 | 一般流程不需記錄（順利往下走）。「特殊情境」是一份可自行增減的清單，每筆規則 = 一個情境卡片（缺件、設備升級、技師未完工掛客戶、AB 件、順拆、人為損毀、調閱影像、虛擬條碼、策略商設備、EDR 失聯補傳調閱…）。每筆標註「處理後去向」 |
| 處理後去向 | 標籤式選項：預設 回一般流程／結案／跳到檢測／跳到送修／跳到報廢，使用者可自行新增、刪除、拖曳排序（互動比照 `SettingsPopover` 的齒輪管理選項）。選項清單存新表 `maintenance_exit_options`（理由見第五節） |
| 檢測區塊 | 子類「年限判斷」（通用規則＋料號例外；結構化年限欄位＋說明文字，**系統不自動計算**，由人員對照日期判斷）與「是否檢測」（以標題記「需檢測／免測」，內容寫檢測項目與標準；第一版不做結構化旗標） |
| 送修區塊 | 子類「廠商送修」：送修規則、保固說明；廠商欄位選填，主要用在這裡 |
| 規則適用範圍 | **不加「全公司」標籤**。沒掛料號 ＝ 通用規則（清單標示「通用」灰標籤）；有掛料號 ＝ 該料號專屬／例外（顯示料號標籤，超過 2 個顯示 +N）。查某料號時，專屬規則排前、通用規則排後 |
| 廠商 | `vendor_id` 改為**選填**。廠商不再是獨立頁面：規則表單用下拉選廠商，規則列點廠商標籤可看基本資料（地址、聯絡人、電話）；廠商的新增／編輯／刪除集中到工具列「廠商資料」入口（沿用現有 `VendorFormDialog`） |
| 搜尋 | 搜尋列同時查料號、品名、廠商。輸入料號後：各區塊以藍點標示「有此料號專屬規則」、顯示適用筆數；清單列出該料號專屬＋通用規則 |
| 過時判斷 | 沿用 Step 38：`last_updated_at` 與 `confirmed_at` 取較新者，超過 6 個月 → 「建議覆核」；流程圖每個區塊顯示待覆核數；規則列一鍵「標示已確認最新」 |
| 維護操作 | 新增、編輯（同一張編輯面板，區塊／子類／標題／內容／料號／廠商／期間或年限／去向）、標示已確認最新、刪除（`ConfirmDialog`）。**所有按鈕以圖示呈現**（鉛筆、圈勾、垃圾桶等，附 `title` 提示），風格照 `RuleCard.tsx` 現有圖示按鈕。不做「複製」 |
| 批次更新 | 規則列可打勾，勾選後出現批次工具列：標示已確認、改區塊、掛載／移除料號、改廠商、改共用欄位（保固期間、年限）、批次刪除（`ConfirmDialog`，顯示筆數）。切換區塊時清除勾選。**不做批次匯入** |
| 下拉選單／挑選器 | 一律使用木質棕主題自訂樣式（不用瀏覽器原生 `<select>`）；料號挑選為「搜尋＋打勾清單＋確認新增（已選 N）」，互動比照 `EquipmentQuickPick` |
| 配色 | 木質棕：主色 `#7a5230`、背景 `#faf6f0`、卡片 `#fff9f4`、強調 `#c49a72`、邊框 `#e8ddd0`、危險 `#b5451b`、警示底 `#fdf0d5`／字 `#8a5a12`、已確認底 `#eaf0df`／字 `#4a6b2e` |
| 資料遷移 | 保留全部既有規則，依舊 `rule_type` 自動對應：報廢條件→檢測／年限判斷；送修規則、保固說明→送修／廠商送修；其他→「待歸類」。待歸類在流程圖尾端顯示為獨立小標籤（含筆數），點擊列出，再用批次「改區塊」處理 |
| 料卡細節頁入口 | 維持現有「查看維修資訊（N 筆）」連結（`CardDetailDialog`、`PhotoWall` **不改**）。點擊後 `MaintenanceInfoClient` 把 `filter.equipmentId` 帶入搜尋框並切到有此料號專屬規則的第一個區塊 |
| 特殊回廠流程 | 已拆解為回廠區塊的「特殊情境」清單＋處理後去向，不另設獨立流程 |

## 三、資料庫異動（`_開發檔案/sql/step49-maintenance-flow-redesign.sql`）

`maintenance_rules` 新增／調整欄位：

| 欄位 | 異動 | 說明 |
|---|---|---|
| `vendor_id` | `DROP NOT NULL` | 廠商選填；FK 與 `ON DELETE CASCADE` 維持（刪廠商仍連動刪除其規則，沿用 Step 43 決策；刪除確認文案要提醒） |
| `stage` | 新增 `TEXT NOT NULL DEFAULT '待歸類'` | 限定值：`回廠`／`檢測`／`送修`／`報廢`／`待歸類`（API 層驗證，另加 CHECK constraint） |
| `sub_category` | 新增 `TEXT` | 子類：`特殊情境`／`年限判斷`／`是否檢測`／`廠商送修`／`報廢規則`；待歸類可為 NULL |
| `exit_option` | 新增 `TEXT` | 處理後去向（存選項文字，僅回廠區塊使用）；選項被刪除時既有規則保留原文字顯示 |
| `age_limit_months` | 新增 `INT` | 年限（月數，比照 `warranty_period_months`，上限 `MAX_WARRANTY_PERIOD_MONTHS`，加 CHECK） |
| `age_limit_basis` | 新增 `TEXT` | 年限起算依據，預設顯示「進貨日」，使用者可改文字 |
| `rule_type` | `DROP NOT NULL`，保留資料 | 舊欄位，新 UI 不再讀寫；留作遷移依據與回溯用 |
| `item` | 沿用 | 新 UI 稱「標題」 |

新表 `maintenance_exit_options`：`id uuid pk`、`label text not null unique`、`sort_order int default 0`、`created_at`。RLS：已登入可讀，寫入走 service_role API（比照 Step 38）。初始資料寫入 5 個預設選項。

遷移 SQL 內含依 `rule_type` 的 `UPDATE ... SET stage/sub_category`，以及索引 `idx_maintenance_rules_stage`。SQL 需可重複執行（`IF NOT EXISTS`、`ADD COLUMN IF NOT EXISTS`）。

## 四、API 異動

| 路由 | 異動 |
|---|---|
| `GET /api/maintenance/rules` | `vendor_id` 改為**選填**；未帶時回傳**全部規則**（含料號掛載、`vendor_name`、`needs_review`）。回傳格式新增 `stage`、`sub_category`、`exit_option`、`age_limit_months`、`age_limit_basis` |
| `POST /api/maintenance/rules` | `vendor_id` 改選填（有值才檢查廠商存在）；`stage` 必填且須在限定值內；新增欄位驗證（`sub_category` 須與 `stage` 相容、`age_limit_months` 範圍、`exit_option` 僅回廠接受） |
| `PATCH /api/maintenance/rules/[id]` | 新增可更新 `stage`、`sub_category`、`exit_option`、`age_limit_months`、`age_limit_basis`、`vendor_id`（可設 null）；不再驗證 `rule_type` |
| `POST /api/maintenance/rules/batch`（新） | Body：`{ ids: string[], action, payload }`；`action` ∈ `confirm`／`move_stage`／`link`／`unlink`／`set_vendor`／`set_fields`／`delete`；`ids` 上限 200；需 `manage_maintenance_info`；寫入 `last_updated_at/by`（`confirm` 寫 `confirmed_at/by`）；回傳每個動作成功筆數與失敗清單，**部分失敗不得靜默**（前端要顯示，比照 Step 38 reviewer 修過的警告訊息教訓） |
| `GET/PUT /api/maintenance/options`（新） | 去向選項讀取（已登入）、整批覆蓋儲存（需 `manage_maintenance_info`，覆蓋寫入需原子或以 upsert＋刪除多餘項處理，避免「先刪後插」的非原子問題，Step 34 reviewer 抓過同類問題） |
| `GET /api/maintenance/vendors` | 統計迴圈需略過 `vendor_id` 為 null 的規則（不得以 null 當 Map key 產生假廠商統計）；其餘不變。`equipment_stats` 欄位前端不再使用，保留不刪（避免無謂改動） |
| `GET /api/maintenance/rules/by-equipment` | 不改（`CardDetailDialog` 只取筆數；`vendor_name` 已容許 null） |
| `POST /api/maintenance/rules/[id]/confirm`、`/link`、`vendors/[id]` | 不改 |

所有新增 API 沿用既有寫入權限 `manage_maintenance_info`，讀取為已登入使用者。

## 五、設計取捨說明

- **處理後去向選項為何不走 `app_settings`／`SettingsPopover`**：現有機制需修改 `/api/settings/route.ts` 的 key 白名單與權限對照、`AppSettings` 型別與 `DEFAULT_SETTINGS`（`src/types/equipment.ts`，全專案多處引用）、`SettingsPopover` 的標題對照，影響面大且權限模型（`edit_card_category` 等）與維修資訊權限不一致。改用獨立小表＋獨立元件，互動比照但不觸碰共用機制。
- **為何不以 `Dialog` 做規則編輯**：預覽採「清單上方展開的行內面板」。可避開 CLAUDE.md 已知兩個 portal 踩坑（`pointerEvents: 'auto'`、`modal={false}`）。若執行時改用 Dialog，必須遵守這兩條。
- **客戶端搜尋**：規則總量小（草稿約 135 筆），首次進入取回全部規則，搜尋、篩選、區塊統計皆在前端計算，不新增搜尋 API。

## 六、前端異動

### 新建（`src/components/maintenance/`）
- `FlowStages.tsx`：流程圖（編號圓圈、圖示、標題、副標題、筆數、待覆核徽章、搜尋命中藍點、選中區塊棕色填滿、待歸類小標籤）
- `RuleListPanel.tsx`：選中區塊的規則清單（子類分組標題、專屬／通用排序、批次勾選與批次工具列、空狀態）
- `RuleRow.tsx`：單筆規則列（標題、內容、料號標籤、通用標籤、去向標籤、年限／期間／廠商標籤、確認狀態、圖示按鈕）
- `RuleEditPanel.tsx`：新增／編輯行內面板
- `BatchPanel.tsx`：批次操作面板（改區塊、掛載或移除料號、改廠商、改共用欄位、刪除確認）
- `ThemedSelect.tsx`：木質棕主題自訂下拉選單
- `ExitOptionsManager.tsx`：處理後去向選項管理（齒輪＋彈出面板，新增／刪除／拖曳排序）
- `VendorManageDialog.tsx`：廠商資料管理（清單＋新增／編輯／刪除，內部沿用 `VendorFormDialog`）；規則列點廠商標籤顯示的基本資料小卡

### 修改
- `MaintenanceInfoClient.tsx`：重寫為新架構（保持 `Props` 不變：`isActive`、`filter`、`permissions`、`allCards`；保留 `isActive` 切回分頁重新抓取機制）
- `src/types/maintenance.ts`：新增 `MaintenanceStage`、新欄位型別；`MaintenanceRuleType`／`MAINTENANCE_RULE_TYPES` 標為棄用或移除
- `src/lib/maintenanceFormat.ts`：新增 `MAINTENANCE_STAGES`、`STAGE_SUBCATEGORIES` 常數；`RULE_TYPE_COLOR`、`VALID_MAINTENANCE_RULE_TYPES` 移除（呼叫端皆在本次改寫範圍內，見第七節）；`computeNeedsReview`、`fmtDateTime`、`emailPrefix`、`formatWarrantyPeriod` 保留沿用（年限顯示重用 `formatWarrantyPeriod` 的換算邏輯）
- `src/lib/maintenance.ts`：re-export 清單同步調整
- `src/components/documents/EquipmentQuickPick.tsx`：新增**選填** prop（預設值維持現狀，不破壞既有三處呼叫端）以支援圖示觸發按鈕

### 刪除（改寫後無引用）
`VendorDetailPanel.tsx`、`VendorListPanel.tsx`、`EquipmentRuleListPanel.tsx`、`RuleCard.tsx`、`RuleFormDialog.tsx`

## 七、影響範圍（CodeGraph＋Grep 交叉驗證結果）

> 方法：`codegraph_explore` 以功能描述與 symbol 名稱各查一輪，`codegraph_callers(computeNeedsReview)` 回報「無 caller」（對 import 型呼叫有盲點），改以 Grep 全專案交叉驗證，以 Grep 結果為準。

| 對象 | 實際使用點 | 處置 |
|---|---|---|
| `MaintenanceInfoClient` | 僅 `PhotoWall.tsx:20,1178` | **需改（重寫內部），Props 不變 → `PhotoWall.tsx` 不需改** |
| `VendorDetailPanel`／`VendorListPanel`／`EquipmentRuleListPanel`／`RuleCard`／`RuleFormDialog` | 唯一呼叫端皆是 `MaintenanceInfoClient.tsx`（`RuleCard` 僅 `VendorDetailPanel.tsx:146`） | 刪除，無外部引用 |
| `VendorFormDialog` | 僅 `MaintenanceInfoClient.tsx:333` | 保留，由 `VendorManageDialog` 沿用 |
| `RULE_TYPE_COLOR` | `RuleCard`、`VendorDetailPanel`、`EquipmentRuleListPanel` | 隨三者刪除一併移除 |
| `VALID_MAINTENANCE_RULE_TYPES` | `rules/route.ts`、`rules/[id]/route.ts`、`lib/maintenance.ts` re-export | 兩支 API 需改（不再驗 `rule_type`），re-export 同步移除 |
| `MAINTENANCE_RULE_TYPES`／`MaintenanceRuleType` | `RuleFormDialog`（將刪除）、`types/maintenance.ts` | 隨 `RuleFormDialog` 移除 |
| `MaintenanceRule` 型別 | `MaintenanceInfoClient`、`RuleCard`、`VendorDetailPanel`、`RuleFormDialog` | 全在本次改寫範圍 |
| `MaintenanceEquipmentRule`／`MaintenanceEquipmentStats` | 僅 `EquipmentRuleListPanel`、`MaintenanceInfoClient` | 隨改寫移除或調整 |
| `computeNeedsReview` | `rules/route.ts`、`vendors/route.ts`、`by-equipment/route.ts`（Grep 確認；codegraph 漏報） | 邏輯不變，不需改 |
| `GET /api/maintenance/rules` | 呼叫端：`MaintenanceInfoClient`（`?vendor_id=` 與 `by-equipment`） | 改為 `vendor_id` 選填、回傳新欄位；舊呼叫方式仍相容 |
| `GET /api/maintenance/rules/by-equipment` | 呼叫端：`CardDetailDialog.tsx:72`、`MaintenanceInfoClient.tsx:132` | 不改 API；`MaintenanceInfoClient` 改為以搜尋框帶入 `filter.equipmentId` |
| `GET /api/maintenance/vendors` | 呼叫端：`MaintenanceInfoClient`（`refreshVendors`） | 僅補 null `vendor_id` 防禦 |
| `EquipmentQuickPick` | `RuleFormDialog`（將刪除）、`PackageListView`、`ExpandableDocumentList` | 僅新增選填 prop、預設不變；改後必須驗證 `PackageListView`、`ExpandableDocumentList` 兩處（設備組合、文件管理）無迴歸 |
| `SettingsPopover`／`/api/settings`／`AppSettings` | 多處共用 | **不觸碰**（去向選項走獨立機制） |
| `manage_maintenance_info` 權限 | `RolesManager.tsx`、`roles/[id]/permissions/route.ts`、`PhotoWall.tsx:767`、`PhotoWall.tsx:1211` | 不新增權限 key，**不需改** |
| `maintenance_tab_switch`（使用統計） | `AnalyticsClient.tsx:32`、`PhotoWall.tsx:769` | 不改 |
| `CardDetailDialog.tsx`（核心保護元件） | 「查看維修資訊」入口與 `by-equipment` 取筆數 | **不改** |
| `PhotoWall.tsx`（核心保護元件） | 頁籤與 `maintenanceFilter` 傳遞 | **不改**（Props 與 `filter` 形狀不變） |

## 八、【允許新建】

- `_開發檔案/sql/step49-maintenance-flow-redesign.sql`
- `src/app/api/maintenance/rules/batch/route.ts`
- `src/app/api/maintenance/options/route.ts`
- `src/components/maintenance/FlowStages.tsx`、`RuleListPanel.tsx`、`RuleRow.tsx`、`RuleEditPanel.tsx`、`BatchPanel.tsx`、`ThemedSelect.tsx`、`ExitOptionsManager.tsx`、`VendorManageDialog.tsx`

## 九、【禁止觸碰】

- 核心保護元件：`PhotoWall.tsx`、`CardDetailDialog.tsx`、`CardFormDialog.tsx`、`EquipmentCardItem.tsx`、`BatchImportDialog.tsx`、`src/app/page.tsx`
- `SettingsPopover.tsx`、`src/app/api/settings/route.ts`、`src/types/equipment.ts`
- `RolesManager.tsx`、`roles/[id]/permissions/route.ts`（不新增權限）
- `rules/[id]/confirm`、`rules/[id]/link`、`rules/by-equipment`、`vendors/[id]` 四支 API
- 既有 `documents`／`card_documents`／`equipment_packages` 相關表與 API
- 執行時若發現必須動到以上任一項，先停下回報、取得使用者確認

## 十、驗收標準

- [ ] 四個區塊切換後清單正確、不殘留編輯面板與勾選；報廢區塊顯示空狀態說明
- [ ] 搜尋料號：區塊藍點、適用筆數、專屬在前通用在後；搜尋框可查料號、品名、廠商
- [ ] 規則新增／編輯／刪除／標示已確認正常；新增或編輯後「最後確認」重置
- [ ] 料號挑選器可搜尋、複選；處理後去向可新增／刪除／拖曳排序且儲存後保留
- [ ] 批次六項操作皆可用；部分失敗時前端有明確提示；批次刪除有 `ConfirmDialog` 與筆數
- [ ] 遷移後舊規則依對應表歸類，「其他」進入待歸類，無資料遺失
- [ ] 6 個月未確認顯示「建議覆核」，流程圖待覆核數正確
- [ ] 廠商為選填；廠商資料管理入口可新增／編輯／刪除廠商；刪除廠商的確認文案提醒連動刪除規則
- [ ] 料卡細節頁「查看維修資訊」跳轉後，搜尋框帶入該料號並顯示對應結果
- [ ] 所有按鈕為圖示並有 `title`；下拉選單與挑選器為主題樣式，無瀏覽器原生元件外觀
- [ ] 設備組合、文件管理中的 `EquipmentQuickPick` 無迴歸；`PhotoWall`／`CardDetailDialog` 無任何異動
- [ ] `npm run build` 通過，並針對新增／修改檔案另跑繞過巢狀 eslintrc 的 lint（`No issues found`）

## 十一、待使用者確認（不阻擋規格，執行前需答覆）

1. **維修資訊頁籤的可見權限**：Step 38 規格寫「所有登入使用者可見、一般人員唯讀」，但實作現況是 `PhotoWall.tsx:767` 只有具 `manage_maintenance_info` 的人才看得到頁籤，且 `PhotoWall.tsx:1211` 的細節頁入口同理。本次規格**維持現況不動**（動它要改核心保護元件），是否需要改成人人可見？
2. 「報廢」區塊的規則之後另開規格新增。
3. 「是否檢測」第一版以標題與內容文字表達，是否之後升級為結構化旗標，視實際使用再決定。

## 十二、執行順序

`data`（SQL、三支 API、新增兩支 API）→ `frontend`（新元件、改寫 `MaintenanceInfoClient`、`EquipmentQuickPick` 選填 prop、清除舊元件）→ `tester`（含 `EquipmentQuickPick` 兩處既有呼叫端迴歸、區塊切換、批次操作）→ `reviewer`。委派 prompt 需明確要求走 CodeGraph blast radius 流程，並引用本文件第七、九節。

## 十三、執行狀態

- ⏳ 規格已寫成，待使用者確認第十一節後委派執行。尚未動工。
