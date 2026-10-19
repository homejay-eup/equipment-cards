# Step 50 規格：維修資訊規則「內容貼圖貼表格」與規則列閱讀性優化

> 來源：2026-10-19 使用者上線 Step 49 後的實測回饋（逐項收集、對焦）。
> 互動預覽：規則列新版型與回廠特殊情境範例已在對話中以預覽確認（標題獨立一行、內文收合 3 行、標籤分組、搜尋命中標籤反色）。
> 接續 Step 49（`step49-maintenance-flow-redesign.md`），資料表與權限沿用，不新增權限 key。

---

## 一、需求清單與已定案決策

| # | 需求 | 決策 |
|---|---|---|
| 1 | 規則「內容」支援貼圖與貼表格 | 完全重用任務板／料卡備註／標準售價備註已有的複合內容機制：`RichContentEditor`、`RichTable`、`LinkifiedText`、`UpdateImageLightbox`、`useUpdateAttachmentUpload`、`validateRichContent`（**皆不修改**）。內容**可以只有圖片或表格、沒有文字**（文字／圖片／表格至少一項） |
| 2 | 批次「改共用欄位」只列適用欄位 | 前端：依勾選規則判斷——全是「送修」→ 只列保固期間；全是「檢測／年限判斷」→ 列年限與年限起算依據；其他（回廠、報廢、檢測／是否檢測、待歸類，或混選）→ 沒有適用欄位，工具列「改共用欄位」圖示停用並以 `title` 說明原因。後端：`set_fields` 對不適用的規則**拒絕並列入 `failed`**（原因「此規則不適用該欄位」），不得靜默寫入 |
| 3 | 規則列標題與內文易讀 | 標題獨立一行（14px、medium），右側為狀態標籤與操作圖示；內文放標題下方（13px、行距 1.75、色 `#4a3422`、保留換行、網址自動轉連結）；**預設收合 3 行**，超過才顯示「展開全文」；料號標籤與屬性標籤分兩組（中間細分隔線）；最後確認時間降到最底、最小最淡 |
| 4 | 年限判斷規則不顯示保固期間 | 規則列依區塊決定顯示哪些屬性標籤：保固期間與「適用進貨日」只在 `送修`；年限與起算依據只在 `檢測／年限判斷`；廠商標籤只在 `送修`（其他區塊若資料殘留也不顯示）。資料不動，只改顯示 |
| 5 | 搜尋命中的標籤反色 | 搜尋時，命中的料號標籤（料號或品名命中）**一定顯示**並排最前、棕底白字反色；其餘補到最多 2 個，剩餘收成「+N」；廠商名稱命中時廠商標籤同樣反色 |
| 6 | 搜尋納入標題與內文 | 搜尋比對範圍擴大為：料號＋品名、廠商名稱、**標題、內文文字、表格儲存格文字**（一律 `includes`，不走模糊）。命中標題或內文的文字以淡黃底標示；若命中只在被收合的內文（超出 3 行）或表格，該列**預設展開**，使用者才看得到命中處 |

## 二、資料庫異動（`_開發檔案/sql/step50-maintenance-rule-rich-content.sql`）

`maintenance_rules` 新增：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `content_image_urls` | `JSONB NOT NULL DEFAULT '[]'::jsonb` | 圖片清單 `[{public_id, url}]` |
| `content_table_data` | `JSONB` | 表格 `{rows: string[][], hasHeader: boolean}`，無表格為 NULL |

- `content` 維持 `TEXT NOT NULL`，補 `SET DEFAULT ''`；內容只有圖片或表格時 API 寫入空字串 `''`。
- 可重複執行（`ADD COLUMN IF NOT EXISTS`）。**部署順序：先 SQL、後程式碼**。

## 三、API 異動

| 路由 | 異動 |
|---|---|
| `POST /api/maintenance/rules/content-signature`（新） | Cloudinary 簽名端點，比照 `/api/standard-prices/notes-signature`：不綁規則 id（新增當下沒有 id）；權限 `manage_maintenance_info`；folder 固定 `equipment-cards/maintenance-rules`；public_id 帶時間戳＋隨機字串 |
| `GET /api/maintenance/rules` | select 與 `formatRule` 補 `content_image_urls`、`content_table_data`（缺欄位時前端 `normalizeRule` 已有防禦，API 本身不需特別處理） |
| `POST /api/maintenance/rules` | 內容改用 `validateRichContent({content, image_urls: body.content_image_urls, table_data: body.content_table_data}, { requireNonEmpty: true, emptyErrorMessage: '內容為必填（文字／圖片／表格至少一項）' })`；不再單獨要求 `content` 非空；寫入 `content`（無文字存 `''`）、`content_image_urls`、`content_table_data` |
| `PATCH /api/maintenance/rules/[id]` | 三個內容欄位**任一有送到就整批驗證**（比照 `PATCH /api/cards/[id]` 的作法，避免只改文字時把既有圖片清空）；驗證同 POST；圖片被移除時 best-effort 清 Cloudinary（見下） |
| `DELETE /api/maintenance/rules/[id]` | 刪除成功後 best-effort 清除該規則的 Cloudinary 圖片 |
| `POST /api/maintenance/rules/batch` | `delete`：刪除成功的規則，best-effort 清除其圖片；`set_fields`：對不適用的規則拒絕並列入 `failed`（見上）。select 補 `content_image_urls` |
| `GET /api/maintenance/rules/by-equipment` | 不改（`CardDetailDialog` 只取筆數） |
| `GET /api/maintenance/vendors`、`options`、`rules/[id]/confirm`、`rules/[id]/link` | 不改 |

