# Bug Log — 設備料卡管理系統

> 格式：每個 Bug 一個區塊。嚴重度：P1（阻斷流程）/ P2（功能缺陷）/ P3（體驗問題）

---

## 範本

```
### BUG-XXX：標題

- **發現於**：Round X / Session S?
- **TC 編號**：TC-X.X
- **嚴重度**：P1 / P2 / P3
- **重現步驟**：
  1. 步驟一
  2. 步驟二
- **預期結果**：
- **實際結果**：
- **截圖**：（路徑或無）
- **狀態**：未修復 / 已修復（StepXX）
```

---

## Round 1（2026-06-13）

---

### BUG-001：/api/upload 照片上傳與刪除僅驗證登入，未驗證 CRUD 權限

- **發現於**：Round 1 / Session S1
- **TC 編號**：TC-1.6
- **嚴重度**：P1
- **位置**：`src/app/api/upload/route.ts`、`src/app/api/upload/[id]/route.ts`
- **描述**：
  三個 handler（POST 取得簽名、PATCH 寫入 URL、DELETE 刪除照片）全部只用本地 `requireAuth()`（僅檢查登入）。
  設計意圖應為「有 `create_delete_cards` 權限才可操作」，但現在 viewer 也能通過。
  修法：將三個 handler 的守衛改為 `requirePermission('create_delete_cards')`，
  使有 CRUD 權限的非管理員角色可用，無權限的 viewer 被擋住。
- **預期結果**：需有 `create_delete_cards` 權限才能上傳/刪除照片
- **實際結果**：任何登入者（含 viewer）均可操作
- **狀態**：未修復

---

### ~~BUG-002~~：DELETE /api/issues/[id] 的 crud_cards check（已確認為設計正確）

- **結論**：需求為「只有建立者能刪自己的議題」，非建立者不應能刪。
  `requirePermission('crud_cards')` 若 DB 未定義此 key，永遠回傳 null，等同於只有建立者能刪，行為正確。
  `hasCrudCards` 判斷是死代碼（dead condition），可日後清理，但不影響功能。
- **狀態**：關閉（非 Bug，為 tech debt）

---

### BUG-003：新增/編輯任務 Dialog 必填欄位無錯誤提示

- **發現於**：Round 1 / Session S6
- **TC 編號**：TC-6.3
- **嚴重度**：P3
- **位置**：`src/components/`（NewIssueDialog 或 TaskFormDialog）
- **重現步驟**：
  1. 開啟「新增任務」Dialog
  2. 不填標題、不選類型，直接點「新增」
- **預期結果**：顯示「標題為必填」/ 「類型為必填」錯誤提示
- **實際結果**：Dialog 停留（未關閉，阻止提交正確），但無任何錯誤提示文字，使用者不知道哪個欄位有問題
- **截圖**：無
- **狀態**：已修復（0d4f217）— 移除 submit button 的 `!title.trim() || !type` disabled 條件，handleSubmit 的 setError 現可正常觸發顯示錯誤訊息；NewIssueDialog + EditIssueDialog 均已修復

---

### BUG-004：新增/編輯任務 Dialog 負責人清單顯示全部使用者，未依部門過濾

- **發現於**：Round 1 / Session S6
- **TC 編號**：TC-6.2（觀察）
- **嚴重度**：P2
- **位置**：`src/components/`（TaskFormDialog 負責人搜尋清單）
- **重現步驟**：
  1. 開啟「新增任務」或「編輯任務」Dialog
  2. 查看「負責人」清單
- **預期結果**：只顯示與目前使用者同部門（同群組）的成員
- **實際結果**：顯示所有使用者（homejay、lala、candy、alley、jenny、livia、gino、faye 等），無部門過濾
- **截圖**：無
- **狀態**：已修復（0d4f217）— tracker/page.tsx 第三批查詢新增 `roles.name WHERE department_id = userDepartmentId`，`assignableRoleNames` 為 null 時以部門角色名單作 fallback 過濾 allowedEmails

---

### BUG-005：/admin/settings 頁面仍存在，重複 SettingsPopover 功能

- **發現於**：Round 1 / Session S7（S8 補確認）
- **TC 編號**：TC-7.8
- **嚴重度**：P3
- **位置**：`src/app/admin/settings/page.tsx`、`src/components/OptionsEditor.tsx`
- **描述**：
  `/admin/settings` 頁面使用舊式 `OptionsEditor` 元件（藍灰色 UI），提供與 CardFormDialog 內 `SettingsPopover` 相同的功能（分類、狀態管理）。
  S7 session 記錄為「已修復：刪除頁面與 OptionsEditor」，但查 git log 確認兩個檔案均未被刪除。
  S8 瀏覽器驗證：導航至 `/admin/settings` 仍可正常存取。
- **預期結果**：頁面應已刪除（功能已整合至 CardFormDialog SettingsPopover）
- **實際結果**：頁面仍存在，UI 風格與主系統不一致（灰藍色）
- **狀態**：已修復（0d4f217）— `git rm` 刪除 `src/app/admin/settings/page.tsx` 與 `src/components/OptionsEditor.tsx`，無其他引用

---

### BUG-006：PhotoWall 底部工具列「新增料卡」「批次匯入」對所有登入者可見

- **發現於**：Round 1 / Session S8
- **TC 編號**：TC-8.1
- **嚴重度**：P2
- **位置**：`src/components/PhotoWall.tsx`（約 Line 883–909）
- **描述**：
  底部固定工具列（批次選取 / 批次匯入 / 新增料卡）無任何 `canEditCard` 或 `permissions` 條件判斷，
  所有已登入使用者（包含僅有 `read_active_only` 的 viewer 角色）均能看到並點擊這三個按鈕。
  Viewer 點擊後可打開 CardFormDialog（新增料卡）或 BatchImportDialog（批次匯入），
  但實際送出 API 時 (POST /api/cards) 後端會返回 403 — UI 保護缺失，API 層保護有效。
- **修法建議**：在工具列外層加 `{canEditCard && ...}` 條件（`canEditCard` 已定義於 PhotoWall.tsx:52）
- **預期結果**：Viewer 看不到「新增料卡」和「批次匯入」按鈕
- **實際結果**：Viewer 可見且可點擊，但 API 呼叫會 403
- **狀態**：已修復（0d4f217）— 三個按鈕整體包 `{canEditCard && (...)}` 條件，Viewer 不再看到工具列

---

### BUG-007：DELETE /api/admin/users 無自我保護，管理員可 API 層刪除自己

- **發現於**：Round 1 / Session S8
- **TC 編號**：TC-8.10
- **嚴重度**：P3
- **位置**：`src/app/api/admin/users/route.ts`（DELETE、PATCH handler）
- **描述**：
  UI 層已實作自我保護（`isSelf` 判斷，`disabled` 按鈕，tooltip「無法移除自己」），
  但 API 層的 DELETE 和 PATCH handler 未檢查 `callerEmail === targetEmail`。
  管理員可繞過 UI 直接呼叫 API，刪除或降級自己的帳號。
- **預期結果**：API 返回 403「不可操作自己的帳號」
- **實際結果**：API 無自我保護，直接執行刪除/更新
- **狀態**：已修復（0d4f217）— PATCH/DELETE handler 新增 `callerUser.email === targetEmail` 比對，返回 403「不可修改/刪除自己的帳號」
