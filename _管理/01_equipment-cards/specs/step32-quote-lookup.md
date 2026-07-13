# Step 32 規格：報價查詢

> 來源：2026-07-09 需求討論。使用者提供參考表單 `配件報價2023-08.pdf`（供應鏈管理組內部文件）。
> 與 Step 30（文件正規化）並行進行，互不觸碰對方的檔案。

---

## 功能描述

新增「報價查詢」功能：品名 + 標準售價 + 主管權限價（優惠價，可留空）。不使用料號（許多品項如線材、支架無正式料號），分類為自由文字，管理員可自行新增/編輯分類。純清單呈現（無縮圖），搜尋沿用 Fuse.js 模糊比對邏輯。

---

## 設計決策

| 項目 | 決策 |
|------|------|
| 料號 | 不使用，純品名 + 分類 |
| 價格 | 兩欄：標準售價（必填）+ 主管權限價（可留空） |
| 分類 | 自由文字，存於 `AppSettings.quoteCategories`，管理員可用 `SettingsPopover` 新增/編輯 |
| 呈現方式 | 純清單（分類分組 → 品名 + 售價），無圖示 |
| 入口 | 頂部第 4 個分頁「報價查詢」（沿用「任務板」加入方式），非獨立路由 |
| 可見範圍 | 整個分頁本身依角色權限決定看不看得到（非全公司開放），預設無需額外總開關 |
| 權限 | 3 個新 permission_key：`view_quotes`、`view_quotes_manager_price`、`edit_quotes` |
| 資料安全 | `quote_items` 表 RLS 全鎖，不開放 authenticated 讀寫，一律經 API + service_role，欄位層級依權限篩選（比對 Step 31 手法） |

---

## Schema 異動

SQL 存放：`_開發檔案/sql/step32-quote-items.sql`（已建立，尚未在正式 Supabase 執行）

```sql
CREATE TABLE IF NOT EXISTS quote_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category       TEXT NOT NULL,
  name           TEXT NOT NULL,
  standard_price NUMERIC NOT NULL,
  manager_price  NUMERIC,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     TEXT
);

ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
-- 不開放任何 authenticated policy，全部經 API route 用 service_role 存取

-- 預設分類（來自參考 PDF 的分類）寫入 app_settings
INSERT INTO app_settings (key, value)
VALUES ('quoteCategories', '["影像配件","溫控配件","純定位配件","數位大餅配件","環保車機配件","整新費用","其他配件"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 管理員角色預設授予 3 個新權限
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, 'view_quotes' FROM roles WHERE name = '管理員'
UNION ALL
SELECT id, 'view_quotes_manager_price' FROM roles WHERE name = '管理員'
UNION ALL
SELECT id, 'edit_quotes' FROM roles WHERE name = '管理員'
ON CONFLICT DO NOTHING;
```

**待辦（尚未執行）**：使用者需在正式 Supabase Dashboard 執行此 SQL 檔案。供應鏈/業務/業助等其他角色的權限，需管理員之後自行到「角色與權限」頁面勾選。

---

## 新增 Permission Key

| permission_key | 說明 |
|---|---|
| `view_quotes` | 看得到「報價查詢」分頁 + 標準售價 |
| `view_quotes_manager_price` | 看得到主管權限價欄位 |
| `edit_quotes` | 新增/編輯品項、分類、兩種價格 |

已加入 `src/app/api/roles/[id]/permissions/route.ts` 的 `VALID_PERMISSION_KEYS` 白名單，以及 `RolesManager.tsx` 的 `PERM_LABELS` + 新分組 `QUOTE_PERMS`（新建角色表單 + 編輯角色頁面兩處皆已加入「報價查詢」區塊）。

---

## API Routes

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| GET | `/api/quotes` | `view_quotes` | 列出全部品項；無 `view_quotes_manager_price` 時 `manager_price` 一律回 `null` |
| POST | `/api/quotes` | `edit_quotes` | 新增品項 |
| PATCH | `/api/quotes/[id]` | `edit_quotes` | 編輯品項（分類/品名/兩種價格，皆為選填局部更新） |
| DELETE | `/api/quotes/[id]` | `edit_quotes` | 刪除品項 |
| PATCH | `/api/settings`（既有路由擴充） | `edit_quotes` 或 `manage_roles` | 新增 `quoteCategories` key 可寫 |

---

## 前端異動

