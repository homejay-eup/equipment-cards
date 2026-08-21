# CLAUDE.md — 設備料卡管理系統（D 型專案執行）

此檔案供 Claude Code 全程使用，涵蓋討論、決策、執行委派、文件維護。
實際程式執行由子 Agent 負責（`.claude/agents/`）。

---

## 專案規格

- **產品名稱**：設備料卡管理系統（Equipment Cards）
- **核心功能**：部門設備照片牆與管理後台，取代過大的 Excel 設備清單
- **目標使用者**：公司內部 @eup.com.tw，10–50 人，786 筆料卡
- **最在意的面向**：使用體驗 + 維護便利性

### 技術架構

- **前端**：Next.js 14 App Router + Tailwind CSS + shadcn/ui + Fuse.js
- **資料庫/Auth**：Supabase（PostgreSQL + Google OAuth + RLS）
- **照片儲存**：Cloudinary（免費 25GB，`dnqtafoh6`）
- **部署**：Vercel Hobby（`equipment-cards` 專案，push 即自動部署）
- **選型原因**：Supabase 免費且不需信用卡；Cloudinary 25GB 比 R2 10GB 大；Vercel + Next.js 同廠商零障礙
- **排除選項**：Cloudflare R2（需信用卡，10GB 上限）、Firebase（比 Supabase 複雜）

### 服務帳號速查

| 服務 | 網址 / 識別 |
|------|------------|
| **GitHub** | https://github.com/homejay-eup/equipment-cards |
| **Vercel** | https://vercel.com/hjs-projects-bc94d0b2/equipment-cards |
| **Supabase** | 專案 `ntapfguwmuufnlafroxs` |
| **Cloudinary** | Cloud Name: `dnqtafoh6` |
| **線上網址** | https://equipment-cards.vercel.app |

### 專案結構

```
設備料卡/
├── CLAUDE.md                          ← 本檔案
├── middleware.ts                      ← 路由保護（cookie 檢查）
├── .env.local                         ← 環境變數（勿 commit）
├── .claude/
│   └── agents/                        ← 子 Agent 定義
│       ├── frontend.md
│       ├── data.md
│       ├── tester.md
│       └── reviewer.md
├── _管理/
│   ├── 00_專案索引.md                 ← 必讀：步驟狀態總覽
│   ├── 00_方案紀錄.md                 ← 按需讀：決策依據
│   ├── 00_執行紀錄.md                 ← 按需讀：試做結果
│   ├── 00_待整理清單.md               ← 暫存用
│   └── 01_equipment-cards/
│       ├── 00_專案概覽.md             ← Step 清單與狀態
│       ├── specs/                     ← 功能規格文件
│       └── archived/                  ← 舊版步驟冊
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                   ← 首頁（驗證 session + 查詢角色）
│   │   ├── globals.css
│   │   ├── login/page.tsx
│   │   ├── auth/callback/route.ts
│   │   ├── admin/users/               ← 帳號管理
│   │   └── api/
│   │       ├── upload/                ← 照片上傳/刪除
│   │       └── cards/                 ← 料卡 CRUD
│   ├── components/
│   │   ├── PhotoWall.tsx              ← 主頁（搜尋+篩選+網格）
│   │   ├── EquipmentCardItem.tsx      ← 單張卡片縮圖
│   │   ├── CardDetailDialog.tsx       ← 細節 Lightbox（照片輪播）
│   │   ├── CardFormDialog.tsx         ← 新增/編輯料卡 Dialog
│   │   ├── BatchImportDialog.tsx      ← CSV 批次匯入
│   │   ├── ConfirmDialog.tsx          ← 破壞性操作確認
│   │   ├── UserMenu.tsx               ← Header 右上角
│   │   └── ui/                        ← shadcn/ui 元件
│   ├── hooks/usePhotoUpload.ts
│   ├── lib/
│   │   ├── supabase-server.ts
│   │   ├── supabase-browser.ts
│   │   ├── admin.ts                   ← requireAdmin() / getUserRole()
│   │   └── utils.ts
│   └── types/equipment.ts             ← EquipmentCard / AppSettings 型別
├── _開發檔案/scripts/                 ← 一次性輔助腳本
└── 設備線材_照片Jason/                ← 分類資料夾（本機，不進 git）
```

### 目前進度

