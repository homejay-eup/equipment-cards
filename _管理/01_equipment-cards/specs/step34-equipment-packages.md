# Step 34 規格：設備套餐（部門共享群組）

> 來源：2026-07-20 需求討論。起因：「我的關注」的群組功能是個人私有的，使用者想要「同部門共用、可指定跨部門可見」的群組功能，經多輪對焦後決定開獨立頁面，不與「我的關注」混用。
> 與 Step 30/30b（文件管理）、Step 32（報價查詢）互不觸碰對方檔案。

---

## 功能描述

新增「設備套餐」獨立頁面（`/packages`），概念上等同「我的關注」群組功能的部門共享版：一組料卡的集合，但歸屬於部門而非個人，可設定額外分享給哪些其他部門檢視。「我的關注」的個人群組功能完全不變，兩套系統各自獨立，僅提供「複製為套餐」的一次性搬移工具。

---

## 核心設計決策

| 項目 | 決策 |
|---|---|
| 頁面定位 | 獨立路由 `/packages`，不併入「我的關注」，PhotoWall 頭部分頁列新增入口連結（比照「任務板」加入方式） |
| 歸屬 | 套餐建立時，依建立者**當下**部門寫入 `department_id`（比照 `issues` 表做法：建立當下查一次、寫死存入，之後不隨建立者本人調部門異動） |
| 部門隔離 | 比照追蹤版：所有角色（含管理員）一律只看自己部門建立的套餐 + 其他部門有分享給自己部門的套餐，**管理員無例外**；`department_id === null` 時回空清單 |
| 名稱唯一性 | 套餐名稱在**同一部門內**不可重複（比照 `user_groups` 現有 unique 邏輯），跨部門不限制（不同部門本來就用部門 Label 區分，允許同名） |
| 內容重複偵測 | 僅比對**同一部門自己底下**的套餐是否料號組合完全相同，顯示提示 Badge（非阻擋），跨部門內容剛好相同視為正常巧合、不提示 |
| 與「我的關注」關係 | 完全獨立資料表，不同步。提供「複製為套餐」一次性複製動作 + 「重新對齊套餐」手動按鈕（見下方「來源對齊機制」） |

---

## 權限模型（4 個獨立 permission key，互不隱含）

| permission_key | 說明 |
|---|---|
| `view_own_packages` | 看得到「本部門套餐」區塊內容（唯讀） |
| `edit_own_packages` | 編輯本部門套餐（新增/改名/加移料卡/刪除套餐/複製套餐/批次維護料號掛載）。若只給此權限未給 `view_own_packages`，邏輯上視同自動具備檢視，不會出現「能編輯但看不到」的矛盾 |
| `share_own_packages` | 能設定/批次調整本部門套餐要分享給哪些其他部門（含批次分享操作） |
| `view_shared_packages` | 看得到「其他部門分享給我的套餐」區塊（永遠唯讀，不受編輯權影響） |

四個 key 可任意組合授予不同角色。頁面/入口只要具備任一即顯示；四者皆無則整個入口不顯示（比照 `view_tracker`/`view_quotes` 模式）。

需加入：
- `src/app/api/roles/[id]/permissions/route.ts` 的 `VALID_PERMISSION_KEYS` 白名單
- `src/components/RolesManager.tsx` 的 `PERM_LABELS` + 新分組常數（如 `PACKAGE_PERMS`），比照 `TRACKER_PERMS`/`QUOTE_PERMS` 的呈現方式，加入新建角色表單 + 編輯角色頁面兩處

---

## 資料表設計（新建，不動既有 `user_groups`/`group_items`）

```sql
-- 部門共享套餐主表
CREATE TABLE IF NOT EXISTS equipment_packages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  department_id     UUID NOT NULL REFERENCES departments(id),
  source_group_id   UUID REFERENCES user_groups(id) ON DELETE SET NULL,
  source_synced_at  TIMESTAMPTZ,
  sort_order        INTEGER,
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, name)
);

-- 套餐內的料卡（比照 group_items）
CREATE TABLE IF NOT EXISTS package_items (
  package_id    UUID NOT NULL REFERENCES equipment_packages(id) ON DELETE CASCADE,
  equipment_id  TEXT NOT NULL,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (package_id, equipment_id)
);

-- 套餐分享給哪些其他部門（多對多）
CREATE TABLE IF NOT EXISTS package_shared_departments (
  package_id     UUID NOT NULL REFERENCES equipment_packages(id) ON DELETE CASCADE,
  department_id  UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  shared_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (package_id, department_id)
);

ALTER TABLE equipment_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_shared_departments ENABLE ROW LEVEL SECURITY;
-- 不開放 authenticated policy，全部經 API route 用 service_role 存取 + 程式碼層做部門過濾（比照 issues 表模式）
```

另外，「我的關注」群組需補上 `updated_at` 欄位（若尚未存在），改名/加卡/移除卡時一併更新，供「來源對齊機制」比對用：

```sql
ALTER TABLE user_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
```

---

## 來源對齊機制（我的關注 → 設備套餐）

