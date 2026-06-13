# S8 — 瀏覽器測試：權限 UI 可見性與功能限制

## 前置條件

- **類型**：瀏覽器操控（需兩個帳號交叉比對）
- **工具**：Claude in Chrome（管理員）+ incognito 視窗（viewer）
- **帳號 A（管理員）**：homejay@eup.com.tw — 正常 Chrome 視窗
- **帳號 B（Viewer）**：test-viewer@test.com — incognito 視窗
- **時間預估**：30–40 分鐘

## Viewer 帳號建立 SOP（一次性，若尚未建立）

1. Supabase Dashboard → Authentication → Users → Add user → **Create new user**
2. Email: `test-viewer@test.com`，Password: 自訂並記錄
3. 網站 `/admin/users` → 新增此 email，角色指派為「一般使用者」（viewer）
4. incognito 視窗導航至 `https://equipment-cards.vercel.app/login`
5. 因 app 只顯示 Google 登入，需透過 Supabase Auth API 直接登入：
   - 或在 Supabase Dashboard → Users → 找到該用戶 → Send magic link，取得登入連結

## 測試矩陣說明

每個 TC 要對 **兩個帳號** 都驗證：
- 管理員看到 ✅ / Viewer 看不到 → 正確
- 管理員看到 ✅ / Viewer 也看到 → **Bug（UI 未隱藏）**
- 管理員 API 成功 / Viewer API 被擋（403）→ 正確
- 管理員 API 成功 / Viewer API 也成功 → **Bug（後端未守衛）**

---

## 首頁（PhotoWall）

### TC-8.1：新增料卡按鈕可見性

| 驗證項目 | 管理員 | Viewer | 預期 |
|---------|--------|--------|------|
| 「新增料卡」按鈕是否可見 | ✅ 應可見 | ❌ 應隱藏 | — |
| 「批次匯入」按鈕是否可見 | ✅ 應可見 | ❌ 應隱藏 | — |
| SettingsPopover 入口是否可見 | ✅ 應可見 | ❌ 應隱藏（或唯讀）| — |

---

### TC-8.2：API 層的新增料卡限制

- 步驟：Viewer 登入後，直接呼叫 `POST /api/cards`（可透過 browser console fetch）
- 驗證：
  - [ ] API 回傳 403 Forbidden（後端守衛有效）

---

## Lightbox（CardDetailDialog）

### TC-8.3：Lightbox 內的編輯按鈕

| 驗證項目 | 管理員 | Viewer | 預期 |
|---------|--------|--------|------|
| 「編輯」按鈕是否可見 | ✅ 應可見 | ❌ 應隱藏 | — |
| 「刪除」按鈕是否可見 | ✅ 應可見 | ❌ 應隱藏 | — |

---

### TC-8.4：書籤功能（Viewer 也應可用）

| 驗證項目 | 管理員 | Viewer | 預期 |
|---------|--------|--------|------|
| 書籤按鈕是否可見 | ✅ | ✅ 應可見 | 書籤是所有人的功能 |
| 加入書籤操作是否成功 | ✅ | ✅ | — |

---

## Admin 路由保護

### TC-8.5：/admin/users 路由

| 驗證項目 | 管理員 | Viewer | 預期 |
|---------|--------|--------|------|
| 導航至 `/admin/users` | ✅ 正常載入 | ❌ 應 redirect 或 403 | — |
| 若 Viewer 可進入，頁面操作按鈕是否隱藏 | — | ❌ 應完全無法進入 | — |

---

### TC-8.6：/admin/roles、/admin/departments、/admin/settings

| 驗證項目 | 管理員 | Viewer | 預期 |
|---------|--------|--------|------|
| `/admin/roles` | ✅ 正常 | ❌ redirect | — |
| `/admin/departments` | ✅ 正常 | ❌ redirect | — |
| `/admin/settings` | ✅ 正常 | ❌ redirect | — |

---

### TC-8.7：Admin API 的後端守衛

- 步驟：Viewer 帳號直接呼叫以下 API（browser console）：
  - `GET /api/admin/users`
  - `PATCH /api/admin/users`（嘗試修改角色）
  - `DELETE /api/admin/users`（嘗試刪除用戶）
- 驗證：
  - [ ] 全部回傳 403 Forbidden

---

## Tracker 頁面

### TC-8.8：Tracker 功能可見性

| 驗證項目 | 管理員 | Viewer | 預期 |
|---------|--------|--------|------|
| 「新增議題」按鈕可見 | 依 permission 設定 | 依 permission 設定 | 需確認 viewer role 是否有 `create_issues` 權限 |
| 議題清單顯示（需有部門設定）| 有部門才顯示 | 有部門才顯示 | — |
| 「刪除議題」按鈕（非建立者）| 依 permission | 依 permission | — |

---

### TC-8.9：Tracker API 層限制

- 步驟：Viewer 帳號嘗試以下操作（browser console）：
  - `POST /api/issues`（Viewer 若無 `create_issues` 權限）
  - `DELETE /api/issues/[id]`（非自己建立的）
- 驗證：
  - [ ] 無權限者回傳 403

---

## 帳號管理（Admin Panel 內）

### TC-8.10：自我保護

| 驗證項目 | 預期 |
|---------|------|
| 管理員嘗試刪除自己 | ⚠️ 應有警告或禁止（若無，記為 Bug） |
| 管理員嘗試降低自己的角色 | ⚠️ 應有警告或禁止 |
| dept_admin 嘗試指派 super_admin 角色 | ❌ 應被 API 拒絕（403）|

---

## 隱藏但可直接存取（Security through obscurity 風險）

### TC-8.11：Viewer 直接 URL 存取

- 步驟：Viewer 登入後直接輸入以下 URL：
  - `https://equipment-cards.vercel.app/admin/users`
  - `https://equipment-cards.vercel.app/admin/roles`
- 驗證：
  - [ ] 每個 URL 是否 redirect 到首頁 or 顯示 403？
  - [ ] 不能因為「按鈕看不到」就認為安全，URL 直接存取也要防

---

## 完成標準

所有 TC 均通過 → 更新 `playbook.md` S8 狀態為 ✅

若 Viewer 帳號未建立導致部分 TC 無法執行 → 標記 ⏭️（skip）並記錄原因