- **已完成**：Step 1–29、31（2026-04-27 至 2026-07-08，含 Step 31 後續兩項高風險修復＋功能實測皆已驗證通過，詳細清單見 `_管理/01_equipment-cards/00_專案概覽.md`）
- **進行中**：Step 30（文件（規格書）管理架構重整：資料正規化 + Google Drive Service Account，完整規格見 plan 檔案 `C:\Users\EupUser\.claude\plans\merry-imagining-pumpkin.md`）
  - ✅ 階段 0：Google 端手動設定（共用雲端硬碟、Service Account、Vercel 環境變數 `GOOGLE_SERVICE_ACCOUNT_JSON`/`GOOGLE_DRIVE_FOLDER_ID`）
  - ✅ 階段 1：`documents`/`card_documents` 正規化資料表 + API routes（`src/app/api/documents/`）
  - ✅ 階段 2：`step30-documents-normalize.sql` 已執行（正式 172 筆）；`upload-spec-books.py` 已改寫為直接寫入新表；`--dry-run` 驗證乾淨（87 個有效條目、0 筆待上傳）；過程中發現並修正 `A++規格書料號對照表.csv` 5 筆過時/錯誤料號對應（詳見 `_管理/00_執行紀錄.md` 「Step 30 階段2」條目）
  - ✅ 階段 3：`frontend` agent 改寫 `CardFormDialog.tsx` 文件區塊完成（新增 `useDocumentUpload.ts`、`GET /api/documents?equipment_id=`）
  - ✅ 階段 4：`npm run build` 通過；`tester` 因登入牆改用程式碼追蹤驗證通過；`reviewer` 抓到 2 High + 2 Medium 皆已修正（詳見 `_管理/00_執行紀錄.md` 「Step 30 階段3+4」條目）
  - ✅ 使用者實測回饋修正（2026-07-13）：正式站實測發現 3 點問題（Drive 看不出料號歸屬、刪除警示但實際未刪除、文件異動不受取消/儲存控制），已對焦決策並修正：上傳同名文件跳提示、誠實回報 Drive 刪除結果、文件異動全面改為暫存到按儲存才生效（詳見 `_管理/00_執行紀錄.md` 「Step 30 使用者實測回饋修正」條目）
  - ✅ Drive 刪除永久失敗根因診斷 + 修正（2026-07-13）：查證確認 Service Account 只有「內容管理員」權限（`canTrash:true`／`canDelete:false`），`files.delete()` 一律失敗（回 404 非 403）。改為搬移到新建的「_待清除文件」資料夾（ID `1u38kmLRsM0fD2KHZXQgfJ7vMc1jvcR0C`，已加入 `.env.local`/Vercel Production 環境變數 `GOOGLE_DRIVE_PENDING_DELETE_FOLDER_ID`），交由人工定期判斷是否真的清除（詳見 `_管理/00_執行紀錄.md` 「Drive 刪除永久失敗根因診斷」條目）
  - ⏳ **待辦**：使用者再次實測移除文件，確認能顯示「文件已完全刪除」不再跳 Drive 清除失敗警告（已 commit/push）
  - ✅ **2026-07-14 Step 30b 文件管理功能——第一版執行完成**：規格 `_管理/01_equipment-cards/specs/step30b-document-management.md`，依序委派 `data` → `frontend` → `tester` → `reviewer`，過程中回頭修正 3 輪（權限降級反查、批次內查重 closure bug、pending 移除/版本更新互斥）。`CardFormDialog` 支援多選上傳、同名二選一（取代／先刪除再上傳）；新增「文件管理」頁籤（比照「任務板」「人為配件報價」掛在 `PhotoWall.tsx`），新增獨立 permission key `manage_documents`（已在正式 Supabase 授予管理員角色）。完整過程見 `_管理/00_執行紀錄.md` 對應條目。
  - ✅ **2026-07-15 Step 30b 第二輪優化（使用者實測回饋）——已執行完成**：6 項回饋逐一討論收斂後委派執行，過程中 1 輪回頭修正，`reviewer` 直接修正 2 項（CSV 公式注入防護、過時權限說明文字）。重點變動：
    1. **拿掉「文件目錄表」Google Sheet 自動同步機制**（使用者確認業務可直接登入網站查看文件，不再需要「不登入網站看 Drive 歸屬」這個情境）——刪除 `regenerate-index` route、`googleDrive.ts` 的 Sheets 相關程式碼，改為純前端「匯出 CSV」按鈕（`GOOGLE_DRIVE_ROOT_FOLDER_ID` 環境變數保留但不再被讀取，無需移除）
    2. 文件清單改為**依文件／依料號雙視圖**（純前端反向分組現有資料，無新 API），支援排序、展開/摺疊、新增掛載（料卡或文件）、取消掛載（沿用「最後一個關聯即整個刪除」保護），批次選取/刪除維持不變
    3. `DocumentsClient.tsx` 從 623 行拆成 `src/components/documents/` 底下 6 個子元件
    4. 同名/受影響料卡確認框補上警語、改用可捲動的 `detail` prop、逐行顯示；批次上傳補齊料卡清單數量提示與文件類型設定入口
    - **非阻塞待辦**：手機版 `EquipmentQuickPick` 下拉選單是否會跟 `overflow-x-auto` 產生巢狀捲動，待部署後實機驗證；`manage_documents`／`edit_card_documents` 是兩個獨立權限彼此不隱含，角色設定時建議兩者一起給
    - **commit 狀態**：已 commit + push（`9312f02`）。先前顧慮的「Step 30b/33 檔案交錯無法乾淨分開 commit」問題，其實已在另一個 session 處理完畢（`6bb4750`／`8a6f0cb`／`6f0ca3a` 三個 commit 依序完成 Step 30b 第一版、Step 33、整合共用檔案），非真的卡住
  - ✅ **2026-07-15 Step 30b 第三輪優化：批次新增/取消掛載——已執行完成**：使用者部署後實測反映「新增掛載料卡」「挑選既有文件」是單選、「取消掛載」逐筆執行且每筆都重新整理整份清單。先對焦確認需求（依文件/依料號兩視圖都要），CodeGraph + Grep 確認影響範圍侷限 `EquipmentQuickPick.tsx`/`AddDocumentToCard.tsx`/`ExpandableDocumentList.tsx` 3 個檔案後才執行。改為打勾複選＋批次送出，`computeUnlinkPlan()` 判斷批次裡哪些會導致文件整個被刪除、哪些只是解除關聯，全部處理完只重新整理一次。`reviewer` 抓到 1 個 High（判斷用的快照可能過期導致誤判成「安全」，其實文件已被刪除，改為事後比對 `unlink()` 實際回傳結果補警示）+ 1 個 Medium（`busyIds` 鎖定漏了一處），皆已直接修正。build 通過，尚未 commit。
