# Step 24 規格：任務板改版與修正（10 項）

> 來源：2026-06-09 需求討論
> 前置條件：Step 23 已完成（issues.dept_group 欄位已存在，roles.dept_group / level / assignable_role_names 已存在）

---

## ⛔ 實作範圍限制

**本 Step 只做指定修正，不做其他改動。**

### 【禁止觸碰】以下檔案不得有任何修改

| 檔案 | 原因 |
|------|------|
| `src/components/CardFormDialog.tsx` | 不涉及本 Step |
| `src/components/CardDetailDialog.tsx` | 不涉及本 Step |
| `src/components/EquipmentCardItem.tsx` | 不涉及本 Step |
| `src/components/BatchImportDialog.tsx` | 不涉及本 Step |
| `src/app/page.tsx` | 不涉及本 Step |
| `src/lib/supabase-server.ts` | 不動 |
| `src/lib/supabase-browser.ts` | 不動 |
| `src/lib/utils.ts` | 不動 |

### 【允許新建】以下為本 Step 新增的檔案

| 檔案 | 說明 |
|------|------|
| `src/app/admin/departments/page.tsx` | 部門管理頁（Server Component） |
| `src/components/DepartmentsManager.tsx` | 部門管理 Client Component |
| `_開發檔案/sql/step24-dept-backfill.sql` | 補跑：回填現有 issues.dept_group |

### 【允許修改的既有檔案】

| 檔案 | 允許的修改範圍 |
|------|-------------|
| `src/app/tracker/page.tsx` | 修正 #3 #4：dept_group 篩 issues + allowedEmails 篩負責人 |
| `src/app/tracker/TrackerClient.tsx` | 修正 #5：移除欄標題顏色圓點 |
| `src/components/IssueDetailDialog.tsx` | 修正 #6：狀態 badge 跑版修正 |
| `src/components/NewIssueDialog.tsx` | 修正 #4：allowedEmails 已在 page 層篩好，元件本身不需改 |
| `src/components/RolesManager.tsx` | 修正 #8：PERM_LABELS 文字 + 部門管理入口連結 |
| `src/components/UserMenu.tsx` | 修正 #7：追蹤板→任務板 改名 |
| `src/components/PhotoWall.tsx` | 修正 #7：追蹤板→任務板 改名（僅限導航文字，不動版面） |
| `src/types/equipment.ts` | 修正 #7：追蹤板→任務板 改名 |
| `src/app/api/issues/route.ts` | 修正 #2：POST 建立時寫入 dept_group |
| `src/app/api/issues/[id]/updates/route.ts` | 修正 #7：追蹤板→任務板 改名 |
| `src/app/auth/callback/route.ts` | 修正 #9：開放 @eup.com.vn |
| `src/lib/admin.ts` | 修正 #9：domain 檢查改為陣列 |

---

## 修正項目

### #1 DB 補跑：回填 issues.dept_group

**背景**：Step 23 SQL 中的回填邏輯使用 `profiles` 表，但本專案使用 `allowed_emails`，需用正確版本補跑。

**SQL 檔案**：`_開發檔案/sql/step24-dept-backfill.sql`

```sql
-- 回填現有 issues 的 dept_group（冪等，只補 NULL 的）
UPDATE issues i
SET dept_group = r.dept_group
FROM allowed_emails ae
JOIN roles r ON r.name = ae.role
WHERE i.created_by = ae.email
  AND i.dept_group IS NULL;
```

> **執行方式**：在 Supabase Dashboard → SQL Editor 跑此 SQL，然後告知主 Agent 已完成。
> 主 Agent 確認後才進行後續 Agent 委派。

---

### #2 POST /api/issues — 新增時寫入 dept_group

**檔案**：`src/app/api/issues/route.ts`

**修改**：POST handler 中，insert issues 時同步查詢並寫入 `dept_group`：

```
1. 取 user.email → 查 allowed_emails.role → 查 roles.dept_group
2. insert issues 時加入 dept_group 欄位
```

若查不到 dept_group（角色未設定），dept_group 填 null，不阻斷建立。

---

### #3 tracker/page.tsx — 依 dept_group 篩 issues

**修改**：

```
1. 查當前使用者 dept_group：
   allowed_emails.email = userEmail → .role → roles.dept_group
2. 篩 issues：.eq('dept_group', userDeptGroup)
   若 userDeptGroup 為 null：不加篩選（保持現有行為）
```

**注意**：所有角色（含管理員）都照 dept_group 篩，沒有特殊豁免。

---

### #4 tracker/page.tsx — allowedEmails 依 assignable_role_names 篩

**修改**：

```
1. 查當前角色的 assignable_role_names（從 roles 表）
2. 若 assignable_role_names 為 null 或空陣列：allowedEmails 全部顯示（向下相容）
3. 若有值：filter allowed_emails，只保留 role 在 assignable_role_names 內的 email
```

**目標**：`allowedEmails` 傳入 `TrackerClient`（進而到 `NewIssueDialog` / `IssueDetailDialog`）時已是篩過的清單。

---

### #5 TrackerClient.tsx — 移除欄標題顏色圓點

**位置**：`COLUMNS` 定義（約第 27-32 行）與欄標題渲染區（約第 404-408 行）

