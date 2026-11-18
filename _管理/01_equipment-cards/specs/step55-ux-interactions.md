# Step 55：互動優化 9 項（來自「互動收藏冊」挑選）

- 日期：2026-11-18
- 來源：使用者在預覽頁 `specs/ux-preview-picks.html`（artifact 7k8asGw9yXFMW8AeG57WfC）勾選 03/04/05/07/08/09/10/12/14
- 性質：純前端，**不改資料庫、不改 API**
- 標準順序：`frontend` → `tester` → `reviewer`

---

## 影響範圍（CodeGraph + Grep 交叉驗證結果）

| 檔案 | 核心保護 | 動到的項目 | 呼叫端（blast radius） |
|---|---|---|---|
| `src/components/PhotoWall.tsx` | ✅ | 03、05、09、10、12 | 只被 `src/app/page.tsx` 使用；props 不變 |
| `src/components/EquipmentCardItem.tsx` | ✅ | 04 | `PhotoWall.tsx:1144`、`GroupsPanel.tsx:1210`、`packages/PackageListView.tsx:234`（三處都吃到星星動畫，props 不變，不需改呼叫端） |
| `src/components/CardDetailDialog.tsx` | ✅ | 08 | 只被 `PhotoWall.tsx:1289` 使用；props 不變 |
| `src/components/CardFormDialog.tsx` | ✅ | 14 | 只被 `PhotoWall.tsx:1441` 使用（CodeGraph 報的另 3 個檔案是同名 `set` 函式誤判，Grep 確認無 `<CardFormDialog`）；props 不變 |
| `src/components/GroupsPanel.tsx` | — | 07 | 只被 `PhotoWall.tsx` 使用；props 不變 |
| 新檔 `src/components/EquipmentCardRow.tsx` | — | 09 | 新建 |
| 新檔 `src/hooks/useFlipAnimation.ts` | — | 03 | 新建 |
| 新檔 `src/components/UndoToast.tsx` | — | 07 | 新建 |

**特別注意（改 A 壞 B 風險點）**

1. `stickyHeaderHeight`（PhotoWall 量測凍結列高度）被 `GroupsPanel`、`DocumentsClient`、`PackagesClient` 當 `stickyTop` 使用。項目 10 讓凍結列變矮 → **只在 `activeTab === 'all'` 時縮小**，其他分頁高度維持現狀，三個子元件的 sticky 定位不受影響。
2. 選取模式時 FAB 用 `bottom-20` 避開操作列（`PhotoWall.tsx:1388`），項目 05 只加滑入動畫，不改操作列高度，FAB 位置不需改。
3. 燈箱手機版照片區是對話框上方的一塊（`paddingBottom: 80%`，`touchAction: pan-y`），不是全螢幕。下滑關閉必須「對話框內容捲在最上面才觸發」，否則會搶走往下捲看資料的手勢。
4. `MobilePhotoArea`/`DesktopPhotoArea`/`PhotoContent` 是定義在元件內的函式元件（每次 render 重建），縮放狀態要放在 `CardDetailDialog` 本體的 state/ref，不能放在這些內部元件裡，否則一 re-render 就歸零。
5. 拖放照片到 `CardFormDialog`：放到照片區以外的地方，瀏覽器預設會直接打開那張圖片、整頁離開網站（表單內容全丟）。必須在對話框層級攔截 `dragover`/`drop` 的預設行為。

---

## 各項規格

### 03 篩選時卡片滑動補位（PhotoWall + 新 hook）
- 新 hook `useFlipAnimation(containerRef, keys)`：記錄變動前位置 → 變動後用 Web Animations API 從舊位置滑到新位置；新出現的卡片依序淡入（每張延遲 40ms，最多延遲 8 張）。
- **只在切換分類、次級篩選、狀態、NEW、無主圖、長輝、排序時觸發**；搜尋框打字不觸發（每個按鍵都動畫會很吵也很慢）。
- 效能：只對變動前後在畫面可視範圍內的卡片做動畫，其他直接到位；結果超過 300 張且全部重排時直接跳過動畫。
- `prefers-reduced-motion` 時完全不動畫。
- 清單模式（項目 09）同樣適用。

### 04 加入關注星星迸開（EquipmentCardItem）
- 只改星號按鈕內部：從未關注 → 關注時，星星彈一下（scale 0.6→1.35→1）並迸出 6–8 個小點（純 CSS/WAAPI，不加套件）。
- 不加 toast（照片牆已有大量卡片，toast 會干擾；星號本身變色＋動畫已足夠）。
- 移除關注時不迸開，只換回空心。
- 不改按鈕位置、大小、顯示條件。

### 05 批次操作列滑入＋數字滾動（PhotoWall）
- 進入選取模式時操作列從下方滑入（translateY 100%→0，0.3s）。
- 「已選 N 張」的 N 用滾輪式數字（上下滾動換數字），列印／封箱標籤／刪除按鈕上的（N）維持一般文字。
- 不改操作列高度、按鈕、版面。

