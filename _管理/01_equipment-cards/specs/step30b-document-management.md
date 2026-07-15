# Step 30 後續規格：文件管理功能重新規劃

> 來源：2026-07-14 需求討論（腦力激盪階段，逐一收斂 5 個開放問題 + 頁籤入口 + 權限設計）。
> 承接 Step 30（文件正規化，已上線）。本次不重寫既有的正規化資料表/API，只調整既有行為 + 新增管理頁面。

---

## 背景

Step 30 文件連結功能上線並經使用者正式站實測後，反映「堪用但未達目標」，具體缺口記於 `CLAUDE.md`「目前進度」Step 30 區塊，本次逐一討論收斂：

1. 批次上傳（一次只能傳一個檔案）
2. 批次換版（逐筆單獨操作）
3. 重複上傳情境（只有精確同名的簡單比對）
4. 樂觀顯示（多數操作要等 API 回應）
5. Drive 內檔案組織方式（平面單一資料夾，業務無法從 Drive 側看出歸屬）

---

## 設計決策

| 項目 | 決策 |
|---|---|
| 單卡片批次上傳 | `CardFormDialog` 文件上傳改為多選（比照細節照片：選檔 → 系統跳窗多選 → 匯入後逐一填類型），顯示名稱固定用檔名（去副檔名），不開放自訂 |
| 跨卡片批次上傳 | 新增管理頁面內建「批次上傳」：多選本地檔案 → 每個檔案填類型 + 搜尋多選掛載料卡（可一張或多張）→ 重用既有 `POST /api/documents/upload`（本來就支援 `equipment_ids: string[]`，無需新增後端邏輯） |
| 換版（批次） | 不做「一對一配對覆蓋」UI。改為「批次刪除」+「批次上傳」兩個獨立動作組合而成：刪除舊文件（確認前列出目前掛載的所有料卡）→ 到管理頁面用批次上傳補新文件 |
| 批次刪除的安全提示 | 勾選文件按刪除前，列出每份文件目前掛載的**料卡清單**（料號＋品名），不是只顯示數字；確認後解除所有 `card_documents` 關聯，Drive 檔案移到既有的「_待清除文件」資料夾（沿用既有安全機制，不會真的消失） |
| 同名文件處理 | 精確同名比對從現有「仍要上傳新文件／改用既有文件」，**統一改為「取代（更新版本）／先刪除舊的再上傳」二選一**，移除「保留兩份同名」選項（避免批次刪除清單出現無法分辨的重複檔名）。兩個上傳入口（`CardFormDialog` 單卡片 + 新管理頁面批次上傳）行為一致 |
| 批次上傳的本批次內查重 | 除了比對資料庫既有文件，也要比對「本次批次清單內尚未送出的其他列」，避免同一批意外把同一份檔案加成兩列造成 Drive 產生實體重複檔案 |
| 樂觀顯示 | 本地暫存動作（勾選、加入待處理清單）本來就是前端狀態，已經即時，不需處理。真正呼叫 Drive／DB 的動作（確認上傳、確認刪除、取代版本）**不做假樂觀**（記取先前「移除文件」曾顯示已刪除但實際未刪成功的教訓），改為批次逐筆即時進度回饋（每筆真的完成才更新該筆狀態） |
| Drive 檔案組織 | 維持現有平面資料夾結構，不依料號建子資料夾（共用雲端硬碟的檔案只能有一個父資料夾，會讓共用文件在其他料號的資料夾裡隱形），不採用檔名加料號前綴（共用文件會被迫重複命名） |
| 文件目錄表 | 新增一份 Google Sheet「文件目錄表」，與既有「A++ 產品規格書」「產品規格書 (上傳)」「_待清除文件」同層。兩個分頁：「依文件」（一列一份文件，掛載料號列在同一格）、「依料號」（一列一張料卡，掛載文件列在同一格）。按需重新產生（非即時、非 Apps Script），每次覆蓋同一份檔案（同一 file id），不累積新檔案 |
| 入口位置 | 新增獨立頁籤「文件管理」，比照既有「任務板」「人為配件報價」的做法，掛在 `PhotoWall.tsx` 頂部分頁列，用 mount-once + CSS 顯示/隱藏模式（非獨立路由）——切換頁籤不會卸載元件，暫存資料與背景執行中的批次動作都不受影響 |
| 權限 | 新增獨立 permission key `manage_documents`，批次上傳／批次刪除／重新產生目錄檔三個功能綁在同一個總開關（不分層級）。角色管理頁面的權限清單新增「文件管理」分組，插在「料卡管理」之後、「追蹤板」之前 |

---

## 新增 Permission Key

| permission_key | 說明 |
|---|---|
| `manage_documents` | 看得到「文件管理」頁籤；可批次上傳、批次刪除、重新產生目錄檔 |

需加入 `src/app/api/roles/[id]/permissions/route.ts` 的 `VALID_PERMISSION_KEYS` 白名單，以及 `RolesManager.tsx` 新增 `DOCUMENT_MGMT_PERMS` 分組常數（插入「料卡管理」`CARD_MGMT_PERMS` 之後、「追蹤板」`TRACKER_PERMS` 之前，新建角色表單與編輯角色頁面兩處皆要加入）。

---

