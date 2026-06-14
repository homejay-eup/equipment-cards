/**
 * export-backup.ts
 * 全量備份 Supabase equipment_cards 資料 + 下載 Cloudinary 所有照片
 *
 * 執行方式：
 *   cd _開發檔案/scripts
 *   npx tsx export-backup.ts
 *
 * 輸出結構：
 *   _開發檔案/backup/YYYY-MM-DD/
 *   ├── equipment_cards.json
 *   └── photos/
 *       ├── main/
 *       ├── detail/
 *       └── weight/
 */

import * as fs   from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http  from 'http'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// ── 設定 ─────────────────────────────────────────────────────

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })

const today      = new Date().toISOString().slice(0, 10)
const BACKUP_DIR = path.resolve(__dirname, `../backup/${today}`)
const LOG_PATH   = path.resolve(__dirname, `../logs/export-backup-${today}.log`)

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? ''

// ── 初始化 ────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ── 日誌 ──────────────────────────────────────────────────────

fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' })

function log(msg: string)     { const line = `[${new Date().toISOString()}] ${msg}`;  console.log(line);   logStream.write(line + '\n') }
function logWarn(msg: string) { const line = `[WARN] ${msg}`;                          console.warn(line);  logStream.write(line + '\n') }
function logErr(msg: string)  { const line = `[ERR]  ${msg}`;                          console.error(line); logStream.write(line + '\n') }

// ── 型別 ──────────────────────────────────────────────────────

interface PhotoEntry {
  public_id: string
  url:       string
  caption?:  string
}

interface EquipmentRow {
  equipment_id:          string
  name:                  string
  category:              string | null
  vendor:                string | null
  status:                string
  tags:                  string[]
  notes:                 string | null
  net_weight:            number | null
  main_photo:            string | null
  main_photo_public_id:  string | null
  detail_photos:         PhotoEntry[] | null
  weight_photos:         PhotoEntry[] | null
  is_new:                boolean
  created_at:            string
  updated_at:            string
}

// ── 下載工具 ──────────────────────────────────────────────────

/**
 * 下載 URL 並儲存至 destPath（自動建立父目錄）
 * 支援 HTTP redirect（最多 5 次）
 */
function downloadFile(url: string, destPath: string, maxRedirects = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true })

    function doGet(targetUrl: string, remaining: number): void {
      const client = targetUrl.startsWith('https://') ? https : http
      const req = (client as typeof https).get(targetUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (remaining <= 0) {
            reject(new Error(`太多重導向：${targetUrl}`))
            return
          }
          res.resume()
          doGet(res.headers.location, remaining - 1)
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode}：${targetUrl}`))
          return
        }
        const file = fs.createWriteStream(destPath)
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
        file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err) })
      })
      req.on('error', reject)
    }

    doGet(url, maxRedirects)
  })
}

/** 組 Cloudinary 下載 URL（不需要 API 金鑰，直接用 public_id）*/
function buildCloudinaryUrl(public_id: string): string {
  // public_id 可能已含 folder 前綴（如 equipment-cards/xxx）
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${public_id}`
}

/** 清理名稱中不能用於檔名的字元 */
function sanitizeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_').trim()
}

/** 從淨重照片的 public_id 取出 kg 字串
 *  public_id 格式：equipment-cards/{id}_weight_{kg}
 */
function extractKgFromPublicId(public_id: string, equipment_id: string): string {
  const base   = public_id.split('/').pop() ?? public_id
  const prefix = `${equipment_id}_weight_`
  return base.startsWith(prefix) ? base.slice(prefix.length) : base
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── 主流程 ────────────────────────────────────────────────────

async function main() {
  log('='.repeat(60))
  log(`export-backup 開始`)
  log('='.repeat(60))

  if (!CLOUD_NAME) {
    logErr('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME 未設定，無法下載照片')
    process.exit(1)
  }

  // 1. 建立輸出目錄
  const photosDir  = path.join(BACKUP_DIR, 'photos')
  const mainDir    = path.join(photosDir, 'main')
  const detailDir  = path.join(photosDir, 'detail')
  const weightDir  = path.join(photosDir, 'weight')
  fs.mkdirSync(mainDir,   { recursive: true })
  fs.mkdirSync(detailDir, { recursive: true })
  fs.mkdirSync(weightDir, { recursive: true })

  // 2. 讀取 Supabase 全量資料（分頁，避免超過 1000 筆限制）
  log('從 Supabase 讀取 equipment_cards...')
  const allRows: EquipmentRow[] = []
  const PAGE = 1000
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('equipment_cards')
      .select('*')
      .order('equipment_id')
      .range(offset, offset + PAGE - 1)

    if (error) {
      logErr(`Supabase 查詢失敗：${error.message}`)
      process.exit(1)
    }

    if (!data || data.length === 0) break
    allRows.push(...(data as EquipmentRow[]))
    log(`  已讀取 ${allRows.length} 筆...`)

    if (data.length < PAGE) break
    offset += PAGE
  }

  log(`Supabase 讀取完成：共 ${allRows.length} 筆`)

  // 3. 寫入 JSON
  const jsonPath = path.join(BACKUP_DIR, 'equipment_cards.json')
  fs.writeFileSync(jsonPath, JSON.stringify(allRows, null, 2), 'utf8')
  log(`JSON 已寫入：${jsonPath}`)

  // 4. 下載照片
  let downloaded = 0, skipped = 0, failed = 0
  const total = allRows.length

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i]
    log(`[${i + 1}/${total}] ${row.equipment_id} ${row.name}`)

    const id   = row.equipment_id
    const name = sanitizeName(row.name)

    // 主照片 → {品號}_{品名}.jpg
    if (row.main_photo_public_id) {
      const url  = buildCloudinaryUrl(row.main_photo_public_id)
      const dest = path.join(mainDir, `${id}_${name}.jpg`)
      try {
        await downloadFile(url, dest)
        downloaded++
        await sleep(50)
      } catch (e) {
        failed++
        logErr(`  主照片下載失敗 ${row.main_photo_public_id}：${(e as Error).message}`)
      }
    }

    // 細節照片 → {品號}_{品名}_2.jpg、_3.jpg…
    const details = row.detail_photos ?? []
    for (let j = 0; j < details.length; j++) {
      const photo = details[j]
      const url   = buildCloudinaryUrl(photo.public_id)
      const dest  = path.join(detailDir, `${id}_${name}_${j + 2}.jpg`)
      try {
        await downloadFile(url, dest)
        downloaded++
        await sleep(50)
      } catch (e) {
        failed++
        logErr(`  細節照片下載失敗 ${photo.public_id}：${(e as Error).message}`)
      }
    }

    // 淨重照片 → {品號}_{品名}_{kg數}.jpg
    for (const photo of row.weight_photos ?? []) {
      const kg   = extractKgFromPublicId(photo.public_id, id)
      const url  = buildCloudinaryUrl(photo.public_id)
      const dest = path.join(weightDir, `${id}_${name}_${kg}.jpg`)
      try {
        await downloadFile(url, dest)
        downloaded++
        await sleep(50)
      } catch (e) {
        failed++
        logErr(`  淨重照片下載失敗 ${photo.public_id}：${(e as Error).message}`)
      }
    }
  }

  // 5. 輸出統計
  log('='.repeat(60))
  log(`備份完成`)
  log(`  JSON: ${jsonPath}`)
  log(`  照片 — 下載:${downloaded}  跳過:${skipped}  失敗:${failed}`)
  log(`  備份目錄：${BACKUP_DIR}`)
  log('='.repeat(60))
  logStream.end()
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
