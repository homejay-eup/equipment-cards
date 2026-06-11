# Step 25 規格：Bug 修正集（7 項 + 1 項新需求）

> 來源：2026-06-09 需求討論。
> 前置條件：Step 24 完成。

---

## 修正清單

| # | 問題 | 根本原因 | 類型 |
|---|------|---------|------|
| B1 | 追蹤板部門隔離失效 | issues 表 dept_group 欄位可能不存在或舊資料為 NULL | data |
| B2 | 角色管理按鈕應依 manage_roles 控制顯示 | UserManagementTable 硬編碼連結，無 permission 檢查 | frontend |
| B3 | 有 edit 權限但看不到編輯按鈕 | CardDetailDialog 編輯按鈕條件為 isAdmin（=create_delete_cards），edit_card_* 無法觸發 | frontend |
| B4 | 編輯料卡按儲存回 Forbidden | /api/cards/[id] PATCH 仍用舊的 crud_cards permission key | data |
| B5 | 新增分類/狀態標籤後儲存 Forbidden | /api/settings PATCH 用 requireAdmin()，dept_admin 被擋 | data |
| B6 | 細節說明 caption 底色太深 | bg-[rgba(44,30,18,.65)] 不透明度過高 | frontend |
| B7 | 新增看標籤/看淨重/看新增時間權限 | 缺少 read_tags / read_weight / read_created_at permission key | data + frontend |
| N1 | 任務卡狀態標籤改為純靜態 badge | IssueDetailDialog 右上角狀態為可點擊下拉 | frontend |

---

## 資料層異動（data agent）

### D1 — /api/cards/[id]/route.ts

PATCH handler 第 28–31 行：

```typescript
// 修改前
const adminUser = await requirePermission('crud_cards')
if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

// 修改後：有 create_delete_cards 或任意 edit_card_* 即可
const adminUser = await requirePermission('create_delete_cards', {
  fallback: (perms: string[]) => perms.some(p => p.startsWith('edit_card_'))
})
if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

> ⚠️ 若 requirePermission 不支援 fallback 參數，改為：
> 1. 呼叫 getUserRoleWithPermissions() 取得 permissions
> 2. 判斷 `permissions.includes('create_delete_cards') || permissions.some(p => p.startsWith('edit_card_'))`
> 3. 不符合則 return 403

### D2 — /api/settings/route.ts

PATCH handler：

```typescript
// 修改前
if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

// 修改後：manage_roles 或 edit_card_category 或 edit_card_status 皆可
const { permissions } = await getUserRoleWithPermissions()
const canEditSettings = permissions.includes('manage_roles')
  || permissions.includes('edit_card_category')
  || permissions.includes('edit_card_status')
if (!canEditSettings) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

### D3 — SQL 修正（_開發檔案/sql/step25-bug-fixes.sql）

```sql
-- 1. 確保 issues 表有 dept_group 欄位
ALTER TABLE issues ADD COLUMN IF NOT EXISTS dept_group TEXT;

-- 2. Backfill：依建立者的 email → allowed_emails.role → roles.dept_group
UPDATE issues i
SET dept_group = r.dept_group
FROM allowed_emails ae
JOIN roles r ON r.name = ae.role
WHERE i.created_by = ae.email
  AND i.dept_group IS NULL;

-- 3. 新增 read_tags / read_weight / read_created_at 到所有系統角色
-- 管理員：三項全開
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, key
FROM roles r
CROSS JOIN unnest(ARRAY['read_tags', 'read_weight', 'read_created_at']) AS key
WHERE r.name IN (
  '管理員', '管理員(技師)', '管理員(採購)', '管理員(供應鏈)', '管理員(工程)', '管理員(業務)'
)
ON CONFLICT DO NOTHING;

-- 一般使用者 / member 角色：三項全開（預設可見，後續由使用者自行調整）
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, key
FROM roles r
CROSS JOIN unnest(ARRAY['read_tags', 'read_weight', 'read_created_at']) AS key
WHERE r.name IN ('一般使用者', '採購', '供應鏈', '工程', '業務', '技師')
ON CONFLICT DO NOTHING;
```

---

## 前端層異動（frontend agent）

### F1 — src/components/UserManagementTable.tsx

Props interface 新增 `permissions: string[]`（預設 `[]`）。

角色管理 Link（第 236–239 行）加條件：

```tsx
// 修改前
<Link href="/admin/roles" ...>角色管理</Link>

// 修改後
{permissions.includes('manage_roles') && (
  <Link href="/admin/roles" ...>角色管理</Link>
)}
```

### F2 — src/app/admin/users/page.tsx（最小侵入）

找到渲染 `<UserManagementTable>` 的地方，新增 `permissions` prop：

```tsx
// 從 page 的 roleData 取出 permissions 並傳入
<UserManagementTable
  ...
  permissions={roleData.permissions}
/>
```

> admin/users/page.tsx 目前已有 permissions 資訊（或可透過 getUserRoleWithPermissions() 取得）

### F3 — src/components/CardDetailDialog.tsx（允許修改）

**① 編輯按鈕條件（第 168 行）**

```tsx
// 修改前
{isAdmin && onEdit && (

// 修改後：有任意 edit_card_* 或 create_delete_cards 皆顯示
const canEditCard = permissions.includes('create_delete_cards')
  || permissions.some(p => p.startsWith('edit_card_'))

{canEditCard && onEdit && (
```

**② Caption 底色（手機版第 219–224 行 + 桌機版第 324–328 行）**