### 07 移除後可以「復原」（GroupsPanel，僅「我的關注」）
- 組合內**單筆移除**：拿掉確認框，直接從畫面移除，底部出現 toast「已從『組合名』移除『品名』 · 復原」，5 秒倒數條。
- 組合內**批次移除**：同樣拿掉確認框，toast「已移除 N 張 · 復原」。
- 實作方式＝**延後送出**：5 秒內不呼叫 DELETE API，按「復原」直接還原畫面（數量、排序都不會遺失）；5 秒到才真的送 DELETE。連續移除時前一筆立即送出、toast 換成新的那一筆。
- 使用者在 5 秒內關閉／重新整理頁面：用 `pagehide` 事件以 `fetch(..., { keepalive: true })` 把待送出的刪除送掉，避免「看起來刪了其實沒刪」。
- 新共用元件 `UndoToast.tsx`（之後其他地方可重用）。
- **不再需要而一併移除**：`GroupsPanel` 的 `removeTarget` state、`handleRemoveConfirm`、`batchConfirmOpen` state 及其兩個 `ConfirmDialog`（Grep 確認只在 GroupsPanel 內部使用）。
- **刻意不納入**：
  - 設備組合（套餐）取消掛載：本來就沒有確認框，且是部門共用資料、還原需要 API 帶回數量與排序，另案處理。
  - 文件取消掛載：最後一個掛載移除時會連同文件整個刪除（含搬 Drive），保留現有確認框。
  - 刪除組合本身、刪除料卡：保留確認框。

### 08 燈箱手勢：下滑關閉、雙擊放大（CardDetailDialog）
- **雙擊／雙點放大**：手機與桌機照片區雙擊 → 以點擊位置為中心放大 2 倍，可拖曳移動查看；再雙擊縮回。放大時停用左右滑換照片，換照片或關閉時自動縮回。
- **手機下滑關閉**：照片未放大、且對話框內容捲動位置在最頂端時，在照片區往下拖 → 整個對話框跟著下移、背景變淡；放開時超過 120px 或速度夠快就關閉，否則彈回。
- 方向鎖定：手指移動超過 10px 時判斷主要方向，水平 → 沿用既有換照片邏輯（`handleMobileTouch*` 不改行為），垂直 → 下滑關閉。只有一張照片時也要能下滑關閉（現有程式在 `allPhotos.length <= 1` 直接 return，需調整判斷順序）。
- 桌機不加下滑關閉（有 X 與點遮罩關閉）。

### 09 網格／清單切換（PhotoWall + 新元件 EquipmentCardRow）
- 「顯示 N / 786 筆」那一列右側加網格／清單切換鈕，圖示與「我的關注」既有切換鈕一致；選擇存在 localStorage（key `photowall_display`）。
- 清單一行一筆：小縮圖（40px）＋料號（等寬字）＋品名＋分類·廠商，狀態非現役時加灰色標籤、NEW 標籤沿用。
- 清單列必須支援卡片模式的所有操作：點開燈箱、選取模式勾選、關注星號（含項目 04 動畫，共用同一個星號小元件）、管理員編輯／刪除、加入組合。hover 時才顯示操作按鈕，手機上常駐星號（比照 `EquipmentCardItem` 的 `[@media(hover:none)]`）。
- 只影響「全部料卡」分頁；我的關注、設備組合各自已有清單模式，不動。

### 10 捲動後標題列變矮＋回到頂端（PhotoWall）
- 僅「全部料卡」分頁：往下捲超過 160px → 凍結列收起篩選列與「共 N 張主圖」說明，只留標題、分頁、搜尋列；捲回 40px 以內才展開（兩個門檻避免在邊界來回抖動）。使用者手動按「篩選」鈕時強制展開。
- 收起時「篩選」按鈕仍在搜尋列旁，已套用的篩選數字徽章照常顯示。
- 捲過 1200px 後右下出現「回到頂端」圓鈕；FAB 存在時放在 FAB 左邊，避免重疊；選取模式時跟著上移避開操作列。

### 12 主分頁滑動底塊（PhotoWall）
- 分頁按鈕外層改 `relative`，加一個絕對定位的深色底塊，依目前分頁按鈕的位置與寬高移動（會換行時也能跨行移動）；按鈕本身的選中底色改透明、只保留白字。
- 視窗寬度改變、分頁按鈕數量改變（權限不同）時重新計算位置。
- 不改按鈕順序、圖示、文字、徽章、點擊行為。

