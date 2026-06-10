# Step 26 規格：邏輯審查修正集（9 項）

> 來源：2026-06-10 全面邏輯審查
> 前置條件：Step 25 完成
> 跨 Session 記憶用：本文件為執行依據，每項修完後於「進度追蹤」欄打勾

---

## ⛔ 實作範圍限制

**本 Step 只做指定修正，不做其他改動。**

### 【禁止觸碰】以下檔案不得有任何修改

| 檔案 | 原因 |
|------|------|
| `src/components/CardFormDialog.tsx` | 不涉及本 Step |
| `src/components/CardDetailDialog.tsx` | 不涉及本 Step |
| `src/components/EquipmentCardItem.tsx` | 不涉及本 Step |
| `src/components/BatchImportDialog.tsx` | 不涉及本 Step |
| `src/app/page.tsx` | 不涉及本 Step |
| `src/lib/supabase-server.ts` | 不動 |
| `src/lib/supabase-browser.ts` | 不動 |
| `src/lib/utils.ts` | 不動 |

### 【允許新建】無

### 【允許修改的既有檔案】

| 檔案 | 修改項目 |
|------|---------|
| `src/lib/admin.ts` | D1：移除廢棄 key；D6：新增 getAssignableRolesData() |
| `src/app/api/admin/users/route.ts` | D2：修正 domain 檢查；D3：PATCH email normalize |
| `src/app/api/issues/route.ts` | D4：GET 加 dept_group 過濾 |
| `src/app/api/roles/[id]/route.ts` | D5：rename 時 cascade 更新 allowed_emails |
| `src/app/api/roles/route.ts` | D7：GET 回傳加 dept_group + level；POST 接收 dept_group/level |
| `src/app/api/roles/assignable/route.ts` | D6：改呼叫共用函數 |
| `src/app/tracker/page.tsx` | D4-b：super_admin 不過濾 issues |
| `src/app/admin/users/page.tsx` | F1：改呼叫共用函數；F2：dept_admin 只看自己部門帳號 |
| `src/components/RolesManager.tsx` | F3：新增角色時加 dept_group/level 欄位 |

---

## 修正清單

| # | 問題 | 嚴重性 | 類型 |
|---|------|--------|------|
| D1 | ADMIN_PERMISSIONS 有廢棄 key（filter_all_statuses / filter_no_photo / crud_cards） | 中 | data |
| D2 | admin/users/route.ts 的 domain 只認 @eup.com.tw，@eup.com.vn 被擋 | 高 | data |
| D3 | PATCH /api/admin/users email 未 normalize（小寫化） | 中 | data |
| D4 | GET /api/issues 完全無 dept_group 過濾；tracker/page.tsx super_admin 看不到全部議題 | 高 | data |
| D5 | PATCH /api/roles/[id] 角色重命名後，allowed_emails.role 不同步 | 高 | data |
| D6 | admin/users/page.tsx 與 api/roles/assignable 兩套相同邏輯各自維護 | 中 | data |
| D7 | GET /api/roles 回傳缺 dept_group + level；POST /api/roles 建角色無法指定 dept_group/level | 中 | data |
| F1 | dept_admin 帳號管理頁面看到全部帳號（含其他部門），UI 與 API 限制不一致 | 中 | frontend |
| F2 | RolesManager 新增角色表單缺 dept_group + level 欄位 | 中 | frontend |

---

## 資料層異動（data agent）

### D1 — src/lib/admin.ts：移除廢棄 permission key

將 `ADMIN_PERMISSIONS` 常數中的 `filter_all_statuses`、`filter_no_photo`、`crud_cards` 三個廢棄 key 移除。

```typescript
// 修改前
const ADMIN_PERMISSIONS = [
  'read_all_cards',
  'read_documents', 'read_notes', 'read_vendor',
  'read_updated_by', 'read_updated_content',
  'use_bookmarks', 'filter_all_statuses', 'filter_no_photo', 'crud_cards', 'create_delete_cards',
  'manage_users', 'manage_roles', 'use_groups',
]

// 修改後
const ADMIN_PERMISSIONS = [
  'read_all_cards',
  'read_documents', 'read_notes', 'read_vendor',
  'read_updated_by', 'read_updated_content',
  'use_bookmarks', 'create_delete_cards',
  'manage_users', 'manage_roles', 'use_groups',
]
```

---