**Cloudinary 清除規則**（共用工具函式，放 `src/lib/maintenanceCloudinary.ts`，僅限 server 端 import）：
- 只清本功能 folder（`equipment-cards/maintenance-rules/`）底下的圖片：`public_id` 由前端送來，不加前綴檢查會讓有權限者藉由「寫入再移除」刪掉其他功能的圖片（標準售價 `destroyUnreferencedImages` 同樣有這道限制）。
- best effort：清除失敗不擋住主要操作，回傳警告字串由前端顯示（`warning` 欄位）。規則之間不共用圖片（本功能沒有「複製規則」），因此不需要查詢其他規則引用。
- 必須在資料庫寫入完成之後才清除。

## 四、前端異動（`src/components/maintenance/`）

### 新建
- `RuleContent.tsx`：規則內容顯示元件。收合時文字 3 行 clamp（用 ref 量測是否溢出決定要不要顯示「展開全文」）、圖片縮圖列（點擊走 `UpdateImageLightbox`）、表格預設隱藏並顯示「含表格 N 列」提示，展開後顯示全部文字、所有圖片與完整表格。文字用 `LinkifiedText`、表格用 `RichTable`（兩者不修改）。支援搜尋關鍵字標示（`<mark>`，淡黃底）；網址連結內不拆分，若命中落在連結內則該段不標示（可接受）。

### 修改
- `RuleEditPanel.tsx`：「內容」換成 `RichContentEditor`；圖片上傳用 `useUpdateAttachmentUpload('/api/maintenance/rules/content-signature')`；`RuleDraft` 新增 `content_image_urls`、`content_table_data`；儲存前驗證「標題必填、文字／圖片／表格至少一項」、有圖片仍在上傳時擋下（比照 `PriceFormDialog.tsx`：`images.some(p => p.uploading)`）。
- `RuleRow.tsx`：改為新版型（標題獨立一行＋狀態標籤＋操作圖示在標題列右側、`RuleContent`、標籤兩組、最後確認時間在最底）；依區塊決定屬性標籤顯示（需求 4）；接收搜尋關鍵字，命中標籤反色與排序（需求 5）、文字標示（需求 6）。
- `RuleListPanel.tsx`：把搜尋關鍵字、`onImageClick` 往下傳；批次工具列「改共用欄位」依勾選規則可用性停用（需求 2）。
- `BatchPanel.tsx`：「改共用欄位」只列適用欄位（需求 2）。
- `MaintenanceInfoClient.tsx`：`normalizeRule` 補 `content_image_urls ?? []`、`content_table_data ?? null`；`ruleMatches` 擴充搜尋範圍（需求 6）並計算「命中是否只在被收合的內文或表格」供預設展開；`handleSaveRule` 送出三個內容欄位；放大檢視 state（`UpdateImageLightbox`，比照 `ProductDetail.tsx`）；API 回 `warning` 時顯示。
- `src/types/maintenance.ts`：`MaintenanceRule` 新增 `content_image_urls`、`content_table_data`。
- `src/lib/maintenanceFormat.ts`：可新增共用小工具（例如表格文字攤平供搜尋用）。

## 五、影響範圍（CodeGraph＋Grep 交叉驗證）

