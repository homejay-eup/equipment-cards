/**
 * batch-import.ts
 * 讀取 _開發檔案/data/ → 上傳照片到 Cloudinary → Upsert Supabase equipment_cards
 *
 * 執行方式：
 *   cd _開發檔案/scripts
 *   npx tsx batch-import.ts            # 正式執行
 *   npx tsx batch-import.ts --dry-run  # 只解析不上傳，印出前 10 筆
 *
 * Replace 行為：equipment_id 已存在於 DB 時，先刪除舊 Cloudinary 照片與 DB 記錄，
 * 再重新上傳與寫入。
 */

import * as fs      from 'fs'
import * as path    from 'path'
import * as readline from 'readline'
import * as dotenv  from 'dotenv'
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary'
import { createClient } from '@supabase/supabase-js'

// ── 設定 ─────────────────────────────────────────────────────

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })

const DATA_DIR    = path.resolve(__dirname, '../data')
const MAIN_DIR    = path.join(DATA_DIR, 'photos-main')
const DETAIL_DIR  = path.join(DATA_DIR, 'photos-detail')
const WEIGHT_DIR  = path.join(DATA_DIR, 'photos-weight')
const MANIFEST    = path.join(DATA_DIR, 'manifest.csv')
const FOLDER      = process.env.CLOUDINARY_UPLOAD_FOLDER ?? 'equipment-cards'
const DRY_RUN     = process.argv.includes('--dry-run')
const DELAY_MS    = 300

const today    = new Date().toISOString().slice(0, 10)
const LOG_PATH = path.resolve(__dirname, `../logs/batch-import-${today}.log`)

// ── 初始化 SDK ────────────────────────────────────────────────

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

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

interface ManifestRow {
  equipment_id: string
  name:         string
  category:     string
  vendor:       string
  status:       string
  tags:         string[]
  notes:        string
  net_weight:   number | null
}

interface PhotoEntry {
  public_id: string
  url:       string
}

interface EquipmentData extends ManifestRow {
  mainFile:     string | null
  detailFiles:  { file: string; suffix: string }[]
  weightFiles:  { file: string; kgStr: string }[]
  // 上傳後填入
  main_photo:           string | null
  main_photo_public_id: string | null
  detail_photos:        PhotoEntry[]
  weight_photos:        PhotoEntry[]
}

// ── 工具函式 ──────────────────────────────────────────────────

const SYSTEM_FILES = new Set(['thumbs.db', 'desktop.ini', '.ds_store'])
const IMAGE_EXTS   = new Set(['.jpg', '.jpeg', '.png', '.webp'])

function isImageFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  if (SYSTEM_FILES.has(lower)) return false
  return IMAGE_EXTS.has(path.extname(lower))
}

/** 解析主照片/細節照片/淨重照片檔名的共用前綴
 *  格式：{id}_{name}...{ext}
 *  回傳 equipment_id
 */
function extractId(filename: string): string {
  const base  = path.basename(filename, path.extname(filename))
  const idx   = base.indexOf('_')
  if (idx === -1) throw new Error(`無法從檔名解析 equipment_id：${filename}`)
  return base.substring(0, idx)
}

/** 解析細節照片 suffix
 *  格式：{id}_{name}_{suffix}.jpg  → suffix 為 _2、_3 等最後一段底線後的內容
 *  用已知 nameMap 剝去 id_name 前綴，剩餘即 suffix
 */
function parseDetailSuffix(filename: string, nameMap: Map<string, string>): string {
  const base  = path.basename(filename, path.extname(filename))
  const idx   = base.indexOf('_')
  if (idx === -1) throw new Error(`無法解析細節照片檔名：${filename}`)
  const id   = base.substring(0, idx)
  const rest = base.substring(idx + 1) // {name}_{suffix}
  const name = nameMap.get(id)
  if (name && rest.startsWith(name + '_')) {
    return rest.substring(name.length + 1)
  }
  // fallback：取最後一個底線後的內容
  const parts  = rest.split('_')
  const suffix = parts.length > 1 ? parts[parts.length - 1] : rest
  logWarn(`細節照片找不到對應 name，使用 suffix=${suffix}（${filename}）`)
  return suffix
}

