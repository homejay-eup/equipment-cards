# Step 41 — 任務板關鍵字搜尋 + 更新紀錄支援貼圖/貼表格

**建立日期**：2026-08-21
**狀態**：規格定案，CodeGraph blast radius 調查已完成（發現並修正原規格誤植目標元件），待委派 `data`→`frontend`→`tester`→`reviewer`

## 背景

任務板任務量持續增加（目前 25+ 筆），現有篩選只有「優先級」「負責人」兩種 chip，沒有關鍵字搜尋，越來越難找到特定任務。另外使用者反映常需要把螢幕截圖（錯誤畫面、報價表等）當佐證資料附加在任務上，希望能直接 Ctrl+V 貼上，也希望能直接複製 Excel/表格範圍貼上呈現成真正的表格，而不是手動打字說明。

## 決策摘要（討論定案，逐項對應）

1. **關鍵字搜尋**：`TrackerClient.tsx` 篩選列新增搜尋輸入框，比對範圍為標題＋說明＋標籤，前端直接過濾現有 `issues` state，不需新增 API。
2. **貼圖/貼表格的定位**：不動「說明」欄位（維持單純初始描述）。改在**更新紀錄**（`issue_updates`）上——更新紀錄本來就是「附加在任務後面、按時間序列疊加」的機制，符合「補充佐證資訊」的語意。更新紀錄從純文字變成「文字＋可選圖片（可多張）＋可選表格」的複合留言。
3. **表格呈現**：採**真表格渲染**（非簡易文字表格）。貼上的表格內容需解析成結構化資料（列×欄），畫面上畫出真正的 `<table>`。
4. **圖片放大檢視**：更新紀錄裡的圖片縮圖需可點擊放大。不沿用 `CardDetailDialog`（核心保護元件，且是料卡照片輪播，用途不同），改新增一個獨立輕量的放大檢視元件（單則更新內若有多張圖，支援左右切換；點空白處或 X 關閉）。
5. **更新紀錄送出行為**：拿掉現有「離開欄位（`onBlur`）自動儲存」機制，改成**明確送出按鈕**。此改動**同時套用在純文字更新**（不分是否含圖片/表格），理由：圖片上傳是非同步動作、表格需要使用者確認解析結果，維持自動儲存邏輯會在貼上瞬間就可能誤觸發或存到不完整內容；兩套邏輯並存（純文字自動存、複合內容才需按送出）反而更複雜、更容易出錯，統一改動的操作成本（多按一下）遠低於邏輯分裂的風險。

## 技術設計要點

### 資料庫（`issue_updates` 表新增欄位，交給 `data` agent 設計實際型別）
- 圖片網址陣列（多張，需保留上傳順序）
- 表格結構化資料（列×欄，JSON 格式，允許 null 表示無表格）

### 圖片上傳機制
- 現有 `usePhotoUpload.ts`／`useDocumentUpload.ts` 皆綁定 `equipment_id`／料卡情境，無法直接沿用。
- 需新增一支以 **issue_id** 為範圍的 Cloudinary 簽名上傳 API + hook，走跟 `usePhotoUpload.ts` 相同的「向自己 API 拿簽名 → 直傳 Cloudinary → PATCH 寫回資料庫」三步模式。

### 貼上偵測（前端）
- 圖片：`onPaste` 偵測 clipboard `image/*` → 呼叫新上傳 hook → 縮圖預覽（可移除、可多張）
- 表格：`onPaste` 偵測 clipboard `text/html` 內的 `<table>`（Excel/Google Sheets 複製會帶此格式）→ 解析成列×欄陣列 → 畫面預覽真表格（可移除重貼）

### UI 行為
- `IssueExpandedContent.tsx` 更新紀錄輸入區：文字 textarea + 已貼附件（圖片縮圖列 / 表格預覽）+ 送出按鈕
- 更新紀錄清單每筆需同時支援顯示文字／圖片縮圖（可點擊放大）／真表格

## 【允許新建】

- 圖片上傳 API route（範例路徑，`data` agent 可依現有慣例調整）：`src/app/api/issues/[id]/updates/upload/route.ts` 或另立簽名端點
- 新 hook：如 `src/hooks/useUpdateAttachmentUpload.ts`
- 新輕量放大檢視元件：如 `src/components/UpdateImageLightbox.tsx`
- SQL migration：`_開發檔案/sql/step41-issue-updates-attachments.sql`

## 【允許修改的既有檔案】（需在此明確列出，非核心保護元件但仍需謹慎）

- `src/app/tracker/TrackerClient.tsx`（篩選列新增搜尋框）
- `src/components/IssueDetailDialog.tsx`（更新紀錄輸入/顯示邏輯大改：送出按鈕、複合留言渲染、貼上偵測、放大檢視觸發點）—— 注意：**不是** `IssueExpandedContent.tsx`（死碼，見下方 blast radius 調查結果）
- `src/app/tracker/page.tsx`（`IssueUpdate` 型別擴充欄位、`issueSelectQuery`、`RawIssue` inline type）
- `src/app/api/issues/route.ts`（GET，select 字串加新欄位）
- `src/app/api/issues/[id]/route.ts`（GET + PATCH refetch，2 處 select 字串都要加新欄位）
- `src/app/api/issues/[id]/updates/route.ts`（POST，放寬必填驗證、支援新欄位）
- `src/app/api/issues/[id]/updates/[updateId]/route.ts`（DELETE，刪除時連動刪除 Cloudinary 圖片）

## 【禁止觸碰】