- ✅ **Step 34（2026-07-20，與 Step 30/32 並行、互不觸碰對方檔案）**：設備套餐（部門共享群組）功能——已執行完成並上線。規格見 `_管理/01_equipment-cards/specs/step34-equipment-packages.md`（4 個獨立 permission key、部門歸屬與隔離比照追蹤版、名稱唯一性+內容重複偵測、我的關注↔套餐一次性複製+手動對齊機制、套餐複製、依套餐/依料號雙視圖+清單/照片顯示切換、批次分享部門/批次掛載）。依 `data`→`frontend`→`tester`→`reviewer` 標準順序委派，`reviewer` 抓到 2 個必須修正的資料完整性問題（批次分享部門的「先刪後插」非原子操作、「一個群組最多連結一份套餐」的併發競態）+ 6 個建議修正，皆已修正並經主 session 覆核程式碼確認正確。`_開發檔案/sql/step34-equipment-packages.sql` 已在正式 Supabase 執行並驗證。已 commit/merge/push main 部署上線。
  - **2026-07-20 使用者實機測試後第二輪優化——已執行完成**：實機驗證後回報 4 點使用回饋 + 1 個不相關的既有 bug，皆已對焦收斂後執行：① `/packages` 從獨立路由改為內嵌分頁（比照任務板/人為配件報價/文件管理，改動 `src/app/page.tsx`＋`PhotoWall.tsx` 這兩個核心保護元件，事前已明確跟使用者確認範圍），`src/app/packages/` 路由已刪除；② `GroupsPanel.tsx` 群組標題列 hover 編輯按鈕從絕對定位改為 flex 版面佔位，修正跟對齊徽章重疊；③ 套餐照片/網格模式補上跟清單模式對等的批次取消掛載；④ 分享至部門成功後新增 toast 提示＋列表即時同步；⑤（不同系統，另外分開 commit）主頁次級篩選改用精確 `includes` 比對取代 Fuse 模糊搜尋，修正「MDVR-4G-2鏡」誤篩選出「MDVR-4G-8鏡」的 bug。全程依使用者要求在委派 prompt 中明確要求走 CodeGraph blast radius 流程；`reviewer` 僅抓到 2 個小建議（未使用的 `userEmail` prop、toast 缺 `aria-live`）已由主 session 直接修正。兩輪改動分開 commit/merge/push main（`4db46cc`、`205ad20`）。
  - **2026-07-20 分頁內嵌化副作用修正**：第二輪優化把設備套餐改成內嵌分頁（首次進入才 mount、之後 CSS 隱藏保留 state）後，使用者發現在「我的關注」複製/對齊套餐後切回設備套餐分頁看不到最新結果，要整頁重新整理才會出現。原因是套餐資料只在首次 mount 時抓一次。修法：`PackagesClient.tsx` 新增 `isActive` prop（`PhotoWall.tsx` 傳入 `activeTab === 'packages'`），新增 `useEffect` 依 `isActive` 變化重新抓取本部門/分享套餐清單，涵蓋所有「切回這個分頁」的情境（不限於複製/對齊這一種來源）。單檔小改動主 session 直接處理，未委派。commit `011f5fa`，merge 後 main `660dbbd`。
  - **2026-07-20 第三輪優化：主搜尋精確度＋次級篩選拖拉排序——已執行完成**：使用者實機測試後再回報 2 點（跟套餐無關的既有系統）：① 主搜尋列模糊搜尋範圍太寬（例如「MDVR-4G-4鏡」誤搜出「HS 4G-DVR」），先列 3 個方案（精確優先+模糊備援／多詞 AND／單純調緊參數）讓使用者選，選定「精確比對優先，模糊當備援」——`PhotoWall.tsx` 的 `filtered` 非數字查詢分支改成兩階段：先用 `includes()` 比對料號/品名/標籤/廠商/分類，有結果就只用精確結果，完全沒結果才 fallback 回 Fuse；② 次級篩選標籤編輯區塊新增拖拉排序（比照 `QuotesClient.tsx` 現成的分類拖拉排序寫法，原生 HTML5 drag events，`category_subfilter_tags` 表已有 `sort_order` 欄位、PUT API 本就整包覆蓋儲存，不需改資料庫/API）。`tester` 驗證通過，`reviewer` 抓到 2 個非阻塞建議（搜尋結果文案仍寫死「模糊搜尋」跟精確命中不符、拖拉排序用 `indexOf(tag)` 若有重複標籤字串會抓錯位置）皆由主 session 直接修正（文案改中性用詞、拖拉排序改用 index 記錄來源/目標而非標籤字串本身）。commit/merge/push main（`c507d9b`）。