/** 解析淨重照片 kg 值
 *  格式：{id}_{name}_{kg}.jpg  → kg 為最後一段底線後的數字字串（含小數）
 */
function parseWeightKg(filename: string, nameMap: Map<string, string>): string {
  const base = path.basename(filename, path.extname(filename))
  const idx  = base.indexOf('_')
  if (idx === -1) throw new Error(`無法解析淨重照片檔名：${filename}`)
  const id   = base.substring(0, idx)
  const rest = base.substring(idx + 1)
  const name = nameMap.get(id)
  if (name && rest.startsWith(name + '_')) {
    return rest.substring(name.length + 1)
  }
  const parts = rest.split('_')
  return parts.length > 1 ? parts[parts.length - 1] : rest
}

/** 讀取 manifest.csv，回傳 ManifestRow[]（跳過空行與 header）*/
async function readManifest(): Promise<ManifestRow[]> {
  if (!fs.existsSync(MANIFEST)) {
    log('manifest.csv 不存在，跳過 CSV 資料')
    return []
  }

  const rows: ManifestRow[] = []
  const rl = readline.createInterface({
    input:     fs.createReadStream(MANIFEST, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  let lineNo = 0
  for await (const line of rl) {
    lineNo++
    if (lineNo === 1) continue  // 跳過 header
    const trimmed = line.trim()
    if (!trimmed) continue

    // 簡易 CSV 解析（不支援欄位內含逗號的引號包覆，manifest 格式單純）
    const cols = trimmed.split(',')
    const equipment_id = cols[0]?.trim()
    const name         = cols[1]?.trim()
    if (!equipment_id || !name) {
      logWarn(`第 ${lineNo} 行缺少必填欄位，跳過：${line}`)
      continue
    }

    const netStr = cols[7]?.trim()
    rows.push({
      equipment_id,
      name,
      category:   cols[2]?.trim() ?? '',
      vendor:     cols[3]?.trim() ?? '',
      status:     cols[4]?.trim() || '現役',
      tags:       (cols[5]?.trim() ?? '').split(/[|,，]/).map(t => t.trim()).filter(Boolean),
      notes:      cols[6]?.trim() ?? '',
      net_weight: netStr ? (isNaN(Number(netStr)) ? null : Number(netStr)) : null,
    })
  }
  log(`manifest.csv 解析完成：${rows.length} 筆`)
  return rows
}

// ── Cloudinary 操作 ───────────────────────────────────────────

function uploadToCloudinary(filePath: string, public_id: string): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const writeStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id,
        overwrite:     true,
        resource_type: 'image',
        use_filename:  false,
      },
      (error, result) => {
        if (error) reject(error)
        else       resolve(result!)
      },
    )
    fs.createReadStream(filePath).pipe(writeStream)
  })
}

// folder 變數（cloudinary.config 之後使用）
const folder = FOLDER