**修改**：
- `COLUMNS` 移除 `dotClass` 屬性
- 欄標題中 `<span className={col.dotClass} />` 整行刪除

---

### #6 IssueDetailDialog.tsx — 狀態 badge 跑版修正

**問題**：`<select appearance-none rounded-full>` 在 Mac/Chrome 文字垂直對齊偏移。

**修改**：改為 `<button>` + `useState` 控制開關的自訂下拉選單：

```
- 點按鈕顯示選項清單（absolute 定位，z-index 高於 dialog body）
- 點選項後呼叫 handleStatusChange，關閉清單
- 樣式維持 STATUS_BADGE 色系
- 有 canChangeStatus 判斷，無編輯權仍顯示純文字 span（不動）
```

---

### #7 全局改名：追蹤板 → 任務板

**範圍**：只改 UI 顯示文字，不改 API path / DB 欄位 / permission key（`view_tracker` 維持不變）

| 檔案 | 要改的文字 |
|------|-----------|
| `src/components/UserMenu.tsx` | 導航連結文字「追蹤板」→「任務板」 |
| `src/components/PhotoWall.tsx` | 導航連結文字「追蹤板」→「任務板」（只改文字，不動版面） |
| `src/types/equipment.ts` | 若有「追蹤板」字串，改為「任務板」 |
| `src/app/api/issues/[id]/updates/route.ts` | error message 若有「追蹤板」，改為「任務板」 |
| `src/app/tracker/TrackerClient.tsx` | 頁面內任何顯示文字「追蹤板」→「任務板」 |
| `src/app/tracker/page.tsx` | 頁面 title 若有「追蹤板」→「任務板」 |

---

### #8 RolesManager.tsx — PERM_LABELS 文字修改

**位置**：`PERM_LABELS` 物件（約第 23-61 行）

**修改**：

```ts
use_bookmarks: '我的關注 (只有個人看得到內容)',
view_tracker:  '可看任務板 (只有同一部門能看到彼此任務)',
```

**額外**：在角色管理頁加入「部門管理」連結按鈕（連到 `/admin/departments`），
位置：頁面 header 旁或頁面頂部，只有有 `manage_roles` 權限者才能看（此頁面本身已受保護，連結顯示條件一致）。

---

### #9 Auth — 開放 @eup.com.vn

**檔案 1**：`src/app/auth/callback/route.ts`

```ts
// 改前
const ALLOWED_DOMAIN = '@eup.com.tw'
if (!data.user.email?.endsWith(ALLOWED_DOMAIN)) { ... }

// 改後
const ALLOWED_DOMAINS = ['@eup.com.tw', '@eup.com.vn']
if (!ALLOWED_DOMAINS.some(d => data.user.email?.endsWith(d))) { ... }
```

**檔案 2**：`src/lib/admin.ts`

```ts
// 改前
const ALLOWED_DOMAIN = '@eup.com.tw'
if (!user.email.endsWith(ALLOWED_DOMAIN)) { ... }

// 改後
const ALLOWED_DOMAINS = ['@eup.com.tw', '@eup.com.vn']
if (!ALLOWED_DOMAINS.some(d => user.email.endsWith(d))) { ... }
```

---

### #10 新頁面：/admin/departments 部門管理

**路由**：`src/app/admin/departments/page.tsx`
**元件**：`src/components/DepartmentsManager.tsx`
**權限**：`manage_roles`

**功能**：

```
顯示：
- 以 dept_group 為單位分組，列出各部門名稱與所屬角色
- 每個部門群組下顯示哪些角色屬於該群組
- 顯示角色的 level（dept_admin / member / viewer）

編輯：
- 可變更某角色的 dept_group 歸屬
  - 下拉選單選現有 dept_group 值（動態從現有角色取唯一值）
  - 或輸入新的 dept_group 名稱
- 儲存後呼叫 PATCH /api/roles/:id 更新（API route 若不存在需新建）
- is_system = true 的角色可編輯 dept_group，但不可刪除

系統角色的 dept_group 預設值（參考）：
admin      → 管理員
tech       → 技師、管理員(技師)
purchasing → 採購、管理員(採購)
supply_chain → 供應鏈、管理員(供應鏈)
engineering → 工程、管理員(工程)
sales      → 業務、管理員(業務)
```

**API 需求**：若 `PATCH /api/roles/:id` 不存在，一併在此 Step 新建。

---

## 執行順序

```
Step 1：使用者在 Supabase 執行 step24-dept-backfill.sql（非 Agent）
           ↓
Step 2：data Agent（#2 POST API + PATCH roles API）
           ↓
Step 3：frontend Agent（#3 #4 tracker/page.tsx + #5 #6 #7 #8 #9 前端修改）
           ↓
Step 4：frontend Agent（#10 /admin/departments 新頁面）
           ↓
Step 5：tester → reviewer
```

---

## 完成標準

- `npm run build` 通過
- 追蹤板 → 任務板 在 UI 全部正確顯示
- 不同 dept_group 帳號看不到彼此的任務（若有測試帳號可驗證）
- 負責人清單只顯示可指派角色的成員
- 狀態 badge 文字在 Chrome / Safari 不偏移
- @eup.com.vn 信箱可正常登入（Google OAuth 允許 domain 設定需一併確認）
