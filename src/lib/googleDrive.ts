import path from 'path'
import { google, drive_v3, sheets_v4 } from 'googleapis'
import { GoogleAuth } from 'google-auth-library'

// Service Account 認證：equipment-cards-drive@...iam.gserviceaccount.com
// 已加入共用雲端硬碟「設備料卡規格書」，權限「內容管理員」
// 憑證檔案不進版控（見 .gitignore）：本機用 KEY_FILE，Vercel 沒有這個檔案，
// 改讀 GOOGLE_SERVICE_ACCOUNT_JSON 環境變數（service-account.json 整份內容）
// Step 30b：新增 spreadsheets scope，供「文件目錄表」讀寫用（Sheets API 已於
// 2026-07-14 用 Service Account 實測確認可用：spreadsheets.get/batchUpdate/values.update 皆成功）
const SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
const KEY_FILE = path.resolve(process.cwd(), '_開發檔案', 'service-account.json')

// 新文件上傳目的地資料夾 ID（共用雲端硬碟「設備料卡規格書」內）
// ⚠️ 尚未設定：需在 .env.local（本機）與 Vercel 環境變數（正式站）補上這個值，
// 否則 /api/documents/upload 會回傳 500 並提示未設定
export const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID ?? ''

// 「_待清除文件」資料夾 ID：Service Account 在共用雲端硬碟的角色是「內容管理員」，
// 只有 canTrash，沒有 canDelete（files.delete() 一律回 404，不是權限不足的 403，
// 已用 Service Account 直接測試確認）。因此刪除文件本體時改為搬移到這個資料夾，
// 不呼叫 files.delete()，交由人工定期判斷是否真的清除。
export const DRIVE_PENDING_DELETE_FOLDER_ID = process.env.GOOGLE_DRIVE_PENDING_DELETE_FOLDER_ID ?? ''

// 共用雲端硬碟「設備料卡規格書」根目錄 ID（與「A++ 產品規格書」「產品規格書 (上傳)」
// 「_待清除文件」同層）。Step 30b 新增「文件目錄表」Google Sheet 要建在這裡。
// ⚠️ 尚未設定：2026-07-14 用 Service Account 查詢 DRIVE_FOLDER_ID 的 parents 反推確認為
// 共用雲端硬碟本身（driveId === parent id），實際值為 0ANjIxrBkz_eeUk9PVA（雲端硬碟名稱
// 已用 drives.get 核對為「設備料卡規格書」）。需在 .env.local（本機）與 Vercel 環境變數
// （正式站）補上 GOOGLE_DRIVE_ROOT_FOLDER_ID=0ANjIxrBkz_eeUk9PVA，否則
// /api/documents/regenerate-index 會回傳 500 並提示未設定。
export const DRIVE_ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? ''

let cachedClient: drive_v3.Drive | null = null
let cachedAuth: GoogleAuth | null = null
let cachedSheetsClient: sheets_v4.Sheets | null = null

function getAuth(): GoogleAuth {
  if (cachedAuth) return cachedAuth
  cachedAuth = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    ? new GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON), scopes: SCOPES })
    : new GoogleAuth({ keyFile: KEY_FILE, scopes: SCOPES })
  return cachedAuth
}

// 取得已認證的 Drive client（cache 住，同一個 serverless instance 內重用）
export async function getDriveClient(): Promise<drive_v3.Drive> {
  if (cachedClient) return cachedClient
  cachedClient = google.drive({ version: 'v3', auth: getAuth() })
  return cachedClient
}

// 取得已認證的 Sheets client（cache 住，同一個 serverless instance 內重用）
// ⚠️ 注意：Service Account 沒有個人 Drive 儲存空間，sheets.spreadsheets.create()
// 若不指定共用雲端硬碟內的 parent 會回 403「The caller does not have permission」
// （已實測確認，跟 Sheets API 是否啟用無關）。建立新試算表一律要改用
// drive.files.create({ mimeType: 'application/vnd.google-apps.spreadsheet', parents: [...] })，
// 之後的讀寫（get / batchUpdate / values.update）才用這個 Sheets client。
export async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (cachedSheetsClient) return cachedSheetsClient
  cachedSheetsClient = google.sheets({ version: 'v4', auth: getAuth() })
  return cachedSheetsClient
}