- **Step 32（新增，與 Step 30 並行、互不觸碰對方檔案）**：報價查詢功能，規格見 `_管理/01_equipment-cards/specs/step32-quote-lookup.md`。程式碼已完成、`npm run build` 通過、已補一次獨立安全審查並修正發現的問題，正式 Supabase 已執行 `_開發檔案/sql/step32-quote-items.sql`、`step32b-quote-items-sort-order.sql`（建表、預設分類、管理員權限授予、拖拉排序欄位），並匯入 88 筆初始報價資料（來源：配件報價2023-08.pdf），功能已由使用者本機實測確認（含一般人員視角、拖拉排序、分類管理）。
- **Step 16 補充說明**：曾誤認為「Phase 2 批次淨重照片待照片提供」仍卡著，經查 commit（`9ba80cb`）與資料快照確認，淨重欄位/照片/批次匯入功能皆已完成，淨重數值也已批次回填 770/786 筆，非阻塞待辦
- **2026-08-13 拖曳排序指示線改為真上/下判斷——已執行完成**：人為配件報價／我的關注／設備套餐三頁面＋任務板共 6 個拖曳排序互動點，從整圈 ring 高亮或永遠插在目標上方，改成依游標懸停上/下半（或左/右半）動態顯示插入指示線；新增共用 `src/lib/dragReorder.ts`，底層排序邏輯也改成明確依 before/after 插入（取代原本依 fromIdx/toIdx 大小關係決定方向的隱性行為）。`frontend`→`tester`→`reviewer` 皆通過，無阻塞問題。詳見 `_管理/00_執行紀錄.md`「拖曳排序指示線改為真上/下判斷」條目。commit/merge/push main（`d99e619`／`d9e1dda`）。
- **2026-08-13 我的關注/設備套餐清單列補齊滑鼠懸停回饋——已執行完成**：群組標題列、套餐標題列/套餐內料卡列、依料號料號群組列/套餐掛載列，補上跟既有「我的關注」群組內料卡列一致的 hover 浮起效果（淡背景+陰影+微上移），純 className 調整。主 session 直接處理，執行前疏漏了 CodeGraph blast radius 檢查（憑經驗判斷風險低就跳過），使用者提醒後補做確認三個元件皆只有唯一呼叫端、無漏改，之後要記得先做這步再動手。詳見 `_管理/00_執行紀錄.md` 對應條目。commit/merge/push main（`855efa6`／`9ad04a9`）。
- **2026-08-15 Step 38：新增維修資訊管理功能——已執行完成，待正式 Supabase 執行 SQL + 授權**：把使用者提供的 Google Sheets「廠商維修品送修資訊」（廠商送修特別事項／海外廠商地址／主機配件報廢條件 3 個分頁，內容雜亂含自由文字、修正歷史、嵌入照片/表格）整合進系統。規格見 `_管理/01_equipment-cards/specs/step38-maintenance-info.md`（原規劃編號 Step 35 因撞上另一 session 的套餐批次替換功能改為 38）。設計：以廠商為主的獨立頁籤（比照任務板/報價/文件管理掛在 `PhotoWall.tsx`），廠商內依料號分組展示規則（送修規則/保固說明/報廢條件/其他），規則↔料號多對多掛載（比照 `card_documents`），6 個月未更新/未確認自動提示「建議覆核」、可人工標示「已確認最新」，新增獨立權限 `manage_maintenance_info`，`CardDetailDialog` 補一個「查看維修資訊」最小連結入口。**批次匯入功能明確暫緩**（使用者要求先不做，第一版靠手動 UI 建立），已請背景 agent 讀完整份 Google Sheets 草擬成匯入草稿 CSV（135 筆規則列、約 25 家廠商，含待確認註記）存於 `_開發檔案/scripts/step38-maintenance-info-draft.csv` 供之後參考，尚未使用。依 `data`→`frontend`→`tester`→`reviewer` 標準順序委派（`frontend` 中途因背景任務 stall 中斷一次，檢查後接續完成未重工），`reviewer` 抓到 1 個 High（規則掛載/移除料號失敗時前端未讀取 API 警告訊息，形同對使用者說謊）已直接修正；主 session 事後再把掛載失敗提示從 `alert()` 優化成套餐分享同款的輕量 toast。完整過程見 `_管理/00_執行紀錄.md` 對應條目。已 commit/merge/push main（`16a177f`／`6cb4e6f`）。
  - **待辦更新**：① `step38-maintenance-info.sql` 使用者已於正式 Supabase 執行成功（3 張表建立完成）；② 角色權限授予、③ 實機測試待確認
  - **2026-08-17 Step 39：使用者實測回饋修正——已執行完成，待正式 Supabase 執行新 SQL**：實機測試後回報「標示已確認最新」導致整頁重整+規則收合的 UX bug、日期選擇器風格不一致、欄位語意需改名「適用進貨日期（起）」、新增保固期間欄位（月/年切換）需求。規格見 `_管理/01_equipment-cards/specs/step39-maintenance-followup-fixes.md`。根因：`MaintenanceInfoClient.tsx` 每次背景刷新都觸發全畫面 loading + 從零重算展開狀態，改成只有「切換廠商」才重算（`isSwitch` 參數 + ref 追蹤）；日期欄位改用既有 `DatePicker.tsx`（任務板同款，Step 38 執行時漏用）；新增 `warranty_period_months` 欄位＋共用格式化函式 `formatWarrantyPeriod()`。過程中為解決 client component 誤觸 `next/headers` 邊界的 build 錯誤，把純函式從 `maintenance.ts` 拆到新檔 `maintenanceFormat.ts`。`reviewer` 補上保固期間三層上限防禦（API+表單+DB CHECK constraint，100 年）。依 `frontend`→`tester`→`reviewer` 委派，全數通過無阻塞問題。完整過程見 `_管理/00_執行紀錄.md` 對應條目。
  - **待辦（需使用者手動執行）**：① 把 `_開發檔案/sql/step39-maintenance-warranty-period.sql` 在正式 Supabase 執行（`maintenance_rules` 加 `warranty_period_months` 欄位+CHECK constraint）；② 到角色管理頁面把 `manage_maintenance_info` 權限授予需要的角色；③ 實機測試維修資訊分頁與料卡細節頁入口
