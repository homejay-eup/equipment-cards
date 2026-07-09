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
  - ⏳ **待辦**：使用者瀏覽器實測（tester 無法自動化測試的部分）+ commit/push
- **Step 16 補充說明**：曾誤認為「Phase 2 批次淨重照片待照片提供」仍卡著，經查 commit（`9ba80cb`）與資料快照確認，淨重欄位/照片/批次匯入功能皆已完成，淨重數值也已批次回填 770/786 筆，非阻塞待辦
- **目前 git HEAD**：`d199a1b`（已 push main，含 Step 30 階段1 文件正規化 + API，已 Vercel 部署，尚未實測）
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

---

## 此次任務（每次新對話時更新，執行完後清空）

（空白，待下次任務指派）

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