### 14 照片拖放上傳區（CardFormDialog）
- 主照片、細節照片、淨重照片三區各自可拖放；拖到該區上方時整區亮起並顯示「放開即可加入 N 張」。
- 把三個 `onChange` handler 內的處理抽成 `addMainPhotoFile(file)`、`addDetailFiles(files)`、`addWeightFiles(files)`，選檔與拖放共用，原本的檢查（新增模式需先填料號、權限 `canEdit`、`isBusy`、選取模式中不接受）全部沿用。
- 只接受圖片，非圖片檔顯示照片錯誤訊息；主照片拖多張只取第一張。
- 對話框層級攔截 `dragover`/`drop` 預設行為（見「特別注意」第 5 點）。
- 仍走暫存機制：按儲存才上傳 Cloudinary。

---

## 第二部分：搜尋 8 項（S01–S08）

- 來源：使用者在 `specs/search-preview-picks.html`（artifact E4eAGLHm355Fsodu9A5xZV）全選 8 項，S07「亮一下」要。
- 照片牆**不加**螢光筆（使用者明確要求）。
- 螢光筆一律重用既有 `HighlightText`（`src/components/maintenance/RuleContent.tsx:17`，大小寫不分、已處理特殊字元），只 import 不修改；它目前的 4 個呼叫端（RuleRow、EquipmentListView、PackageListView、ExpandableDocumentList）不受影響。
- ⚠️ 2026-11-17 的 `65a7150`／`1ba2a0c` 才拿掉文件管理／設備組合的閃爍與自動捲動、條碼明細的定位連結與閃爍。這次 S07 的「亮一下」使用者已知情並明確要：**1 秒、只一次、不捲動、不重複**，`prefers-reduced-motion` 時不亮。文件管理／設備組合維持現狀，不加回閃爍。

### 影響範圍（CodeGraph + Grep 交叉驗證）

| 檔案 | 項目 | 呼叫端 |
|---|---|---|
| `PhotoWall.tsx`（核心保護，同第一部分） | S01–S04 | 只被首頁使用 |
| `inventory/InventoryClient.tsx` | S05、S06、S07（多傳搜尋字） | 只被 `InventoryHub.tsx` 使用，props 不變 |
| `inventory/BarcodeDrawer.tsx` | S07 | 只被 `InventoryClient.tsx` 使用；`DrawerTarget` 的 cell 模式**新增選填欄位** `query?: string`，另一個建立 cell target 的地方（`InventoryClient.tsx:425` 點表格數字）不傳、行為不變 |
| `inventory/InventoryTable.tsx` | S08 | 只被 `InventoryClient.tsx:410` 使用；Props 新增選填 `q?: string`（預設 `''`），三種檢視 `Pivot`／`PivotT`／`List` 的料號與品名都要標 |
| `inventory/ErpInventory.tsx` | S08 | 只被 `InventoryHub.tsx` 使用；內部改動 |
| `QuotesClient.tsx` | S08 | 只被 `PhotoWall.tsx:1205` 使用；內部改動 |
| `residual/ResidualItemsPanel.tsx` | S08 | 只被 `ResidualClient.tsx:163` 使用；內部改動 |
| `app/tracker/TrackerClient.tsx` | S08 | 被 `PhotoWall.tsx:1188` 與 `app/tracker/page.tsx:201` 使用；內部改動，兩處都會吃到 |
| `src/app/globals.css` | S07 | 新增一次性亮光 keyframes，既有 `tr.barcode-hit` 不改 |

### 各項規格

**S01 改用相近結果時明講（PhotoWall）**
- `filtered` 的 useMemo 內部多算一個「這次是否走模糊備援」旗標（改成回傳物件再解構，`filtered` 名稱與型別不變，`filtered` 的其他使用點——全選、封箱標籤、`GroupsPanel filteredCards`——不受影響）。
- 走模糊備援且有結果時，數量那行改為虛線框「沒有完全符合「q」的料卡，以下是相近的 N 筆」。

**S02 找不到時告訴你在別的分類有（PhotoWall）**
- 只在「有搜尋字 + 有其他篩選 + 結果 0 筆」時，算出「只套搜尋字、不套其他篩選」的筆數與分類分布。
- 顯示「目前篩選條件下找不到「q」；不限篩選有 N 筆：主機 3、鏡頭 2」＋按鈕「保留搜尋字，清除其他篩選」（新函式，**不能**用既有 `clearFilters`，它會連搜尋字一起清掉）。
- 不限篩選也是 0 筆時，維持現有「找不到符合的料卡」文案。

**S03 打字時自動捲回結果頂端（PhotoWall）**
- 搜尋字改變、且 `window.scrollY` 已超過凍結列高度時，平滑捲回最上方；`prefers-reduced-motion` 時直接跳。只在「全部料卡」分頁生效（我的關注共用同一個搜尋框，但它有自己的群組結構，不動）。

