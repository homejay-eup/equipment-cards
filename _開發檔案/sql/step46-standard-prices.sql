-- Step 46：標準售價（主機／設備整機銷售方案）
-- 執行前注意：本檔案為一次性建表腳本，可安全重複執行（皆用 IF NOT EXISTS）。
-- 執行方式：使用者於正式 Supabase SQL Editor 手動執行，非本次程式自動執行。
--
-- 設計重點：
--   - 同一產品名稱（name 完全相同＝同一產品）可有多個版本，以 effective_date 區分；
--     「現行版本」不存欄位，由程式計算（同 name 中 effective_date 最大者）。
--   - (name, effective_date) 唯一：同一產品同一天只能有一個版本，API 撞到回 409。
--   - updated_at 比照 quote_items / equipment_cards，由 API Route 寫入當下時間（不用 trigger）。
--   - 新表，無舊資料相容性問題；extra_fees / notes_image_urls 預設 '[]'，notes_table_data 預設 NULL。

-- 1. 建表：標準售價品項（每列＝某產品的某一個版本）
CREATE TABLE IF NOT EXISTS standard_price_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,                      -- 產品名稱（識別用）
  category             TEXT NOT NULL,                      -- 分類（自由輸入）
  plan_name            TEXT,                               -- 方案名稱（出自哪份文件）
  effective_date       DATE NOT NULL,                      -- 生效日期（版本）
  buyout_list_price    NUMERIC,                            -- 買斷定價
  buyout_sales_price   NUMERIC,                            -- 買斷業務價
  buyout_manager_price NUMERIC,                            -- 買斷主管價
  warranty             TEXT,                               -- 保固（例：三年）
  rent_monthly         NUMERIC,                            -- 0 元月租方案月租（元/月）
  rent_contract        TEXT,                               -- 合約期（例：三年約，續租續保）
  platform_fee_buyout  NUMERIC,                            -- 平台費（買斷，元/月）
  platform_fee_rent    NUMERIC,                            -- 平台費（租賃，元/月）
  install_fee          NUMERIC,                            -- 施工費（元/台）
  extra_fees           JSONB NOT NULL DEFAULT '[]'::jsonb, -- 其他費用 [{ name, amount, unit }]
  notes                TEXT,                               -- 備註文字
  notes_image_urls     JSONB NOT NULL DEFAULT '[]'::jsonb, -- 備註圖片 [{ public_id, url }]（比照 Step 45）
  notes_table_data     JSONB DEFAULT NULL,                 -- 備註表格 { rows: string[][], hasHeader }（比照 Step 45）
  points_buyout        NUMERIC,                            -- 買斷業績積分（分/台）
  points_rent          NUMERIC,                            -- 租賃業績積分（分/台）
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by           TEXT,                               -- 最後修改者 email
  CONSTRAINT standard_price_items_name_effective_date_key UNIQUE (name, effective_date)
);

-- 2. 索引：依產品名稱查詢全部版本、匯入時依名稱批次比對既有資料
CREATE INDEX IF NOT EXISTS standard_price_items_name_idx ON standard_price_items (name);

