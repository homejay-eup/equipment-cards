# Step 28 規格：分類次級篩選標籤

> 來源：2026-06-13 需求討論。
> 前置條件：Step 19（角色與權限系統）已完成。

---

## 功能描述

主篩選列選中某分類後，展開第二排 tag chip 作為次級篩選。
管理員可在篩選列上直接新增/移除該分類對應的次級標籤（不需進後台）。
多選次級標籤邏輯為**聯集**（符合任一 tag 即顯示）。

---

## 設計決策

| 項目 | 決策 |
|------|------|
| 標籤來源 | 管理員指定，非自動掃描料卡 tags |
| 編輯入口 | 篩選列內嵌編輯（Option B），有權限才顯示編輯按鈕 |
| 多選邏輯 | 聯集（OR） |
| 通用性 | 任何分類都可設定，沒設定的分類不展開第二排 |
| 權限控制 | 新增 `manage_subfilter_tags` 至 permission_key 清單 |
| 標籤資料 | 新建 `category_subfilter_tags` 資料表 |

---

## Schema 異動

```sql
-- 新增次級篩選標籤設定表
CREATE TABLE category_subfilter_tags (
  id          SERIAL PRIMARY KEY,
  category    TEXT NOT NULL,
  tag         TEXT NOT NULL,
  sort_order  INT DEFAULT 0,
  UNIQUE(category, tag)
);

-- RLS：所有登入使用者可讀；manage_subfilter_tags 權限才能寫（由 API 層控制，不加 RLS policy）
ALTER TABLE category_subfilter_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read subfilter tags"
  ON category_subfilter_tags FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "service_role can write subfilter tags"
  ON category_subfilter_tags FOR ALL
  TO service_role USING (true);
```

SQL 存放：`_開發檔案/sql/add-category-subfilter.sql`

---

## 新增 Permission Key

在 `role_permissions` 現有清單新增一個 key：

| permission_key | 說明 | 預設管理員 | 預設一般使用者 |
|---|---|---|---|
| `manage_subfilter_tags` | 管理各分類的次級篩選標籤 | ✅ | ❌ |

**需執行的 SQL**：
```sql
-- 管理員角色加入新權限
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, 'manage_subfilter_tags' FROM roles WHERE name = '管理員'
ON CONFLICT DO NOTHING;
```

---

## API Routes

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/subfilter-tags` | 取得所有分類的次級標籤（回傳 `{ [category]: string[] }`） |
| PUT | `/api/subfilter-tags/[category]` | 覆寫指定分類的標籤清單（body: `{ tags: string[], sort_orders?: number[] }`） |

**權限保護**：PUT 需驗證使用者有 `manage_subfilter_tags`，否則回傳 403。

---

## 前端異動

### 1. `PhotoWall.tsx`（核心保護元件，僅允許以下最小侵入）

**允許修改**（須在本規格明確列出）：
- 接收新 prop：`subfilterConfig: Record<string, string[]>`（各分類對應的次級標籤清單）
- 新增 state：`selectedSubTags: string[]`，切換主分類時重置為 `[]`
- 在主分類篩選列**下方**新增第二排 chip 列（獨立 DOM 節點，不影響現有篩選列結構）
- 篩選邏輯：在現有 category filter 之後追加一條 tag 聯集過濾

**禁止改動**：現有 className、handler、layout 結構、其他 state

**第二排展開條件**：
- 主分類有選中（非「全部」）
- 且 `subfilterConfig[selectedCategory]` 存在且非空

**篩選邏輯擴充**（追加在現有邏輯後）：
```typescript
// 現有：filtered by category
// 新增：若 selectedSubTags.length > 0，再過濾 tags 包含任一 selectedSubTag 的料卡
if (selectedSubTags.length > 0) {
  result = result.filter(card =>
    card.tags?.some(t => selectedSubTags.includes(t))
  )
}
```

### 2. 新建 `SubfilterTagBar.tsx`

路徑：`src/components/SubfilterTagBar.tsx`

職責：
- 顯示次級篩選 chip 列
- 若有 `manage_subfilter_tags` 權限，顯示「編輯」圖示按鈕
- 點「編輯」展開 inline popover，可新增/移除標籤（輸入框 + chip 列表）
- 儲存後呼叫 PUT `/api/subfilter-tags/[category]`，更新本地 `subfilterConfig`

**Props**：
```typescript
interface SubfilterTagBarProps {
  category: string
  tags: string[]              // 當前分類的設定標籤
  selectedTags: string[]
  onTagToggle: (tag: string) => void
  canManage: boolean          // permissions.includes('manage_subfilter_tags')
  onTagsUpdated: (category: string, newTags: string[]) => void
}
```

### 3. `page.tsx`（Server Component）

- 新增 subfilterConfig 查詢：從 `/api/subfilter-tags` 取得設定，傳入 PhotoWall

```typescript
const subfilterConfig = await getSubfilterTags() // 呼叫 Supabase，回傳 Record<string, string[]>

