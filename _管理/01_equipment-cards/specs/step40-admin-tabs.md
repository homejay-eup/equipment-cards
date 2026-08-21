# Step 40：管理頁面收斂為首頁「系統管理」分頁

## 背景

`/admin/users`（帳號管理）、`/admin/roles`（角色管理）、`/admin/departments`（部門管理）、
`/admin/analytics`（使用統計）目前是 4 個獨立 Next.js Server Component 路由，各自有
`loading.tsx`。使用者實測回饋：這 4 頁彼此用 `<Link>` 互相導覽、回首頁時首頁也會重新查角色，
來回切換會連續卡多次整頁 Loading，無法快速確認「改權限後其他頁面會長怎樣」。

## 目標

把 4 個路由收斂成首頁單一「系統管理」分頁（比照套餐/文件管理的 mount-once 模式），分頁內用
橫向子分頁切換 4 個子項目，消除來回切換與返回首頁的整頁 Loading。

## 範圍收斂（已與使用者確認定案）

1. 首頁分頁列新增「系統管理」分頁按鈕，顯示條件：`permissions` 含 `manage_users` 或
   `manage_roles` 或 `view_analytics` 任一個
2. 分頁內橫向子分頁：帳號管理／角色管理／部門管理／使用統計，各自依原本權限 key 決定是否顯示
   子分頁按鈕（`manage_users`／`manage_roles`／`manage_roles`／`view_analytics`）
3. 子分頁的權限判斷邏輯、使用統計頁面版面 **完全沿用現況、不新增不更動**，只是資料來源從
   Server Component props 改成 client fetch
4. 首頁標題列既有「帳號管理」徽章連結（`PhotoWall.tsx:606-613`）改為切換到系統管理分頁的
   帳號管理子分頁，不再導頁至 `/admin/users`
5. 遷移完成後，`src/app/admin/{users,roles,departments,analytics}/` 整組路由（含
   `page.tsx`、`loading.tsx`）直接刪除，不保留相容路由/重導向

## CodeGraph blast radius 調查結果（已完成，執行時不需重跑）

### 權限判斷（不變，只是換讀取來源）

| 子分頁 | 現況權限 | 來源 |
|---|---|---|
| 帳號管理 | `requireAdmin()` = `requirePermission('manage_users')` | `src/lib/admin.ts:109` |
| 角色管理／部門管理 | `requirePermission('manage_roles')` | `src/app/admin/roles/page.tsx:118`、`departments/page.tsx:101` |
| 使用統計 | `requirePermission('view_analytics')` | `src/app/admin/analytics/page.tsx:12` |

`middleware.ts` 只做 session cookie 存在性檢查，沒有 `/admin/*` 專屬邏輯 → **不需修改**。

### 既有可重用 API

- **`GET /api/admin/analytics`**（`src/app/api/admin/analytics/route.ts`）已完整實作
  `requirePermission('view_analytics')` 守衛 + 回傳 `{ rows, heatmap }`，內容跟
  `AnalyticsPage` 目前 server-side 呼叫的 `getUsageAnalyticsSummary()` /
  `getUsageDailyHeatmap()` 完全一致。**但目前全專案沒有任何地方呼叫它**（Grep 確認），是現成
  可直接拿來用的端點，AnalyticsPanel 直接 fetch 這個即可，不用新建。
- **`GET /api/admin/users`**（`src/app/api/admin/users/route.ts:40-52`）已存在，但只回傳單純
  `allowed_emails` 清單，**缺少**目前 `AdminUsersPage`（`src/app/admin/users/page.tsx`）在
  server 端額外做的：① `dept_admin` 只看同部門角色的 email 範圍過濾（`fetchAllowedEmails`）
  ② Supabase Auth 登入時間 enrichment（`fetchAuthTimestamps`，分頁撈
  `auth.admin.listUsers`）③ 可指派角色清單（`getAssignableRolesData`）④
  `canSyncUsers`（`callerLevel === 'super_admin'`）。**需要擴充這個 GET handler**，補齊這 4
  項邏輯（可直接搬 `page.tsx` 現有的 3 個 helper function 進來），讓回傳的初始資料跟現在
  `UserManagementTable` 收到的 props 完全對齊。
- **角色管理／部門管理沒有現成 GET API**：`RolesManager`/`DepartmentsManager` 目前資料都是
  server page 直接查 Supabase 傳 props 進去，需要**新增**：
  - `GET /api/admin/roles`：回傳 `departments`（id/name）+ `roles`（含
    `role_permissions`、`assignable_role_names` 等，邏輯照搬
    `src/app/admin/roles/page.tsx` 的 `fetchDepartments`/`fetchRoles`）+
    `currentUserRoleName`（照搬 `getUserRoleWithPermissions()`），皆需
    `requirePermission('manage_roles')` 守衛
  - `GET /api/admin/departments`：回傳 `departments`（含 `created_at`）+
    `roles`（basic，邏輯照搬 `departments/page.tsx` 的 `fetchDepartments`/`fetchRoles`），
    同樣 `requirePermission('manage_roles')` 守衛

### 需要注意的既有邏輯（遷移時必須處理，否則會改A壞B）

- **`RolesManager.tsx:325`** `saveAll()` 存完權限後呼叫 `router.refresh()`，目的是讓
  Next.js 重新執行 `/admin/roles` 這個 Server Component 拿新 props。遷移後這個路由不存在了，
  `router.refresh()` 對嵌在首頁分頁裡的 client 元件不會有預期效果。**local state 已經用
  `setRoles(...)` 同步更新過**，所以這行大概率可以直接移除；`frontend` agent 動手前要先確認
  移除後畫面資料仍完整（沒有依賴 refresh 才會更新的欄位），再決定移除或換成重新呼叫
  `GET /api/admin/roles`。
