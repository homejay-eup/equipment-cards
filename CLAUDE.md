# 設備料卡管理系統

部門設備料卡管理系統，取代過大的 Excel 檔。使用人數 10–50 人，料卡 786 筆。

## 目前進度

| 步驟 | 狀態 |
|------|------|
| Step 1：資料盤點 + Schema | ✅ 完成 |
| Step 2：Supabase + Cloudinary 設定 | ✅ 完成 |
| Step 3：批次上傳（786 筆料卡 + 1091 張細節照片） | ✅ 完成 |
| Step 4：Next.js 專案建立 + 照片牆 UI | ✅ 完成 |
| Step 5：查詢、篩選、模糊搜尋 | ⏳ 待執行 |
| Step 6：Vercel 部署 | ⏳ 待執行 |

## 技術選型

- **前端**：Next.js 14 + Tailwind CSS + shadcn/ui
- **資料庫**：Supabase（PostgreSQL + Auth）
- **照片儲存**：Cloudinary（免費 25 credits/月）
- **部署**：Vercel

## 關鍵資訊

- Supabase URL：`https://ntapfguwmuufnlafroxs.supabase.co`
- Cloudinary Cloud Name：`dnqtafoh6`
- 上傳資料夾：`equipment-cards/`
- 環境變數：`.env.local`（已填寫完畢）

## 資料庫 Schema（equipment_cards 表）

```
equipment_id          TEXT PRIMARY KEY      -- 如 1000003
name                  TEXT NOT NULL
category              TEXT                  -- 主機/天線/支架/螢幕…
vendor                TEXT
status                TEXT DEFAULT 'active' -- 'active' | 'discontinued'
tags                  TEXT[]
notes                 TEXT
main_photo            TEXT                  -- Cloudinary secure_url
main_photo_public_id  TEXT                  -- 刪除照片用
detail_photos         JSONB                 -- [{"public_id":"…","url":"…"}]
created_at            TIMESTAMPTZ
updated_at            TIMESTAMPTZ
```

## 檔案結構

```
設備料卡/                            ← Next.js 14 專案根目錄
├── CLAUDE.md
├── .env.local                       ← 環境變數（已填寫）
├── next.config.mjs                  ← Cloudinary image domain 白名單
├── tailwind.config.ts               ← shadcn/ui CSS 變數設定
├── src/
│   ├── app/
│   │   ├── layout.tsx               ← Root layout（Inter 字型）
│   │   ├── page.tsx                 ← 首頁：Server Component，拉 Supabase 資料
│   │   ├── globals.css              ← Tailwind v3 + shadcn CSS 變數
│   │   └── api/upload/              ← 照片上傳/刪除 API routes
│   ├── components/
│   │   ├── PhotoWall.tsx            ← Client Component：搜尋 + Grid 網格
│   │   ├── EquipmentCardItem.tsx    ← 單張卡片縮圖元件
│   │   ├── CardDetailDialog.tsx     ← 細節 Lightbox（照片輪播 + 資訊）
│   │   └── ui/                     ← shadcn/ui 元件（Radix 版）
│   ├── hooks/usePhotoUpload.ts      ← 照片上傳 hook
│   ├── lib/
│   │   ├── supabase.ts              ← Supabase client（anon key）
│   │   └── utils.ts                 ← cn() helper
│   └── types/equipment.ts           ← EquipmentCard TypeScript 型別
└── _開發檔案/                       ← 開發工具（已排除在 tsconfig 外）
    └── scripts/batch-upload.ts     ← 批次上傳腳本（已執行完畢）
```