- 「我的關注」的非預設群組上加按鈕：
  - 尚未連結套餐 → 顯示「複製為套餐」，點擊後在**目前使用者當下部門**建立一份新套餐（`source_group_id` 記錄來源、`source_synced_at` 記當下時間），複製當時的料卡清單
  - 已連結套餐（`source_group_id` 有值）→ 按鈕變成「重新對齊套餐」，點擊後（跳 `ConfirmDialog` 警語：會覆蓋套餐目前內容為來源群組最新版本）用群組目前的名稱+料卡清單整個覆蓋套餐，更新 `source_synced_at`
  - **一個群組最多只能連結一份套餐**（避免重複複製產生多份）。若真的想要同一批內容拆成兩份不同套餐，走「新建套餐」或「複製套餐」（見下），不會經過群組的複製按鈕
- 對齊狀態徽章：比較 `user_groups.updated_at` 與 `equipment_packages.source_synced_at`
  - `updated_at > source_synced_at` → 顯示「來源已更新，可重新對齊」（amber）
  - 否則 → 顯示「已對齊最新版本」（success）
- 此機制**單向、手動觸發**，非自動同步：「我的關注」永遠是主版本（草稿），套餐是發布快照，套餐內容之後也可能被部門內有 `edit_own_packages` 權限的其他人直接編輯，與來源群組脫鉤發展，不會互相覆蓋

---

## 複製套餐（套餐 → 套餐，A 複製給 B）

- 套餐清單提供「複製套餐」動作：選定 A → 立即彈出「新套餐名稱」輸入框（強制當場輸入不同名稱，預設帶出「原名稱（副本）」）→ 建立內容相同的新套餐 B，兩者建立後完全獨立、無 `source_group_id` 之類的關聯（不做 A/B 對齊，因為預期兩者會分道揚鑣）
- 內容重複偵測：同部門套餐清單載入時，比對是否有多個套餐的料號集合（equipment_id 排序後的 set）完全相同，命中則在雙方套餐列上顯示提示 Badge「⚠ 與「XXX」內容完全相同」，純提示不阻擋操作

---

## UI 設計

### 頁面分區
- 「本部門套餐」（上，需 `view_own_packages`/`edit_own_packages` 其一才顯示）
- 「其他部門分享給我的套餐」（下，需 `view_shared_packages` 才顯示，永遠唯讀，每筆項目均帶「來自：OO部門」Label——不只是分區標題，是因為「依料號檢視」等視圖可能會把不同部門來源的套餐混在同一個料號底下顯示，需要逐筆標示避免混淆）

### 雙視圖切換（比照文件管理的依文件/依料號模式）
- 「依套餐檢視」：以套餐為單位，展開後看到內含料卡
- 「依料號檢視」：以料號為單位（純前端反向分組現有 `package_items` 資料，無新關聯表），展開後看到此料號被掛在哪些套餐——與「依套餐檢視」互為正反查詢，資料完全共用同一份 `package_items`
- 每個視圖展開後的內容，再提供「清單／照片」顯示模式切換（清單=文字列；照片=重用既有 `EquipmentCardItem` 縮圖網格），狀態存本機（比照文件管理篩選列做法）

### 批次操作
- 套餐清單/料號清單皆支援 checkbox 多選 + 全選
- 批次動作：
  - 「分享至部門…」（需 `share_own_packages`）：彈窗內部門清單同樣支援多選 + 全選，一次套用到所有勾選的套餐
  - 「批次刪除」「批次新增/移除料號掛載」（需 `edit_own_packages`）——比照 Step 30b 第三輪已建立的批次掛載模式（`computeUnlinkPlan()` 概念可參考複用：需判斷解除掛載是否會導致某個套餐清空、需二次確認）

### 元件放置
- `src/app/packages/page.tsx`（server component，比照 `tracker/page.tsx` 抓 `department_id` 過濾邏輯）
- `src/app/packages/PackagesClient.tsx`
- `src/components/packages/` 底下拆子元件（比照 `src/components/documents/` 拆法，避免單檔過大）：套餐列表、料號反查列表、批次分享彈窗、複製/對齊按鈕與彈窗

【禁止觸碰】：`PhotoWall.tsx`（僅加一個分頁入口連結）、`EquipmentCardItem.tsx`、`CardDetailDialog.tsx`、`CardFormDialog.tsx`、`BatchImportDialog.tsx`、`src/app/page.tsx`
【允許修改】：`GroupsPanel.tsx`（加「複製為套餐」/「重新對齊套餐」按鈕與徽章）、`RolesManager.tsx`、`src/app/api/roles/[id]/permissions/route.ts`

---

## API Routes（新建）

- `GET/POST /api/packages`：本部門套餐清單 + 建立
- `PATCH/DELETE /api/packages/[id]`：改名/刪除
- `POST /api/packages/[id]/items`、`DELETE /api/packages/[id]/items/[equipmentId]`：加/移料卡（含批次版本）
- `POST /api/packages/[id]/duplicate`：複製套餐
- `POST /api/packages/[id]/align`：從來源群組重新對齊
- `PATCH /api/packages/batch/share`：批次設定分享部門
- `GET /api/packages/shared`：查詢其他部門分享給我的套餐

---

## 完成標準

- `npm run build` 通過
- 部門隔離邏輯需與追蹤版一致（含管理員無例外）驗證
- 名稱唯一性（同部門）、內容重複偵測（同部門）需有測試情境
- 批次分享/批次掛載的邊界情況（例如唯一掛載被移除、跨部門同名分享來源顯示）需在 `tester` 階段驗證
- 委派順序：`data`（4 張新表 + API routes + RLS）→ `frontend`（頁面/元件/GroupsPanel 按鈕）→ `tester` → `reviewer`