- **`DepartmentsManager.tsx`** 已經是完全用 `fetch` + local state 管理，沒有
  `router.refresh()` 依賴，可直接沿用，不需改動內部邏輯。
- **`UserManagementTable.tsx:246,255`** 有 `<Link href="/admin/analytics">`、
  `<Link href="/admin/roles">`（頁面右上角切到其他管理子頁）；**`RolesManager.tsx:620`** 有
  `<Link href="/admin/departments">`。這 3 處要改成呼叫新的子分頁切換 callback（例如新增
  `onSwitchSubTab?: (tab: 'roles' | 'departments' | 'analytics') => void` prop），不是單純刪掉。

### 需刪除的檔案

- `src/app/admin/users/page.tsx`、`src/app/admin/users/loading.tsx`
- `src/app/admin/roles/page.tsx`、`src/app/admin/roles/loading.tsx`
- `src/app/admin/departments/page.tsx`、`src/app/admin/departments/loading.tsx`
- `src/app/admin/analytics/page.tsx`、`src/app/admin/analytics/loading.tsx`

## 【允許新建】

- `src/components/admin/SystemAdminClient.tsx`：系統管理分頁殼，管理 4 個子分頁切換狀態
  （比照 `PackagesClient.tsx` 的 `isActive` + 首次點擊才 mount 模式），依權限決定顯示哪些
  子分頁按鈕
- `src/components/admin/UserManagementPanel.tsx`：client fetch `GET /api/admin/users`
  取得初始資料（擴充後含 dept 範圍過濾/auth 時間/可指派角色/canSyncUsers），loading/error
  處理後渲染既有 `UserManagementTable`
- `src/components/admin/RolesPanel.tsx`：client fetch `GET /api/admin/roles`，渲染既有
  `RolesManager`
- `src/components/admin/DepartmentsPanel.tsx`：client fetch `GET /api/admin/departments`，
  渲染既有 `DepartmentsManager`
- `src/components/admin/AnalyticsPanel.tsx`：client fetch 既有
  `GET /api/admin/analytics`，渲染既有 `UsageHeatmap`/`CumulativeDurationChart`/
  `UsageLeaderboard`/`AnalyticsClient`（版面照搬 `AnalyticsPage` 現有 JSX 結構）
- `src/app/api/admin/roles/route.ts`（新）
- `src/app/api/admin/departments/route.ts`（新）

## 【異動】

- `src/app/api/admin/users/route.ts`：擴充 `GET` handler（補齊上述 4 項邏輯）
- `src/components/UserManagementTable.tsx`：新增 `onSwitchSubTab` prop，取代
  `/admin/analytics`／`/admin/roles` 兩個 `<Link>`
- `src/components/RolesManager.tsx`：新增 `onSwitchSubTab` prop 取代
  `/admin/departments` 的 `<Link>`；`saveAll()` 內 `router.refresh()` 視情況移除或改為
  重新 fetch
- `src/components/PhotoWall.tsx`（**核心保護元件，已事前跟使用者確認範圍**）：
  - 新增「系統管理」分頁按鈕 + `activeTab === 'admin'` 分支（比照現有 `packages`/
    `maintenance` 等分頁的 `isActive`/mount-once 寫法）
  - 標題列 `canManage` 判斷的「帳號管理」徽章連結（`607-613` 行）改為
    `onClick={() => setActiveTab('admin')}`，不再是 `<Link href="/admin/users">`

## 【禁止觸碰】

- 除上述明確列出的異動外，`PhotoWall.tsx` 其他既有邏輯、樣式、layout 一律不得更動
- `CardDetailDialog.tsx`／`CardFormDialog.tsx`／`EquipmentCardItem.tsx`／
  `BatchImportDialog.tsx`／`src/app/page.tsx` 不在本次範圍，不得修改
- `UsageHeatmap.tsx`／`CumulativeDurationChart.tsx`／`UsageLeaderboard.tsx`／
  `AnalyticsClient.tsx`／`src/lib/analytics.ts` 內部邏輯不得更動，只搬版面組裝方式

## 委派順序

`data`（擴充 `/api/admin/users` GET + 新建 `/api/admin/roles`、`/api/admin/departments`）
→ `frontend`（4 個 Panel + `SystemAdminClient` + `PhotoWall.tsx`/`UserManagementTable.tsx`/
`RolesManager.tsx` 異動 + 刪除舊路由）→ `tester` → `reviewer`

## 驗收標準

- `npm run build` 通過
- 4 個管理權限的使用者情境皆可在系統管理分頁內看到對應子分頁按鈕，功能與現況一致（帳號
  新增/移除/改角色/同步、角色權限勾選/新建/改名/刪除/拖拉排序、部門新增/改名/刪除/角色搬移、
  使用統計圖表顯示）
- 子分頁互相切換、切到其他主分頁再切回、回到「全部料卡」分頁，均不出現整頁 Loading，且資料
  不是過期快取（例如改完角色權限切到帳號管理能看到新角色選項）
- 首頁標題列「帳號管理」徽章點擊後正確切到系統管理分頁的帳號管理子分頁
- 舊 4 個路由已刪除，`/admin/*` 直接訪問應回 404（非阻塞：確認即可，不需額外處理重導向）
