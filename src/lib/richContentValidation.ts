// 任務板「複合內容」（文字＋圖片＋表格）共用驗證函式。
//
// 背景：Step 41 在 POST /api/issues/[id]/updates 寫了一套完整驗證（文字長度上限、
// 圖片張數上限＋Cloudinary URL 前綴檢查、表格列數/欄數上限）。Step 42 新增 3 個寫入端點
// （PATCH 更新紀錄、POST/PATCH 議題的 description_image_urls/description_table_data）
// 都需要一樣的規則，抽成這個共用函式讓 4 個端點一起呼叫，避免規則各自維護後續飄掉。
//
// 「說明」欄位（issues.description* ）跟「更新紀錄」（issue_updates.*）的差異只有一點：
// 更新紀錄要求文字/圖片/表格三者至少有一項非空（不能送出完全空白的留言），說明欄位本身
// 就是選填欄位（issue 已經有 title 作為必填內容），不需要這條限制 → 用 requireNonEmpty 開關。

export interface RichContentImage {
  public_id: string
  url: string
}

export interface RichContentTable {
  rows: string[][]
  hasHeader: boolean
}

export interface RichContentValidationOptions {
  /**
   * 是否要求 content/images/table 三者至少有一項非空。
   * 更新紀錄留言（新增/編輯）要開；說明欄位不需要（本身選填，title 已經是必填欄位）。
   * 預設 false。
   */
  requireNonEmpty?: boolean
  /** requireNonEmpty 為 true 且三者皆空時的錯誤訊息 */
  emptyErrorMessage?: string
  maxContentLength?: number
  maxImages?: number
  maxTableRows?: number
  maxTableCols?: number
}

export type RichContentValidationResult =
  | {
      ok: true
      content: string | null
      images: RichContentImage[]
      table: RichContentTable | null
    }
  | {
      ok: false
      error: string
      status: number
    }

const DEFAULT_MAX_CONTENT_LENGTH = 5000
const DEFAULT_MAX_IMAGES = 10
const DEFAULT_MAX_TABLE_ROWS = 500
const DEFAULT_MAX_TABLE_COLS = 50

export function validateRichContent(
  input: { content?: unknown; image_urls?: unknown; table_data?: unknown },
  options: RichContentValidationOptions = {},
): RichContentValidationResult {
  const {
    requireNonEmpty = false,
    emptyErrorMessage = '更新內容為必填（文字／圖片／表格至少一項）',
    maxContentLength = DEFAULT_MAX_CONTENT_LENGTH,
    maxImages = DEFAULT_MAX_IMAGES,
    maxTableRows = DEFAULT_MAX_TABLE_ROWS,
    maxTableCols = DEFAULT_MAX_TABLE_COLS,
  } = options
  const { content, image_urls, table_data } = input

  // ── content 驗證 ──────────────────────────────────────────
  if (content !== undefined && content !== null && typeof content !== 'string') {
    return { ok: false, error: '文字內容格式錯誤', status: 400 }
  }
  const trimmedContent: string | null =
    typeof content === 'string' && content.trim() ? content.trim() : null
  if (trimmedContent && trimmedContent.length > maxContentLength) {
    return { ok: false, error: `文字內容最多 ${maxContentLength} 字`, status: 400 }
  }

  // ── image_urls 驗證 ────────────────────────────────────────
  // 每個元素必須是 { public_id: string, url: string }，且 url 必須是本專案 Cloudinary
  // 帳號下的網址，不接受任意外部網址（避免外洩隱私、避免前端渲染時因型別不符整頁壞掉）
  if (image_urls !== undefined && !Array.isArray(image_urls)) {
    return { ok: false, error: '圖片資料格式錯誤', status: 400 }
  }
  const images: RichContentImage[] = Array.isArray(image_urls) ? image_urls : []
  if (images.length > maxImages) {
    return { ok: false, error: `圖片最多 ${maxImages} 張`, status: 400 }
  }
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const cloudinaryPrefix = `https://res.cloudinary.com/${cloudName}/`
  for (const img of images) {
    if (
      !img ||
      typeof img !== 'object' ||
      typeof (img as Partial<RichContentImage>).public_id !== 'string' ||
      typeof (img as Partial<RichContentImage>).url !== 'string' ||
      !(img as RichContentImage).url.startsWith(cloudinaryPrefix)
    ) {
      return { ok: false, error: '圖片資料格式錯誤', status: 400 }
    }
  }

  // ── table_data 驗證 ────────────────────────────────────────
  // rows 每一列必須是 string[]，不符合直接拒絕（不嘗試自動轉型修正）
  if (table_data !== undefined && table_data !== null) {
    if (typeof table_data !== 'object' || !Array.isArray((table_data as { rows?: unknown }).rows)) {
      return { ok: false, error: '表格資料格式錯誤', status: 400 }
    }
    const rows = (table_data as { rows: unknown[] }).rows
    if (rows.length > maxTableRows) {
      return { ok: false, error: `表格最多 ${maxTableRows} 列`, status: 400 }
    }
    for (const row of rows) {
      if (
        !Array.isArray(row) ||
        row.length > maxTableCols ||
        row.some((cell: unknown) => typeof cell !== 'string')
      ) {
        return { ok: false, error: '表格資料格式錯誤', status: 400 }
      }
    }
  }
  const table: RichContentTable | null =
    table_data &&
    typeof table_data === 'object' &&
    Array.isArray((table_data as { rows?: unknown }).rows) &&
    (table_data as { rows: unknown[] }).rows.length > 0
      ? (table_data as RichContentTable)
      : null

  // 複合留言：文字/圖片/表格三者至少要有一項，才視為有效更新（僅更新紀錄需要，說明欄位不需要）
  if (requireNonEmpty && !trimmedContent && images.length === 0 && !table) {
    return { ok: false, error: emptyErrorMessage, status: 400 }
  }

  return { ok: true, content: trimmedContent, images, table }
}
