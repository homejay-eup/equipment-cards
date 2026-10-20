# Step 52 規格：維修資訊規則清單「原地編輯」與「整列展開」

> 來源：2026-10-20 使用者實測 Step 50 後的回饋（廠商資料之外的另一組需求）。
> 互動原型：`_管理/01_equipment-cards/specs/step52-preview-mockup.html`（版面、配色、互動以此為準；其中 B「顯示 3 行」僅供對照，**已定案採 A**）。
> 純前端互動與版面調整：**不改資料庫、不改 API、不需執行 SQL**。

---

## 一、問題與已定案決策

| # | 問題／需求 | 決策 |
|---|---|---|
| 1 | 編輯面板固定長在整份清單最上面，離被點的那筆很遠，面板上也沒寫是哪一筆 | **原地編輯**：按編輯後，該筆規則**就地變成編輯表單**（位置不動）。外框棕色粗框（2px `#7a5230`）、底色 `#fff9f4`；頂端「正在編輯」標籤＋該筆標題；其餘規則變淡（opacity .5）並暫時不可點（`pointer-events-none`）；開始編輯時自動捲動到表單（`scrollIntoView({block:'nearest',behavior:'smooth'})`） |
| 2 | 新增規則 | 表單出現在**清單最上方**（第一個子類群組之前），頂端「新增」標籤＋「新增規則」，同樣自動捲動；新增時其餘規則同樣變淡不可點 |
| 3 | 切換編輯對象時可能丟失草稿 | 同時只編輯一筆。**有未儲存修改時**，要切換到另一筆、新增、或切換區塊，先顯示黃色提示條「目前編輯的內容還沒儲存，要放棄並切換嗎？」，按鈕「繼續編輯」「放棄並切換」。沒有修改時直接切換，不提示。（「有修改」＝與開啟當下的初始值不同；開啟後又改回原值視為沒修改） |
| 4 | 規則無法點開展開 | **整列可點開收合（A 平常精簡）**：收合時只顯示標題、**內文第一個非空行的單行摘要**（單行截斷加「…」，內文超過一行時摘要尾端加「…」）、標籤；展開時顯示完整內文、全部圖片與表格、最後確認時間與人。點擊操作圖示（編輯／確認／刪除）、勾選框、廠商標籤、連結都**不觸發展開**。左側依序為勾選框（維持現況）、展開箭頭（右向，展開後轉 90°） |

## 二、與 Step 50 既有行為的整合（需特別處理）

Step 50 的 `RuleContent` 自己管理「3 行收合／展開全文」與搜尋命中自動展開。本次展開責任**上移到規則列（`RuleRow`）層級**：

- `RuleContent` 改為「純顯示元件」：由父層傳入 `expanded`（boolean）；收合時顯示單行摘要＋「含圖片 N 張」「含表格 N 列」小標籤（有才顯示）；展開時顯示完整內文（保留換行、網址連結、搜尋標黃）、圖片縮圖列（點擊走既有 lightbox）、完整表格（外層 `overflow-x-auto`）。**移除**自己的「展開全文」「展開表格」按鈕、3 行 clamp 與 `ResizeObserver` 溢出量測（不再需要）。
- **搜尋自動展開**搬到 `RuleRow`：搜尋命中發生在被摘要隱藏的位置（內文第一行之外的文字、或表格儲存格）時，該列預設展開；命中標題、第一行摘要或料號／廠商標籤時不需展開。搜尋字串或命中型態改變時才判斷一次；使用者手動展開／收合會被尊重（不要每次 render 又強制）；清除搜尋後還原由搜尋自動展開的列（沿用 Step 50 `autoExpandedRef` 的作法與 reviewer 修過的語意）。
- 展開狀態屬於「每列各自」，存在 `RuleRow` 內部 state 或由 `RuleListPanel` 管理皆可；**資料重新整理（`isActive` 切回分頁、儲存後重抓）不得讓使用者已展開的列被收起**（以 `rule.id` 為 key，沿用既有 Step 39／44 的教訓）。
- 編輯中的那一列由 `RuleEditPanel` 取代顯示（不顯示摘要／展開箭頭）。