-- 3. RLS：內部價格資料，全鎖不開放 authenticated 直接讀寫（比照 quote_items）
--    所有讀寫一律經過 API Route（/api/standard-prices/*），用 service_role 存取；
--    觀看：所有登入者（API 檢查 session）；新增/修改/刪除/匯入：需 edit_quotes 權限（沿用既有 key，不新增）
ALTER TABLE standard_price_items ENABLE ROW LEVEL SECURITY;

-- 4. 初始資料：使用者提供的兩份銷售方案（2025.9 DMS 168 & 土石方車機 & EDR+416、2025.2 公信/捷世林 16-1）
--    已存在同名同生效日期的版本就略過（ON CONFLICT DO NOTHING），可安全重複執行、不會覆蓋之後手動修改的內容。
--    生效日期：原文件只標到月份，一律取該月 1 日。
INSERT INTO standard_price_items (
  name, category, plan_name, effective_date,
  buyout_list_price, buyout_sales_price, buyout_manager_price, warranty,
  rent_monthly, rent_contract,
  platform_fee_buyout, platform_fee_rent, install_fee,
  extra_fees, notes, points_buyout, points_rent, updated_by
) VALUES
(
  'DMS 168', '疲勞偵測', '2025.9 DMS 168 & 土石方車機 & EDR+416 銷售方案', '2025-09-01',
  6800, 6500, 6000, '三年',
  280, '三年約（續租續保）',
  NULL, NULL, NULL,
  '[{"name":"平台費加收（年繳，可半年／季繳）","amount":40,"unit":"元"}]'::jsonb,
  '需搭配車機（S168、EDR、MDVR 其一）及 Smart Box 使用。',
  2, 1, 'Step 46 初始資料'
),
(
  '土石方車機（車頭）', '土石方車機', '2025.9 DMS 168 & 土石方車機 & EDR+416 銷售方案', '2025-09-01',
  NULL, NULL, NULL, NULL,
  350, '三年約（續租續保）',
  NULL, NULL, NULL,
  '[]'::jsonb,
  '適用型號：U1 PLUS LTE、EDR-168P。',
  NULL, 2, 'Step 46 初始資料'
),
(
  '土石方車機（尾車）', '土石方車機', '2025.9 DMS 168 & 土石方車機 & EDR+416 銷售方案', '2025-09-01',
  NULL, NULL, NULL, NULL,
  380, '三年約（續租續保）',
  NULL, NULL, NULL,
  '[]'::jsonb,
  '適用型號：U1 PLUS LTE、EDR-168P。尾車費用包含防水盒。',
  NULL, 2, 'Step 46 初始資料'
),
(
  'EDR 數位大餅 + 416 刷卡機', '數位大餅', '2025.9 DMS 168 & 土石方車機 & EDR+416 銷售方案', '2025-09-01',
  NULL, NULL, NULL, NULL,
  400, '三年約',
  NULL, NULL, NULL,
  '[]'::jsonb,
  '三年期滿 416 歸客戶所有，不保固。',
  NULL, 4, 'Step 46 初始資料'
),
(
  '公信 16-1 數位大餅', '數位大餅', '2025.2 公信、捷世林(JAS) 16-1 數位大餅銷售方案', '2025-02-01',
  13800, NULL, 13000, '買斷三年；租用期間保固（停用後設備整套需歸還）',
  0, '三年',
  340, 680, 1000,
  '[{"name":"新車原廠搭載 16-1 加裝 4G 模組","amount":4500,"unit":"元/台"},{"name":"加裝 4G 模組施工費","amount":300,"unit":"元/台"},{"name":"車機設備校驗（每 2 年）","amount":500,"unit":"元/次"}]'::jsonb,
  E'1. 啟用日（1 或 16）權限：業務可延 1 個月，區主管可延 2 個月。\n2. 買斷方案含首年平台費，第二年起平台費每台 340 元/月。\n3. 買斷方案車機設備保固三年，第四年起如設備故障可選擇新購（同買斷方案）或加購保固（同租賃方案）。\n4. 車機設備每 2 年需重新校驗核發合格證，費用每台 500 元/次。\n5. 技師至現場如確認原設備無法加裝 4G 模組（須拍照），應立即通報業務，且不得直接更換車機，需由業務與客端溝通下新單（買斷或租賃）。\n6. 新車原廠搭載 16-1 加裝模組保固：自領牌日起 2 年；過保後如有故障可選擇新購（同買斷方案）或加費保固（同租賃方案）。',
  NULL, NULL, 'Step 46 初始資料'
),
(
  '捷世林(JAS) 16-1 數位大餅', '數位大餅', '2025.2 公信、捷世林(JAS) 16-1 數位大餅銷售方案', '2025-02-01',
  13800, NULL, 13000, '買斷三年；租用期間保固（停用後設備整套需歸還）',
  0, '三年',
  340, 680, 1000,
  '[{"name":"新車原廠搭載 16-1 加裝 4G 模組","amount":4500,"unit":"元/台"},{"name":"加裝 4G 模組施工費","amount":300,"unit":"元/台"},{"name":"車機設備校驗（每 2 年）","amount":500,"unit":"元/次"}]'::jsonb,
  E'1. 啟用日（1 或 16）權限：業務可延 1 個月，區主管可延 2 個月。\n2. 買斷方案含首年平台費，第二年起平台費每台 340 元/月。\n3. 買斷方案車機設備保固三年，第四年起如設備故障可選擇新購（同買斷方案）或加購保固（同租賃方案）。\n4. 車機設備每 2 年需重新校驗核發合格證，費用每台 500 元/次。\n5. 技師至現場如確認原設備無法加裝 4G 模組（須拍照），應立即通報業務，且不得直接更換車機，需由業務與客端溝通下新單（買斷或租賃）。\n6. 新車原廠搭載 16-1 加裝模組保固：自領牌日起 1 年；過保後如有故障可選擇新購（同買斷方案）或加費保固（同租賃方案）。',
  NULL, NULL, 'Step 46 初始資料'
)
ON CONFLICT (name, effective_date) DO NOTHING;
