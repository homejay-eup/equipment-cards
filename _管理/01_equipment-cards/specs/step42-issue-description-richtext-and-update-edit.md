# Step 42 — 任務「說明」欄位支援貼圖/貼表格 + 更新紀錄支援修改

**建立日期**：2026-08-26
**狀態**：規格定案，CodeGraph blast radius 調查已完成，待委派 `data`→`frontend`→`tester`→`reviewer`

## 背景

使用者反映：① 更新紀錄的新增輸入框只有 3 行高，打長一點就要一直捲動（已在本次對話單獨處理，`rows` 已改成 10，不在本 Step 範圍）；② 任務卡的「說明」欄位希望能跟更新紀錄一樣支援貼圖/貼表格；③ 更新紀錄目前只能刪除，希望也能修改，且修改後要更新顯示的時間。

## 決策摘要（討論定案，逐項對應）

1. **更新紀錄「修改」的範圍**：文字＋圖片＋表格都能改（跟新增留言功能對等），不是只能改文字。
2. **修改後的時間顯示**：直接把該筆更新紀錄顯示的時間換成「最後修改時間」，不额外加「已編輯」標記，版面不變。
3. **「說明」欄位支援貼圖/貼表格的適用範圍**：`EditIssueDialog.tsx`（編輯任務）＋ `NewIssueDialog.tsx`（新增任務）都要。因為新增任務當下還沒有 issue id，貼圖用的 Cloudinary 簽名端點不能像更新紀錄那樣綁 issue id，必須另外設計一個不依賴 issue id、只依賴使用者部門的簽名端點。
4. **RWD**：三個 dialog（`EditIssueDialog`／`NewIssueDialog`／`IssueDetailDialog`）在手機寬度（375px）下，圖片縮圖列要 wrap、表格要橫向捲動、Step 41 已加高的 `rows=10` 輸入框不能把 dialog 撐出奇怪的版面（dialog body 本身已是 `overflow-y-auto`，理論上沒問題，但要實測確認）。

## 技術設計要點

### 資料庫

- `issues` 新增：
  - `description_image_urls jsonb NOT NULL DEFAULT '[]'::jsonb`（元素 `{public_id, url}`，跟 `issue_updates.image_urls` 同格式）
  - `description_table_data jsonb`（`{rows: string[][], hasHeader: boolean}` 或 null，跟 `issue_updates.table_data` 同格式）
- `issue_updates` 新增：
  - `updated_at timestamptz`（null＝從未被修改過；一旦被 PATCH 就寫入當下時間；前端顯示時 fallback：`updated_at ?? created_at`）

### 驗證邏輯共用化

現有 `POST /api/issues/[id]/updates/route.ts` 裡有一段完整的 content/image_urls/table_data 格式驗證（文字長度上限、圖片張數上限＋Cloudinary URL 前綴檢查、表格列數/欄數上限）。本次會新增 3 個寫入端點（PATCH 更新紀錄、POST/PATCH 議題的 description 欄位）都需要一樣的規則，**必須抽成共用函式**（例如 `src/lib/richContentValidation.ts`），4 個端點一起呼叫，避免規則各自維護後續飄掉（Step 41 已有的坑）。

### 圖片上傳端點

- 更新紀錄的貼圖沿用既有 `POST /api/issues/[id]/updates/signature`（issue-scoped，不用改）。
- 「說明」欄位的貼圖需求新增 **一個新的通用簽名端點**（例如 `POST /api/issues/description-signature`），權限檢查比照現有端點（`view_tracker` + 呼叫者部門檢查），但**不要求存在的 issue id**（因為新增任務時還沒有），folder 路徑改用 `equipment-cards/tracker-issues/description/{department_id}/...`。`EditIssueDialog`（已有 issue id）跟 `NewIssueDialog`（還沒有）都呼叫這同一個端點，維持單一實作。
- 現有 `useUpdateAttachmentUpload.ts` 目前硬綁 `issueId` 組出簽名端點網址，需要泛化成接受一個 `signatureUrl` 字串參數，讓「更新紀錄貼圖」跟「說明欄位貼圖」共用同一個 hook、指向不同端點。

### 前端共用元件（避免 3 個 dialog 各寫一份貼上/渲染邏輯）

`IssueDetailDialog.tsx` 現有的 `parseHtmlTable()`、`handlePaste()`、圖片縮圖 grid＋Lightbox 觸發、`UpdateTable` 渲染，需要抽成共用元件供 3 個 dialog 使用：
- 一個「可編輯」版本（textarea + 貼上偵測 + 待上傳圖片縮圖/移除 + 表格預覽/移除），`EditIssueDialog`／`NewIssueDialog`／`IssueDetailDialog` 的新增與編輯更新紀錄都用它
- 一個「只讀顯示」版本（文字 + 圖片縮圖列 + 真表格），說明欄位跟更新紀錄清單項目都用它

放置位置：`src/components/tracker/`（新資料夾，跟 tracker 功能相關的共用元件放一起）。

### 更新紀錄「修改」UI