| 對象 | 實際使用點 | 處置 |
|---|---|---|
| `MaintenanceRule`（型別） | `types/maintenance.ts`、`RuleRow`、`RuleEditPanel`、`RuleListPanel`、`MaintenanceInfoClient`（Grep 5 檔，全在 `maintenance/` 內） | 新增欄位，4 個元件皆在本次修改範圍 |
| `rule.content`／`content` 欄位（API） | `rules/route.ts`（select、formatRule、POST）、`rules/[id]/route.ts`（PATCH）、`rules/by-equipment/route.ts`（僅回傳） | 前兩者需改；`by-equipment` 只讀 `content` 不需改 |
| `RichContentEditor`、`RichContentView`、`RichTable` | 任務板三個 Dialog、`CardFormDialog`、`CardDetailDialog`、標準售價 `PriceFormDialog`／`ProductDetail` | **不修改**，只 import 使用 |
| `LinkifiedText` | 僅 `RichContentView.tsx` 與自身 | 不修改，`RuleContent` 新增一處 import |
| `UpdateImageLightbox` | 標準售價 `ProductDetail`、任務板、`CardDetailDialog` | 不修改，新增一處使用 |
| `useUpdateAttachmentUpload` | 10 個呼叫端 | 不修改，新增一處使用 |
| `validateRichContent` | cards、issues、standard-prices 多支 API | 不修改，新增兩處呼叫（rules POST／PATCH） |
| `set_fields`（batch API） | 呼叫端僅 `BatchPanel`（經 `MaintenanceInfoClient.callBatch`） | 後端補適用性檢查、前端同步 |
| `CardDetailDialog`／`PhotoWall`（核心保護元件） | 只用 `by-equipment` 取筆數、`MaintenanceInfoClient` Props 不變 | **不改** |

## 六、【允許新建】

- `_開發檔案/sql/step50-maintenance-rule-rich-content.sql`
- `src/app/api/maintenance/rules/content-signature/route.ts`
- `src/lib/maintenanceCloudinary.ts`
- `src/components/maintenance/RuleContent.tsx`

## 七、【禁止觸碰】

- 核心保護元件：`PhotoWall.tsx`、`CardDetailDialog.tsx`、`CardFormDialog.tsx`、`EquipmentCardItem.tsx`、`BatchImportDialog.tsx`、`src/app/page.tsx`
- 既有複合內容共用元件與工具：`components/tracker/*`（`RichContentEditor`、`RichContentView`、`RichTable`、`LinkifiedText`、`richContentTypes`、`richContentUtils`）、`UpdateImageLightbox.tsx`、`hooks/useUpdateAttachmentUpload.ts`、`lib/richContentValidation.ts`
- `SettingsPopover.tsx`、`src/app/api/settings/route.ts`、`src/types/equipment.ts`、`RolesManager.tsx`、`src/app/api/roles/**`
- `rules/by-equipment`、`rules/[id]/confirm`、`rules/[id]/link`、`vendors/**`、`options/**` 等未列出的 API
- 若必須動到以上任一項，停下回報。

## 八、驗收標準

- [ ] 編輯面板內容可貼圖（Ctrl+V 截圖）、貼 Excel 表格；圖片上傳中擋住儲存；可只有圖片或只有表格就儲存；三者皆空時擋下並提示
- [ ] 規則列顯示文字、縮圖（點擊放大並可左右切換）、表格；表格預設收合、展開後完整顯示
- [ ] 內文超過 3 行才出現「展開全文」，展開／收合正常；保留換行與網址連結
- [ ] 規則列新版型：標題獨立一行、狀態標籤與操作圖示在標題列右側、標籤分兩組、最後確認時間在最底；手機寬度無橫向捲動
- [ ] 檢測區塊規則不顯示保固標籤；送修規則才顯示保固期間、適用進貨日、廠商
- [ ] 搜尋料號或品名時，命中標籤反色、一定顯示且排最前；搜尋廠商名稱時廠商標籤反色
- [ ] 搜尋標題、內文、表格文字皆能命中；命中文字標黃；命中只在被收合內文或表格時該列預設展開
- [ ] 批次「改共用欄位」依勾選規則只列適用欄位；沒有適用欄位時圖示停用並有說明；後端對不適用規則回報 `failed`
- [ ] 刪除規則（單筆、批次）與編輯時移除圖片，Cloudinary 圖片被清除（限本功能 folder）；清除失敗有警告提示但不擋住主要操作
- [ ] SQL 未執行時 `GET /api/maintenance/rules` 會回 500（select 已含新欄位），須先執行 SQL 再部署程式碼
- [ ] 回廠特殊情境範例資料（10 筆、含長內文與兩筆掛料號）顯示效果與預覽一致
- [ ] `npm run build` 通過，並針對新增／修改檔案另跑繞過巢狀 eslintrc 的 lint（`No issues found`）

## 九、執行順序

`data`（SQL、content-signature、rules POST／PATCH／DELETE、batch、Cloudinary 工具）→ `frontend`（`RuleContent`、`RuleRow`、`RuleEditPanel`、`RuleListPanel`、`BatchPanel`、`MaintenanceInfoClient`）→ `tester` → `reviewer`。委派 prompt 明確要求走 CodeGraph blast radius 流程，並引用本文件第五、七節。

## 十、執行狀態

- ⏳ 規格已寫成，待委派。使用者已確認：長內文預設收合 3 行、搜尋納入標題與內文、內容可只有圖片或表格、批次欄位只列適用欄位。
