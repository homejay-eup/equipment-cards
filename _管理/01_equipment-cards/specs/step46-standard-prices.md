# Step 46：標準售價頁籤（主機／設備整機銷售方案）

> 狀態：已執行完成（2026-09-23），待正式 Supabase 執行 SQL + commit + 實機測試
> 分支：`feat/step46-standard-prices`

## 背景

業務用的「產品銷售方案」內部文件（例：2025.9 DMS 168 & 土石方車機 & EDR+416 銷售方案、2025.2 公信/捷世林 JAS 16-1 數位大餅銷售方案）目前是 Word/PDF，每份文件格式不一、含多種價格（買斷三層價、0 元月租、平台費、施工費、加裝模組費）與大量條件備註。要在系統內做成好查閱的工具。

## 已確認決策

| 項目 | 決策 |
|---|---|
| 位置 | 首頁新頁籤「標準售價」，放在「人為配件報價」後面 |
| 顯示方式 | **依產品**：左側產品清單（依分類分組＋搜尋），右側該產品現行價格格子＋其他費用＋備註＋歷史版本 |
| 價格欄位 | 固定欄位＋「其他費用」自由列；空欄位不顯示 |
| 觀看權限 | **所有登入者**都可看，定價/業務價/主管價全部顯示（不分級） |
| 編輯權限 | 沿用既有 `edit_quotes`（不新增 permission key） |
| 維護方式 | 手動新增/編輯 ＋ CSV 批次匯入（兩者都要） |
| 版本 | 保留歷史版本；同一產品名稱可多版本，生效日期最新者＝現行 |
| 產品識別 | 產品名稱（完全相同＝同一產品）；匯入時對「名稱相近但不同」提示 |

### 主 session 代決（使用者同意「先做再調」）

- 分類：自由輸入＋既有分類自動提示（datalist），**不**新增 app_settings key（避免動共用的 `SettingsPopover`、`/api/settings`、`AppSettings`）
- 土石方車頭/尾車：拆成兩個產品
- 方案共通條款（如啟用日權限）：第一版寫在各產品備註，不做方案層級資料
- 原始 PDF/Word 附件：第一版不做
- 料卡連結：不做，不動 `CardDetailDialog.tsx`
- 使用統計（頁籤切換事件）：不做

## 資料表 `standard_price_items`

| 欄位 | 型別 | 說明 |
|---|---|---|
| id | UUID PK default gen_random_uuid() | |
| name | TEXT NOT NULL | 產品名稱（識別用） |
| category | TEXT NOT NULL | 分類（自由輸入） |
| plan_name | TEXT | 方案名稱（出自哪份文件） |
| effective_date | DATE NOT NULL | 生效日期（版本） |
| buyout_list_price | NUMERIC | 買斷定價 |
| buyout_sales_price | NUMERIC | 買斷業務價 |
| buyout_manager_price | NUMERIC | 買斷主管價 |
| warranty | TEXT | 保固（例：三年） |
| rent_monthly | NUMERIC | 0 元月租方案月租（元/月） |
| rent_contract | TEXT | 合約期（例：三年約，續租續保） |
| platform_fee_buyout | NUMERIC | 平台費（買斷，元/月） |
| platform_fee_rent | NUMERIC | 平台費（租賃，元/月） |
| install_fee | NUMERIC | 施工費（元/台） |
| extra_fees | JSONB NOT NULL default '[]' | `[{ name: string, amount: number \| null, unit: string }]` |
| notes | TEXT | 備註文字 |
| notes_image_urls | JSONB NOT NULL default '[]' | 比照 Step 45，`[{public_id,url}]` |
| notes_table_data | JSONB | 比照 Step 45，`{rows: string[][], hasHeader: boolean}` |
| points_buyout | NUMERIC | 買斷業績積分（分/台） |
| points_rent | NUMERIC | 租賃業績積分（分/台） |
| created_at / updated_at | TIMESTAMPTZ NOT NULL default now() | |
| updated_by | TEXT | email |

- `UNIQUE (name, effective_date)`；`INDEX (name)`
- RLS：ENABLE，不開任何 policy（比照 `quote_items`，一律經 API 用 service_role 讀寫）
- 「現行」不存欄位，由程式計算：同 name 中 effective_date 最大者

## API

| 路由 | 方法 | 權限 | 說明 |
|---|---|---|---|
| `/api/standard-prices` | GET | 登入即可 | 全部版本，依 category, name, effective_date desc |
| `/api/standard-prices` | POST | `edit_quotes` | 新增一筆（新產品或新版本）；(name, effective_date) 重複回 409 |
| `/api/standard-prices/[id]` | PATCH | `edit_quotes` | 修改該版本；改 name/effective_date 撞到既有回 409 |
| `/api/standard-prices/[id]` | DELETE | `edit_quotes` | 刪除該版本，並清除 Cloudinary 備註圖片 |
| `/api/standard-prices/import` | POST | `edit_quotes` | 批次匯入，依 (name, effective_date) upsert；覆蓋時只更新 CSV 有的欄位，**保留**既有 notes_image_urls/notes_table_data |
| `/api/standard-prices/notes-signature` | POST | `edit_quotes` | 備註貼圖 Cloudinary 簽名，folder `equipment-cards/standard-prices` |