`IssueDetailDialog.tsx` 每筆更新紀錄 hover 時目前只有刪除按鈕，需新增「編輯」按鈕（同排、同樣 hover 才顯示）。點擊後該筆項目原地切換成可編輯版本（帶入現有文字/圖片/表格），有「儲存」「取消」。權限比照刪除（本人 or `create_issues`）。

### API 變動

- `POST /api/issues`、`PATCH /api/issues/[id]`：body 接受 `description_image_urls`／`description_table_data`，套用共用驗證後寫入。
- 新增 `PATCH /api/issues/[id]/updates/[updateId]`（加進現有 DELETE 那個檔案）：套用共用驗證，權限比照 DELETE，寫入時設定 `updated_at = now()`；比對移除掉的圖片 best-effort 呼叫 Cloudinary 刪除（跟現有 DELETE 的做法一致）。
- 刪除議題（`DELETE /api/issues/[id]`）目前只清 `issue_updates` 的圖片，需要一併清 `description_image_urls`。

## 已知 blast radius：select 查詢共有 5 處，其中 1 處刻意不動

Step 41 執行時發現過同一類坑（漏改 select 導致新欄位抓不到），這次先列清楚：

| 檔案 | 需改／不需改 | 理由 |
|---|---|---|
| `src/app/tracker/page.tsx`（`issueSelectQuery`） | **需改** | 獨立 `/tracker` 路由的 SSR 初始資料 |
| `src/app/api/issues/route.ts`（GET 清單） | **需改** | `TrackerClient.tsx` 輪詢用的 `/api/issues` |
| `src/app/api/issues/[id]/route.ts` | **需改（同檔 2 處）** | GET 單筆 + PATCH 回傳的 refetch，各自一份幾乎一樣的 select 字串 |
| `src/app/api/issues/route.ts`（POST 新增） | **不需改 select** | 用 `.select()` 不指定欄位，自動回傳全部欄位；只需要 insert 時帶入新欄位 |
| `src/app/page.tsx`（`getTrackerData()`） | **刻意不改** | 核心保護元件，禁止觸碰。比照 Step 41 的決策：`frontend` agent 渲染時一律對新欄位做 `?? []`／`?? null` 防禦，`TrackerClient.tsx` mount 後的 client-side `/api/issues` fetch 會在極短時間內用完整資料覆蓋掉這份初始 SSR 資料的落差 |

## 【允許新建】

- SQL migration：`_開發檔案/sql/step42-issue-description-and-update-edit.sql`
- 共用驗證函式：`src/lib/richContentValidation.ts`
- 通用說明欄位簽名端點：`src/app/api/issues/description-signature/route.ts`
- 共用前端元件：`src/components/tracker/`（可編輯／只讀兩個元件，檔名由 `frontend` agent 決定）

## 【允許修改的既有檔案】

- `src/app/tracker/page.tsx`（`Issue`／`IssueUpdate` 型別擴充、`issueSelectQuery`、`RawIssue` inline type）
- `src/app/api/issues/route.ts`（GET select 加欄位；POST insert 支援新欄位＋套用共用驗證）
- `src/app/api/issues/[id]/route.ts`（GET + PATCH 的 2 處 select 都加欄位；PATCH 支援新欄位＋套用共用驗證；DELETE 的 Cloudinary 清除範圍加 `description_image_urls`）
- `src/app/api/issues/[id]/updates/[updateId]/route.ts`（新增 PATCH，跟現有 DELETE 放同檔案）
- `src/app/api/issues/[id]/updates/route.ts`（若抽驗證函式，這裡改成呼叫共用函式，行為不變）
- `src/hooks/useUpdateAttachmentUpload.ts`（泛化成接受 `signatureUrl` 參數）
- `src/components/IssueDetailDialog.tsx`（說明改用共用只讀元件；更新紀錄新增/編輯改用共用可編輯元件；新增編輯按鈕與編輯模式狀態）
- `src/components/EditIssueDialog.tsx`（說明欄位換成共用可編輯元件）
- `src/components/NewIssueDialog.tsx`（說明欄位換成共用可編輯元件）

## 【禁止觸碰】

- 核心保護元件：`PhotoWall.tsx`、`EquipmentCardItem.tsx`、`CardDetailDialog.tsx`、`CardFormDialog.tsx`、`BatchImportDialog.tsx`、`src/app/page.tsx`（僅上表列出的防禦性 `?? []` 例外邏輯要放在 `frontend` 端處理，不透過修改 `page.tsx` 解決）
- `IssueExpandedContent.tsx`（Step 41 已確認是死碼，本次不處理）
- `src/app/tracker/TrackerClient.tsx` 的拖曳自動捲動邏輯（本次對話另一個獨立修正，已 commit，跟本 Step 無關，不要動）

## 委派順序

`data`（schema + 共用驗證函式 + description-signature 端點 + 上述 API routes 調整）→ `frontend`（共用 RichContent 元件抽取 + 3 個 dialog 串接 + 更新紀錄編輯 UI + RWD 檢查）→ `tester`（build + worktree eslint 額外檢查 + 手機寬度檢查；瀏覽器自動化受 Google OAuth 登入牆限制，功能性驗證改用程式碼追蹤）→ `reviewer`