### 1. `src/types/equipment.ts`
- 新增 `QuoteItem` 介面
- `AppSettings` 新增 `quoteCategories: string[]`，`DEFAULT_SETTINGS` 補上預設分類

### 2. `src/lib/settings.ts` / `src/app/api/settings/route.ts`
- `getSettings()` 讀取 `quoteCategories`
- PATCH 允許 `quoteCategories` key，寫入權限查 `edit_quotes`（或 `manage_roles`）

### 3. 新建 `src/components/QuotesClient.tsx`
- 搜尋列（Fuse.js，比對品名）+ 分類篩選 chip（含 `SettingsPopover` 管理分類，僅 `edit_quotes` 顯示）
- 清單依分類分組，每列：品名 + 標準售價（+ 主管權限價，依權限顯示）+ 編輯/刪除圖示（僅 `edit_quotes`）
- 新增/編輯走自訂 Dialog；刪除走 `ConfirmDialog`（danger）

### 4. `src/components/SettingsPopover.tsx`（既有元件，非核心保護清單內）
- `settingKey` 型別新增 `'quoteCategories'`，補上對應標題文字

### 5. `src/components/RolesManager.tsx`（既有元件，非核心保護清單內）
- `PERM_LABELS` 新增 3 個 key 說明
- 新增 `QUOTE_PERMS` 分組常數
- 「新建角色」表單的區塊清單加入 `{ label: '報價查詢', keys: QUOTE_PERMS }`
- 「編輯角色」頁面新增「報價查詢」勾選區塊（追蹤板區塊之後、帳號管理區塊之前）

### 6. `src/app/page.tsx`（**核心保護元件**，本次規格允許的最小侵入）
- 新增 `getQuoteItems()`：`view_quotes` 權限成立才查詢 `quote_items`
- 依 `view_quotes_manager_price` 權限，伺服器端把 `manager_price` 欄位過濾為 `null`（防止未授權使用者從網路請求內容看到）
- 新增 `quoteItems` prop 傳入 `PhotoWall`

### 7. `src/components/PhotoWall.tsx`（**核心保護元件**，本次規格允許的最小侵入）
- 新增 `quoteItems` prop（預設 `[]`）
- `activeTab` 型別新增 `'quotes'`
- 新增 `quotesMounted` state（沿用「任務板」的首次進入才 mount、之後 CSS hide/show 保留 state 的模式）
- 頂部分頁列新增第 4 顆按鈕「報價查詢」（`Receipt` 圖示），僅 `permissions.includes('view_quotes')` 才顯示
- 搜尋列 + 篩選列 + 卡片網格的隱藏條件從 `activeTab === 'tracker'` 擴充為 `activeTab === 'tracker' || activeTab === 'quotes'`
- 新增 `QuotesClient` 渲染區塊（沿用 `TrackerClient` 的 CSS hide/show 模式）
- 未變動任何既有 state、handler、既有分頁的邏輯與版面

---

## 驗收標準

- [ ] 正式 Supabase 執行 `step32-quote-items.sql` 後，`quote_items` 表建立、RLS 已開啟且無 authenticated policy
- [ ] `view_quotes` 權限成立才看得到「報價查詢」分頁
- [ ] 無 `view_quotes_manager_price`：主管權限價欄位不顯示（且 API/SSR 回應中 `manager_price` 皆為 `null`，非僅前端隱藏）
- [ ] 無 `edit_quotes`：看不到新增/編輯/刪除按鈕與分類管理圖示
- [ ] 有 `edit_quotes`：可新增/編輯/刪除品項，可新增/編輯分類
- [ ] 搜尋列可用品名模糊比對，分類篩選正確
- [ ] 角色管理頁「新建角色」與「編輯角色」皆能勾選/儲存 3 個新權限
- [ ] 現有料卡照片牆（全部料卡/我的關注/任務板）功能與版面無迴歸
- [ ] `npm run build` 通過

---

## 執行狀態

- ✅ 程式碼已完成（主 session 直接實作，因執行環境無法呼叫本專案 `.claude/agents/` 自訂子 Agent，改由主 session 依相同規範直接執行）
- ✅ `npm run build` 通過（0 errors）
- ⏳ 待辦：使用者於正式 Supabase 執行 `step32-quote-items.sql`；上線後功能實測（含未授權情境）；未經過 `tester`/`reviewer` 子 Agent 的獨立審查
