-- Step 53：設備殘值計算器（把「設備殘值計算器_20261109.html」搬進料卡系統）
-- 兩張表：residual_items（品項：品號／品名／金額／年限）、residual_meta（單列，記錄「價格版本」＝最後一次異動時間）。
-- 價格版本由資料表 trigger 自動更新（新增／修改／刪除任一筆都會更新），不用人工填。
-- 另有 2 個新權限 view_residual／edit_residual（管理員角色自動授予；edit 隱含可看）。
-- 可安全重複執行（IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT DO NOTHING）。
--
-- RLS：兩張表一律「啟用 RLS、不建任何 policy」＋收回 anon/authenticated 的表權限，
--   讀寫一律走 /api/residual/**（service_role），並先檢查 view_residual／edit_residual（比照 Step 49）。
--
-- 初始資料：216 筆（來自 HTML 的 DATA；其中 30 筆金額／年限為空＝「報價無資料」），只在資料表為空時匯入，
--   重複執行不會覆蓋後台已修改的內容。價格版本初始值設為原 HTML 的 2026-11-09 10:59（台灣時間）。

-- ── 1. residual_items ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS residual_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL,                      -- 品號（同料卡料號），唯一
  name        TEXT NOT NULL,                      -- 品名
  price       NUMERIC(12,2),                      -- 金額；NULL＝報價無資料
  years       INT,                                -- 年限（單位：月）
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT,
  CONSTRAINT residual_items_code_key UNIQUE (code),
  CONSTRAINT residual_items_price_nonneg CHECK (price IS NULL OR price >= 0),
  CONSTRAINT residual_items_years_range CHECK (years IS NULL OR (years BETWEEN 1 AND 600)),
  CONSTRAINT residual_items_price_years_pair CHECK ((price IS NULL) = (years IS NULL))
);

COMMENT ON COLUMN residual_items.years IS '殘值計算的攤提年限，單位：月（例：36、12）';

CREATE INDEX IF NOT EXISTS residual_items_sort_idx ON residual_items (sort_order, code);

-- ── 2. residual_meta（單列）─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS residual_meta (
  id          INT PRIMARY KEY DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT residual_meta_single_row CHECK (id = 1)
);
INSERT INTO residual_meta (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 任何品項「真的有資料列」被新增／修改／刪除 → 價格版本更新為現在。
-- 用 row-level trigger：對不存在的 id 做修改／刪除（0 列受影響）不會更新版本（statement-level 會誤更新）。
CREATE OR REPLACE FUNCTION touch_residual_meta() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE residual_meta SET updated_at = now() WHERE id = 1;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS residual_items_touch_meta_ins ON residual_items;
DROP TRIGGER IF EXISTS residual_items_touch_meta_upd ON residual_items;
DROP TRIGGER IF EXISTS residual_items_touch_meta_del ON residual_items;
DROP TRIGGER IF EXISTS residual_items_touch_meta ON residual_items;
CREATE TRIGGER residual_items_touch_meta AFTER INSERT OR UPDATE OR DELETE ON residual_items
  FOR EACH ROW EXECUTE FUNCTION touch_residual_meta();

-- ── 3. RLS：全鎖（不建任何 policy）＋收回直連權限 ───────────────────────────
ALTER TABLE residual_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE residual_meta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE residual_items, residual_meta FROM anon, authenticated;
REVOKE ALL ON FUNCTION touch_residual_meta() FROM PUBLIC, anon, authenticated;

-- ── 4. 權限：授予「管理員」角色 view_residual／edit_residual（比照 step49）──────
-- 其他角色由管理員在「系統管理 → 角色管理」自行勾選。
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, 'view_residual' FROM roles WHERE name = '管理員'
UNION ALL SELECT id, 'edit_residual' FROM roles WHERE name = '管理員'
ON CONFLICT DO NOTHING;

-- ── 5. 初始資料（只在資料表為空時匯入）──────────────────────────────────────
DO $seed$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM residual_items) THEN
    INSERT INTO residual_items (code, name, price, years, sort_order) VALUES
  ('1000042', 'HS SD-DVR', 12000, 36, 10),
  ('1000162', 'S208 16-1 歐系數位行車記錄器', 8800, 36, 20),
  ('1000163', 'S208 16-1 日系數位行車記錄器', 8800, 36, 30),
  ('1000158', 'FH E304 4G DVR(4CH)', 12000, 36, 40),
  ('1000159', 'FH E304 DVR(4CH)', 12000, 36, 50),
  ('1000166', 'GS-817S 16-1 數位行車記錄器 V2', 8800, 36, 60),
  ('1000167', 'U1 Plus LTE 數位大餅', 8800, 36, 70),
  ('1000113', 'SM-C43-4G DVR', 6800, 36, 80),
  ('1000115', 'SM-C43-4G DVR(CAT1)', 6800, 36, 90),
  ('1000116', 'Go-168', 3000, 36, 100),
  ('1000142', 'MT99 GPS tracker', 3000, 36, 110),
  ('1000043', 'HS 3G-DVR', 12000, 36, 120),
  ('1000044', 'HS DVR', 12000, 36, 130),
  ('1000045', 'HS 4G-DVR', 12000, 36, 140),
  ('1000054', 'HS AHD 4G-DVR', 12000, 36, 150),
  ('1000055', 'HS AHD DVR', 12000, 36, 160),
  ('1000059', 'HS AHD SD DVR', 12000, 36, 170),
  ('1000078', 'HS AHD 4G-DVR(8AHD)', 15000, 36, 180),
  ('1000081', 'HS AHD DVR(8AHD)', 15000, 36, 190),
  ('1000083', 'HS AHD 4G-DVR(4路)雙SD', 12000, 36, 200),
  ('1000122', 'HS-8230 4G-DVR', 15000, 36, 210),
  ('1000148', 'HS-8231-DVR', 15000, 36, 220),
  ('2000009', 'HS AHD星光級攝影機', 2000, 12, 230),
  ('2000011', 'HS 倒車攝影機', 2000, 12, 240),
  ('2000012', 'HS 車內(前)攝影機', 2000, 12, 250),
  ('2000014', 'HS AHD 倒車攝影機', 2000, 12, 260),
  ('2000015', 'HS AHD 車內(前)攝影機', 2000, 12, 270),
  ('2000026', 'HS AHD車內(前窄角)攝影機', 2000, 12, 280),
  ('2000061', 'HS-CC300 AHD小方攝影機', 2000, 12, 290),
  ('5000024', 'HS毫米波雷達控制盒', 5000, 12, 300),
  ('5000025', 'HS毫米波角雷達', 4000, 12, 310),
  ('5000026', 'HS毫米波LED蜂鳴器', 1200, 12, 320),
  ('5000055', 'HS-毫米波雷達控制盒(歐系)', 5000, 12, 330),
  ('5000056', 'HS-毫米波雷達控制盒(日系)', 5000, 12, 340),
  ('9000026', 'HS 4G大吸盤天線', 1200, 12, 350),
  ('9000144', 'HS UPS電池', 900, 12, 360),
  ('1000088', 'EDR-168 二合一', 5200, 36, 370),
  ('1000103', 'EDR-168(P)二合一', 5200, 36, 380),
  ('9000266', 'EDR-168(P)天線', 5200, 12, 390),
  ('1000102', 'EDR-168(P)數位大餅', 5200, 36, 400),
  ('1000069', 'EDR-168數位大餅', 5200, 36, 410),
  ('1000120', 'GM-S168-LTE(BT)', 3000, 36, 420),
  ('9000201', 'MiFare-RFID416', 1200, 12, 430),
  ('1000151', 'R007T-4G 貨物定位器V2', 6200, 36, 440),
  ('1000060', 'R007T-4G貨物定位器', 6200, 36, 450),
  ('1000138', 'S168-4G(S)', 3000, 36, 460),
  ('1000146', 'S168-4G(TB)', 3000, 36, 470),
  ('1000094', 'S168-4G酒測車機', 3000, 36, 480),
  ('1000005', 'S168-4G衛星定位器', 3000, 36, 490),
  ('1000139', 'S168-LTE (CH)', 3000, 36, 500),
  ('1000124', 'S168-LTE(BT)', 3000, 36, 510),
  ('1000144', 'S168-LTE(CP)', 3000, 36, 520),
  ('1000153', 'S168-LTE(HSR)', 3000, 36, 530),
  ('5000012', 'Smart Box(H)', 900, 12, 540),
  ('5000017', 'Smart Box(N)', 900, 12, 550),
  ('9000075', '1-wire 有線溫度計', 1200, 12, 560),
  ('9000128', 'Smart Box', 900, 12, 570),
  ('5000057', 'Smart Box(H)2.0', 900, 12, 580),
  ('5000045', 'Smart Box(L)', 900, 12, 590),
  ('5000054', 'Smart Box(L2)', 900, 12, 600),
  ('5000044', 'Smart Box(N)1.5', 900, 12, 610),
  ('5000058', 'Smart Box(N)2.0', 900, 12, 620),
  ('5000063', 'Smart Box(T)', 900, 12, 630),
  ('5000065', 'Smart Box(T)CP', 900, 12, 640),
  ('5000062', 'Smart Box(W)1.5', 900, 12, 650),
  ('1000096', 'VN-88 4G(H)', 3000, 36, 660),
  ('1000086', 'VN-88 4G(越弋)', 3000, 36, 670),
  ('9000195', '酒精鎖-SmartBox', 900, 12, 680),
  ('2000032', '酒精鎖-鏡頭', 2000, 12, 690),
  ('9000129', 'Bar Code 掃描器F780', 2500, 12, 700),
  ('9000022', 'EP168 光罩掃描器', 2500, 12, 710),
  ('6000029', 'CS-CAB2000有線酒測器', 2500, 12, 720),
  ('6000003', '無線藍芽酒測器', 2800, 12, 730),
  ('6000007', '有線酒測器', 2800, 12, 740),
  ('1000057', 'FUHO AHD 4G-DVR(4路)雙SD', 12000, 36, 750),
  ('1000058', 'FUHO AHD 4G-DVR(8路)', 15000, 36, 760),
  ('1000061', 'FUHO AHD DVR(4路)', 12000, 36, 770),
  ('1000080', 'FH-82D DVR(8CH)', 15000, 36, 780),
  ('1000121', 'FH-82DD 4G-DVR', 15000, 36, 790),
  ('1000132', 'FH-E304 4G-DVR(4GAD)', 12000, 36, 800),
  ('1000134', 'FH-82DD-DVR', 18000, 36, 810),
  ('1000135', 'FH-82D AI 4G-DVR', 15000, 36, 820),
  ('1000137', 'FH-82DD-DVR(W)', 15000, 36, 830),
  ('1000143', 'FH-82D AI-DVR(W)', 15000, 36, 840),
  ('3000015', 'VP-九吋VSCC螢幕', 2000, 12, 850),
  ('2000046', 'VP-AHD小反攝影機', 2000, 12, 860),
  ('2000047', 'VP-AHD帽型前攝影機', 2000, 12, 870),
  ('9000253', 'VPON GPS天線', 2000, 12, 880),
  ('2000005', 'VPON 攝影機(黑鋼炮)', 2000, 12, 890),
  ('2000003', 'VPON 攝影機(小反向)', 2000, 12, 900),
  ('2000007', 'VPON 攝影機(小型球)', 2000, 12, 910),
  ('2000033', 'VPON 攝影機AHD室外(白鋼砲)', 2000, 12, 920),
  ('2000030', 'VPON攝影機AHD室外(黑鋼炮)', 2000, 12, 930),
  ('2000028', 'VPON 星光級攝影機(小反向)', 2000, 12, 940),
  ('2000029', 'VPON 星光(前)攝影機', 2000, 12, 950),
  ('2000004', 'VPON 攝影機(槍型)', 2000, 12, 960),
  ('2000002', 'VPON 攝影機(帽型)', 2000, 12, 970),
  ('2000016', 'VPON 攝影機AHD室內(黑鋼炮)', 2000, 12, 980),
  ('9000011', 'FUHO  4G GPS天線', 1200, 12, 990),
  ('2000069', 'CR-804K AHD 小方攝影機', 2000, 12, 1000),
  ('2000074', 'CR-804K 720P Camera-Outside', 2000, 12, 1010),
  ('2000017', 'VPON 攝影機AHD(小反向)', 2000, 12, 1020),
  ('2000018', 'VPON 攝影機AHD(不防水白鋼炮)', 2000, 12, 1030),
  ('2000013', 'VPON 攝影機AHD(帽型)', 2000, 12, 1040),
  ('2000019', 'FUHO AHD前檔攝影機', 2000, 12, 1050),
  ('2000020', 'FUHO AHD室外半球紅外線攝影機', 2000, 12, 1060),
  ('2000021', 'FUHO AHD室內半球紅外線攝影機', 2000, 12, 1070),
  ('7000044', '蛇管QQ線(7米)', 1200, 12, 1080),
  ('2000022', 'FUHO AHD攝影機(小反向)', 2000, 12, 1090),
  ('2000025', 'FUHO AHD星光級攝影機', 2000, 12, 1100),
  ('2000027', 'FUHO AHD星光級攝影機(小反向)', 2000, 12, 1110),
  ('2000034', 'FUHO AHD室內半球紅外線攝影機(白鋼砲)', 2000, 12, 1120),
  ('2000076', 'CR-807E AHD室外鋼炮攝影機', 2000, 12, 1130),
  ('2000060', 'FH-AHD S265 側裝攝影機', 2000, 12, 1140),
  ('2000062', 'FH-AHD 330B5 360度攝影機', 2000, 12, 1150),
  ('2000071', 'FH-AHD 330B5 360度攝影機(焦距)', 2000, 12, 1160),
  ('3000008', 'FUHO 七吋VSCC螢幕', 2800, 12, 1170),
  ('3000017', 'FU-七吋VSCC螢幕', 2800, 12, 1180),
  ('4000019', 'Samsung EVO Plus 128GB', 1200, 12, 1190),
  ('4000004', '記憶卡128G SD卡', 1200, 12, 1200),
  ('4000018', 'Samsung EVO Plus 256GB', 1200, 12, 1210),
  ('4000021', '記憶卡256G SD卡', 1200, 12, 1220),
  ('1000184', 'CH-68 4G', NULL, NULL, 1230),
  ('1000176', 'U1 Plus LTE 土石方車機', 8800, 36, 1240),
  ('1000041', 'EP168-4G環保車機', 8800, 36, 1250),
  ('1000170', 'SM-F6N 4G-DVR(EC25)', NULL, NULL, 1260),
  ('1000147', 'SM-F6N 4G-DVR(4CH)', NULL, NULL, 1270),
  ('1000185', 'CH-M1 4G-DVR(3.0)', NULL, NULL, 1280),
  ('1000186', 'CH-M1 4G-DVR(4.0)', NULL, NULL, 1290),
  ('1000168', 'FH-82D AI 4G-DVR(UA)', 15000, 36, 1300),
  ('1000191', 'CH-X5 4G-DVR(5)', NULL, NULL, 1310),
  ('1000192', 'CH-X5 4G-DVR(N)', NULL, NULL, 1320),
  ('1000188', 'CH-F6N 4GDVR', NULL, NULL, 1330),
  ('1000193', 'CH-D5 4G-DVR(X)', NULL, NULL, 1340),
  ('1000187', 'CH-M1N 4G-DVR', NULL, NULL, 1350),
  ('1000189', 'CH-X3N 4G-DVR', NULL, NULL, 1360),
  ('1000119', 'GM-板車ID-有線子車發射器V1.5+', NULL, NULL, 1370),
  ('1000131', '4G ROUTER(MR600 V3)', 28080, 36, 1380),
  ('1000111', '4G ROUTER(MR600 V2)', 2080, 36, 1390),
  ('1000107', 'U1 Plus LTE環保車機', 8800, 36, 1400),
  ('1000104', 'U1 Plus LTE(4G) WIFI', 8800, 36, 1410),
  ('1000145', 'MW-MT1 S7 到站播報器', 24000, 36, 1420),
  ('1000154', 'MW-MT1 S7 到站播報器(LED)', 24000, 36, 1430),
  ('1000140', 'JL-S208 16-1 數位行車記錄器', 8800, 36, 1440),
  ('1000123', 'GS-817S 16-1數位行車記錄器', 8800, 36, 1450),
  ('6000004', 'WBPM無線藍芽健康手環', NULL, NULL, 1460),
  ('2000081', 'CR-804K AHD夜全彩小方攝影機', 2000, 12, 1470),
  ('4000009', '固態硬碟256G SSD', 3000, 12, 1480),
  ('3000024', 'FU-206七吋VSCC螢幕', 2800, 12, 1490),
  ('2000083', 'SDY-1902 AHD前裝攝影機(MIC)', 2000, 12, 1500),
  ('2000084', 'SDY-1905Y AHD 前裝攝影機(MIC)', 2000, 12, 1510),
  ('4000022', 'MicroSD 128GB記憶卡', 1200, 12, 1520),
  ('4000034', 'Kingston Micro SD 128GB', 1200, 12, 1530),
  ('4000020', 'MicroSD 256GB記憶卡', 1200, 12, 1540),
  ('2000080', 'VP-廣角星光小反攝影機', 2000, 12, 1550),
  ('2000077', 'VP-小反向攝影機', 2000, 12, 1560),
  ('2000031', 'CN AHD小方塊鏡頭', 2000, 12, 1570),
  ('2000059', 'FH-DMS攝影機', 2000, 12, 1580),
  ('4000015', '1TB SSD硬碟', NULL, NULL, 1590),
  ('4000010', '固態硬碟512G SSD', 4000, 12, 1600),
  ('4000014', '2TB HDD硬碟', NULL, NULL, 1610),
  ('2000053', 'CE-AHD超廣角攝影機', 2000, 12, 1620),
  ('2000070', 'SM-953C11XR IPC Camera inside', 2000, 12, 1630),
  ('3000020', 'UT-TB85 PLUS 八吋平板', 23000, 12, 1640),
  ('9000331', 'RFD-418 車載語音讀卡機', 1200, 12, 1650),
  ('9000295', 'FH-語音喇叭(含MIC)', 1500, 12, 1660),
  ('6000002', '胎外式發射器', 1200, 12, 1670),
  ('6000030', '胎壓螢幕顯示器V2', 1500, 12, 1680),
  ('5000079', 'EUP i box 2(飾板)', 4500, 12, 1690),
  ('5000077', 'EUP i box 2', 4500, 12, 1700),
  ('5000078', 'EUP i box 2(車廂)', 4500, 12, 1710),
  ('5000059', 'MV-ADAS-P9', 12000, 12, 1720),
  ('5000060', 'MV-ADAS-P9接口控制盒', 900, 12, 1730),
  ('6000028', 'MV-ADAS-P9顯示器', 2500, 12, 1740),
  ('5000003', 'ADAS-P9', 12000, 12, 1750),
  ('6000011', 'DMS感測器(CM)', 6000, 12, 1760),
  ('5000064', 'DMS疲勞駕駛控制盒(CM)V2', 6000, 12, 1770),
  ('9000313', 'YC-LE322 讀卡機', 1200, 12, 1780),
  ('9000157', 'HID_RFID5127(讀卡機)', 1200, 12, 1790),
  ('9000210', 'Bar Code 掃描器MS838', 2500, 12, 1800),
  ('9000148', 'EDR-168天線', 1200, 12, 1810),
  ('9000105', 'HS GPS天線', 1200, 12, 1820),
  ('9000092', 'HS 金電容UPS電池', 900, 12, 1830),
  ('9000311', 'GM-DS200A 無手把磁扣式鑰匙(CH)', NULL, NULL, 1840),
  ('9000302', 'GM-DS200 iButton Reader (CH)', NULL, NULL, 1850),
  ('9000238', 'GM-板車ID-有線母車接收器V1.5+', NULL, NULL, 1860),
  ('9000067', '限動開關-拉桿感應線組', 1200, 12, 1870),
  ('9000412', 'GM-RF-176 濾波器', NULL, NULL, 1880),
  ('7000233', 'JL-S208 16-1 GPS 天線', 1200, 12, 1890),
  ('7000238', 'JL-S208 16-1 GSM天線(FAKRA)', 1200, 12, 1900),
  ('9000272', 'GS-817S 16-1 GSM天線', 1200, 12, 1910),
  ('9000271', 'GS-817S 16-1 GPS天線', 1200, 12, 1920),
  ('9000326', 'MW-MT1 S7 播報器3米GPS天線', 1200, 12, 1930),
  ('9000325', 'MW-MT1 S7 播報器喇叭', 1200, 12, 1940),
  ('7000177', '環保車機7米QQ線', 1200, 12, 1950),
  ('9000370', 'FH-DMS 攝影機支架', 1200, 12, 1960),
  ('9000319', 'DC24V 轉12V 降壓器10A', NULL, NULL, 1970),
  ('7000194', '尾車鋼板短線', NULL, NULL, 1980),
  ('7000114', '8PIN QQ線(尾)', 1200, 12, 1990),
  ('7000113', '8PIN QQ線(頭)', 1200, 12, 2000),
  ('7000308', 'JL-16-1 歐系電源線', NULL, NULL, 2010),
  ('7000309', 'JL-16-1 日系電源線', NULL, NULL, 2020),
  ('7000301', 'EDR 車速放大器線', 1200, 12, 2030),
  ('7000273', '360度攝影機用15米線', NULL, NULL, 2040),
  ('9000108', '壓地式鐵捲門檢(磁簧開關NO型)', 900, 12, 2050),
  ('7000266', 'MW-MT1 S7 播報器USB網卡轉RJ45轉接線', 1200, 12, 2060),
  ('7000267', 'MW-MT1 S7 播報器1.8米電源線', 1200, 12, 2070),
  ('7000195', '尾車7米QQ線', 1200, 12, 2080),
  ('9000341', '鏡頭ㄇ型支架含螺絲邊架', NULL, NULL, 2090),
  ('9000322', 'CZ-GB02 中油巴PC 平板支架', 2500, 12, 2100),
  ('7000088', '一分三航空線(7米)', 1200, 12, 2110),
  ('7000255', '專插頭FIT(B+/ACC/解鎖/上鎖)', NULL, NULL, 2120),
  ('7000269', '專插頭FIT66P(四門)', NULL, NULL, 2130),
  ('7000252', '專插頭FIT(室內燈)', NULL, NULL, 2140),
  ('7000319', '專插頭FIT24P 油電(後門)', NULL, NULL, 2150),
  ('7000318', '專插頭FIT 油電(中控鎖狀態)', NULL, NULL, 2160);
    -- 價格版本沿用原 HTML 的版本時間（台灣時間 2026-11-09 10:59）
    UPDATE residual_meta SET updated_at = TIMESTAMPTZ '2026-11-09 10:59:00+08' WHERE id = 1;
  END IF;
END
$seed$;
