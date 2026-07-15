# Step 33 — 使用統計（登入次數／停留時長／功能使用分析）

## 背景與目的

帳號管理頁新增「初始登入」「最後登入」後，使用者希望進一步掌握：
1. 每人登入次數（Supabase Auth 只有「初始/最後登入時間」，沒有次數）
2. 單次停留多久（Supabase Auth 完全沒有這個資料）
3. 各功能有沒有被實際使用（判斷系統有沒有「落地」），以料卡檢索/瀏覽為核心指標，其餘功能（任務板、人為配件報價、文件）為次要指標

## 已確認的決策（腦力激盪收斂）

- 追蹤範圍：完整使用行為分析（登入 + 停留時長 + 關鍵功能使用），不只做登入記錄
- 關鍵指標優先順序：**料卡檢索/瀏覽為主**，其餘功能都值得記錄但非核心
- 查看權限：獨立 permission key（`view_analytics`），管理員可依角色彈性開放，不綁死 super_admin
- 心跳頻率：60 秒一次
- 隱私：內部工具記錄員工登入/使用情形，使用者已確認沒有疑慮

## 資料庫設計（3 張新表，皆走 service_role 讀寫，RLS 全鎖不開放 authenticated 存取，比照 Step 31/32 手法）

### `login_events`
單純記錄「每次成功登入」這個事件，用來算登入次數/頻率。

```sql
create table login_events (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);
create index login_events_email_idx on login_events(email);
```

寫入點：`src/app/auth/callback/route.ts`，`isEmailAllowedToLogin` 通過後、redirect 前，用 service role client insert 一筆（fire-and-forget，失敗不擋登入流程）。

### `usage_sessions`
估算單次停留時長。session id 由前端在頁面第一次載入時用 `crypto.randomUUID()` 產生，存在 `sessionStorage`（分頁關閉即失效，符合「一次停留」的定義）。

```sql
create table usage_sessions (
  id uuid primary key,
  email text not null,
  started_at timestamptz not null default now(),
  last_ping_at timestamptz not null default now()
);
create index usage_sessions_email_idx on usage_sessions(email);
```

- 心跳 API：`POST /api/analytics/heartbeat`，body `{ session_id }`。第一次呼叫（session_id 不存在）→ insert；之後每次呼叫 → update `last_ping_at`。email 一律從伺服器端 `supabase.auth.getUser()` 取得，不信任前端傳的值。
- 前端：新增 `src/hooks/useHeartbeat.ts`，每 60 秒打一次心跳；分頁不可見（`document.hidden`）時暫停，避免背景分頁持續佔用資源。掛載點：`src/app/page.tsx`（首頁，等同「登入後的主要停留頁」）比照任務板/報價查詢分頁的 mount-once 模式。
- 停留時長 = `last_ping_at - started_at`（單一 session）；多個 session 加總可算「總使用時數」。

### `usage_events`
記錄關鍵功能使用（通用事件表，之後要加新的追蹤點只需多一行呼叫，不需要改 schema）。

```sql
create table usage_events (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  event_type text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index usage_events_email_idx on usage_events(email);
create index usage_events_type_idx on usage_events(event_type);
```

- 通用 API：`POST /api/analytics/event`，body `{ event_type, metadata? }`，email 從伺服器端 session 取得。前端封裝一個 `logUsageEvent(eventType, metadata?)` fire-and-forget 函式（`src/lib/analytics.ts`），呼叫失敗不影響任何既有功能（try/catch 吞掉）。

**Phase 1 事件（本次实作範圍，料卡為核心）**：
| event_type | 觸發點 | 說明 |
|---|---|---|
| `card_search` | `PhotoWall.tsx` 搜尋框（debounce 後才記錄，避免每個按鍵都送） | 記錄有沒有人在用搜尋 |
| `card_detail_view` | `CardDetailDialog.tsx` 開啟時 | metadata: `{ equipment_id }` |

**Phase 2 事件（後續依需要再擴充，本次先不做）**：
`tracker_view` / `quote_search` / `document_view` 等，架構上只是多加呼叫點，之後隨時可以加。

## 權限

- `src/lib/admin.ts` 的 `VALID_PERMISSION_KEYS`（實際檔案是 `src/app/api/roles/[id]/permissions/route.ts`）新增 `view_analytics`
- `src/components/RolesManager.tsx` 權限清單新增「使用統計」勾選項（獨立分組，比照人為配件報價的做法）

## 新增頁面：`/admin/analytics`

- `src/app/admin/analytics/page.tsx`：`requirePermission('view_analytics')` 保護，SSR 撈三張表做基礎彙總（每人：登入次數、總/平均停留時長、各 event_type 次數），傳給 client 元件
- `src/components/AnalyticsClient.tsx`：表格呈現，依 email 分組，可依「登入次數」「總停留時長」排序
- 入口連結：比照 `UserMenu.tsx` 現有「帳號管理」「角色管理」連結的模式，新增「使用統計」，僅 `permissions.includes('view_analytics')` 時顯示

## 核心保護元件異動範圍（本次規格明確授權）

| 元件 | 異動內容 |
|---|---|
| `src/app/page.tsx` | 掛載 `useHeartbeat()` |
| `src/components/PhotoWall.tsx` | 搜尋框 onChange 加一行 debounce 後的 `logUsageEvent('card_search', ...)` 呼叫 |
| `src/components/CardDetailDialog.tsx` | `useEffect` 在 `open` 變 true 時呼叫一次 `logUsageEvent('card_detail_view', { equipment_id })` |
| `src/components/UserMenu.tsx` | 新增「使用統計」連結（沿用既有連結樣式） |

以上 4 個元件的異動都是「加一行 fire-and-forget 呼叫」或「加一個連結」，不改變既有 UI 外觀與既有邏輯行為。

## 執行順序

1. `data`：SQL migration（3 張表 + RLS）、`POST /api/analytics/heartbeat`、`POST /api/analytics/event`、`GET /api/admin/analytics`（或直接 SSR 查詢）、`VALID_PERMISSION_KEYS` 新增 `view_analytics`
2. `frontend`：`useHeartbeat.ts`、`lib/analytics.ts`、`page.tsx`/`PhotoWall.tsx`/`CardDetailDialog.tsx` 三處埋點、`RolesManager.tsx` 權限勾選、`UserMenu.tsx` 入口連結、`admin/analytics/page.tsx` + `AnalyticsClient.tsx`
3. `tester`：驗證心跳/事件 API 邊界情況、權限保護、SQL migration 是否可重複執行
4. `reviewer`：安全性審查（email 是否都從伺服器端 session 取得、RLS 是否鎖死、metadata JSONB 有無注入疑慮）
5. 主 session 整合回報，使用者手動執行 SQL + 瀏覽器實測

## 不做的事（避免過度設計）

- 不做即時（realtime）儀表板，SSR 查詢 + 手動重新整理即可
- 不做資料保留/清除機制（V1 不設定，之後資料量大再評估）
- Phase 2 事件（tracker/quote/document）本次不做，架構上支援之後直接加
