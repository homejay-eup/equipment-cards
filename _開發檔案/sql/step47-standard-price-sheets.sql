-- Step 47：標準售價改為整份 HTML 價目表原樣顯示
-- 可安全重複執行（IF NOT EXISTS；初始資料以 file_name 判斷已存在就不重複新增）。
-- 舊的 standard_price_items（Step 46）保留不動，畫面暫不使用。

CREATE TABLE IF NOT EXISTS standard_price_sheets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,                      -- 標題（預設取 HTML 的 <title>）
  effective_date DATE NOT NULL,                      -- 生效日期（畫面只顯示到月份，存當月 1 日）
  file_name      TEXT,                               -- 上傳時的原始檔名
  html           TEXT NOT NULL,                      -- 整份 HTML 原文（前端放在 sandbox iframe 顯示）
  uploaded_by    TEXT,                               -- 上傳者 email
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS standard_price_sheets_effective_idx ON standard_price_sheets (effective_date DESC, created_at DESC);

-- RLS：全鎖，一律經 /api/standard-prices/sheets* 用 service_role 讀寫（看：view/edit_standard_prices；上傳/刪除：edit_standard_prices）
ALTER TABLE standard_price_sheets ENABLE ROW LEVEL SECURITY;

-- 初始資料：EUP 產品銷售報價權限表（2026/10/1 起適用）
INSERT INTO standard_price_sheets (title, effective_date, file_name, html, uploaded_by)
SELECT 'EUP 產品銷售報價權限表', '2026-10-01', '產品銷售報價權限表_20261001.html', $sheet$<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_top"></head><body>
<title>EUP 產品銷售報價權限表</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
/* Layout: summary header → left category tabs (one panel at a time) + search across all → product cards (terms, price table, notes) */
:root{
  --bg:#f5f6f8; --surface:#ffffff; --surface-2:#eef0f4; --fg:#1b2230; --muted:#5d6676; --line:#dde1e8;
  --ink:#24324a; --chg:#c8102e; --chg-bg:#fde8eb; --x:#a3abb8;
  --sans:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#12161d; --surface:#1a2029; --surface-2:#232b37; --fg:#e7eaf0; --muted:#9aa3b2; --line:#2e3744;
  --ink:#c9d4e8; --chg:#ff6b7f; --chg-bg:#3a1c23; --x:#5f6878; color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#12161d; --surface:#1a2029; --surface-2:#232b37; --fg:#e7eaf0; --muted:#9aa3b2; --line:#2e3744;
  --ink:#c9d4e8; --chg:#ff6b7f; --chg-bg:#3a1c23; --x:#5f6878; color-scheme:dark}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{background:var(--bg);color:var(--fg);font-family:var(--sans);font-size:14px;line-height:1.55;margin:0}
.wrap{max-width:1180px;margin:0 auto;padding-inline:20px;padding-block:24px 64px}
header.top{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:end;padding-bottom:18px;border-bottom:2px solid var(--ink)}
.brand{font-family:var(--mono);font-size:12px;letter-spacing:.12em;color:var(--chg);text-transform:uppercase}
h1{font-size:clamp(22px,3.2vw,30px);font-weight:900;margin:4px 0 6px;text-wrap:balance;color:var(--ink)}
.sub{color:var(--muted);font-size:13px}
.facts{display:flex;gap:10px;flex-wrap:wrap}
.fact{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px 14px;min-width:110px}
.fact b{display:block;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--ink)}
.fact span{font-size:12px;color:var(--muted)}
.fact.c b{color:var(--chg)}
.legend{margin-top:14px;display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;color:var(--muted)}
.legend i{font-style:normal;color:var(--fg);font-weight:500}
.layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:24px;margin-top:20px;align-items:start}
.side{position:sticky;top:calc(env(safe-area-inset-top,0px) + 16px);display:grid;gap:4px;max-height:calc(100vh - 32px);overflow-y:auto}
.side .lbl{font-size:11.5px;letter-spacing:.08em;color:var(--muted);padding:0 12px 6px}
.side button{all:unset;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 12px;border-radius:8px;font-size:14px;color:var(--fg);border-left:3px solid transparent}
.side button:hover{background:var(--surface-2)}
.side button:focus-visible{outline:2px solid var(--ink);outline-offset:-2px}
.side button[aria-selected="true"]{background:var(--surface);border-left-color:var(--chg);font-weight:700;color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.06)}
.side button em{font-style:normal;font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.side button em.c{color:var(--chg);font-weight:700}
.content{min-width:0}
.tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);padding-block:10px;border-bottom:1px solid var(--line)}
#q{flex:1 1 240px;min-width:0;font:inherit;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--fg)}
#q:focus{outline:2px solid var(--ink);outline-offset:1px}
.tog{display:inline-flex;gap:8px;align-items:center;font-size:13px;cursor:pointer;user-select:none;padding:7px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
.tog input{accent-color:var(--chg)}
.count{font-size:12.5px;color:var(--muted)}
section.cat{margin-top:22px}
section.cat:first-child{margin-top:14px}
.cat-h{display:flex;align-items:baseline;gap:12px;margin-bottom:12px}
.cat-h h2{margin:0;font-size:19px;font-weight:900;color:var(--ink)}
.cat-h span{color:var(--muted);font-size:13px}
.grid{display:grid;gap:14px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px 18px;min-width:0}
.card-h{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:baseline;margin-bottom:10px}
.card-h h3{margin:0;font-size:16px;font-weight:700}
.model{font-family:var(--mono);font-size:12.5px;color:var(--muted)}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{font-size:11.5px;padding:1px 8px;border-radius:4px;background:var(--surface-2);color:var(--muted)}
.chip.new{background:var(--chg-bg);color:var(--chg);font-weight:700}
.terms{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:0 0 12px;font-size:13.5px}
.terms dt{color:var(--muted)}
.terms dd{margin:0;min-width:0}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:13.5px;font-variant-numeric:tabular-nums}
th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap;vertical-align:top}
th{background:var(--surface-2);font-weight:500;color:var(--muted);font-size:12.5px}
th.g{text-align:center;color:var(--ink);font-weight:700;border-left:1px solid var(--line)}
th.gs{border-left:1px solid var(--line)}
td.gs{border-left:1px solid var(--line)}
th:first-child,td:first-child{text-align:left}
td.l{text-align:left;white-space:normal;min-width:120px}
td.w{text-align:left;white-space:normal;min-width:180px;color:var(--muted);font-size:12.5px}
tr:last-child td{border-bottom:0}
td.x{color:var(--x)}
mark.chg{background:var(--chg-bg);color:var(--chg);font-weight:700;padding:0 3px;border-radius:3px}
tr.has-chg td:first-child{box-shadow:inset 3px 0 0 var(--chg)}
.notes{margin:12px 0 0;padding-left:20px;font-size:13px;color:var(--muted)}
.notes li{margin:2px 0}
.notes li mark.chg{font-weight:500}
.empty{padding:40px 0;text-align:center;color:var(--muted)}
.rules{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.rules .card h3{font-size:15px;margin:0 0 8px}
.rules ul{margin:0;padding-left:20px}
.rules li{margin:4px 0}
footer{margin-top:40px;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:12px}
@media (max-width:820px){.layout{grid-template-columns:1fr;gap:8px}.side{position:static;display:flex;overflow-x:auto;max-height:none;gap:6px;padding-bottom:4px}.side .lbl{display:none}.side button{flex:none;border-left:0;border-bottom:3px solid transparent;border-radius:6px;padding:7px 10px}.side button[aria-selected="true"]{border-bottom-color:var(--chg)}}
@media (max-width:640px){header.top{grid-template-columns:1fr}.wrap{padding-inline:16px}}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
</style>

<div class="wrap">
  <header class="top">
    <div>
      <div class="brand">EUP · 內部文件</div>
      <h1>產品銷售報價權限表</h1>
      <div class="sub">業務處簽呈 115/9/16（董事長、總經理核決）· 2026/10/1 起適用 · 單位：新台幣</div>
    </div>
    <div class="facts">
      <div class="fact"><b>2026/10/1</b><span>新價生效日</span></div>
      <div class="fact c"><b id="nChg">–</b><span>本次調整品項</span></div>
      <div class="fact"><b id="nItem">–</b><span>產品／方案</span></div>
    </div>
  </header>
  <div class="legend">
    <span><i>定價</i>：對客報價</span>
    <span><i>業務</i>：業務權限最低價</span>
    <span><i>區主管</i>：區主管權限最低價</span>
    <span><mark class="chg">紅底</mark>：本次（10/1）調整部分</span>
    <span><i>X</i>：不提供此方案</span>
  </div>

  <div class="layout">
    <nav class="side" id="side" role="tablist" aria-label="產品分類"><div class="lbl">產品分類</div></nav>
    <div class="content">
      <div class="tools">
        <input id="q" type="search" placeholder="搜尋全部產品、型號或關鍵字（例：F6N、酒測、Smart Box）" aria-label="搜尋">
        <label class="tog"><input id="onlyChg" type="checkbox"> 只看本次調整</label>
        <span class="count" id="count"></span>
      </div>
      <main id="main"></main>
    </div>
  </div>

  <footer>
    依據：業務處簽呈〈因應供應商調漲產品、配件價格，調整售價一案〉附件「產品銷售方案權限表 2026.9」。原 2026/4 公告之 EDR、F6N 銷售積分競賽獎勵方案維持至 2026/12/31。
  </footer>
</div>

<script>
/* «…» marks the parts changed in this adjustment (red text in the source table). */
const STD = [{g:'設備買斷',l:'定價'},{g:'設備買斷',l:'業務'},{g:'設備買斷',l:'區主管'},{l:'平台費（年繳）'},{l:'0元租賃（合約三年）'},{l:'備註',w:1}];
const CATS = [
{id:'gps',name:'GPS 主機',desc:'定位車機與通訊設備',items:[
  {name:'GPS 車機',model:'S168 4G / MT99 / GO168',chips:['車機買斷'],
   cols:[{l:'回傳'},{l:'安全駕駛'},{g:'車機買斷',l:'定價'},{g:'車機買斷',l:'業務'},{g:'車機買斷',l:'區主管'},{l:'平台費（年繳）'},{l:'0元租賃（合約三年）'}],
   rows:[['30 秒','–','3,500','«3,000»','«2,500»','300 元/月','400 元/月'],
         ['5 秒','V','3,500','«3,000»','«2,500»','340 元/月','440 元/月']],
   notes:['另加 Smart Box 可外接 RFID、條碼機、溫控、胎壓、ADAS、疲勞偵測等；每增加一項功能 +40 元/月','«MT99 無法擴充配件，且不支援安全駕駛功能»','«GO168 無法擴充配件，可支援安全駕駛功能»']},
  {name:'攜帶式車機',model:'R007T-4G',chips:['保固一年'],
   cols:[{l:'設備買斷'},{l:'平台費（年繳）'},{l:'0元租賃（合約三年）'},{l:'備註',w:1}],
   rows:[['9,800','300 元/月','600 元/月','買斷含首年平台費']]},
  {name:'手機 APP 定位',model:'S007',
   cols:[{l:'設備買斷'},{l:'平台費（年繳）'},{l:'0元租賃（合約三年）'}],
   rows:[['X','200','X']]},
  {name:'4G Router',model:'WIFI',
   cols:[{l:'設備買斷'},{l:'平台費（年繳）'},{l:'0元租賃（合約三年）'},{l:'備註',w:1}],
   rows:[['X','X','780 元/月','中華']]}
]},
{id:'video',name:'影像 DVR',desc:'即時影像、純錄與螢幕',items:[
  {name:'即時影像 FUHO AHD 4G DVR',model:'FH-82DD',chips:['8 路','標配 256G SSD'],
   terms:[['鏡頭買斷・主機租賃<br>（合約三年/年繳）','鏡頭 2,500/顆（定價・業務）、2,200/顆（區主管）＋ 主機 «1,300 元/月»']],
   cols:[{l:'鏡頭數'},{g:'設備全買斷（權限/年繳）',l:'定價'},{g:'設備全買斷（權限/年繳）',l:'業務'},{g:'設備全買斷（權限/年繳）',l:'區主管'},{l:'0元租賃 月費'}],
   rows:[['8 鏡','«38,000»','«37,000»','«36,000»','«2,100 元/月»'],['7 鏡','«36,000»','«35,000»','«34,000»','«2,000 元/月»'],
         ['6 鏡','«34,000»','«33,000»','«32,000»','«1,900 元/月»'],['5 鏡','«32,000»','«31,000»','«30,000»','«1,800 元/月»'],
         ['4 鏡','«28,000»','«27,000»','«26,000»','«1,700 元/月»'],['3 鏡','«26,000»','«25,000»','«24,000»','«1,600 元/月»'],
         ['2 鏡','«24,000»','«23,000»','«22,000»','«1,500 元/月»'],['1 鏡','«22,000»','«21,000»','«20,000»','«1,400 元/月»']],
   notes:['0元租賃：合約三年、年繳；定價含 2 年 4 張儲存卡，年繳或半年繳']},
  {name:'即時影像 AI 版',model:'FH 82D-AI',chips:['8 路','DMS・ADAS'],
   cols:[{l:'項目'},{l:'設備全買斷'},{l:'鏡頭買斷・主機租賃'},{l:'0元租賃'}],
   rows:[['價格','依 FH-82DD 價格 +3,000','DMS 鏡頭 2,500/顆；月費依上述 +300','依上述價格 +100']],
   notes:['«DMS、ADAS 演算法：每一項 150 元/月（不含原本平台費）»']},
  {name:'即時影像 FUHO / F6N AHD 4G DVR',model:'FUHO・F6N',chips:['4 路','雙 SD 卡','標配 128G SD×2','«以 F6N 為主»'],
   terms:[['鏡頭買斷・主機租賃','鏡頭 2,500/顆（定價・業務）、2,200/顆（區主管）＋ 主機 «1,300 元/月»'],
          ['到約/買斷後平台費','買斷：標準三年 780 元/月；租賃：«1,300 元/月（四鏡），多一鏡 +100 元/月»'],
          ['保固','買斷：«到約延長保固 1,300 元/月»；租賃：租用期間保固（停用後主機/設備需歸還弋揚）']],
   cols:[{l:'鏡頭數'},{g:'設備全買斷',l:'定價'},{g:'設備全買斷',l:'業務'},{g:'設備全買斷',l:'區主管'},{l:'0元租賃 月費'}],
   rows:[['4 鏡','«28,000»','«26,000»','«24,000»','«1,700 元/月»'],['3 鏡','«26,000»','«24,000»','«22,000»','«1,600 元/月»'],
         ['2 鏡','«24,000»','«22,000»','«20,000»','«1,500 元/月»'],['1 鏡','«22,000»','«20,000»','«18,000»','«1,400 元/月»']]},
  {name:'純錄 FUHO AHD DVR',model:'HS (DVR) AHD×8',chips:['8 路','標配 256G SSD'],
   cols:[{l:'方案'},{l:'設備全買斷'},{l:'鏡頭買斷・主機租賃'},{l:'0元租賃'}],
   rows:[['價格','X','鏡頭 2,500/顆（業務）、2,200/顆（區主管）＋ «4 鏡 1,000 元/月，多一鏡 +100 元/月»','X']]},
  {name:'純錄 FUHO AHD SD-DVR',model:'HS SD (DVR) AHD×4',chips:['4 路','標配 128G SD'],
   terms:[['鏡頭買斷・主機租賃','鏡頭 2,500/顆（業務）、2,200/顆（區主管）＋ 主機 «700 元/月»；租用期間保固（停用主機需歸還弋揚）'],
          ['保固','買斷保固一年，«續保 700 元/月»']],
   cols:[{l:'鏡頭數'},{g:'設備全買斷',l:'定價'},{g:'設備全買斷',l:'業務'},{g:'設備全買斷',l:'區主管'},{l:'0元租賃'}],
   rows:[['4 鏡','«24,000»','X','«23,000»','X'],['3 鏡','«23,000»','X','«22,000»','X'],['2 鏡','«22,000»','X','«21,000»','X'],['1 鏡','«21,000»','X','«20,000»','X']]},
  {name:'即時影像 4GDVR',model:'C43 僅前後雙鏡',chips:['2 路','標配 256G SD'],
   cols:[{l:'項目'},{l:'買斷'},{l:'年繳（租賃）'}],
   rows:[['設備','«8,800 元/台»','0 元/月'],['平台費','標準三年 580 元/月','«880 元/月»'],['保固','到約延長保固 «880 元/月»','租用期間保固（停用後設備整套需歸還弋揚）']]},
  {name:'«螢幕 7 吋»',model:'VSCC',
   cols:[{l:'定價'},{l:'業務'},{l:'區主管'},{l:'備註',w:1}],
   rows:[['«3,000»','«2,700»','«2,500»','«贈送不保固（需經區主管同意）»']]}
]},
{id:'tacho',name:'數位大餅・法規型',desc:'行車紀錄（法規）車機',items:[
  {name:'數位大餅 4G 法規型',model:'EDR-168 16 式',chips:['回傳 30 秒','安全駕駛 V','保固一年'],
   cols:[{l:'方案'},{l:'設備全買斷'},{l:'平台費（年繳）'},{l:'0元租賃（合約三年）'},{l:'備註',w:1}],
   rows:[['一般方案','8,800','340 元/月','600 元/月','一般客戶使用；買斷含第一年平台費；另加 Smart Box 可外接配件，每增加一項功能 +40 元/月'],
         ['遊覽車方案','X','X','380 元/月','僅供遊覽車專案使用，合格證 500 元；裝機費：標準 800 元／業務 400 元／主管 0 元']]},
  {name:'公信 JAS 16-1',model:'JAS 16-1',chips:['回傳 30 秒','安全駕駛 V'],
   cols:STD,
   rows:[['13,800','X','13,000','340 元/月（買斷方案保固三年）','680 元/月（停用後設備需歸還）','']],
   notes:['買斷含第一年平台費','買斷方案車機設備保固三年，第四年起如設備故障可選擇新購（同買斷方案）或加購保固（同租賃方案）','每 2 年需重新校驗核發合格證，費用每台 500 元/次','«新車原廠搭載 16-1 加裝模組，車機設備由 EUP 提供保固（保固期間依行照領牌日起算，JAS 為 1 年、公信為 2 年）»；過保後如有故障可選擇新購（同買斷方案）或加費保固（同租賃方案）','«施工費 1,000»']},
  {name:'新車原廠搭載 JAS16-1 加裝 4G 模組',model:'JAS16-1 + 4G',chips:['回傳 30 秒','安全駕駛 V'],
   cols:[{l:'設備全買斷'},{l:'平台費（年繳）'},{l:'0元租賃'},{l:'備註',w:1}],
   rows:[['«4,500»','340 元/月','X','施工費 300']]},
  {name:'土石方車機',model:'U1 PLUS LTE / EDR-168P',chips:['保固三年'],
   cols:[{l:'設備全買斷'},{l:'平台費（年繳）'},{l:'0元租賃（合約三年/年繳）'},{l:'備註',w:1}],
   rows:[['X','X','車頭 350 元/月；尾車 380 元/月','尾車費用包含防水盒']]}
]},
{id:'eco',name:'環保車機',desc:'環保／車隊管理整合',items:[
  {name:'EDR-168 環保車機',model:'EDR-168',
   cols:[{l:'類型'},{g:'設備買斷',l:'定價'},{g:'設備買斷',l:'業務'},{g:'設備買斷',l:'區主管'},{l:'平台方案'},{l:'平台費'},{l:'0元租賃 定價'}],
   rows:[['標準','8,800','7,800','6,800','車隊＋環保','380 元/月','650 元/月'],['舊換新','5,800','5,500','5,000','純環保','200 元/月','500 元/月']]},
  {name:'EDR-168 二合一（數位大餅＋環保車機）',model:'車機＋條碼機＋無線鍵盤',
   cols:[{l:'客群'},{l:'車機買斷（含安裝）'},{l:'平台費（年繳）'},{l:'平台費權限 區主管/經理'},{l:'備註',w:1}],
   rows:[['新客','9,800','380 元/月','–','含首年平台費'],
         ['既有升級','–','480 元/月','420 / 380 元/月','車機升級 3,000 元/台（含施工、鍵盤更換、合格證）'],
         ['舊換新','–','480 元/月','420 / 380 元/月','含車機、條碼、鍵盤、合格證'],
         ['車頭加裝','6,800','380 元/月','–','含首年平台費；同時安裝 2 台，第二年起平台費減免 100 元/月']],
   notes:['條碼機（環保車機專用）2,500；無線鍵盤（環保車機專用）1,400','合約：買斷無；0元租賃合約三年、無滿期','保固：設備租賃期間保固（不含設備升級），配件保固一年']}
]},
{id:'safety',name:'主動安全',desc:'ADAS・DMS（保固一年）',items:[
  {name:'ADAS 先進駕駛輔助系統',model:'主機＋小螢幕',cols:[{l:'型號'}].concat(STD),
   rows:[['Mobileye','28,000','26,000','24,000','X','X','需搭配 Smart Box；解譯器 3,000 元；E-Box 3,000 元；Can Sensor 2,500 元'],
         ['車元素-P9','12,000','11,000','10,000','40 元/月','440 元/月','需搭配 Smart Box']]},
  {name:'DMS 疲勞偵測',model:'',cols:[{l:'型號'}].concat(STD),
   rows:[['奇美','12,000','11,000','10,000','40 元/月','440 元/月','需搭配 Smart Box'],
         ['DMS 168','6,800','6,500','6,000','40 元/月','280 元/月','需搭配 Smart Box']]}
]},
{id:'health',name:'健康管理',desc:'血壓・酒測（保固一年）',items:[
  {name:'血壓偵測',model:'',cols:[{l:'型號'}].concat(STD),
   rows:[['全家寶-綁帶式','8,800','7,800','6,800','800 元/月','1,200 元/月（不含駕駛 APP 帳號）','含 10 組駕駛 APP 帳號；血壓綁帶不保固，每條 1,000'],
         ['歐姆龍-隧道式','105,000','102,000','–','800 元/月','X','兩年需回廠校正，費用 3,000']]},
  {name:'酒測',model:'',cols:[{l:'型號'}].concat(STD),
   rows:[['無線藍芽酒測（銓勝）內附吹嘴×1','3,800','3,500','3,300','150 元/月','200 元/月','買斷 3,800 含首年平台費；校正費 800 元；加購吹嘴 250 元/10 個'],
         ['酒精鎖（銓勝有線酒測＋鎖＋鏡頭）','8,800','8,500','8,000','40 元/月','550 元/月','校正費 800 元'],
         ['法規型有線酒測（寰康）需搭配 PC/NB','22,800','–','–','800 元/月','1,480 元/月','含 10 組駕駛 APP 帳號；校正費 1,500（使用 1,000 次）']],
   notes:['法規型達 1,000 次須重新校正，否則無法繼續使用','每增加一組駕駛 APP 帳號 +80 元/月']}
]},
{id:'acc',name:'配件與感測',desc:'需搭配 GPS 主產品',items:[
  {name:'Smart Box',model:'',cols:[{l:'設備買斷'},{l:'0元租賃'},{l:'備註',w:1}],
   rows:[['2,500','100 元/月','«GPS 主產品加配件皆需要加購此設備»']]},
  {name:'無線胎壓偵測器',model:'',chips:['保固一年'],cols:[{l:'型號'}].concat(STD),
   rows:[['8 輪','11,800','11,500','11,000','40 元/月','500 元/月',''],['6 輪','9,800','9,500','9,000','40 元/月','400 元/月',''],
         ['4 輪','7,800','7,500','7,000','40 元/月','300 元/月',''],['2 輪','5,800','5,500','5,000','40 元/月','200 元/月','']],
   notes:['需搭配 Smart Box 使用','安裝 4 輪 3.5 噸以上、低底盤、遊覽車須加購訊號中繼器 1,500 元']},
  {name:'溫控',model:'',cols:[{l:'型號'},{l:'設備買斷'},{l:'平台費（年繳）'},{l:'0元租賃'},{l:'備註',w:1}],
   rows:[['有線溫控','2,100','40 元/月','140 元/月','需搭配 GPS 主產品＋Smart Box'],['無線溫控','2,100','40 元/月','140 元/月','需搭配 GPS 主產品＋Smart Box']]},
  {name:'板車 ID',model:'',cols:STD,
   rows:[['4,880','4,580','4,380','120 元/月','360 元/月','買斷含第一年平台費；本報價為 1 車頭＋1 車尾；加購車尾每台 120 元/月']]},
  {name:'Barcode',model:'',cols:[{l:'類型'},{l:'設備買斷'},{l:'平台費（年繳）'},{l:'0元租賃'}],
   rows:[['環保','2,500 元','40 元/月','140 元/月'],['台積電（二維、日立）','2,800 元','40 元/月','140 元/月'],['台積電（QR code）','3,500 元','40 元/月','160 元/月']]},
  {name:'刷卡機・RFID',model:'',cols:[{l:'品項'},{l:'設備買斷'},{l:'平台費（年繳）'},{l:'0元租賃'},{l:'備註',w:1}],
   rows:[['遊覽車法規刷卡機（418）','4,200','40 元/月','–','需搭配 GPS 主產品；補助案保固 5 年'],
         ['非遊覽車法規刷卡機（RFID）','Mifare・EM 3,500；HID 5,500','40 元/月','Mifare・EM 200 元/月；HID 250 元/月','需搭配 GPS 主產品'],
         ['RFID 感應卡（白卡）','45 元','X','X','']]}
]},
{id:'svc',name:'加值服務・施工',desc:'側錄、儲存卡、拆裝移機',items:[
  {name:'雲端側錄加購',model:'',cols:[{l:'權限'},{l:'10 天'},{l:'20 天'},{l:'30 天'}],
   rows:[['業務權限','100 元/月','180 元/月','260 元/月'],['主管權限','80 元/月','160 元/月','240 元/月']],
   notes:['每多加 10 天 +80 元（40 天 340 元；50 天 420 元，以此類推）','費用直接加在月租費計算']},
  {name:'儲存卡加購',model:'',cols:[{l:'品項'},{l:'單價'}],
   rows:[['«256G SSD（或 micro SD）»','«2,800 元/張»'],['«128G SD（或 micro SD）»','«1,800 元/張»']]},
  {name:'拆、裝、移機費用',model:'',cols:[{l:'項目'},{l:'費用'}],
   rows:[['拆機','1,000 元/台'],['裝機','2,000 元/台'],['移機（同時地）','2,500 元/台'],['移機（不同時或地）','3,000 元/台'],['裝車尾（業務權限可送）','1,500 元/台']],
   notes:['此報價為標準 4 鏡','每加裝一鏡費用加 500 元','每多拆一鏡費用加 250 元']},
  {name:'轉拋資料平台費',model:'遊覽車、畜產會除外',cols:[{l:'設備買斷'},{l:'平台費（年繳）'},{l:'0元租賃'}],
   rows:[['X','40 元/月','X']]}
]}
];
const RULES = [
  {h:'超出權限',li:['銷售時若超出以上銷售方案範圍，再呈報區／處主管評估']},
  {h:'啟用日（1 或 16 日）權限',li:['業務可延 1 個月','區主管可延 2 個月']},
  {h:'舊機換新機或同業競價（僅 S168、R007T）',li:['若遇原系統商繳費方式為月繳，可同意月繳','啟算日：區主管可延 3 個月，經理可延 6 個月']},
  {h:'獎勵方案',li:['原 2026/4 公告之 EDR、F6N 銷售積分競賽獎勵方案，維持至 2026/12/31']}
];

const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/&lt;br&gt;/g,'<br>');
const fmt=s=>esc(s).replace(/«([^»]*)»/g,'<mark class="chg">$1</mark>');
const hasChg=s=>/«/.test(s);
const strip=s=>String(s).replace(/[«»]/g,'');
const itemChanged=it=>JSON.stringify(it).includes('«');