## API Routes 異動

| 方法 | 路徑 | 異動 | 說明 |
|---|---|---|---|
| GET | `/api/documents` | 擴充 | `equipment_id` 改為選填；省略時（需 `manage_documents` 權限）回傳**全部**文件，每筆額外帶出 `linked_cards: {equipment_id, name}[]`（供文件清單顯示掛載張數 + 刪除前列出受影響料卡） |
| POST | `/api/documents/upload` | 不需異動 | 已支援 `equipment_ids: string[]`，批次上傳直接重用 |
| DELETE | `/api/documents/[id]/link` | 不需異動 | 批次刪除＝對該文件目前所有 `equipment_id` 各呼叫一次既有 unlink（最後一個關聯時既有邏輯本來就會處理 Drive 搬移＋刪除 `documents` 列），前端迴圈呼叫即可 |
| PATCH | `/api/documents/[id]` | 不需異動 | 取代（更新版本）沿用既有邏輯 |
| POST | `/api/documents/regenerate-index`（新建） | 新增 | 需 `manage_documents` 權限。查詢 `documents`／`card_documents`／`equipment_cards` 現況，寫入/覆蓋 Google Sheet「文件目錄表」兩個分頁。**需確認 Google Cloud 專案已啟用 Sheets API**（與 Drive API 用同一組 Service Account 憑證，若未啟用需先在 Google Cloud Console 開通） |

---

## 前端異動

### 1. `src/components/CardFormDialog.tsx`（**核心保護元件**，本次規格允許的最小侵入）
- 文件上傳 `<input type="file">` 加上 `multiple`，選檔後每個檔案各自進入待處理列表填類型（比照 `detailFileRef` 的多選模式）
- 顯示名稱移除自訂輸入，固定用檔名（去副檔名）
- 精確同名跳提示的選項從「仍要上傳新文件／改用既有文件」改為「取代（更新版本）／先刪除舊的再上傳」
- 既有「暫存到按儲存才生效」機制不變

### 2. 新建 `src/components/DocumentsClient.tsx`
- 頂部：「重新產生目錄檔」按鈕 + 上次產生時間 + 完成後顯示「已更新」與開啟 Sheet 連結
- 批次上傳區塊：多選本地檔案 → 每個檔案一列（類型下拉 + 搜尋多選掛載料卡）→ 確認上傳，逐筆即時進度回饋 + 本批次內查重
- 文件清單區塊：勾選多筆 → 「批次刪除」→ 確認框列出每份文件目前掛載的料卡（料號＋品名）→ 確認後逐一 unlink

### 3. `src/hooks/useDocumentUpload.ts`（既有，非核心保護清單內）
- 新增 `listAll(): Promise<DocumentSearchResult[]>`（呼叫擴充後的 `GET /api/documents`，不帶 `equipment_id`）
- 新增 `regenerateIndex(): Promise<{ generated_at: string; sheet_url: string }>`

### 4. `src/components/PhotoWall.tsx`（**核心保護元件**，本次規格允許的最小侵入）
- `activeTab` 型別新增 `'documents'`
- 新增 `documentsMounted` state（沿用「任務板」「報價查詢」的 mount-once + CSS hide/show 模式）
- 頂部分頁列新增第 5 顆按鈕「文件管理」，僅 `permissions.includes('manage_documents')` 才顯示；批次動作背景執行中時按鈕加小提示（處理中）
- 搜尋列 + 篩選列 + 卡片網格的隱藏條件擴充納入 `activeTab === 'documents'`
- 未變動任何既有 state、handler、既有分頁的邏輯與版面

### 5. `src/components/RolesManager.tsx`（既有，非核心保護清單內）
- `PERM_LABELS` 新增 `manage_documents` 說明
- 新增 `DOCUMENT_MGMT_PERMS = ['manage_documents']` 常數
- 新建角色表單 + 編輯角色頁面，皆在「料卡管理」區塊之後、「追蹤板」區塊之前插入「文件管理」勾選區塊

---

## 驗收標準

- [ ] `CardFormDialog` 可一次多選上傳文件，各自填類型，顯示名稱固定用檔名
- [ ] 精確同名時二選一（取代／先刪除再上傳），兩個上傳入口行為一致
- [ ] 有 `manage_documents` 才看得到「文件管理」頁籤
- [ ] 批次上傳可一次多檔、每檔可多選掛載料卡，本批次內同名會提示
- [ ] 批次刪除前正確列出每份文件目前掛載的料卡清單，確認後正確解除全部關聯、Drive 移至「_待清除文件」
- [ ] 「重新產生目錄檔」按鈕可正確覆蓋 Google Sheet 兩個分頁內容，不累積新檔案
- [ ] 切換頁籤時，「文件管理」內暫存/執行中的批次動作不受影響（mount-once 驗證）
- [ ] 角色管理頁「新建角色」與「編輯角色」皆能勾選/儲存 `manage_documents`
- [ ] 現有料卡照片牆（全部料卡/我的關注/任務板/人為配件報價）功能與版面無迴歸
- [ ] `npm run build` 通過

---

## 執行狀態

- ⏳ 尚未開始執行，本檔案為腦力激盪階段收斂後的規格，待使用者確認執行順序後委派 `data`/`frontend` agent