### D2 — src/app/api/admin/users/route.ts：修正 domain 驗證

`getCallerRoleInfo()` 目前只認 `@eup.com.tw`，改為與 `admin.ts` 一致的陣列驗證。

```typescript
// 修改前（第 20 行）
const ALLOWED_DOMAIN = '@eup.com.tw'
// ...
if (!user?.email || !user.email.endsWith(ALLOWED_DOMAIN)) return null

// 修改後：移除檔案頂部的 ALLOWED_DOMAIN 常數，改用本地輔助函數
const ALLOWED_DOMAINS = ['eup.com.tw', 'eup.com.vn']

function isAllowedDomain(email: string): boolean {
  const domain = email.split('@')[1]
  return !!domain && ALLOWED_DOMAINS.includes(domain)
}

// getCallerRoleInfo() 第 20 行改為：
if (!user?.email || !isAllowedDomain(user.email)) return null
```

---

### D3 — src/app/api/admin/users/route.ts：PATCH email normalize

```typescript
// PATCH handler，找到目前的解構賦值（約第 119 行）
// 修改前
const { email, role } = await req.json()
if (!email || !role) {
  return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
}

// 修改後
const { email: rawEmail, role } = await req.json()
const email = rawEmail?.trim().toLowerCase()
if (!email || !role) {
  return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
}
```

---

### D4 — GET /api/issues + tracker/page.tsx：dept_group 過濾補齊

#### D4-a：src/app/api/issues/route.ts — GET 加 dept_group 過濾

在 GET handler 開頭，取得使用者的角色等級與 dept_group，依此決定是否過濾：

```typescript
// GET /api/issues handler 修改（requirePermission 之後）
export async function GET(req: NextRequest) {
  const user = await requirePermission('view_tracker')
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ★ 新增：查詢 caller 的 level + dept_group
  let callerLevel: string | null = null
  let callerDeptGroup: string | null = null
  try {
    const service = getSupabase()
    const { data: emailRow } = await service
      .from('allowed_emails')
      .select('role')
      .eq('email', user.email!)
      .single()
    if (emailRow?.role) {
      const { data: roleRow } = await service
        .from('roles')
        .select('level, dept_group')
        .eq('name', emailRow.role)
        .single()
      callerLevel = roleRow?.level ?? null
      callerDeptGroup = roleRow?.dept_group ?? null
    }
  } catch {
    // 查詢失敗不阻斷，預設不過濾（安全面考慮：後面有 null 保護）
  }

  // ... 原有的 searchParams 解析 ...

  let query = supabase.from('issues').select(`...`)
    .order(...)

  // ★ 新增：非 super_admin 依 dept_group 過濾
  if (callerLevel !== 'super_admin') {
    if (callerDeptGroup !== null) {
      query = query.eq('dept_group', callerDeptGroup)
    } else {
      // dept_group 為 null → 無部門歸屬，回傳空清單
      return NextResponse.json([])
    }
  }
  // super_admin → 不加任何過濾，看全部

  if (type) query = query.eq('type', type)
  // ... 其餘原有條件不動 ...
}
```

#### D4-b：src/app/tracker/page.tsx — super_admin 可看全部議題

目前邏輯：`if (userDeptGroup !== null)` 才查 issues，super_admin 的 dept_group='admin' 所以只看到 admin 部門的議題。

修改：在第二批查詢後，加入 level 查詢，super_admin 不加 dept_group 過濾：

```typescript
// 第二批取得 dept_group 之後，接著取 level
const callerLevel = (roleInfoResult as { data: { dept_group: string | null; assignable_role_names: string[] | null; level?: string } | null }).data?.level ?? null

// 第三批 issues 查詢改為：
let rawIssues: RawIssue[] = []
if (callerLevel === 'super_admin') {
  // super_admin 看全部，不加 dept_group filter
  const issuesResult = await adminClient
    .from('issues')
    .select(`...`)  // 欄位同原本
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .order('created_at', { referencedTable: 'issue_updates', ascending: false })
  rawIssues = (issuesResult.data ?? []) as RawIssue[]
} else if (userDeptGroup !== null) {
  const issuesResult = await adminClient
    .from('issues')
    .select(`...`)  // 欄位同原本
    .eq('dept_group', userDeptGroup)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .order('created_at', { referencedTable: 'issue_updates', ascending: false })
  rawIssues = (issuesResult.data ?? []) as RawIssue[]
}
// else：userDeptGroup === null 且非 super_admin → rawIssues = []（原本行為，不變）

// ★ roles 查詢需加 level 欄位：
const roleInfoResult = userRoleName
  ? await adminClient
      .from('roles')
      .select('dept_group, assignable_role_names, level')  // ← 加 level
      .eq('name', userRoleName)
      .single()
  : { data: null }
```