function headRows(cols){
  const groups=cols.some(c=>c.g);
  if(!groups) return '<tr>'+cols.map(c=>`<th>${esc(c.l)}</th>`).join('')+'</tr>';
  let r1='',r2='',i=0;
  while(i<cols.length){
    const c=cols[i];
    if(c.g){let n=0;while(i+n<cols.length&&cols[i+n].g===c.g)n++;r1+=`<th class="g" colspan="${n}">${esc(c.g)}</th>`;
      for(let k=0;k<n;k++)r2+=`<th class="${k===0?'gs':''}">${esc(cols[i+k].l)}</th>`;i+=n;}
    else{r1+=`<th rowspan="2">${esc(c.l)}</th>`;i++;}
  }
  return `<tr>${r1}</tr><tr>${r2}</tr>`;
}
function rowHtml(cols,row){
  let prevG=null;
  const tds=row.map((v,i)=>{const c=cols[i]||{};const cls=[];
    if(c.w)cls.push('w');else if(i===0&&!/^[«\d]/.test(v))cls.push('l');else if(String(v).length>14)cls.push('l');
    if(strip(v)==='X')cls.push('x');
    if(c.g&&c.g!==prevG)cls.push('gs');prevG=c.g||null;
    return `<td class="${cls.join(' ')}">${fmt(v)}</td>`}).join('');
  return `<tr class="${row.some(hasChg)?'has-chg':''}" data-t="${esc(strip(row.join(' ')))}">${tds}</tr>`;
}
function card(it){
  const chg=itemChanged(it);
  const chips=(it.chips||[]).map(c=>`<span class="chip">${fmt(c)}</span>`).join('')+(chg?'<span class="chip new">10/1 調整</span>':'');
  const terms=it.terms?`<dl class="terms">${it.terms.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${fmt(v)}</dd>`).join('')}</dl>`:'';
  const notes=it.notes?`<ul class="notes">${it.notes.map(n=>`<li>${fmt(n)}</li>`).join('')}</ul>`:'';
  return `<article class="card" data-chg="${chg?1:0}" data-t="${esc(strip([it.name,it.model,(it.chips||[]).join(' '),(it.terms||[]).flat().join(' '),(it.notes||[]).join(' ')].join(' ')))}">
    <div class="card-h"><h3>${fmt(it.name)}</h3>${it.model?`<span class="model">${esc(it.model)}</span>`:''}<div class="chips">${chips}</div></div>
    ${terms}<div class="tbl"><table><thead>${headRows(it.cols)}</thead><tbody>${it.rows.map(r=>rowHtml(it.cols,r)).join('')}</tbody></table></div>${notes}</article>`;
}
const main=document.getElementById('main'),side=document.getElementById('side');let tab='all';
let nChg=0,nItem=0;
main.innerHTML=CATS.map(c=>{nItem+=c.items.length;const k=c.items.filter(itemChanged).length;nChg+=k;
  return `<section class="cat" id="${c.id}"><div class="cat-h"><h2>${esc(c.name)}</h2><span>${esc(c.desc)}${k?` · <mark class="chg">${k} 項調整</mark>`:''}</span></div><div class="grid">${c.items.map(card).join('')}</div></section>`;
}).join('')+`<section class="cat" id="rules"><div class="cat-h"><h2>權限規則與重要備註</h2><span>適用全產品</span></div><div class="rules">${RULES.map(r=>`<div class="card"><h3>${esc(r.h)}</h3><ul>${r.li.map(l=>`<li>${esc(l)}</li>`).join('')}</ul></div>`).join('')}</div></section><div class="empty" id="empty" hidden>找不到符合的產品，請換個關鍵字。</div>`;
const tabs=[{id:'all',name:'全部產品',n:nItem,k:nChg}].concat(CATS.map(c=>({id:c.id,name:c.name,n:c.items.length,k:c.items.filter(itemChanged).length})),[{id:'rules',name:'權限規則',n:'',k:0}]);
side.insertAdjacentHTML('beforeend',tabs.map(t=>`<button role="tab" id="tab-${t.id}" data-tab="${t.id}" aria-selected="${t.id==='all'}"><span>${esc(t.name)}</span>${t.k?`<em class="c">${t.k} 調整</em>`:`<em>${t.n}</em>`}</button>`).join(''));
side.addEventListener('click',e=>{const b=e.target.closest('button[data-tab]');if(!b)return;tab=b.dataset.tab;
  side.querySelectorAll('button').forEach(x=>x.setAttribute('aria-selected',x===b));
  q.value='';apply();window.scrollTo({top:document.querySelector('.layout').offsetTop-8});});
document.getElementById('nChg').textContent=nChg;document.getElementById('nItem').textContent=nItem;

const q=document.getElementById('q'),only=document.getElementById('onlyChg'),count=document.getElementById('count');
function apply(){
  const term=q.value.trim().toLowerCase(),oc=only.checked;let shown=0;
  document.querySelectorAll('section.cat').forEach(sec=>{
    const inTab=term?true:(tab==='all'?sec.id!=='rules':sec.id===tab);
    if(sec.id==='rules'){sec.hidden=!(inTab&&!term);if(!sec.hidden)shown++;return;}
    if(!inTab){sec.hidden=true;return;}
    let any=false;
    sec.querySelectorAll('.card').forEach(cd=>{
      const ok=(!oc||cd.dataset.chg==='1')&&(!term||cd.dataset.t.toLowerCase().includes(term)||[...cd.querySelectorAll('tr[data-t]')].some(r=>r.dataset.t.toLowerCase().includes(term)));
      cd.hidden=!ok;if(ok){any=true;shown++;}
    });
    sec.hidden=!any;
  });
  document.getElementById('empty').hidden=shown>0;
  count.textContent=term?`在全部產品中找到 ${shown} 項`:(oc?`本分類調整 ${shown} 項`:'');
}
q.addEventListener('input',apply);only.addEventListener('change',apply);
apply();
</script>
</body></html>
$sheet$, 'Step 47 初始資料'
WHERE NOT EXISTS (SELECT 1 FROM standard_price_sheets WHERE file_name = '產品銷售報價權限表_20261001.html');