```tsx
// 修改前
className="bg-[rgba(44,30,18,.65)] text-[#f2ebe0] ..."

// 修改後
className="bg-[rgba(44,30,18,.38)] text-[#f2ebe0] ..."
```

**③ 新增三個條件渲染（料卡細節區塊）**

在適當位置加入：
```tsx
{permissions.includes('read_tags') && card.tags.length > 0 && (
  // 標籤渲染（原本無條件顯示，改為有 read_tags 才顯示）
)}

{permissions.includes('read_weight') && (card.net_weight !== null || card.weight_photos?.length > 0) && (
  // 淨重渲染（原本無條件顯示，改為有 read_weight 才顯示）
)}

{permissions.includes('read_created_at') && card.created_at && (
  // 新增時間渲染（若原本已顯示則加條件，若無則新增顯示）
)}
```

> 注意：若原始碼中標籤/淨重已有顯示，找到對應區塊包上條件判斷即可；勿動其他現有欄位。

### F4 — src/components/PhotoWall.tsx（最小侵入）

找到傳 `onEdit` 給 CardDetailDialog 的地方，條件從「isAdmin」擴充為「isAdmin 或有任意 edit_card_*」：

```tsx
// 修改前（大意）
onEdit={isAdmin ? () => handleEditCard(card) : undefined}

// 修改後
const canEditCard = isAdmin || permissions.some(p => p.startsWith('edit_card_'))
onEdit={canEditCard ? () => handleEditCard(card) : undefined}
```

> 僅修改 onEdit 的傳遞條件，不動其他邏輯。

### F5 — src/app/admin/roles/page.tsx（RolesManager 元件）

在「料卡細節」分組下，現有項目（看文件/規格書、看備註、看廠商、看更新人員、看更新內容）之後新增三個 checkbox：

| permission_key | 顯示文字 |
|---------------|---------|
| `read_tags` | 看標籤 |
| `read_weight` | 看淨重 |
| `read_created_at` | 看新增時間 |

依照現有 checkbox 的樣式與連動邏輯加入（勾選後即時呼叫 PUT `/api/roles/[id]/permissions`）。

### F6 — src/components/IssueDetailDialog.tsx

找到狀態標籤區塊（第 248–278 行），移除 dropdown 機制，改為純靜態 badge：

```tsx
// 修改前：有 canChangeStatus 判斷、下拉選單、▾ 箭頭
{canChangeStatus && (
  <div className="relative" onMouseLeave={...}>
    <button onClick={() => setStatusMenuOpen(...)} ...>
      {localIssue.status}
      <span>▾</span>
    </button>
    {statusMenuOpen && (...下拉選單...)}
  </div>
)}
{!canChangeStatus && (
  <span className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_BADGE[localIssue.status]}`}>
    {localIssue.status}
  </span>
)}

// 修改後：統一為純靜態 badge，不可點擊
<span className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_BADGE[localIssue.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
  {localIssue.status}
</span>
```

> 移除 statusMenuOpen state、setStatusMenuOpen、handleStatusChange 的觸發邏輯。若 handleStatusChange 在其他地方仍有使用則保留函式，僅移除觸發入口。

---

## 驗收標準

- [ ] 管理員(供應鏈)和供應鏈角色進入追蹤板，只看到 dept_group=supply_chain 的議題
- [ ] 沒有 manage_roles 的角色，帳號管理頁看不到「角色管理」連結
- [ ] 只有 edit_card_* 無 create_delete_cards 的角色，料卡細節右上角出現鉛筆圖示
- [ ] 以上角色在 CardFormDialog 點儲存不再 403
- [ ] 在 CardFormDialog 新增分類標籤或狀態標籤後儲存不再 403
- [ ] 料卡細節 caption 底色明顯變淡
- [ ] 角色管理頁「料卡細節」分組出現「看標籤」「看淨重」「看新增時間」三個 checkbox
- [ ] 無 read_tags 的角色進入料卡細節，不顯示標籤
- [ ] 無 read_weight 的角色進入料卡細節，不顯示淨重
- [ ] 無 read_created_at 的角色進入料卡細節，不顯示新增時間
- [ ] 任務卡詳情右上角狀態標籤為純靜態 badge，無下拉選單
- [ ] `npm run build` 通過

---

## 委派指示

```
【data agent】
執行 D1、D2、D3：
- 修改 src/app/api/cards/[id]/route.ts PATCH permission 檢查
- 修改 src/app/api/settings/route.ts PATCH permission 檢查
- 建立 _開發檔案/sql/step25-bug-fixes.sql（需提醒使用者在 Supabase Dashboard 執行）
規格：_管理/01_equipment-cards/specs/step25-bug-fixes.md

【frontend agent】
執行 F1–F6，並行執行
規格：_管理/01_equipment-cards/specs/step25-bug-fixes.md

【允許新建】
  _開發檔案/sql/step25-bug-fixes.sql

【允許修改（明確列出）】
  src/app/api/cards/[id]/route.ts
  src/app/api/settings/route.ts
  src/components/UserManagementTable.tsx
  src/app/admin/users/page.tsx
  src/components/CardDetailDialog.tsx
  src/components/PhotoWall.tsx（僅 onEdit 傳遞條件）
  src/app/admin/roles/page.tsx（僅新增 3 個 checkbox）
  src/components/IssueDetailDialog.tsx

【禁止觸碰】
  src/components/EquipmentCardItem.tsx
  src/components/CardFormDialog.tsx
  src/components/BatchImportDialog.tsx
  src/app/page.tsx
  src/app/tracker/page.tsx

完成後：tester 驗收 → reviewer 審查
```