---

### D5 — src/app/api/roles/[id]/route.ts：rename 後 cascade 更新 allowed_emails

PATCH handler 在成功更新 `roles.name` 後，同步更新 `allowed_emails.role`。

```typescript
// PATCH handler，在 update roles 成功之後加入（約第 69 行之後）

const { data: updated, error: updateError } = await supabase
  .from('roles')
  .update(updateFields)
  .eq('id', id)
  .select('id, name, dept_group')
  .single()

if (updateError) {
  return NextResponse.json({ error: updateError.message }, { status: 500 })
}

// ★ 新增：若 name 有變更，cascade 更新 allowed_emails
if (hasName && updateFields.name && updateFields.name !== /* 原始名稱 */ body.name) {
  // ← 修正：需要在前面先取得 original name
}
```

> ⚠️ 需要在 update 前先讀取原始名稱：

完整修改邏輯：

```typescript
// 在 fetch role（第 51 行）時多取 name：
const { data: role, error: fetchError } = await supabase
  .from('roles')
  .select('id, name, is_system')  // ← 加 name
  .eq('id', id)
  .single()

// 在 update 成功後：
if (hasName && typeof updateFields.name === 'string' && updateFields.name !== role.name) {
  // role 已被 rename，同步更新所有指派了此角色的帳號
  const { error: cascadeError } = await supabase
    .from('allowed_emails')
    .update({ role: updateFields.name })
    .eq('role', role.name)  // role.name 是 rename 前的舊名稱

  if (cascadeError) {
    // cascade 失敗不回滾（roles 表已成功），但回報警告
    console.error('[roles] cascade allowed_emails update failed:', cascadeError)
    return NextResponse.json({
      ...updated,
      warning: 'roles 已重命名，但 allowed_emails 同步失敗，請手動確認'
    })
  }
}

return NextResponse.json(updated)
```

---

### D6 — 共用 getAssignableRolesData()：消除重複邏輯

在 `src/lib/admin.ts` 新增共用函數，讓 `admin/users/page.tsx` 和 `api/roles/assignable/route.ts` 都呼叫它。

```typescript
// 新增至 src/lib/admin.ts

export interface AssignableRoleRow {
  id: string
  name: string
  is_system: boolean
  dept_group: string | null
  level: string | null
}

/**
 * 依目前登入者的 level/dept_group/assignable_role_names 回傳可指派的角色清單。
 * 直接接受 email，使用 service client 查詢（可用於 SSR 或 API route）。
 */
export async function getAssignableRolesData(userEmail: string): Promise<AssignableRoleRow[]> {
  const service = getServiceClient()

  const { data: emailData } = await service
    .from('allowed_emails')
    .select('role')
    .eq('email', userEmail)
    .single()

  if (!emailData?.role) return []

  const { data: roleData, error: roleError } = await service
    .from('roles')
    .select('id, name, is_system, dept_group, level, assignable_role_names')
    .eq('name', emailData.role)
    .single()

  if (roleError || !roleData) return []

  const { level, dept_group, assignable_role_names } = roleData as {
    id: string; name: string; is_system: boolean
    dept_group: string | null; level: string
    assignable_role_names: string[] | null
  }

  // 優先：明確設定的清單
  if (assignable_role_names && assignable_role_names.length > 0) {
    const { data } = await service
      .from('roles')
      .select('id, name, is_system, dept_group, level')
      .in('name', assignable_role_names)
      .order('id', { ascending: true })
    return (data ?? []) as AssignableRoleRow[]
  }

  // Fallback：依 level
  if (level === 'super_admin') {
    const { data } = await service
      .from('roles')
      .select('id, name, is_system, dept_group, level')
      .order('created_at', { ascending: true })
    return (data ?? []) as AssignableRoleRow[]
  }

  if (level === 'dept_admin') {
    if (!dept_group) return []
    const { data } = await service
      .from('roles')
      .select('id, name, is_system, dept_group, level')
      .eq('dept_group', dept_group)
      .in('level', ['member', 'viewer'])
      .order('created_at', { ascending: true })
    return (data ?? []) as AssignableRoleRow[]
  }

  return []
}
```