- **目前 git HEAD**：`e15c921`（Step 39 維修資訊管理實測回饋修正，已 push main，Vercel 應已自動部署；`step39-maintenance-warranty-period.sql` 尚未在正式 Supabase 執行）
- **承接待辦（尚未執行，來自上一次對話，非本次任務）**：設備套餐頁面補齊跨套餐批次替換功能，範圍已定案（詳見 `_管理/00_方案紀錄.md` 2026-08-12／2026-08-13 共三條條目），CodeGraph 調查與委派尚未進行。
- **2026-08-21 Step 40：管理頁面收斂為首頁「系統管理」分頁——已執行完成，待 commit/push**：`/admin/users`／`/admin/roles`／`/admin/departments`／`/admin/analytics` 4 個獨立路由整頁 Loading 困擾，收斂成首頁「系統管理」分頁 + 內部橫向子分頁（帳號管理/角色管理/部門管理/使用統計），子分頁權限判斷與使用統計版面完全沿用現況。規格見 `_管理/01_equipment-cards/specs/step40-admin-tabs.md`。依 `data`→`frontend`→`tester`→`reviewer` 標準順序委派，`tester` 抓到 1 個必須修正（4 個 Panel 原本用 `key={version}` 強制 remount 保持資料最新，會把使用者切分頁時把 `RolesManager`/`UserManagementTable`/`DepartmentsManager` 正在編輯的草稿靜默清空，跟 Step 39 修過的同一類 bug）+ 2 個非阻塞建議（死連結 fallback、殘留返回箭頭），皆已修正——改成 `useEffect(() => setX(initialX), [initialX])` 只同步資料清單本身，比照既有 `DocumentsClient.tsx` 模式。`reviewer` 通過，提出 2 項非阻塞技術債（並發覆蓋風險本來就存在非本次引入、4 個 Panel 重複邏輯可抽共用 hook）不處理。核心保護元件 `PhotoWall.tsx` 異動已事前跟使用者確認範圍（新分頁按鈕+標題列徽章行為改變）。`npm run build` 通過，舊 4 個路由已刪除。完整過程見 `_管理/00_執行紀錄.md` 對應條目。**尚未 commit/push**（工作目錄有一批跟本次無關的既有未追蹤檔案，commit 時需限定只加入本次異動檔案）。
- **重要**：Step 20 執行時必須嚴守 `_管理/01_equipment-cards/specs/step20-tracker.md` 的「⛔ 核心保護原則」，現有版面功能風格一律不得改動

### CodeGraph 工作規範（強制）

本專案已安裝 **CodeGraph**（`npm i -g codegraph`），並設定為 Claude Code MCP server。

**換機器時的初始化步驟**：
```bash
npm install -g codegraph
cd 設備料卡
codegraph init        # 建立索引（約 2–3 秒）
# ⚠️ 用 CCD（Claude Desktop App）時必須用 claude mcp add，不能用 codegraph install
claude mcp add --scope user codegraph -- codegraph serve --mcp
# 重新開啟 session 讓 MCP tools 生效
```

