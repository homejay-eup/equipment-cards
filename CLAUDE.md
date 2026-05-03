# 設備料卡管理系統

部門設備料卡管理系統，取代過大的 Excel 檔。使用人數 10–50 人，料卡 786 筆。

## 🚀 系統已上線

- **正式網址**：https://equipment-cards.vercel.app
- **上次部署**：2026-05-03，所有功能正常運作

## ✅ 開發進度（全部完成）

| 步驟 | 狀態 | 說明 |
|------|------|------|
| Step 1：資料盤點 + Schema | ✅ 完成 | Supabase 資料表建立 |
| Step 2：Supabase + Cloudinary 設定 | ✅ 完成 | 雲端服務設定完畢 |
| Step 3：批次上傳 | ✅ 完成 | 786 筆料卡 + 1091 張細節照片 |
| Step 4：Next.js 專案 + 照片牆 UI | ✅ 完成 | 卡片網格 + Lightbox |
| Step 5：查詢、篩選、模糊搜尋 | ✅ 完成 | Fuse.js + 分類 + 狀態 + URL 同步 |
| Step 6：Vercel 部署 + GitHub | ✅ 完成 | 自動部署，push 即上線 |

## 🔑 服務帳號與網址

| 服務 | 帳號 / 資訊 |
|------|------------|
| **GitHub** | https://github.com/homejay-eup/equipment-cards |
| **Vercel** | https://vercel.com/hjs-projects-bc94d0b2/equipment-cards（專案名：equipment-cards）|
| **Supabase** | https://supabase.com → 專案 `ntapfguwmuufnlafroxs` |
| **Cloudinary** | https://cloudinary.com → Cloud Name: `dnqtafoh6` |

## ⚙️ 技術選型

- **前端**：Next.js 14 + Tailwind CSS + shadcn/ui + Fuse.js
- **資料庫**：Supabase（PostgreSQL）
- **照片儲存**：Cloudinary（免費 25 GB）
- **部署**：Vercel Hobby（GitHub 自動部署）

## 🗂️ 分類系統（category + tags）

`category` 欄位對應 UI 篩選按鈕：

| 分類 | 說明 |
|------|------|
| 主機 | GPS 定位器、DVR、環保車機（1000xxx）|
| 鏡頭 | 各式攝影機（2000xxx）|
| 螢幕 | 車用螢幕（3000xxx）|
| 儲存媒體 | 記憶卡、SSD、HDD（4000xxx）|
| 線材 | 電源線、鏡頭線、轉接線（7000xxx）|
| 配件 | ADAS、RFID、Smart Box、胎壓、酒測器等 |
| 耗材 | 螺絲、螺帽、束帶、繼電器等 |
| 工具 | 校正工具 |
| 國外設備 | 進口設備 |

`tags` 欄位由 `設備線材_照片Jason` 資料夾結構自動萃取：
- 品牌標籤：`HS昇銳`、`FUHO馥鴻`、`格瑪車機`、`康訊車機` 等
- 功能標籤：`ADAS`、`RFID`、`Smart Box`、`盲區`、`DMS`、`CAN設備` 等
- 搜尋時可直接輸入標籤名稱（Fuse.js 模糊比對）

若需重新更新 category/tags，執行：
```bash
node _開發檔案/scripts/update-categories.js
```

## 🗄️ 資料庫 Schema（equipment_cards 表）

```
equipment_id          TEXT PRIMARY KEY      -- 如 1000003
name                  TEXT NOT NULL
category              TEXT                  -- 主機/鏡頭/螢幕/線材/配件/耗材…
vendor                TEXT
status                TEXT DEFAULT 'active' -- 'active' | 'discontinued'
tags                  TEXT[]                -- 品牌/功能標籤，如 ["HS昇銳","RFID"]
notes                 TEXT
main_photo            TEXT                  -- Cloudinary secure_url
main_photo_public_id  TEXT                  -- 刪除照片用
detail_photos         JSONB                 -- [{"public_id":"…","url":"…"}]
created_at            TIMESTAMPTZ
updated_at            TIMESTAMPTZ
```

## 🔧 本機開發

```bash
# 1. 安裝依賴
npm install

# 2. 確認 .env.local 存在（內含所有金鑰）
# 參考 .env.local.example

# 3. 啟動開發伺服器
npm run dev
# → http://localhost:3000

# 4. 部署上線（push 到 GitHub 即自動觸發）
git add .
git commit -m "說明"
git push
```

## 🌐 部署流程

| 方式 | 說明 |
|------|------|
| **自動**（推薦）| `git push` → GitHub → Vercel 自動部署 |
| **手動**（備用）| `npx vercel --prod` |

> **注意**：git commit 作者必須使用 `homejay@eup.com.tw`  
> 本機已設定：`git config user.name "homejay-eup"` / `git config user.email "homejay@eup.com.tw"`  
> 換電腦時需重新執行上述設定

## 📁 專案檔案結構

```
設備料卡/                              ← Next.js 14 專案根目錄
├── CLAUDE.md                          ← 本文件
├── .env.local                         ← 環境變數（勿 commit）
├── .env.local.example                 ← 環境變數範本
├── next.config.mjs                    ← Cloudinary image domain 白名單
├── tailwind.config.ts                 ← shadcn/ui CSS 變數設定
├── src/
│   ├── app/
│   │   ├── layout.tsx                 ← Root layout（Inter 字型）
│   │   ├── page.tsx                   ← 首頁：Server Component + Suspense
│   │   ├── globals.css                ← Tailwind v3 + shadcn CSS 變數
│   │   └── api/upload/                ← 照片上傳/刪除 API routes
│   ├── components/
│   │   ├── PhotoWall.tsx              ← 搜尋 + 分類篩選 + Grid（Fuse.js）
│   │   ├── EquipmentCardItem.tsx      ← 單張卡片縮圖元件
│   │   ├── CardDetailDialog.tsx       ← 細節 Lightbox（照片輪播）
│   │   └── ui/                        ← shadcn/ui 元件
│   ├── hooks/usePhotoUpload.ts        ← 照片上傳 hook
│   ├── lib/
│   │   ├── supabase.ts                ← Supabase client
│   │   └── utils.ts                   ← cn() helper
│   └── types/equipment.ts             ← EquipmentCard TypeScript 型別
├── 設備線材_照片Jason/                ← 分類用資料夾（category/tags 來源）
└── _開發檔案/                         ← 開發工具（排除在 tsconfig 外）
    └── scripts/
        ├── batch-upload.ts            ← 批次上傳腳本（已執行完畢，勿重複執行）
        └── update-categories.js       ← 分類/標籤更新腳本
```

## 🔮 未來可擴充方向

- [ ] 管理員後台：新增 / 編輯 / 刪除料卡
- [ ] 照片上傳 UI（目前只有 API）
- [ ] 廠商篩選器
- [ ] 匯出 PDF / Excel 清單
- [ ] Supabase Auth 登入（限定公司成員）
- [ ] 手機版 UI 優化