<PhotoWall
  ...
  subfilterConfig={subfilterConfig}
/>
```

### 4. 角色管理頁（`/admin/roles`）

`manage_subfilter_tags` 已存入 DB，角色管理頁的權限清單需加入此項目顯示：

```
功能權限
  ...
  ☐ 管理次級篩選標籤
```

此為 `/admin/roles` 頁面的靜態 permission label 清單更新。

---

## UI 草圖

```
主篩選列：
[ 全部 ] [ 攝影機 ] [✓ 鏡頭 ] [ 燈光 ] ...

↓ 選了「鏡頭」且有設定次級標籤時展開：
次級篩選：[ 前鏡 ] [ 後鏡 ] [✓ 室內鏡 ]  ✏️（管理員才看到編輯圖示）

↓ 點編輯圖示後展開 inline popover：
[前鏡 ×] [後鏡 ×] [室內鏡 ×]  [＋ 新增標籤]  [儲存]
```

---

## 驗收標準

- [ ] `category_subfilter_tags` 資料表建立，RLS 設定正確
- [ ] `manage_subfilter_tags` 權限成功加入管理員角色
- [ ] 主篩選選「全部」時，第二排不顯示
- [ ] 主篩選選某分類且有設定次級標籤，第二排展開正確
- [ ] 沒有次級標籤設定的分類，選中後第二排不出現
- [ ] 次級標籤多選，聯集過濾正確（切換主分類時次級選擇重置）
- [ ] 無 `manage_subfilter_tags` 權限：看不到編輯圖示
- [ ] 有 `manage_subfilter_tags` 權限：可新增/移除標籤，儲存後即時反映
- [ ] 角色管理頁的功能權限清單包含「管理次級篩選標籤」
- [ ] 現有主頁搜尋、篩選、版面功能無迴歸
- [ ] `npm run build` 通過

---

## 委派指示

```
委派給：data（DB table + SQL + API routes + page.tsx subfilterConfig 查詢）
        + frontend（SubfilterTagBar.tsx + PhotoWall.tsx 最小侵入 + /admin/roles 頁面標籤更新）並行

【允許新建】
- src/components/SubfilterTagBar.tsx
- _開發檔案/sql/add-category-subfilter.sql
- src/app/api/subfilter-tags/route.ts
- src/app/api/subfilter-tags/[category]/route.ts

【允許修改】
- src/app/page.tsx（新增 subfilterConfig 查詢，傳 prop）
- src/components/PhotoWall.tsx（僅限：新增 subfilterConfig prop、selectedSubTags state、第二排 DOM、tag 聯集過濾）
- src/app/admin/roles/page.tsx（新增 manage_subfilter_tags 顯示文字）

【禁止觸碰】
- src/components/CardDetailDialog.tsx
- src/components/CardFormDialog.tsx
- src/components/EquipmentCardItem.tsx
- src/components/BatchImportDialog.tsx

規格文件：_管理/01_equipment-cards/specs/step28-category-subfilter.md
SQL 執行：需提醒使用者在 Supabase Dashboard 執行 add-category-subfilter.sql
完成後：tester 驗收 → reviewer 審查
```
