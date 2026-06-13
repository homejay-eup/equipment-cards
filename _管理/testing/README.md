# 設備料卡管理系統 — 測試基礎設施

## 如何啟動測試

每個測試 Session 是完全自包含的。啟動方式：

> 告訴 Claude：「請執行 `_管理/testing/sessions/S1-static-auth.md` 的測試」

Claude 讀取 Session 檔、冷啟動、執行所有測試案例、結果寫回 `bug-log.md`。**不需要額外說明背景。**

---

## 工具說明

| 工具 | 用途 |
|------|------|
| Claude in Chrome | 操控已登入的 Chrome，用於瀏覽器測試 |
| DOM Snapshot（read_page） | 輕量頁面讀取（首選，比截圖省 Context） |
| 截圖（take_screenshot） | 只在發現 Bug 時才截圖記錄 |
| 靜態閱讀（Read/Grep） | 程式碼邏輯審查 |

---

## Session 清單

| Session | 類型 | 主題 | 狀態 |
|---------|------|------|------|
| [S1](sessions/S1-static-auth.md) | 靜態 | Auth / 權限閘道 | 待執行 |
| [S2](sessions/S2-static-components.md) | 靜態 | 元件邏輯審查 | 待執行 |
| [S3](sessions/S3-homepage-search.md) | 瀏覽器 | 首頁搜尋與篩選 | 待執行 |
| [S4](sessions/S4-lightbox-bookmark.md) | 瀏覽器 | Lightbox + 書籤 | 待執行 |
| [S5](sessions/S5-admin-crud.md) | 瀏覽器 | 管理員 CRUD | 待執行 |
| [S6](sessions/S6-tracker.md) | 瀏覽器 | Tracker 看板 | 待執行 |
| [S7](sessions/S7-admin-pages.md) | 瀏覽器 | Admin 後台頁面 | 待執行 |
| [S8](sessions/S8-permissions.md) | 瀏覽器（雙帳號）| 權限 UI 可見性與功能限制 | 待執行 |

---

## 前置測試帳號設定（一次性）

**管理員帳號**：homejay@eup.com.tw（你的帳號）

**Viewer 測試帳號**（需建立一次）：
1. Supabase Dashboard → Authentication → Users → Add user → Create new user
2. Email: `test-viewer@test.com`，Password: 自訂
3. 網站 `/admin/users` → 新增此 email，角色設為一般使用者（viewer）
4. incognito 視窗打開 `https://equipment-cards.vercel.app/login`
5. 因 app 只顯示 Google 登入按鈕，需直接呼叫 Supabase email 登入

---

## 結果紀錄規則

- Bug 發現 → 追加至 `bug-log.md`（格式見該檔案）
- Session 完成 → 更新本 README 的狀態欄位（✅ / ❌ / ⚠️）
- 全部 Session 通過 → 在 playbook.md 標記本輪測試完成

---

## Delta 測試（新功能上線後）

見 [delta-protocol.md](delta-protocol.md)