**S04 快捷鍵與手機搜尋鍵（PhotoWall）**
- 全域 `/`：在「全部料卡」或「我的關注」分頁（搜尋列可見時）、焦點不在 input/textarea/select/contenteditable、沒有開著的對話框（`[role="dialog"]`）時，聚焦並全選搜尋框。
- 搜尋框內 `Esc`：有字就清空（不關任何東西）；搜尋框加 `enterKeyHint="search"`，按 Enter 收起手機鍵盤（`blur()`）。
- 搜尋框右側顯示淡淡的 `/` 提示，聚焦或有字時隱藏；手機不顯示。

**S05 條碼命中的號碼片段加螢光筆（InventoryClient）**
- 「找到 N 筆條碼」清單的條碼欄用 `HighlightText` 標出搜尋字。

**S06 按 Enter 直接打開條碼明細（InventoryClient）**
- 有條碼命中時：預設選第一筆（淡底），↑↓ 換一筆，Enter 打開該筆明細（等同點擊）；若有一筆條碼**完全等於**搜尋字，預設選它。
- **條碼槍情境**：掃描器會快速輸入後立即送 Enter，但條碼查詢有 350ms 延遲＋API 時間，Enter 會比結果早到。做法：Enter 時若查詢還在進行，記下「要開啟」，結果回來後自動開完全符合的那筆（沒有完全符合就開第一筆）；結果為 0 筆則不做事。搜尋字再改變就取消這個待開。
- 沒有條碼命中、但品項搜尋結果只有 1 個時，Enter 打開該品項的總覽（`mode: 'item'`）。
- 提示文字「按 Enter 開啟」只在電腦寬度顯示。

**S07 條碼明細：號碼螢光筆＋進來亮一下（BarcodeDrawer）**
- 從搜尋點進來（S05/S06）時把原始搜尋字一起傳入 `DrawerTarget.query`。
- 「你搜尋的條碼」卡片號碼、置頂那一列的條碼欄，用 `HighlightText` 標出搜尋字（搜尋字是完整條碼時整串標）。
- 抽屜打開時卡片外圈柔和亮一下、置頂列底色由深轉回 `barcode-hit` 原色，各 1 秒、只一次；同一個 target 重新渲染不會再亮（以 target 物件為 key 觸發）。

**S08 其他列表補上螢光筆**
- 任務板：看板欄位卡片的標題（`TrackerClient.tsx:837`、`:894`）與卡片上的標籤；公佈欄、今日／逾期提醒不受搜尋篩選，不標。說明欄卡片上不顯示，不標。
- 人為配件報價：品名（`QuotesClient.tsx:392`）。注意此頁用 Fuse 模糊搜尋，只有連續相同的字串會被標，模糊命中的不標（不另外處理）。
- 設備殘值：品號、品名（`ResidualItemsPanel.tsx:265-266`）。
- ERP 庫存：品號、品名（`ErpInventory.tsx:189-190`）。
- 庫存主表：三種檢視的料號與品名（`InventoryTable.tsx:66/69`、`161/162`、`215/217`）；`crmNames` 會被比對但不顯示，不標。

---

## 【允許新建】
- `src/hooks/useFlipAnimation.ts`
- `src/components/EquipmentCardRow.tsx`
- `src/components/UndoToast.tsx`
- 若 04 的星號要給卡片與清單列共用：`src/components/BookmarkStar.tsx`

## 【允許修改】
- `src/components/PhotoWall.tsx`（核心保護，使用者已確認）
- `src/components/EquipmentCardItem.tsx`（核心保護，使用者已確認）
- `src/components/CardDetailDialog.tsx`（核心保護，使用者已確認）
- `src/components/CardFormDialog.tsx`（核心保護，使用者已確認）
- `src/components/GroupsPanel.tsx`
- `src/app/globals.css`（僅新增 keyframes，不改既有規則）
- `src/components/inventory/InventoryClient.tsx`、`BarcodeDrawer.tsx`、`InventoryTable.tsx`、`ErpInventory.tsx`
- `src/components/QuotesClient.tsx`、`src/components/residual/ResidualItemsPanel.tsx`、`src/app/tracker/TrackerClient.tsx`

## 【禁止觸碰】
- `src/app/page.tsx`、`BatchImportDialog.tsx`
- `src/components/maintenance/RuleContent.tsx`（`HighlightText` 只 import 不改）
- `src/components/packages/*`、`src/components/documents/*`、`DocumentsClient.tsx`、`PackagesClient.tsx`
- 所有 API routes、資料庫、`src/types/*`

## 完成標準
- `npm run build` 通過
- 針對改動檔案另跑 `npx eslint <檔案...> --no-eslintrc --config .eslintrc.json --parser-options=project:tsconfig.json`（worktree lint 盲點）
- 新增檔案後 `codegraph sync`
- 實機驗證：桌機＋手機寬度（375px）各跑一次 9 項情境；`prefers-reduced-motion` 下不出現動畫
