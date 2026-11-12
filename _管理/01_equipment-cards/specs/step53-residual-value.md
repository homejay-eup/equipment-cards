# Step 53 規格：設備殘值計算

> 來源：2026-11-12 需求討論。把供應鏈管理組的單檔 HTML 工具「設備殘值計算器_20261109.html」搬進料卡系統，
> 並讓後台可以直接維護品項與金額，不必再改 HTML 重新發檔。

---

## 功能描述

新頁籤「設備殘值計算」（位置：人為配件報價之後、標準售價之前）：

- **計算畫面**：設備殘值／合約殘值兩個分頁；輸入品名或品號帶出金額與年限，依計算日與起算日算出殘值；
  可複製結果貼 Excel、複製圖片、下載圖片（計算規則與原 HTML 完全一致）。
- **管理品項**（需編輯權限）：新增／修改／刪除品項、CSV 批次匯入（以品號比對，全有或全無）、匯出 CSV。
- **價格版本**：由資料庫 trigger 在品項真的有異動時自動更新，取代原 HTML 手動填的版本字串。

殘值＝金額 ÷ 年限(月) × 剩餘月數（超過年限以 0 計）；使用月數同 Excel `DATEDIF(起算日, 計算日, "M")`；
每列四捨五入到元；金額與年限皆空＝「報價無資料」，不列入合計。

## 設計決策

| 項目 | 決策 |
|------|------|
| 位置 | 獨立頁籤，**不併入**人為配件報價（金額與報價的標準售價不是同一份數字，已與使用者確認） |
| 資料 | 獨立資料表 `residual_items`（品號唯一、品名、金額、年限(月)、排序）＋單列 `residual_meta`（價格版本） |
| 分類 | 本版不做（使用者決定先不加，之後可補欄位） |
| 修改紀錄 | 本版不做；每筆只記最後修改人／時間 |
| 存取 | 兩張表 RLS 全鎖，一律經 `/api/residual/**`（service_role）並先檢查權限 |

## 權限

- `view_residual`：可看頁籤、使用計算器。
- `edit_residual`：管理品項（隱含可看）。
- 預設只授予「管理員」角色（SQL 內建）；其他角色在「系統管理 → 角色管理 → 設備殘值計算」勾選。
- 2026-11-12 已於正式環境把 `view_residual` 加到「業務」「業務(管理)」兩個角色。

## API

| 路徑 | 方法 | 權限 | 說明 |
|------|------|------|------|
| `/api/residual/items` | GET | view/edit | 回 `{ items, version }` |
| `/api/residual/items` | POST | edit | 新增，品號重複回 409 |
| `/api/residual/items/[id]` | PATCH／DELETE | edit | 找不到回 404 |
| `/api/residual/import` | POST | edit | 批次新增／更新，一次最多 1000 筆，任一列有誤整批不寫入 |

## 異動檔案

- 新增：`src/components/residual/*`、`src/lib/residual*.ts`、`src/types/residual.ts`、`src/app/api/residual/**`、
  `_開發檔案/sql/step53-residual-value.sql`、`step53b-residual-version-fix.sql`
- 既有檔案最小侵入：`PhotoWall.tsx`（頁籤按鈕＋掛載，使用者已同意）、`RolesManager.tsx`（權限顯示）、
  `api/roles/[id]/permissions/route.ts`（權限白名單）

## SQL

- `step53-residual-value.sql`：建表、trigger、RLS、管理員權限、216 筆初始資料（只在資料表為空時匯入）。
- `step53b-residual-version-fix.sql`：僅給「已執行過舊版 step53（statement-level trigger）」的資料庫；
  新執行 `step53-residual-value.sql` 的環境不需要。

## 已知待確認

- 初始資料中 `1000131`（4G ROUTER MR600 V3，28080）與 `9000266`（EDR-168(P)天線，5200）金額看起來偏高，照原 HTML 匯入，請上線後確認。
