# 測試 Playbook — 執行紀錄

## 測試輪次

| 輪次 | 日期 | 觸發原因 | 結果 | Bug 數 |
|------|------|---------|------|--------|
| Round 1 | 2026-06-13 | 全面性首次測試 | ✅ 完成 | 7（BUG-001~007，BUG-002 已關閉）|

---

## Round 1 Session 狀態

| Session | 狀態 | Bug 數 | 備註 |
|---------|------|--------|------|
| S1 靜態 Auth | ✅ 完成 | 1 | BUG-001(P1)；BUG-002 關閉（設計正確）|
| S2 靜態元件 | ✅ 完成 | 0 | 無嚴重 Bug；觀察：noPhotoFilter/selectedSubTags 未同步 URL；更新紀錄排序方向待確認 |
| S3 首頁搜尋 | ✅ 完成 | 0 | 10/10 TC 全通過（2026-06-13）|
| S4 Lightbox + 書籤 | ✅ 完成 | 0 | 10/10 TC 全通過（2026-06-13）|
| S5 管理員 CRUD | ✅ 完成 | 0 | 9/10 TC 通過；TC-5.7 照片暫存略過（需實體檔案）；TC-5.2 驗證為 banner 而非欄位個別提示（2026-06-13）|
| S6 Tracker | ✅ 完成 | 2 | BUG-003(P3) 必填無錯誤提示；BUG-004(P2) 負責人清單未依部門過濾；PRE-03 設計風險確認；類型篩選未實作（觀察）（2026-06-13）|
| S7 Admin 後台 | ✅ 完成 | 1 | 10/10 TC 全通過；BUG-005(P3) /admin/settings 頁面重複 SettingsPopover 功能（**S7 修復記錄有誤，實際未修復，S8 確認仍存在**）；TC-7.9 SettingsPopover 位於 CardFormDialog 而非首頁 header（文件描述有誤）（2026-06-13）|
| S8 權限 UI（雙帳號）| ✅ 完成 | 3 | BUG-005(P3) 確認未修復；BUG-006(P2) 底部工具列無 canEditCard 保護；BUG-007(P3) API 層無自我保護；Viewer 側 TC-8.1/8.3/8.4/8.5/8.6/8.8/8.11 以 Code Review 方式驗證（無 Viewer 帳號）|

---

## 已知潛在問題（測試前預判）

| 編號 | 位置 | 描述 | 嚴重度 | 已驗證 |
|------|------|------|--------|--------|
| PRE-01 | `admin.ts:24` | ~~ALLOWED_DOMAINS 含 `eup.com.vn`，但截圖中有用戶 `henry@eup.net.vn`~~（已修正為 `eup.net.vn`，2026-06-13）| P1 | ✅ 已修復 |
| PRE-02 | `middleware.ts` | 中介軟體只檢查 session cookie 是否存在，不驗證 admin 身份；/admin/* 路由保護依賴 page 層自行檢查 | P2 | S1 驗證 |
| PRE-03 | `issues/route.ts:68` | department_id 為 null 時 `.eq('department_id', null)` 只查 null 部門任務。homejay 無 department_id，但其建立的任務也是 null，故仍有資料。若任務均有 department_id 則管理員看板為空，缺少全域 bypass | P2 | ⚠️ 設計風險確認（管理員未被豁免部門過濾）|
