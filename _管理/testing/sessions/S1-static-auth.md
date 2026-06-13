# S1 — 靜態審查：Auth / 權限閘道

## 前置條件

- **類型**：純靜態程式碼閱讀，不需瀏覽器
- **工具**：Read、Grep
- **帳號**：不需登入
- **時間預估**：20–30 分鐘

## 目標

驗證「誰能做什麼」的邊界在程式碼層是否正確設防：
1. 路由保護（middleware）
2. 管理員身份驗證函式（admin.ts）
3. 每條 API route 的 auth 守衛
4. Domain 白名單正確性

---

## 測試案例

### TC-1.1：Middleware 覆蓋範圍

**讀取**：`middleware.ts`

**驗證項目**：
- [ ] matcher 是否排除 `_next/static`、`_next/image`、靜態資源？
- [ ] `/login`、`/auth` 是否放行（不重導向）？
- [ ] 其他所有路由是否在無 session cookie 時重導向 `/login`？
- [ ] `/admin/*` 是否也在 middleware 中做了 **角色** 驗證？（預判：**沒有**，只檢查 cookie 存在，role 驗證在 page 層）

**預期**：middleware 只做「有無登入」守衛，admin 路由保護需確認是否在 page 層補足。

---

### TC-1.2：ALLOWED_DOMAINS 白名單正確性

**讀取**：`src/lib/admin.ts`，第 24 行附近

**驗證項目**：
- [ ] ALLOWED_DOMAINS 目前值為 `['eup.com.tw', 'eup.com.vn']`
- [ ] ⚠️ **PRE-01 驗證**：Supabase 用戶清單中有 `henry@eup.net.vn`，但 `eup.net.vn` ≠ `eup.com.vn`，這個帳號應被 isAllowedDomain() 拒絕
- [ ] 確認是否有其他非 `.tw` / `.vn` 的合法用戶被遺漏

---

### TC-1.3：requireAdmin() 邏輯鏈

**讀取**：`src/lib/admin.ts`，`requireAdmin` → `requirePermission` → `getUserRoleWithPermissions`

**驗證項目**：
- [ ] `requireAdmin()` 是否等同於 `requirePermission('manage_users')`？
- [ ] `getUserRoleWithPermissions()` 是否先驗 session、再驗 domain、再查 DB？
- [ ] DB 查詢失敗時 fallback 行為是否安全（應回傳 VIEWER_PERMISSIONS，不是 ADMIN_PERMISSIONS）？
- [ ] session 不存在時是否返回空 permissions（不是拋出例外）？

---

### TC-1.4：/api/admin/* 路由保護

**讀取**：`src/app/api/admin/users/route.ts`

**驗證項目**：
- [ ] GET、POST、PATCH、DELETE 四個方法是否全部有 `requireAdmin()` 守衛？
- [ ] 角色指派限制：`dept_admin` 只能指派同部門且 level = member/viewer 的角色？
- [ ] `super_admin` 才能指派跨部門角色？

---

### TC-1.5：/api/cards/* 路由保護

**讀取**：`src/app/api/cards/route.ts`、`src/app/api/cards/[id]/route.ts`、`src/app/api/cards/batch/route.ts`

**驗證項目**：
- [ ] POST（新增料卡）有 `requireAdmin()`？
- [ ] GET（查詢料卡）是否需要驗證？（任何登入者可查 or 需特定 permission？）
- [ ] PATCH（編輯料卡）有 `requireAdmin()`？
- [ ] DELETE（刪除料卡）有 `requireAdmin()`？
- [ ] batch（批次匯入）有 `requireAdmin()`？

---

### TC-1.6：/api/upload/* 路由保護

**讀取**：`src/app/api/upload/route.ts`、`src/app/api/upload/[id]/route.ts`

**驗證項目**：
- [ ] 上傳照片是否需要 admin 權限？
- [ ] 刪除照片是否需要 admin 權限？

---

### TC-1.7：/api/issues/* 路由保護

**讀取**：`src/app/api/issues/route.ts`、`src/app/api/issues/[id]/route.ts`、`src/app/api/issues/[id]/updates/route.ts`

**驗證項目**：
- [ ] GET 使用 `requirePermission('view_tracker')`？
- [ ] POST 使用 `requirePermission('create_issues')`？
- [ ] PATCH（編輯議題）：只有建立者 or 有特定 permission 的人可以編輯？
- [ ] DELETE（刪除議題）：權限限制是否合理？
- [ ] ⚠️ **PRE-03 驗證**：`department_id = null` 時是否回傳空陣列（管理員未設部門時看不到任何議題）？

---

### TC-1.8：/api/bookmarks、/api/groups 路由保護

**讀取**：`src/app/api/bookmarks/route.ts`、`src/app/api/groups/route.ts`

**驗證項目**：
- [ ] 書籤操作是否需要登入（任何登入者可用？）
- [ ] 群組操作是否有 `use_bookmarks` 或 `use_groups` permission 守衛？

---

### TC-1.9：/api/settings、/api/roles、/api/departments 路由保護

**讀取**：`src/app/api/settings/route.ts`、`src/app/api/roles/route.ts`、`src/app/api/departments/route.ts`

**驗證項目**：
- [ ] 設定讀取（GET）vs 修改（PATCH）的權限是否分開？
- [ ] 角色 CRUD 是否需要 admin？
- [ ] 部門 CRUD 是否需要 admin？

---

### TC-1.10：Admin 頁面的 Server-side 角色驗證

**讀取**：`src/app/admin/users/page.tsx`、`src/app/admin/roles/page.tsx`、`src/app/admin/departments/page.tsx`、`src/app/admin/settings/page.tsx`

**驗證項目**：
- [ ] ⚠️ **PRE-02 驗證**：每個 admin 頁面是否在 SSR 層做角色驗證（非 admin 自動 redirect 或 403）？
- [ ] 驗證失敗時是否 redirect 到合適位置（首頁 or 403 頁）？

---

## 完成標準

所有 TC 均通過 → 更新 `playbook.md` S1 狀態為 ✅

## Bug 回報

發現問題追加至 `bug-log.md`，格式：

```
### BUG-XXX：標題
- 發現於：Round 1 / Session S1
- TC 編號：TC-1.X
- 嚴重度：P1/P2/P3
- 描述：...
- 狀態：未修復
```