- 備註三欄位驗證用 `validateRichContent()`（`src/lib/richContentValidation.ts`，不修改）
- 數字欄位：空字串/null → null；非數字 → 400；不可為負
- extra_fees：陣列上限 20，name 必填且 ≤ 50 字，unit ≤ 20 字

## CSV 匯入格式（UTF-8 BOM）

欄位標頭（中文）：
`產品名稱,分類,方案名稱,生效日期,買斷定價,業務價,主管價,保固,月租,合約期,平台費(買斷),平台費(租賃),施工費,其他費用,買斷積分,租賃積分,備註`

- 生效日期：`YYYY-MM-DD` 或 `YYYY/MM/DD`
- 其他費用：`名稱=金額/單位`，多筆用中文頓號「、」分隔（相容 `|`），例 `加裝4G模組=4500/台、校驗=500/次`；金額可省略（`名稱=/單位` 或 `名稱`）
- 預覽階段（前端）每列標示：新增產品／新版本／覆蓋同一版／錯誤；名稱正規化（去空白、轉小寫、全形轉半形）後相同但原字串不同 → 警示「名稱相近：○○」
- 有錯誤列時可選擇只匯入正確列

## 前端

- `PhotoWall.tsx`：新增 `'prices'` 分頁（首次進入才 mount、之後 CSS hide/show，比照 quotes），按鈕放在「人為配件報價」後、「我的關注」前，**所有人可見**；新 prop `standardPrices?: StandardPriceItem[]` 預設 `[]`
- `page.tsx`：新增 `getStandardPrices()`，併入既有 `Promise.all` 平行抓取
- 新元件 `src/components/standard-prices/`：
  - `StandardPricesClient.tsx`：主元件（狀態、搜尋、選取）
  - `ProductList.tsx`：左側分類分組清單（只列現行版本，每產品一列）
  - `ProductDetail.tsx`：右側價格格子、其他費用、備註（`RichContentView`）、方案名稱、生效日期、歷史版本切換
  - `PriceFormDialog.tsx`：新增/編輯（編輯模式兩個按鈕：「儲存修改」「另存為新版本」）
  - `PriceImportDialog.tsx`：CSV 範本下載＋上傳＋預覽＋匯入
- 搜尋：產品名稱/分類/方案名稱 精確 `includes`（不區分大小寫），不用 Fuse
- 手機版：清單與詳情上下堆疊，點產品後詳情顯示於清單上方並提供「返回清單」
- 價格顯示：千分位、`元`／`元/月`；空欄位不顯示；整個區塊都空就不顯示該區塊

## 檔案範圍

【允許修改（核心保護元件，使用者已同意）】
- `src/app/page.tsx`：只新增 fetch 函式與傳 prop
- `src/components/PhotoWall.tsx`：只新增分頁（型別、mounted state、按鈕、內容區、隱藏條件、prop）

【允許新建】
- `_開發檔案/sql/step46-standard-prices.sql`
- `src/types/standardPrice.ts`
- `src/lib/standardPriceValidation.ts`（API 共用驗證/正規化）
- `src/app/api/standard-prices/route.ts`
- `src/app/api/standard-prices/[id]/route.ts`
- `src/app/api/standard-prices/import/route.ts`
- `src/app/api/standard-prices/notes-signature/route.ts`
- `src/lib/standardPriceFormat.ts`（client 可用的純函式，執行時新增）
- `src/components/standard-prices/*.ts`（priceForm / priceCsv / standardPriceUtils，執行時新增）
- `src/components/standard-prices/*.tsx`

【禁止觸碰】
- 其他所有既有檔案，特別是：`QuotesClient.tsx`、`/api/quotes/*`、`SettingsPopover.tsx`、`/api/settings`、`src/lib/settings.ts`、`src/types/equipment.ts`、`RichContentEditor`/`RichContentView`/`RichTable`、`src/lib/richContentValidation.ts`、`CardDetailDialog.tsx`、`CardFormDialog.tsx`、`BatchImportDialog.tsx`、`RolesManager.tsx`、`AnalyticsClient.tsx`

## 待使用者手動執行

1. 正式 Supabase 執行 `_開發檔案/sql/step46-standard-prices.sql`
2. 實機測試

## 範圍外發現（不處理）

- `/api/settings` PATCH 的 `canManageSettings` 漏了 `edit_quotes`，只有 `edit_quotes` 的角色存「報價分類」會 403（已另開獨立任務提示）