**api/roles/assignable/route.ts 改為：**

```typescript
import { getAssignableRolesData } from '@/lib/admin'

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email || !isAllowedDomain(user.email)) {  // 改用 isAllowedDomain
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const roles = await getAssignableRolesData(user.email)
  return NextResponse.json(roles)
}
```

> `isAllowedDomain` 需從 admin.ts export 出來（目前為 private），或在此 route 內也宣告一份。建議從 admin.ts export。

**admin/users/page.tsx 的 fetchAssignableRoles() 改為：**

```typescript
import { getAssignableRolesData } from '@/lib/admin'

// 移除整個 fetchAssignableRoles() 函數（約 42–115 行）
// 移除 ROLE_ORDER 與 sortRoleNames（若只在此函數使用）

// 在 AdminUsersPage 的 Promise.all 中改為：
const [admin, { data: { user } }, users, assignableRoles, roleData] = await Promise.all([
  requireAdmin(),
  supabase.auth.getUser(),
  fetchAllowedEmails(),    // 此函數見 F1 修改
  user ? getAssignableRolesData(user.email) : Promise.resolve([]),
  getUserRoleWithPermissions(),
])

// roleNames 改由 assignableRoles.map(r => r.name) 取得，並照需要排序
const roleNames = sortRoleNames(assignableRoles.map(r => r.name))
```

> ⚠️ `user` 在 Promise.all 裡不能提前解構，需調整順序：先取 user，再 getAssignableRolesData。
> 實作時注意：先呼叫 `supabase.auth.getUser()` 取得 userEmail，再把 email 傳入 Promise.all 的其他並行查詢。

---

### D7 — src/app/api/roles/route.ts：補齊回傳欄位 + 接收 dept_group/level

#### GET：加回 dept_group + level

```typescript
// 修改前
const { data, error } = await getSupabase()
  .from('roles')
  .select('id, name, is_system, created_at, role_permissions(permission_key)')

// 修改後
const { data, error } = await getSupabase()
  .from('roles')
  .select('id, name, is_system, dept_group, level, created_at, role_permissions(permission_key)')

// map 時也加入：
const roles = (data ?? []).map((r) => ({
  id: r.id,
  name: r.name,
  is_system: r.is_system,
  dept_group: r.dept_group ?? null,          // ← 新增
  level: r.level ?? null,                    // ← 新增
  permissions: (r.role_permissions as { permission_key: string }[]).map(p => p.permission_key),
}))
```

#### POST：接收並寫入 dept_group + level

```typescript
// 修改前
const { name, permissions } = await req.json()

// 修改後
const { name, permissions, dept_group, level } = await req.json()

// insert 時加入：
const { data: newRole, error: insertError } = await supabase
  .from('roles')
  .insert({
    name: name.trim(),
    is_system: false,
    dept_group: typeof dept_group === 'string' ? dept_group : null,  // ← 新增
    level: typeof level === 'string' ? level : 'viewer',             // ← 預設 viewer
  })
  .select('id, name, is_system, dept_group, level')
  .single()

// 回傳也加入：
return NextResponse.json({
  id: newRole.id, name: newRole.name, is_system: newRole.is_system,
  dept_group: newRole.dept_group,  // ← 新增
  level: newRole.level,            // ← 新增
  permissions: permList
}, { status: 201 })
```

---

## 前端層異動（frontend agent）

### F1 — src/app/admin/users/page.tsx：dept_admin 只看自己部門帳號

修改 `fetchAllowedEmails()` 讓它依 caller 的 dept_group 過濾：