> **背景**：`codegraph install` 把設定寫入 `~/.claude/settings.json`（舊格式），但 CCD 只讀 `~/.claude.json`（新格式）。`claude mcp add --scope user` 才是正確路徑。

**這是預設行為，不需要使用者每次提醒才執行。** 每次要修改程式碼前，主 session 要主動照下面流程走，不要等使用者說「記得用 CodeGraph」才做。

⚠️ **worktree 注意事項**：每個 git worktree 是獨立目錄，`.codegraph/` 索引不會跨 worktree 共用。換一個新 worktree 第一次用 CodeGraph 前，先確認 `.codegraph/` 是否存在；不存在的話要先 `codegraph init` 建索引，否則 `codegraph_explore`/`codegraph_search` 會查不到東西、或回傳其他目錄的舊內容而不自知。若查詢結果跟實際檔案內容對不上（例如 Read 出來的內容跟 codegraph_explore 顯示的不同），視為索引失準，直接改用 Grep 驗證，不要採信 codegraph 的結果。

**每次修改 code 前的強制流程**：
1. 用「功能描述」呼叫 `codegraph_explore` → 找出要改的 symbol 名稱
2. **確定 symbol 後，再用 symbol 名稱呼叫 `codegraph_explore`** → 取得 caller 清單（blast radius）
   - ⚠️ 步驟 1 是「探索理解」，步驟 2 才是「blast radius check」，兩者目的不同，不可合併
   - ⚠️ 用功能描述查詢不等於 blast radius check，即使結果看起來已經夠用
3. **用 `Grep` 交叉驗證**：搜尋 symbol 名稱確認實際使用點，與 codegraph 結果比對
   - 指令範例：`Grep: <ComponentName` 或 `Grep: import.*ComponentName`
   - ⚠️ codegraph 對 JSX `<Component>` 呼叫的追蹤有盲點，Grep 是必要的安全網
   - 若兩者有落差，以 Grep 結果為準，補查遺漏的檔案
4. 逐一確認每個 caller 是否需要同步修改，**明確列出「需改 / 不需改」的理由**
5. 將所有受影響的地方一起改完
6. `npm run build` 驗證
7. 若有新增/刪除檔案，執行 `codegraph sync` 更新索引

**原因**：多次出現「改A壞B」前例（如新增 permission key 只改 UI、未同步更新 API 白名單）。CodeGraph 有時漏報 JSX component caller（已驗證），Grep 作為補充確保不遺漏。「用功能描述探索」與「用 symbol 名稱查 caller」是兩個不同步驟，前者不能取代後者。

---

### 規範與約定

- 命名規則：TypeScript 檔案 `PascalCase`（元件）/ `camelCase`（hooks/lib）
- UI 語言：繁體中文
- 主題色：`#7a5230`（木質暖棕）、背景 `#faf6f0`、強調 `#c49a72`
- **不要動的東西**：`.env.local`（含所有金鑰）、`設備線材_照片Jason/`（原始資料）

#### 核心既有元件保護原則（強制）

**這條規則是針對「新功能實作」的範圍限制，不是永久凍結。** 若有新需求或優化要調整現有元件，在該 Step 的規格中明確說明即可。

新功能實作時，**未在規格中明確列出的既有元件一律不得修改**：

| 元件 | 說明 |
|------|------|
| `src/components/PhotoWall.tsx` | 主頁照片牆 |
| `src/components/EquipmentCardItem.tsx` | 卡片縮圖 |
| `src/components/CardDetailDialog.tsx` | Lightbox |
| `src/components/CardFormDialog.tsx` | 新增/編輯料卡 |
| `src/components/BatchImportDialog.tsx` | CSV 匯入 |
| `src/app/page.tsx` | 首頁入口 |

**允許的最小侵入**（需在規格中明確列出）：
- 加新 prop，且必須有預設值不破壞現有呼叫端
- 加一個入口連結或圖示，不改變版面結構

**未列在規格的既有元件，禁止**：
- 改 className / 樣式
- 改現有 handler 邏輯
- 改 layout 結構
- 新增影響既有功能的 state

**新功能優先走獨立路由**：新頁面開新路由（如 `/tracker`、`/groups`），現有頁面只加一個入口連結，不動內部邏輯。

#### 根目錄使用原則

根目錄只允許：
- 設定檔（`package.json`、`next.config.mjs`、`tsconfig.json`、`.env.local` 等）— **必須在根目錄**
- `src/`、`public/`
- `CLAUDE.md`、`.claude/`
- `_管理/`、`_開發檔案/`

#### 檔案放置規則

| 類型 | 位置 |
|------|------|
| 頁面 | `src/app/`（路徑即 URL，不可移動） |
| 共用元件 | `src/components/` |
| shadcn/ui | `src/components/ui/` |
| 自訂 hooks | `src/hooks/` |
| 工具/API Client | `src/lib/` |
| TypeScript 型別 | `src/types/` |
| API Routes | `src/app/api/` |
| 一次性腳本 | `_開發檔案/scripts/` |
| Schema SQL | `_開發檔案/sql/` |
| 規格文件 | `_管理/01_equipment-cards/specs/` |
| **不確定時** | 停下來問，不擅自建立新資料夾 |

