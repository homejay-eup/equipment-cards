// Step 48：標準售價價目表「資料 ↔ HTML」轉換。
// 價目表的內容（表頭、圖例、分類、產品、價格表、備註、權限規則）存成 SheetData，
// renderSheetHtml() 把它套進固定版型（比照 2026/10/1 原始 HTML 的樣式與互動），
// 資料本身以 JSON 內嵌在 <script type="application/json" id="sheet-data">，
// 下次編輯時 extractSheetData() 直接讀回來，不需要另外存資料庫欄位。
//
// 文字中的 «…» 代表「本次調整」，顯示時套紅底；可以整格標記，也可以只標記部分文字。

export interface SheetCol {
  l: string          // 欄位標題
  g?: string         // 上方群組標題（相鄰欄位同一個群組會合併成一格）
  w?: boolean        // 寬欄（備註類，靠左、可換行）
}

export interface SheetItem {
  name: string
  model: string
  chips: string[]
  terms: [string, string][] // 條款說明（左：項目，右：內容）
  cols: SheetCol[]
  rows: string[][]
  notes: string[]
}

export interface SheetCat {
  id: string
  name: string
  desc: string
  items: SheetItem[]
}

export interface SheetRule {
  h: string
  li: string[]
}

export interface SheetLegend {
  k: string
  v: string
}

export interface SheetMeta {
  docTitle: string     // <title>，也是上傳時的預設標題
  brand: string        // 左上小字
  title: string        // 大標題
  sub: string          // 副標（簽呈、適用日、單位）
  factDate: string     // 右上第一格大字（例如 2026/10/1）
  factDateLabel: string
  changeTag: string    // 產品卡片上的調整標籤（例如「10/1 調整」）
  legend: SheetLegend[]
  footer: string
}

export interface SheetData {
  version: 1
  meta: SheetMeta
  cats: SheetCat[]
  rules: SheetRule[]
}

export interface RenderOptions {
  // 編輯器「此產品」預覽：只顯示產品卡片，隱藏表頭、分類選單、搜尋列與頁尾
  compact?: boolean
  // 編輯器「整頁」預覽：捲到正在編輯的分類／產品並框起來（格式 "分類id" 或 "分類id:產品序號"）
  focus?: string
}

// ── 正規化（讀回來的 JSON 一律過這裡，缺欄位補預設值，型別不對就丟掉） ──

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(str) : [])

export function normalizeSheetData(raw: unknown): SheetData | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const m = (r.meta && typeof r.meta === 'object' ? r.meta : {}) as Record<string, unknown>
  if (!Array.isArray(r.cats)) return null
  const meta: SheetMeta = {
    docTitle: str(m.docTitle),
    brand: str(m.brand),
    title: str(m.title),
    sub: str(m.sub),
    factDate: str(m.factDate),
    factDateLabel: str(m.factDateLabel),
    changeTag: str(m.changeTag),
    legend: Array.isArray(m.legend)
      ? m.legend.map(x => ({ k: str((x as SheetLegend)?.k), v: str((x as SheetLegend)?.v) }))
      : [],
    footer: str(m.footer),
  }
  const cats: SheetCat[] = r.cats.map((c, ci) => {
    const cc = (c ?? {}) as Record<string, unknown>
    return {
      id: safeId(str(cc.id)) || `cat${ci + 1}`,
      name: str(cc.name),
      desc: str(cc.desc),
      items: (Array.isArray(cc.items) ? cc.items : []).map(normalizeItem),
    }
  })
  const rules: SheetRule[] = (Array.isArray(r.rules) ? r.rules : []).map(x => {
    const rr = (x ?? {}) as Record<string, unknown>
    return { h: str(rr.h), li: strArr(rr.li) }
  })
  return { version: 1, meta, cats: dedupeIds(cats), rules }
}