```typescript
// 原本無參數，改為接收 caller 的 level + dept_group
async function fetchAllowedEmails(
  callerLevel: string | null,
  callerDeptGroup: string | null
) {
  const service = getServiceClient()

  if (callerLevel === 'super_admin') {
    // super_admin 看全部
    const { data } = await service
      .from('allowed_emails')
      .select('email, role, created_at')
      .order('created_at', { ascending: true })
    return (data ?? []) as { email: string; role: string; created_at: string }[]
  }

  if (callerLevel === 'dept_admin' && callerDeptGroup) {
    // dept_admin 只看同 dept_group 的角色所對應的帳號
    // 先查同 dept_group 的角色名稱
    const { data: deptRoles } = await service
      .from('roles')
      .select('name')
      .eq('dept_group', callerDeptGroup)
    const deptRoleNames = (deptRoles ?? []).map((r: { name: string }) => r.name)

    if (deptRoleNames.length === 0) return []

    const { data } = await service
      .from('allowed_emails')
      .select('email, role, created_at')
      .in('role', deptRoleNames)
      .order('created_at', { ascending: true })
    return (data ?? []) as { email: string; role: string; created_at: string }[]
  }

  // 其他（不應進入此頁，requireAdmin 已擋）：回傳空
  return []
}
```

在 `AdminUsersPage` 中調整呼叫順序（先取 caller 的 role info，再 fetchAllowedEmails）：

```typescript
export default async function AdminUsersPage() {
  const supabase = createSupabaseServerClient()

  // Step 1：平行取 auth + admin guard + role info
  const [admin, { data: { user } }, roleData] = await Promise.all([
    requireAdmin(),
    supabase.auth.getUser(),
    getUserRoleWithPermissions(),
  ])

  if (!admin) redirect('/')

  // Step 2：取 caller 的 level + dept_group
  let callerLevel: string | null = null
  let callerDeptGroup: string | null = null
  if (user?.email) {
    const service = getServiceClient()
    const { data: emailRow } = await service
      .from('allowed_emails').select('role').eq('email', user.email).single()
    if (emailRow?.role) {
      const { data: roleRow } = await service
        .from('roles').select('level, dept_group').eq('name', emailRow.role).single()
      callerLevel = roleRow?.level ?? null
      callerDeptGroup = roleRow?.dept_group ?? null
    }
  }

  // Step 3：平行取使用者清單 + 可指派角色
  const [users, assignableRoles] = await Promise.all([
    fetchAllowedEmails(callerLevel, callerDeptGroup),
    user?.email ? getAssignableRolesData(user.email) : Promise.resolve([]),
  ])

  const roleNames = sortRoleNames(assignableRoles.map(r => r.name))

  return (
    <main ...>
      ...
      <UserManagementTable
        initialUsers={users}
        currentUserEmail={user!.email!}
        availableRoles={roleNames}
        permissions={roleData.permissions}
      />
    </main>
  )
}
```

> `sortRoleNames` 與 `ROLE_ORDER` 保留在此檔，供 roleNames 排序使用。

---

### F2 — src/components/RolesManager.tsx：新增角色表單加 dept_group + level 欄位

找到目前「新增角色」的 Dialog/Sheet，在角色名稱輸入框之後新增兩個下拉選單：

**dept_group 下拉：**

| 值 | 顯示文字 |
|----|---------|
| `null` / `""` | 無部門 |
| `admin` | 管理 |
| `tech` | 技師 |
| `purchasing` | 採購 |
| `supply_chain` | 供應鏈 |
| `engineering` | 工程 |
| `sales` | 業務 |

**level 下拉：**

| 值 | 顯示文字 |
|----|---------|
| `viewer` | 一般檢視（預設） |
| `member` | 部門成員 |
| `dept_admin` | 部門管理員 |
| `super_admin` | 超級管理員 |

**新增角色 POST 時帶入這兩個欄位：**

```typescript
// 目前呼叫 POST /api/roles 的地方
const body = { name: newRoleName }

// 改為
const body = {
  name: newRoleName,
  dept_group: newRoleDeptGroup || null,  // 新增 state
  level: newRoleLevel || 'viewer',       // 新增 state
}
```

> 僅修改「新增角色」的表單 UI 與 submit 邏輯，不動其他功能。

---

## 進度追蹤（跨 Session 記憶用）

