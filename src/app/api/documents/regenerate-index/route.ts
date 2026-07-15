import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sheets_v4 } from 'googleapis'
import { requirePermission } from '@/lib/admin'
import { getDriveClient, getSheetsClient, DRIVE_ROOT_FOLDER_ID } from '@/lib/googleDrive'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const APP_SETTINGS_KEY = 'documentIndexSheet'
const SHEET_NAME_BY_DOC = '依文件'
const SHEET_NAME_BY_CARD = '依料號'

interface DocumentIndexSheetSetting {
  sheet_id: string
  sheet_url: string
  generated_at?: string
}

interface DocumentRow {
  id: string
  name: string
  type: string
  url: string
  updated_at: string
}

interface CardDocLinkRow {
  equipment_id: string
  document_id: string
}

interface EquipmentCardRow {
  equipment_id: string
  name: string
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
  } catch {
    return iso
  }
}

// 找既有「文件目錄表」（file id 存在 app_settings），確認檔案仍存在且未被移到垃圾桶；
// 找不到或已失效則建立新的一份，維持「同一份檔案長期存在、每次覆蓋內容」的設計。
// ⚠️ Service Account 沒有個人 Drive 儲存空間，sheets.spreadsheets.create() 若不指定
// 共用雲端硬碟內的 parent 會回 403「The caller does not have permission」（已實測確認，
// 跟 Sheets API 是否啟用無關），因此一律改用 drive.files.create() 指定 parents 建立。
async function getOrCreateSheet(): Promise<{ spreadsheetId: string; sheetUrl: string }> {
  const supabase = getSupabase()
  const drive = await getDriveClient()

  const { data: settingRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', APP_SETTINGS_KEY)
    .maybeSingle()

  const existing = settingRow?.value as DocumentIndexSheetSetting | null | undefined

  if (existing?.sheet_id) {
    try {
      const fileRes = await drive.files.get({
        fileId: existing.sheet_id,
        supportsAllDrives: true,
        fields: 'id, trashed, webViewLink',
      })
      if (!fileRes.data.trashed) {
        return {
          spreadsheetId: existing.sheet_id,
          sheetUrl: fileRes.data.webViewLink ?? existing.sheet_url,
        }
      }
      // 已被移到垃圾桶 → 視同失效，往下建立新的一份
    } catch {
      // 檔案已不存在（例如被人工從垃圾桶永久清除）→ 往下建立新的一份
    }
  }

  if (!DRIVE_ROOT_FOLDER_ID) {
    throw new Error('DRIVE_ROOT_FOLDER_ID_NOT_SET')
  }

  const createRes = await drive.files.create({
    requestBody: {
      name: '文件目錄表',
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [DRIVE_ROOT_FOLDER_ID],
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  })

  const spreadsheetId = createRes.data.id
  const sheetUrl = createRes.data.webViewLink
  if (!spreadsheetId || !sheetUrl) {
    throw new Error('建立 Google Sheet 失敗，未取得有效檔案資訊')
  }

  return { spreadsheetId, sheetUrl }
}

// 確保試算表內有「依文件」「依料號」兩個分頁（依名稱比對，不假設 sheetId，
// 因為既有檔案的分頁 sheetId 在建立當下就固定了，重新產生時只能用標題比對）
async function ensureSheetTabs(spreadsheetId: string): Promise<void> {
  const sheets = await getSheetsClient()
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
  const sheetList = meta.data.sheets ?? []
  const existingTitles = sheetList.map((s) => s.properties?.title)

  const requests: sheets_v4.Schema$Request[] = []
  const firstSheet = sheetList[0]
  const isFreshDefaultSheet =
    sheetList.length === 1 &&
    firstSheet?.properties?.title !== SHEET_NAME_BY_DOC &&
    firstSheet?.properties?.title !== SHEET_NAME_BY_CARD

  if (isFreshDefaultSheet && firstSheet?.properties?.sheetId !== undefined) {
    // 新建立的試算表只有一個預設分頁（通常叫 Sheet1），改名成「依文件」+ 新增「依料號」
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: firstSheet.properties.sheetId, title: SHEET_NAME_BY_DOC },
        fields: 'title',
      },
    })
    requests.push({ addSheet: { properties: { title: SHEET_NAME_BY_CARD } } })
  } else {
    if (!existingTitles.includes(SHEET_NAME_BY_DOC)) {
      requests.push({ addSheet: { properties: { title: SHEET_NAME_BY_DOC } } })
    }
    if (!existingTitles.includes(SHEET_NAME_BY_CARD)) {
      requests.push({ addSheet: { properties: { title: SHEET_NAME_BY_CARD } } })
    }
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
  }
}