### 完成標準

- 每個功能完成後 `npm run build` 必須通過
- 不確定時先問，不要自行假設
- 照片操作採暫存機制（按儲存才呼叫 Cloudinary API）
- 破壞性操作必須使用 `ConfirmDialog`，不用原生 `confirm()`
- **PR 合併前**：主 Agent 必須列出所有**修改過的既有檔案**，每個改動說明理由；若有核心保護元件被改動，必須先取得使用者確認才能繼續

### 已知問題 / 技術債

- `useSearchParams()` 必須包在 `<Suspense>` 內（否則 build 失敗）
- 三元運算式不能當 statement（ESLint `no-unused-expressions`，已踩過 3 次）
- shadcn/ui Popover 在 overflow:hidden 父容器需改 fixed 定位
- Fuse.js 純數字查詢要走 `includes`，不走模糊算法
- **⚠️ worktree 內 `npm run build` 驗不出 ESLint error（結構性盲點，已踩坑一次）**：本專案的 git worktree 位於 `設備料卡/.claude/worktrees/...`，往上層目錄另有 `.eslintrc.json`，兩者的 `@next/next` plugin 定義衝突，導致 `next build` 的 lint 階段直接放棄執行（build 尾端會出現 `⨯ ESLint: Plugin "@next/next" was conflicted between ...` 這行），因此**本機 build 就算 exit 0 也不代表 lint 乾淨**。Vercel 從乾淨 checkout 建置時 lint 正常執行，才會抓到 error 導致 production build 失敗。
  - **對策**：在 worktree 內完成程式碼後、push 到 main 前，針對本次「新增/修改的檔案」額外跑一次繞過巢狀設定的 lint：
    `npx eslint <改動的檔案...> --no-eslintrc --config .eslintrc.json --parser-options=project:tsconfig.json`
    確認 `No issues found` 再 push；委派 `tester`/`reviewer` 時也要明確要求做這一步，不要只依賴 `npm run build` 的結果。

---

## 此次任務（每次新對話時更新，執行完後清空）

**主題**：任務板功能優化（暫定 Step 41）——關鍵字搜尋 + 更新紀錄支援貼圖/貼表格。

**已定案範圍**：
1. `TrackerClient.tsx` 篩選列新增關鍵字搜尋框，比對標題+說明+標籤，前端過濾現有 state，不需新 API
2. 更新紀錄（`issue_updates`）從純文字變成「文字＋可選圖片(可多張)＋可選表格」複合留言——不動「說明」欄位，貼圖/貼表格定位在更新紀錄（本來就是按時間序列附加的機制），取代原本考慮過的「說明欄位改 rich text 編輯器」重工方案
3. 表格採**真表格渲染**（結構化資料存成列×欄，非簡易文字表格）
4. 圖片縮圖可點擊放大：新增獨立輕量放大檢視元件，**不**沿用核心保護元件 `CardDetailDialog`（用途是料卡照片輪播，不適合）
5. 更新紀錄輸入行為從「離開欄位（`onBlur`）自動儲存」改成「明確送出按鈕」，**純文字更新也一併改動**（理由：圖片上傳非同步、表格需使用者確認解析結果，跟自動儲存衝突；兩套邏輯並存的複雜度成本高於「多按一下」）

完整規格見 `_管理/01_equipment-cards/specs/step41-tracker-search-attachments.md`；討論過程見 `_管理/00_方案紀錄.md` [2026-08-21] 條目。討論過程中先用 `mcp__visualize__show_widget` 畫搜尋框+複合留言介面預覽給使用者確認後才進入規格文件。

**尚未執行**：CodeGraph blast radius 調查（`issue_updates`／`IssueUpdate`／`handleSubmitUpdate`／`IssueExpandedContent`／`useIssueRealtime.ts`）+ Grep 交叉驗證，確認影響範圍後才進入委派（`data`→`frontend`→`tester`→`reviewer`）。

---

## 啟動行為

每次對話開始時：

1. 依優先順序讀取常駐檔：
   - **必讀**：`_管理/00_專案索引.md`、`_管理/01_equipment-cards/00_專案概覽.md`
   - **按需讀**：`_管理/00_方案紀錄.md`、`_管理/00_執行紀錄.md`
   - **暫存用**：`_管理/00_待整理清單.md`
2. 讀取「專案規格」與「此次任務」區塊
3. 簡要告知目前進度（走到第幾步、各步驟狀態、上次執行結果）
4. 詢問本次要做什麼

---

## 工作流程

1. **啟動** → 讀常駐檔、報告進度、確認本次任務類型
2. **腦力激盪階段**（主 session，不委派子 Agent）：
   - 模糊概念 → 列選項優缺點後收斂
   - 已有具體方案 → 評估優缺點，提出替代做法
   - 技術選型 → 列選項優缺點與成本，確認後更新「技術架構」