## 三、前端異動（皆在 `src/components/maintenance/`）

### 修改
- `RuleListPanel.tsx`：新增 props（編輯中的規則 id 或 `'new'`、渲染編輯表單的 render prop 或 children，以及「清單變淡」狀態）；在對應規則的位置渲染編輯面板取代該列；`'new'` 時在清單最上方渲染。保留現有 `panels` prop 但**只放批次面板**（編輯面板移出）。其餘批次工具列、分組標題、空狀態不變。
- `RuleRow.tsx`：整列 `onClick` 展開／收合（`event.target` 若在互動元素內則忽略：按鈕、勾選框、連結 `a`、廠商標籤小卡）；左側加展開箭頭（`ChevronRight`）；`aria-expanded`、鍵盤可操作（箭頭按鈕為 `button`，Enter／Space 切換）；把 `expanded` 傳給 `RuleContent`；搜尋自動展開邏輯（見第二節）；標籤列、最後確認時間在收合時的顯示：**收合時顯示標籤列、不顯示最後確認時間；展開時才顯示最後確認時間與人**。
- `RuleContent.tsx`：改為受控顯示元件（見第二節）；`HighlightText` 等既有匯出保留（`RuleRow` 有使用）。
- `RuleEditPanel.tsx`：頂端改為「正在編輯／新增」標籤＋標題；新增 `onDirtyChange?: (dirty: boolean) => void`（預設值不破壞呼叫端），以「目前欄位值與初始值是否不同」計算（涵蓋標題、內容文字、圖片、表格、料號、區塊、子類、廠商、保固、年限、去向等所有欄位）；**匯出的 `PeriodInput`、`SELECTABLE_STAGES` 不得改動**（`BatchPanel` 有 import）。外框改為棕色粗框樣式。
- `MaintenanceInfoClient.tsx`：`editing` 狀態沿用；編輯面板從 `panels` 移到 `RuleListPanel` 的編輯 slot；新增 `editDirty` state 與 `pendingSwitch`（待切換目標：另一筆規則、`'new'` 或另一個區塊）；`openEdit`／`openCreate`／`switchStage` 先檢查 `editDirty`，有修改則設定 `pendingSwitch` 並顯示提示條，無修改直接切換；提示條放在編輯表單上方（或表單內頂端）。按「放棄並切換」才執行原本的切換；「繼續編輯」清除 `pendingSwitch`。儲存成功、取消、刪除該筆後清除 `editDirty`。自動捲動：編輯面板掛載後 `scrollIntoView`。`handleSaveRule` 邏輯不變。

### 不改
- `FlowStages.tsx`、`BatchPanel.tsx`（除非型別連動，需說明）、`ThemedSelect.tsx`、`ExitOptionsManager.tsx`、`VendorManageDialog.tsx`、`VendorFormDialog.tsx`
- 所有 API、`src/types/maintenance.ts`、`src/lib/maintenanceFormat.ts`（除非新增純函式小工具，例如取內文第一個非空行；可放此檔）

## 四、影響範圍（Grep 交叉驗證）

| 對象 | 實際使用點 | 處置 |
|---|---|---|
| `RuleEditPanel`（default export） | 僅 `MaintenanceInfoClient.tsx:15,483` | 需改（外觀、`onDirtyChange`） |
| `RuleEditPanel` 的 `PeriodInput`、`SELECTABLE_STAGES` | `BatchPanel.tsx:10` | **不得改動**簽名與行為 |
| `RuleListPanel` | 僅 `MaintenanceInfoClient.tsx:14,603` | 需改（編輯 slot、變淡狀態） |
| `RuleRow` | 僅 `RuleListPanel.tsx:10,137` | 需改（整列點擊、展開、搜尋自動展開） |
| `RuleContent` | 僅 `RuleRow.tsx:10,129`（另有 `HighlightText` 匯出） | 需改（受控顯示） |
| `panels` prop（`RuleListPanel`） | `MaintenanceInfoClient.tsx:614` | 只保留批次面板 |
| `switchStage`／`openEdit`／`openCreate` | `MaintenanceInfoClient.tsx` 內部（含 `FlowStages` 的 `onSelect`、`filter` 跳轉 effect、待歸類自動回退 effect） | 全部走「有修改先提示」守門；`filter.equipmentId` 跳轉與待歸類自動回退若發生在編輯中，**不得彈提示打斷**，沿用現況直接切換（`filter` 跳轉為使用者主動從料卡進入、待歸類回退為資料變動，兩者皆視為強制切換）——請在回報說明處理方式 |
| `PhotoWall.tsx`、`CardDetailDialog.tsx`（核心保護元件） | `MaintenanceInfoClient` Props 不變 | **不改** |