| 項目 | 狀態 | 備註 |
|------|------|------|
| D1：移除廢棄 key | ✅ 完成 | |
| D2：domain 不一致 | ✅ 完成 | |
| D3：PATCH email normalize | ✅ 完成 | DELETE 也一併修正（M3） |
| D4-a：GET /api/issues dept_group | ✅ 完成 | |
| D4-b：tracker super_admin 全看 | ✅ 完成 | |
| D5：角色重命名 cascade | ✅ 完成 | cascade 失敗回 207（S2 修正） |
| D6：共用 getAssignableRolesData | ✅ 完成 | |
| D7：GET/POST /api/roles 補欄位 | ✅ 完成 | |
| F1：帳號列表部門隔離 | ✅ 完成 | user null 保護也一併修正（M1） |
| F2：新增角色表單欄位 | ✅ 完成 | |
| M2：型別 level string→string|null | ✅ 完成 | reviewer 追加 |
| M4：RolesManager 移除廢棄 UI 選項 | ✅ 完成 | reviewer 追加 |
| tester 驗收 | ✅ 完成 | 10/10 通過 |
| reviewer 審查 | ✅ 完成 | S1/S2/M1-M4 全部處理 |

---

## 驗收標準

- [ ] @eup.com.vn 的帳號可以正常執行帳號管理（新增/修改帳號不再 403）
- [ ] dept_admin（如管理員(技師)）進入帳號管理頁，只看到技師部門的帳號
- [ ] dept_admin 進入任務板，只看到本部門的議題
- [ ] 管理員（super_admin）進入任務板，看到所有部門的議題
- [ ] GET /api/issues 回傳結果與 tracker/page.tsx SSR 一致（不同部門無法透過 API 拿到跨部門資料）
- [ ] 角色重命名後，使用該角色的帳號權限不變（allowed_emails 已同步更新）
- [ ] PATCH /api/admin/users 大寫 email 能正確找到記錄並更新
- [ ] GET /api/roles 回傳包含 dept_group 和 level 欄位
- [ ] POST /api/roles 新增角色時可指定 dept_group 和 level
- [ ] RolesManager 新增角色 Dialog 有 dept_group 和 level 下拉選單
- [ ] `npm run build` 通過

---

## 委派指示

```
【data agent】
執行 D1–D7（含 D4-b tracker/page.tsx 修改）：
- 修改 src/lib/admin.ts（D1 移除廢棄 key、D6 新增 getAssignableRolesData、export isAllowedDomain）
- 修改 src/app/api/admin/users/route.ts（D2 domain、D3 email normalize）
- 修改 src/app/api/issues/route.ts（D4-a dept_group 過濾）
- 修改 src/app/tracker/page.tsx（D4-b super_admin 看全部，注意加 level 到 select）
- 修改 src/app/api/roles/[id]/route.ts（D5 cascade 更新）
- 修改 src/app/api/roles/assignable/route.ts（D6 改呼叫共用函數）
- 修改 src/app/api/roles/route.ts（D7 補欄位）
規格：_管理/01_equipment-cards/specs/step26-logic-audit-fixes.md

【frontend agent】
執行 F1–F2：
- 修改 src/app/admin/users/page.tsx（F1 帳號列表部門隔離）
- 修改 src/components/RolesManager.tsx（F2 新增角色表單欄位）
規格：_管理/01_equipment-cards/specs/step26-logic-audit-fixes.md

【禁止觸碰】
  src/components/CardFormDialog.tsx
  src/components/CardDetailDialog.tsx
  src/components/EquipmentCardItem.tsx
  src/components/BatchImportDialog.tsx
  src/app/page.tsx

完成後：tester 驗收 → reviewer 審查
```

---

## 注意事項 / 踩坑預防

1. **D6 的 Promise.all 順序問題**：`admin/users/page.tsx` 需先取到 `user.email` 才能呼叫 `getAssignableRolesData(user.email)`。若用 Promise.all 並行，需先單獨取 user，再並行後續查詢。
2. **D4 的 service client 問題**：`GET /api/issues` route 目前宣告的 `getSupabase()` 使用 service role key（可看到全部資料），過濾必須在 query 層做（不能靠 RLS），所以邏輯必須寫在 route 裡。
3. **D5 的 cascade 非原子性**：roles 更新成功但 allowed_emails 更新失敗時，系統處於不一致狀態。已設計為回傳 warning 而不回滾（因為 Supabase REST API 沒有 transaction）。如需保證原子性，可考慮改用 Supabase RPC（SQL function），但屬於未來優化。
4. **D6 的 isAllowedDomain 需 export**：`api/roles/assignable/route.ts` 要用到，目前 admin.ts 裡是 private function，需加 `export`。
5. **F1 的頁面查詢順序**：由於 fetchAllowedEmails 現在需要 callerLevel + callerDeptGroup，這兩個值必須先查到，不能全部並行。改為分兩批查詢（見 F1 說明）。