3. **逐步引導討論**：每次只問一個問題
4. 討論告一段落時主動詢問：「要把以上討論整理並更新到常駐檔嗎？」確認後更新
5. **執行前** → 提出「步驟結構與執行摘要」，確認後才委派子 Agent
6. **委派執行** → 依任務類型呼叫對應子 Agent
7. 執行結果有問題 → 依迭代規則處理

---

## 子 Agent 委派規則

| 任務類型 | 委派給 | 備註 |
|---|---|---|
| UI 元件、頁面、前端邏輯、樣式 | `frontend` | 告知相關檔案路徑與規格文件 |
| Supabase Schema、API Routes、RLS | `data` | 告知 schema 與操作需求 |
| Build 驗證、功能情境 | `tester` | 告知要測試的功能與完成標準 |
| Code Review、安全性、效能審查 | `reviewer` | tester 通過後呼叫 |

**標準執行順序（新功能）**：
```
frontend／data 執行 → tester 驗證 → reviewer 審查 → 主 Agent 整合回報
```

**委派時必須在規格中明確列出**：
- `【允許新建】`：列出所有新增的檔案路徑
- `【禁止觸碰】`：列出所有不得修改的既有檔案（預設包含核心保護元件）

**不委派的情況**：
- 小幅修改（單檔、10 行以內）
- 純文件更新（常駐檔、.md）

---

## 迭代規則（三類）

**類型 1：當前步驟重來**
1. 舊版移入 `_管理/01_equipment-cards/archived/`
2. 分析原因，記入 `00_執行紀錄.md`
3. 調整做法，重新委派

**類型 2：前步驟決策改變**
1. 確認哪個步驟的決策要改
2. 版號 +1，舊版 archived
3. 確認受影響步驟需要重跑的範圍

**類型 3：整個方案推翻**
1. 所有步驟冊移入 `archived/`
2. 更新方案紀錄與執行紀錄
3. 重新討論，產出新方案

---

## 常駐檔寫入規則（強制）

1. **先讀再寫**：寫入前必須先讀取現有內容，比照格式繼續寫
2. **只能追加**：只能在檔尾追加新條目，不允許重寫整個檔案
   - 例外 1：狀態類欄位允許就地修改
   - 例外 2：使用者明確要求重寫
3. 格式不一致時停下來問

---

## 完成後動作（依序執行）

1. 輸出回報格式（給使用者看）
2. 將執行結果追加至 `_管理/00_執行紀錄.md`
3. 清空「此次任務」區塊，還原為空白模板
4. 更新「目前進度」

**回報格式**：
```
## 執行結果

- 完成項目：
- 產出檔案：（列出所有新建或修改的檔案）
- 遇到的問題：
- 不滿意的點：（若有）
- 建議下一步：
- 已更新常駐檔：
```

---

## CoreBrain 連接

### 路徑宣告

```
知識庫根目錄：  C:\Users\jay10\.claude\CoreBrain\
設備料卡實體：  C:\Users\jay10\.claude\CoreBrain\wiki\entities\equipment-cards-system(設備料卡管理系統).md
Bug 百科：     C:\Users\jay10\.claude\CoreBrain\wiki\analyses\equipment-cards-bugs(Bug百科與教訓).md
技術組合：     C:\Users\jay10\.claude\CoreBrain\wiki\concepts\web-dev\nextjs-supabase-cloudinary-stack(技術組合).md
Auth 踩坑：   C:\Users\jay10\.claude\CoreBrain\wiki\concepts\web-dev\supabase-auth-google-oauth(認證與Google登入).md
Cloudinary：  C:\Users\jay10\.claude\CoreBrain\wiki\concepts\web-dev\cloudinary-photo-management(照片管理).md
```

### 開發前必查

開始新 Step 或技術選型討論前，主動查詢：
- `equipment-cards-bugs` — 有無相關踩坑（必讀）
- `equipment-cards-system` — 現有功能與 schema 狀態
- `wiki/concepts/web-dev/` — 有無相關技術踩坑

### 何時 ingest 到 CoreBrain

| 內容 | 目的地 | 時機 |
|------|--------|------|
| 新功能完成、schema 變更 | `equipment-cards-system` entity | Step 完成後 |
| 新 Bug 或踩坑 | `equipment-cards-bugs` analysis | 發現時 |
| 可複用的技術模式 | `wiki/concepts/web-dev/` | 確認有通用價值時 |

---

## 本機開發

```bash
npm install        # 安裝依賴
npm run dev        # 開發伺服器 → http://localhost:3000
npm run build      # 確認無 build 錯誤
git push           # 自動觸發 Vercel 部署
```

## 回答偏好

- 簡潔，無開場白
- 腦力激盪時主動列出選項優缺點，不替使用者做決定
- 委派前說明要委派給哪個 Agent、做什麼
- 步驟有相依關係時主動提出
- 不確定直接說不知道，不擅自猜測

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->