## 五、【允許新建】
無新檔案（皆為既有檔案修改）。

## 六、【禁止觸碰】
- 核心保護元件：`PhotoWall.tsx`、`CardDetailDialog.tsx`、`CardFormDialog.tsx`、`EquipmentCardItem.tsx`、`BatchImportDialog.tsx`、`src/app/page.tsx`
- `src/components/tracker/*`、`UpdateImageLightbox.tsx`、`src/hooks/**`、`src/lib/richContentValidation.ts`、`src/components/standard-prices/*`、`src/components/documents/*`、`SettingsPopover.tsx`
- `src/app/api/**`、`src/types/**`、資料庫與 SQL
- 第三節「不改」清單
- 若必須動到以上任一項，停下回報。

## 七、驗收標準

- [ ] 按編輯：該筆就地變成表單、外框棕色粗框、頂端「正在編輯」標籤＋標題、其餘規則變淡且不可點、自動捲動到表單
- [ ] 按「＋」新增：表單在清單最上方，頂端「新增」標籤，其餘規則變淡不可點，自動捲動
- [ ] 儲存、取消、刪除後回到一般清單，不殘留變淡或表單
- [ ] 有未儲存修改時，切換到另一筆編輯、新增、切換區塊都會出現提示條；「繼續編輯」保留草稿、「放棄並切換」才切換；無修改直接切換；開啟後改回原值不算修改
- [ ] 整列點擊展開／收合，箭頭轉向；點編輯／確認／刪除圖示、勾選框、廠商標籤、內文連結不觸發展開；鍵盤可用箭頭按鈕展開
- [ ] 收合：標題＋單行摘要（內文超過一行加「…」）＋標籤列；展開：完整內文、全部圖片、完整表格、最後確認時間與人
- [ ] 有圖片或表格時，收合列顯示「含圖片 N 張」「含表格 N 列」小標籤
- [ ] 搜尋命中被隱藏的位置（內文第一行以外、表格）時該列預設展開；使用者手動收合被尊重；清除搜尋還原
- [ ] 儲存後重抓資料、切回分頁重抓，已展開的列維持展開
- [ ] Step 49／50 既有功能不退化：流程圖與區塊切換、批次六項、搜尋標籤反色、去向選項管理、料卡細節頁跳轉、貼圖貼表格儲存
- [ ] 手機寬度（375px）無整頁橫向捲動；編輯表單與提示條不撐破版面
- [ ] `npm run build` 通過，並針對修改檔案另跑繞過巢狀 eslintrc 的 lint（`No issues found`）

## 八、執行順序

`frontend` → `tester` → `reviewer`（無資料庫與 API 異動，省略 `data`）。委派 prompt 明確要求走 blast radius 流程（CodeGraph 連不上時以 Grep 為準）並引用本文件第四、六節。

## 九、執行狀態

- ⏳ 規格已寫成，待委派。使用者已確認：原地編輯（A）、整列展開採 A 平常精簡、同時只編輯一筆並有未儲存提示。

---

## reviewer 補充（追加）

- 編輯中的規則一律保留在清單：搜尋字串改變導致不再命中時，被編輯的那筆仍留在 `curRules`（`r.id === editingRuleId || isVisible(r)`），避免編輯表單位置跳動、重新掛載而丟失草稿。區塊統計、`hitIds` 不受影響（仍以真實命中計算）。
- 編輯中其他列加上 `inert`（同時保留變淡與 `pointer-events-none`），鍵盤無法聚焦到其勾選框與按鈕。
- 欄位改回原值（dirty 變 false）時，未儲存提示條自動消失。