- 核心保護元件：`PhotoWall.tsx`、`EquipmentCardItem.tsx`、`CardDetailDialog.tsx`、`CardFormDialog.tsx`、`BatchImportDialog.tsx`、`src/app/page.tsx`
- 本 Step 範圍外的其他 Tracker 相關檔案（如 `NewIssueDialog.tsx`、`EditIssueDialog.tsx` 的「說明」欄位本身——本次不動說明欄位）

## CodeGraph blast radius 調查結果（2026-08-21，已完成）

**重大發現：原規格草稿寫錯目標元件。** `IssueExpandedContent.tsx` 全域搜尋（Grep + CodeGraph）確認**沒有任何地方 import/使用它，是死碼**。實際掛在 `TrackerClient.tsx` 上、畫面上真正在跑的「更新紀錄」UI 是 **`IssueDetailDialog.tsx`**（兩檔案程式碼幾乎一樣，`IssueDetailDialog.tsx` 還多了刪除單筆更新紀錄的功能）。以下【允許修改】清單已依此修正。

**需改／不需改清單（逐一確認完畢）**：

| 檔案 | 需改／不需改 | 理由 |
|---|---|---|
| `src/components/IssueDetailDialog.tsx` | **需改** | 唯一實際掛載的更新紀錄 UI，送出按鈕/複合留言渲染/貼上偵測/放大檢視觸發點都在這裡加 |
| `src/components/IssueExpandedContent.tsx` | **不改** | 死碼，維持現狀，不在本次規格範圍內 |
| `src/app/tracker/page.tsx` | **需改** | `IssueUpdate` interface 擴充新欄位；`issueSelectQuery` 字串、`RawIssue.issue_updates` inline type 都要同步加欄位 |
| `src/app/api/issues/route.ts`（GET） | **需改** | select 字串裡的 `issue_updates(id, content, created_by, created_at)` 要加新欄位，否則任務板輪詢（`TrackerClient.tsx` 的 `/api/issues` fetch）抓不到圖片/表格資料 |
| `src/app/api/issues/[id]/route.ts` | **需改（同一檔案內 2 處）** | GET 與 PATCH 的 refetch 各自有一份幾乎一樣的 select 字串，都要加欄位，容易漏改其中一處 |
| `src/app/api/issues/[id]/updates/route.ts`（POST） | **需改** | 現在 `if (!content?.trim())` 強制文字必填，要放寬成「文字/圖片/表格至少一項」；insert 要接受新欄位 |
| `src/app/api/issues/[id]/updates/[updateId]/route.ts`（DELETE） | **需改** | 刪除帶圖片的更新紀錄時，一併呼叫 Cloudinary API 刪除對應圖片（不比照 Drive 那套「留給人工」的做法——這裡的 Cloudinary 簽名是本專案自己的 API key，權限沒有 Drive Service Account 的限制，可以直接刪除，使用者已確認） |
| `src/hooks/useIssueRealtime.ts` | **不需改** | fast-update path 本來就明確排除 `issue_updates`／`assignees`／`assignee_emails`（保留現有值），慢路徑靠重新 fetch `/api/issues/${issueId}`，只要 API 端 select 補上新欄位就會自動帶到 |

## 補充發現與決策（`data` agent 執行後回報，2026-08-21）

`data` agent 執行時發現原 blast radius 調查漏掉第 5 處 select：**`src/app/page.tsx`**（核心保護元件）的 `getTrackerData()` 也有一份一樣的 `issue_updates(...)` select 字串（餵給任務板分頁的 SSR 初始資料），沒有加新欄位。已決策：**不修改 `page.tsx`**（維持核心保護元件禁止觸碰），改為 `frontend` agent 渲染時一律用 `update.image_urls ?? []` 防禦，SSR 那一瞬間的資料落差會被 `TrackerClient.tsx` mount 後的 client fetch 立刻蓋掉，跟現有 `is_pinned` 合併邏輯是同一類已存在的模式。

`data` agent 已完成的實作摘要：
- `issue_updates` 新增 `image_urls JSONB NOT NULL DEFAULT '[]'::jsonb`（元素 `{public_id, url}`）、`table_data JSONB`（`{rows: string[][], hasHeader: boolean}` 或 null）；`content` 改為可 null；CHECK constraint 確保三者至少一個非空
- 新簽名端點 `POST /api/issues/[id]/updates/signature`（權限 `view_tracker`），回應 `{ signature, timestamp, public_id, folder, api_key, cloud_name }`，folder 固定 `equipment-cards/tracker-updates/{issue_id}`；前端每張圖片各呼叫一次拿獨立簽名，直傳 Cloudinary，最後把 `public_id`/`url` 陣列包進 `POST /api/issues/[id]/updates` 的 body
- `POST /api/issues/[id]/updates`：驗證放寬為「`content`/`image_urls`/`table_data` 三者至少一項」；insert 支援新欄位
- `DELETE /api/issues/[id]/updates/[updateId]`：刪除前先 best-effort 呼叫 Cloudinary 刪除 `image_urls` 對應圖片，即使失敗仍繼續刪 DB row，回應多帶非阻塞 `warning` 欄位
- 4 處既有 select 字串（`page.tsx`、`/api/issues` GET、`/api/issues/[id]` GET+PATCH）皆已加新欄位
- SQL migration `_開發檔案/sql/step41-issue-updates-attachments.sql` 已產出，**尚未在正式 Supabase 執行**

## 委派順序

`data`（schema + 上傳 API + 上述 API routes 欄位/驗證邏輯調整）→ `frontend`（`IssueDetailDialog.tsx` 送出按鈕/複合留言渲染/貼上偵測/放大檢視元件、`TrackerClient.tsx` 搜尋框）→ `tester` → `reviewer`