// 清空兩個分頁既有內容後寫入最新資料（避免資料筆數變少時，舊資料的多餘列殘留）
async function writeSheetData(
  spreadsheetId: string,
  docRows: string[][],
  cardRows: string[][],
): Promise<void> {
  const sheets = await getSheetsClient()

  await Promise.all([
    sheets.spreadsheets.values.clear({ spreadsheetId, range: `${SHEET_NAME_BY_DOC}!A:Z` }),
    sheets.spreadsheets.values.clear({ spreadsheetId, range: `${SHEET_NAME_BY_CARD}!A:Z` }),
  ])

  await Promise.all([
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME_BY_DOC}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: docRows },
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME_BY_CARD}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: cardRows },
    }),
  ])
}

// ── POST /api/documents/regenerate-index ────────────────────────
// 需 manage_documents 權限。查詢 documents / card_documents / equipment_cards 現況，
// 覆蓋寫入 Google Sheet「文件目錄表」（「依文件」「依料號」兩個分頁），
// 同一份檔案長期存在（file id 存在 app_settings.documentIndexSheet），每次呼叫都是覆蓋更新內容，
// 不會每次都新建檔案。
export async function POST() {
  if (!await requirePermission('manage_documents')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = getSupabase()

    const [
      { data: documents, error: docsError },
      { data: links, error: linksError },
      { data: cards, error: cardsError },
    ] = await Promise.all([
      supabase.from('documents').select('id, name, type, url, updated_at').order('name', { ascending: true }),
      supabase.from('card_documents').select('equipment_id, document_id'),
      supabase.from('equipment_cards').select('equipment_id, name').order('equipment_id', { ascending: true }),
    ])

    if (docsError) throw docsError
    if (linksError) throw linksError
    if (cardsError) throw cardsError

    const docList = (documents ?? []) as DocumentRow[]
    const linkList = (links ?? []) as CardDocLinkRow[]
    const cardList = (cards ?? []) as EquipmentCardRow[]

    const cardNameById = new Map(cardList.map((c) => [c.equipment_id, c.name]))
    const docById = new Map(docList.map((d) => [d.id, d]))

    const cardLabelsByDoc = new Map<string, string[]>()   // document_id -> ["1000003 品名", ...]
    const docNamesByCard = new Map<string, string[]>()    // equipment_id -> ["文件名稱", ...]

    for (const link of linkList) {
      const cardName = cardNameById.get(link.equipment_id)
      if (cardName !== undefined) {
        const label = `${link.equipment_id} ${cardName}`
        if (!cardLabelsByDoc.has(link.document_id)) cardLabelsByDoc.set(link.document_id, [])
        cardLabelsByDoc.get(link.document_id)!.push(label)
      }

      const doc = docById.get(link.document_id)
      if (doc) {
        if (!docNamesByCard.has(link.equipment_id)) docNamesByCard.set(link.equipment_id, [])
        docNamesByCard.get(link.equipment_id)!.push(doc.name)
      }
    }

    const docRows: string[][] = [
      ['文件名稱', '類型', '掛載料號', 'Drive 連結', '更新時間'],
      ...docList.map((d) => [
        d.name,
        d.type,
        (cardLabelsByDoc.get(d.id) ?? []).join('、'),
        d.url,
        formatDateTime(d.updated_at),
      ]),
    ]

    const cardRows: string[][] = [
      ['料號', '品名', '掛載文件'],
      ...cardList.map((c) => [
        c.equipment_id,
        c.name,
        (docNamesByCard.get(c.equipment_id) ?? []).join('、'),
      ]),
    ]

    const { spreadsheetId, sheetUrl } = await getOrCreateSheet()
    await ensureSheetTabs(spreadsheetId)
    await writeSheetData(spreadsheetId, docRows, cardRows)

    const generatedAt = new Date().toISOString()
    const settingValue: DocumentIndexSheetSetting = {
      sheet_id: spreadsheetId,
      sheet_url: sheetUrl,
      generated_at: generatedAt,
    }
    const { error: settingsError } = await supabase
      .from('app_settings')
      .upsert({ key: APP_SETTINGS_KEY, value: settingValue }, { onConflict: 'key' })
    if (settingsError) throw settingsError

    return NextResponse.json({ generated_at: generatedAt, sheet_url: sheetUrl })
  } catch (err) {
    console.error('[documents/regenerate-index] error', err)
    if (err instanceof Error && err.message === 'DRIVE_ROOT_FOLDER_ID_NOT_SET') {
      return NextResponse.json(
        { error: '伺服器尚未設定 Google Drive 根目錄資料夾（GOOGLE_DRIVE_ROOT_FOLDER_ID），請聯絡管理員' },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: '重新產生目錄檔失敗' }, { status: 500 })
  }
}