async function destroyCloudinaryPhoto(public_id: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(public_id, { resource_type: 'image' })
  } catch (e) {
    logWarn(`Cloudinary 刪除失敗 ${public_id}：${(e as Error).message}`)
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── DB 刪除舊資料 ─────────────────────────────────────────────

async function deleteExistingRecord(equipment_id: string): Promise<void> {
  // 1. 查舊照片 public_id
  const { data, error } = await supabase
    .from('equipment_cards')
    .select('main_photo_public_id, detail_photos, weight_photos')
    .eq('equipment_id', equipment_id)
    .single()

  if (error || !data) return

  // 2. 刪除 Cloudinary 照片
  const publicIds: string[] = []
  if (data.main_photo_public_id) publicIds.push(data.main_photo_public_id as string)

  const detailPhotos = (data.detail_photos ?? []) as PhotoEntry[]
  detailPhotos.forEach(p => { if (p.public_id) publicIds.push(p.public_id) })

  const weightPhotos = (data.weight_photos ?? []) as PhotoEntry[]
  weightPhotos.forEach(p => { if (p.public_id) publicIds.push(p.public_id) })

  for (const pid of publicIds) {
    await destroyCloudinaryPhoto(pid)
  }
  if (publicIds.length > 0) log(`  已刪除 Cloudinary 照片 ×${publicIds.length}`)

  // 3. 刪除 DB 記錄
  const { error: delErr } = await supabase
    .from('equipment_cards')
    .delete()
    .eq('equipment_id', equipment_id)

  if (delErr) throw new Error(`DB 刪除失敗：${delErr.message}`)
}

// ── 主流程 ────────────────────────────────────────────────────

async function main() {
  log('='.repeat(60))
  log(`batch-import 開始  ${DRY_RUN ? '[DRY RUN — 不實際上傳]' : ''}`)
  log('='.repeat(60))

  // 1. 讀取 manifest.csv
  const manifestRows = await readManifest()
  const manifestMap  = new Map<string, ManifestRow>(manifestRows.map(r => [r.equipment_id, r]))

  // 2. 掃描主照片目錄，建立 equipMap
  const equipMap = new Map<string, EquipmentData>()
  const nameMap  = new Map<string, string>()

  if (fs.existsSync(MAIN_DIR)) {
    const mainFiles = fs.readdirSync(MAIN_DIR).filter(isImageFile)
    for (const filename of mainFiles) {
      try {
        const id   = extractId(filename)
        const base = path.basename(filename, path.extname(filename))
        const name = base.substring(id.length + 1)
        nameMap.set(id, name)

        const manifest = manifestMap.get(id)
        equipMap.set(id, {
          equipment_id:         id,
          name:                 manifest?.name         ?? name,
          category:             manifest?.category     ?? '',
          vendor:               manifest?.vendor       ?? '',
          status:               manifest?.status       ?? '現役',
          tags:                 manifest?.tags         ?? [],
          notes:                manifest?.notes        ?? '',
          net_weight:           manifest?.net_weight   ?? null,
          mainFile:             path.join(MAIN_DIR, filename),
          detailFiles:          [],
          weightFiles:          [],
          main_photo:           null,
          main_photo_public_id: null,
          detail_photos:        [],
          weight_photos:        [],
        })
      } catch (e) {
        logWarn(`跳過主照片：${filename} — ${(e as Error).message}`)
      }
    }
    log(`主照片掃描完成：${equipMap.size} 筆`)
  } else {
    log('photos-main 目錄不存在，跳過主照片掃描')
  }

  // 補上只有 manifest 記錄、無主照片的料卡
  for (const [id, row] of manifestMap) {
    if (!equipMap.has(id)) {
      equipMap.set(id, {
        ...row,
        mainFile:             null,
        detailFiles:          [],
        weightFiles:          [],
        main_photo:           null,
        main_photo_public_id: null,
        detail_photos:        [],
        weight_photos:        [],
      })
    }
  }

  // 3. 掃描細節照片
  if (fs.existsSync(DETAIL_DIR)) {
    const detailFiles = fs.readdirSync(DETAIL_DIR).filter(isImageFile)
    let linked = 0, orphan = 0
    for (const filename of detailFiles) {
      try {
        const id     = extractId(filename)
        const suffix = parseDetailSuffix(filename, nameMap)
        const equip  = equipMap.get(id)
        if (equip) {
          equip.detailFiles.push({ file: path.join(DETAIL_DIR, filename), suffix })
          linked++
        } else {
          logWarn(`細節照片無對應主照片：${filename}（id=${id}）`)
          orphan++
        }
      } catch (e) {
        logWarn(`跳過細節照片：${filename} — ${(e as Error).message}`)
      }
    }
    log(`細節照片掃描完成：${linked} 張已連結，${orphan} 張無對應`)
  }

  // 4. 掃描淨重照片
  if (fs.existsSync(WEIGHT_DIR)) {
    const weightFiles = fs.readdirSync(WEIGHT_DIR).filter(isImageFile)
    let linked = 0, orphan = 0
    for (const filename of weightFiles) {
      try {
        const id    = extractId(filename)
        const kgStr = parseWeightKg(filename, nameMap)
        const equip = equipMap.get(id)
        if (equip) {
          equip.weightFiles.push({ file: path.join(WEIGHT_DIR, filename), kgStr })
          linked++
        } else {
          logWarn(`淨重照片無對應料卡：${filename}（id=${id}）`)
          orphan++
        }
      } catch (e) {
        logWarn(`跳過淨重照片：${filename} — ${(e as Error).message}`)
      }
    }
    log(`淨重照片掃描完成：${linked} 張已連結，${orphan} 張無對應`)
  }

  // 5. 無資料時提早結束
  if (equipMap.size === 0) {
    log('無資料（equipMap 為空），結束。')
    logStream.end()
    return
  }

  // 6. DRY RUN：印出前 10 筆並結束
  if (DRY_RUN) {
    log(`DRY RUN 完成，共 ${equipMap.size} 筆，印出前 10 筆預覽：`)
    let count = 0
    for (const [id, e] of equipMap) {
      if (count++ >= 10) break
      log(`  ${id}  ${e.name}  主×${e.mainFile ? 1 : 0}  細節×${e.detailFiles.length}  淨重×${e.weightFiles.length}`)
    }
    logStream.end()
    return
  }

  // 7. 正式執行：上傳 + Upsert
  let uploaded = 0, failed = 0
  const total = equipMap.size

  for (const [equipment_id, equip] of equipMap) {
    log(`[${uploaded + failed + 1}/${total}] 處理 ${equipment_id} ${equip.name}`)

    try {
      // 7a. 刪除舊資料（若 DB 已存在）
      const { data: existing } = await supabase
        .from('equipment_cards')
        .select('equipment_id')
        .eq('equipment_id', equipment_id)
        .maybeSingle()

      if (existing) {
        log(`  已存在，刪除舊資料中...`)
        await deleteExistingRecord(equipment_id)
      }

      // 7b. 上傳主照片
      if (equip.mainFile) {
        const pid    = `${equipment_id}_main`
        const result = await uploadToCloudinary(equip.mainFile, pid)
        equip.main_photo           = result.secure_url
        equip.main_photo_public_id = result.public_id
        await sleep(DELAY_MS)
      }

      // 7c. 上傳細節照片
      for (const { file, suffix } of equip.detailFiles) {
        const pid    = `${equipment_id}_${suffix}`
        const result = await uploadToCloudinary(file, pid)
        equip.detail_photos.push({ public_id: result.public_id, url: result.secure_url })
        await sleep(DELAY_MS)
      }

      // 7d. 上傳淨重照片
      for (const { file, kgStr } of equip.weightFiles) {
        const pid    = `${equipment_id}_weight_${kgStr}`
        const result = await uploadToCloudinary(file, pid)
        equip.weight_photos.push({ public_id: result.public_id, url: result.secure_url })
        await sleep(DELAY_MS)
      }

      // 7e. Insert Supabase（先刪後插，不用 upsert）
      const { error } = await supabase.from('equipment_cards').insert({
        equipment_id,
        name:                  equip.name,
        category:              equip.category   || null,
        vendor:                equip.vendor     || null,
        status:                equip.status     || '現役',
        tags:                  equip.tags,
        notes:                 equip.notes      || null,
        net_weight:            equip.net_weight,
        main_photo:            equip.main_photo,
        main_photo_public_id:  equip.main_photo_public_id,
        detail_photos:         equip.detail_photos,
        weight_photos:         equip.weight_photos,
      })

      if (error) throw error
      uploaded++
      log(`  完成（主×${equip.main_photo ? 1 : 0} 細節×${equip.detail_photos.length} 淨重×${equip.weight_photos.length}）`)
    } catch (e) {
      failed++
      logErr(`  ${equipment_id} 失敗：${(e as Error).message}`)
    }
  }

  log('='.repeat(60))
  log(`完成  上傳:${uploaded}  失敗:${failed}`)
  log('='.repeat(60))
  logStream.end()
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
