# S7 — 瀏覽器測試：Admin 後台頁面

## 前置條件

- **類型**：瀏覽器操控
- **工具**：Claude in Chrome（繼承已登入 session）
- **帳號**：管理員（homejay@eup.com.tw）
- **起始頁面**：https://equipment-cards.vercel.app/admin/users
- **時間預估**：25–30 分鐘

## 注意

- 角色指派操作使用測試帳號（`test-viewer@test.com`）
- 不修改真實使用者的角色

---

## 測試案例

### TC-7.1：帳號管理頁面載入

- 步驟：導航至 `/admin/users`
- 驗證：
  - [ ] 頁面正常載入，顯示用戶清單
  - [ ] 清單包含已知的真實用戶

---

### TC-7.2：新增使用者

- 步驟：
  1. 點「新增使用者」
  2. 輸入 `test-viewer@test.com`，角色選「一般使用者」
  3. 儲存
- 驗證：
  - [ ] 清單即時顯示新用戶
  - [ ] Email 格式錯誤時顯示錯誤提示
  - [ ] 重複 email 時顯示「已加入」錯誤

---

### TC-7.3：修改角色

- 步驟：找到 test-viewer@test.com，修改角色為其他角色
- 驗證：
  - [ ] 角色即時更新
  - [ ] 下拉選單只顯示可指派的角色（依當前管理員的 level 限制）

---

### TC-7.4：移除使用者

- 步驟：移除 test-viewer@test.com
- 驗證：
  - [ ] 出現 ConfirmDialog
  - [ ] 確認後用戶從清單消失
  - [ ] 取消後用戶仍存在

---

### TC-7.5：非 admin 路由保護（PRE-02 驗證）

- 步驟：確認 admin 頁面的 server-side 角色驗證（讀頁面程式碼，或用 viewer 帳號嘗試存取）
- 驗證：
  - [ ] `/admin/users` 對 viewer 是否 redirect 或顯示 403？
  - [ ] `/admin/roles` 對 viewer 是否保護？
  - [ ] `/admin/departments` 對 viewer 是否保護？

---

### TC-7.6：角色群組管理頁面

- 步驟：導航至 `/admin/roles`
- 驗證：
  - [ ] 頁面正常載入，顯示現有角色清單
  - [ ] 角色的 level（super_admin / dept_admin / member / viewer）是否正確顯示
  - [ ] 新增角色功能是否正常（用測試角色名稱，事後刪除）
  - [ ] 刪除角色是否有 ConfirmDialog

---

### TC-7.7：部門管理頁面

- 步驟：導航至 `/admin/departments`
- 驗證：
  - [ ] 頁面正常載入，顯示現有部門
  - [ ] 新增部門（用「TEST-部門」，事後刪除）
  - [ ] 刪除部門是否有 ConfirmDialog

---

### TC-7.8：系統設定頁面

- 步驟：導航至 `/admin/settings`
- 驗證：
  - [ ] 頁面正常載入
  - [ ] 修改設定後儲存，重整頁面確認持久

---

### TC-7.9：SettingsPopover（首頁右上角）

- 步驟：回到首頁，找 SettingsPopover 入口（管理員可見）
- 驗證：
  - [ ] Popover 正常開啟
  - [ ] 修改設定後即時生效（或說明何時生效）

---

### TC-7.10：帳號管理邊界條件

- 步驟：嘗試刪除自己的帳號（homejay@eup.com.tw）
- 驗證：
  - [ ] 是否有保護機制（禁止自我刪除 or 警告）？
  - [ ] 若無保護，記錄為 Bug

---

## 完成標準

所有 TC 均通過 → 更新 `playbook.md` S7 狀態為 ✅

## 清理

刪除測試用角色「TEST-部門」及「TEST 角色」