function normalizeItem(raw: unknown): SheetItem {
  const it = (raw ?? {}) as Record<string, unknown>
  const cols: SheetCol[] = (Array.isArray(it.cols) ? it.cols : []).map(x => {
    const c = (x ?? {}) as Record<string, unknown>
    const col: SheetCol = { l: str(c.l) }
    if (str(c.g)) col.g = str(c.g)
    if (c.w) col.w = true
    return col
  })
  const rows = (Array.isArray(it.rows) ? it.rows : []).map(row => {
    const cells = strArr(row)
    // 列的格數一律跟欄位數對齊
    return cols.map((_, i) => cells[i] ?? '')
  })
  const terms = (Array.isArray(it.terms) ? it.terms : []).map(t => {
    const a = strArr(t)
    return [a[0] ?? '', a[1] ?? ''] as [string, string]
  })
  return { name: str(it.name), model: str(it.model), chips: strArr(it.chips), terms, cols, rows, notes: strArr(it.notes) }
}

function safeId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^[^a-z]+/, '').slice(0, 40)
}

function dedupeIds(cats: SheetCat[]): SheetCat[] {
  const seen = new Set<string>(['all', 'rules'])
  return cats.map(c => {
    let id = c.id
    let n = 2
    while (seen.has(id)) id = `${c.id}-${n++}`
    seen.add(id)
    return id === c.id ? c : { ...c, id }
  })
}

export function newCatId(cats: SheetCat[]): string {
  const ids = new Set(cats.map(c => c.id))
  let n = cats.length + 1
  while (ids.has(`cat${n}`)) n++
  return `cat${n}`
}

// ── 讀回資料 ──────────────────────────────────────────────

const DATA_RE = /<script type="application\/json" id="sheet-data">([\s\S]*?)<\/script>/

export function extractSheetData(html: string): SheetData | null {
  const m = html.match(DATA_RE)
  if (!m) return null
  try {
    return normalizeSheetData(JSON.parse(m[1]))
  } catch {
    return null
  }
}

