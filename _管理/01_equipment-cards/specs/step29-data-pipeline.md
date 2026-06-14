# Step 29 規格：資料管線（批次匯入 + 全量備份）

> 來源：2026-06-14 需求討論。
> 前置條件：無（獨立腳本，不影響前端）。

---

## 功能描述

提供兩支可重複執行的 CLI 腳本，讓使用者無需手動操作 Supabase / Cloudinary，
只需在本機整理好 `_開發檔案/data/` 資料夾，即可由 Claude Code 協助執行批次匯入或備份。

---

## 輸入資料夾規格

```
_開發檔案/data/
├── manifest.csv          ← 文字欄位（必要）
├── photos-main/          ← 主圖（品號_品名.jpg）
├── photos-detail/        ← 細節照（品號_品名_2.jpg、_3.jpg…）
└── photos-weight/        ← 淨重照（品號_品名_2.67.jpg）
```

### manifest.csv 欄位

| 欄位 | 必填 | 說明 |
|------|------|------|
| `equipment_id` | ✅ | 品號（DB 主鍵，同照片檔名前綴） |
| `name` | ✅ | 品名 |
| `category` | ✅ | 分類 |
| `vendor` | | 廠商 |
| `status` | | 狀態（留空預設「現役」） |
| `tags` | | 標籤，多個用 `\|` 或逗號分隔皆可（腳本同時支援兩種） |
| `notes` | | 備註 |
| `net_weight` | | 淨重（數字，kg） |

> `documents`（PDF 連結）欄位結構複雜，維持透過 UI 手動管理，不放進 manifest。

### 照片命名規則

| 資料夾 | 命名格式 | 說明 |
|--------|---------|------|
| `photos-main/` | `品號_品名.jpg` | 每筆料卡一張主圖 |
| `photos-detail/` | `品號_品名_2.jpg`、`_3.jpg`… | 流水號後綴 |
| `photos-weight/` | `品號_品名_2.67.jpg` | 後綴為 kg 數值（小數） |

---

## 腳本 1：`batch-import.ts`

**路徑**：`_開發檔案/scripts/batch-import.ts`

**功能**：讀取 `_開發檔案/data/` → 上傳照片到 Cloudinary → Upsert Supabase

**Replace 行為（equipment_id 已存在時）**：
1. 刪除 Cloudinary 所有舊照片（main / detail / weight）
2. 刪除 Supabase 該筆 equipment_cards 記錄
3. 重新上傳照片、寫入 DB

**執行指令**：
```bash
cd _開發檔案/scripts
npx tsx batch-import.ts             # 正式執行
npx tsx batch-import.ts --dry-run   # 只解析不上傳，確認結果
```

**日誌輸出**：`_開發檔案/logs/batch-import-YYYY-MM-DD.log`

---

## 腳本 2：`export-backup.ts`

**路徑**：`_開發檔案/scripts/export-backup.ts`

**功能**：全量匯出 Supabase 資料 + 下載 Cloudinary 所有照片

**輸出結構**：
```
_開發檔案/backup/2026-06-14/
├── equipment_cards.json   ← 全量料卡資料
└── photos/
    ├── main/
    ├── detail/
    └── weight/
```

**執行指令**：
```bash
cd _開發檔案/scripts
npx tsx export-backup.ts
```

---

## 全清重灌流程（搬遷 / 環境遷移情境）

```bash
# Step 1：備份現有資料（必做）
npx tsx export-backup.ts

# Step 2：確認備份無誤後，手動清空 Supabase equipment_cards 資料表
# → 在 Supabase 後台執行：TRUNCATE equipment_cards CASCADE;

# Step 3：將新資料放入 _開發檔案/data/（manifest.csv + 照片）

# Step 4：重新匯入
npx tsx batch-import.ts --dry-run   # 先確認解析結果
npx tsx batch-import.ts             # 正式執行
```

> Step 2 刻意保留人工確認，避免誤觸清空資料。

---

## 與 Claude Code 的互動方式

### 日常新增 / 更新一批料卡

1. 將新資料放入 `_開發檔案/data/`：
   - `manifest.csv`（文字欄位）
   - `photos-main/`、`photos-detail/`、`photos-weight/`（照片）
2. 開啟 Claude Code，說：
   > 「`_開發檔案/data/` 已放好新資料，請執行批次匯入」
3. Claude Code 執行 `--dry-run` 讓你確認解析結果
4. 確認無誤後執行正式匯入

### 備份現有資料

1. 開啟 Claude Code，說：
   > 「請備份現在的資料到 `_開發檔案/backup/`」
2. Claude Code 執行 `export-backup.ts`
3. 完成後確認 `_開發檔案/backup/YYYY-MM-DD/` 內容

### 全清重灌

1. 開啟 Claude Code，說：
   > 「請先備份再清空資料庫，然後匯入 `_開發檔案/data/` 的資料」
2. Claude Code 執行備份 → 提示你手動確認清空 → 執行匯入

---

## 產出檔案

| 檔案 | 說明 |
|------|------|
| `_開發檔案/scripts/batch-import.ts` | 批次匯入腳本（新建） |
| `_開發檔案/scripts/export-backup.ts` | 全量備份腳本（新建） |
| `_開發檔案/data/photos-weight/` | 淨重照資料夾（已建立） |

## 禁止觸碰

- 所有 `src/` 下的前端檔案
- `.env.local`
- `_開發檔案/scripts/batch-upload.ts`（原始首次上傳腳本，保留備查）

---

## 完成標準

- `batch-import.ts --dry-run` 能正確解析 `_開發檔案/data/` 資料夾
- 正式執行後 Supabase 資料與 Cloudinary 照片皆正確更新
- `export-backup.ts` 能輸出完整的 JSON + 照片到 `_開發檔案/backup/`
- `npm run build` 不受影響（腳本獨立，不引用前端模組）