// 2026/10/1 原始版（資料直接寫在 <script> 的 const CATS = [...]）
export function isLegacySheet(html: string): boolean {
  return !DATA_RE.test(html) && /const CATS\s*=\s*\[/.test(html) && /const RULES\s*=\s*\[/.test(html)
}

// ── 產生 HTML ─────────────────────────────────────────────

const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function renderSheetHtml(data: SheetData, opts: RenderOptions = {}): string {
  // JSON 內嵌在 <script> 裡：把 < 轉成 <，避免內容出現 </script> 提早結束標籤
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_top">
<title>${escHtml(data.meta.docTitle || data.meta.title || '價目表')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=IBM+Plex+Mono:wght@500&display=swap">
<style>${SHEET_CSS}</style></head><body${opts.compact ? ' class="compact"' : ''}${opts.focus ? ` data-focus="${escHtml(opts.focus)}"` : ''}>
${SHEET_BODY}
<script type="application/json" id="sheet-data">${json}</script>
<script>${SHEET_SCRIPT}</script>
</body></html>`
}

const SHEET_CSS = `
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
body.compact .wrap{padding:12px}
body.compact header.top,body.compact .legend,body.compact .side,body.compact .tools,body.compact footer,body.compact .cat-h,body.compact #rules{display:none!important}
body.compact .layout{display:block;margin-top:0}
body.compact section.cat{margin-top:0}
`

const SHEET_BODY = `<div class="wrap">
  <header class="top">
    <div>
      <div class="brand" id="m-brand"></div>
      <h1 id="m-title"></h1>
      <div class="sub" id="m-sub"></div>
    </div>
    <div class="facts">
      <div class="fact"><b id="m-date"></b><span id="m-date-l"></span></div>
      <div class="fact c"><b id="nChg">–</b><span>本次調整品項</span></div>
      <div class="fact"><b id="nItem">–</b><span>產品／方案</span></div>
    </div>
  </header>
  <div class="legend" id="m-legend"></div>

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

  <footer id="m-footer"></footer>
</div>`

// 跟原始 HTML 的渲染邏輯相同，只是資料改從 #sheet-data 讀，表頭/圖例/頁尾也由資料產生
const SHEET_SCRIPT = `
/* «…» marks the parts changed in this adjustment. */
const D = JSON.parse(document.getElementById('sheet-data').textContent);
const M = D.meta, CATS = D.cats, RULES = D.rules;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/&lt;br&gt;/g,'<br>');
const fmt=s=>esc(s).replace(/«([^»]*)»/g,'<mark class="chg">$1</mark>');
const hasChg=s=>/«/.test(s);
const strip=s=>String(s).replace(/[«»]/g,'');
const itemChanged=it=>JSON.stringify(it).includes('«');

document.getElementById('m-brand').innerHTML=fmt(M.brand);
document.getElementById('m-title').innerHTML=fmt(M.title);
document.getElementById('m-sub').innerHTML=fmt(M.sub);
document.getElementById('m-date').innerHTML=fmt(M.factDate);
document.getElementById('m-date-l').innerHTML=fmt(M.factDateLabel);
document.getElementById('m-legend').innerHTML=M.legend.map(g=>'<span>'+(/^«[^»]*»$/.test(g.k)?fmt(g.k):'<i>'+fmt(g.k)+'</i>')+(g.v?'：'+fmt(g.v):'')+'</span>').join('');
document.getElementById('m-footer').innerHTML=fmt(M.footer);
document.getElementById('m-footer').hidden=!M.footer;

function headRows(cols){
  const groups=cols.some(c=>c.g);
  if(!groups) return '<tr>'+cols.map(c=>\`<th>\${esc(c.l)}</th>\`).join('')+'</tr>';
  let r1='',r2='',i=0;
  while(i<cols.length){
    const c=cols[i];
    if(c.g){let n=0;while(i+n<cols.length&&cols[i+n].g===c.g)n++;r1+=\`<th class="g" colspan="\${n}">\${esc(c.g)}</th>\`;
      for(let k=0;k<n;k++)r2+=\`<th class="\${k===0?'gs':''}">\${esc(cols[i+k].l)}</th>\`;i+=n;}
    else{r1+=\`<th rowspan="2">\${esc(c.l)}</th>\`;i++;}
  }
  return \`<tr>\${r1}</tr><tr>\${r2}</tr>\`;
}
function rowHtml(cols,row){
  let prevG=null;
  const tds=row.map((v,i)=>{const c=cols[i]||{};const cls=[];
    if(c.w)cls.push('w');else if(i===0&&!/^[«\\d]/.test(v))cls.push('l');else if(String(v).length>14)cls.push('l');
    if(strip(v)==='X')cls.push('x');
    if(c.g&&c.g!==prevG)cls.push('gs');prevG=c.g||null;
    return \`<td class="\${cls.join(' ')}">\${fmt(v)}</td>\`}).join('');
  return \`<tr class="\${row.some(hasChg)?'has-chg':''}" data-t="\${esc(strip(row.join(' ')))}">\${tds}</tr>\`;
}
function card(it){
  const chg=itemChanged(it);
  const chips=(it.chips||[]).map(c=>\`<span class="chip">\${fmt(c)}</span>\`).join('')+(chg&&M.changeTag?\`<span class="chip new">\${esc(M.changeTag)}</span>\`:'');
  const terms=it.terms&&it.terms.length?\`<dl class="terms">\${it.terms.map(([k,v])=>\`<dt>\${esc(k)}</dt><dd>\${fmt(v)}</dd>\`).join('')}</dl>\`:'';
  const notes=it.notes&&it.notes.length?\`<ul class="notes">\${it.notes.map(n=>\`<li>\${fmt(n)}</li>\`).join('')}</ul>\`:'';
  const table=it.cols.length?\`<div class="tbl"><table><thead>\${headRows(it.cols)}</thead><tbody>\${it.rows.map(r=>rowHtml(it.cols,r)).join('')}</tbody></table></div>\`:'';
  return \`<article class="card" data-chg="\${chg?1:0}" data-t="\${esc(strip([it.name,it.model,(it.chips||[]).join(' '),(it.terms||[]).flat().join(' '),(it.notes||[]).join(' ')].join(' ')))}">
    <div class="card-h"><h3>\${fmt(it.name)}</h3>\${it.model?\`<span class="model">\${esc(it.model)}</span>\`:''}<div class="chips">\${chips}</div></div>
    \${terms}\${table}\${notes}</article>\`;
}
const main=document.getElementById('main'),side=document.getElementById('side');let tab='all';
let nChg=0,nItem=0;
main.innerHTML=CATS.map(c=>{nItem+=c.items.length;const k=c.items.filter(itemChanged).length;nChg+=k;
  return \`<section class="cat" id="\${c.id}"><div class="cat-h"><h2>\${esc(c.name)}</h2><span>\${esc(c.desc)}\${k?\` · <mark class="chg">\${k} 項調整</mark>\`:''}</span></div><div class="grid">\${c.items.map(card).join('')}</div></section>\`;
}).join('')+\`<section class="cat" id="rules"><div class="cat-h"><h2>權限規則與重要備註</h2><span>適用全產品</span></div><div class="rules">\${RULES.map(r=>\`<div class="card"><h3>\${esc(r.h)}</h3><ul>\${r.li.map(l=>\`<li>\${fmt(l)}</li>\`).join('')}</ul></div>\`).join('')}</div></section><div class="empty" id="empty" hidden>找不到符合的產品，請換個關鍵字。</div>\`;
const tabs=[{id:'all',name:'全部產品',n:nItem,k:nChg}].concat(CATS.map(c=>({id:c.id,name:c.name,n:c.items.length,k:c.items.filter(itemChanged).length})),RULES.length?[{id:'rules',name:'權限規則',n:'',k:0}]:[]);
side.insertAdjacentHTML('beforeend',tabs.map(t=>\`<button role="tab" id="tab-\${t.id}" data-tab="\${t.id}" aria-selected="\${t.id==='all'}"><span>\${esc(t.name)}</span>\${t.k?\`<em class="c">\${t.k} 調整</em>\`:\`<em>\${t.n}</em>\`}</button>\`).join(''));
side.addEventListener('click',e=>{const b=e.target.closest('button[data-tab]');if(!b)return;tab=b.dataset.tab;
  side.querySelectorAll('button').forEach(x=>x.setAttribute('aria-selected',x===b));
  q.value='';apply();window.scrollTo({top:document.querySelector('.layout').offsetTop-8});});
document.getElementById('nChg').textContent=nChg;document.getElementById('nItem').textContent=nItem;

const q=document.getElementById('q'),only=document.getElementById('onlyChg'),count=document.getElementById('count');
function apply(){
  const term=q.value.trim().toLowerCase(),oc=only.checked;let shown=0;
  document.querySelectorAll('section.cat').forEach(sec=>{
    const inTab=term?true:(tab==='all'?sec.id!=='rules':sec.id===tab);
    if(sec.id==='rules'){sec.hidden=!(inTab&&!term)||!RULES.length;if(!sec.hidden)shown++;return;}
    if(!inTab){sec.hidden=true;return;}
    let any=false;
    sec.querySelectorAll('.card').forEach(cd=>{
      const ok=(!oc||cd.dataset.chg==='1')&&(!term||cd.dataset.t.toLowerCase().includes(term)||[...cd.querySelectorAll('tr[data-t]')].some(r=>r.dataset.t.toLowerCase().includes(term)));
      cd.hidden=!ok;if(ok){any=true;shown++;}
    });
    sec.hidden=!any;
  });
  document.getElementById('empty').hidden=shown>0;
  count.textContent=term?\`在全部產品中找到 \${shown} 項\`:(oc?\`本分類調整 \${shown} 項\`:'');
}
q.addEventListener('input',apply);only.addEventListener('change',apply);
apply();
const fz=document.body.dataset.focus;
if(fz){const [cid,ii]=fz.split(':');if(cid==='rules'){const t=document.getElementById('tab-rules');if(t)t.click();}const sec=document.getElementById(cid);
  const el=sec&&(ii===undefined?sec:sec.querySelectorAll('.card')[+ii]);
  if(el){document.documentElement.style.scrollBehavior='auto';el.scrollIntoView({block:ii===undefined?'start':'center'});el.style.outline='2px solid var(--chg)';el.style.outlineOffset='3px';}}
`
