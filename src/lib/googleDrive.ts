import path from 'path'
import { google, drive_v3 } from 'googleapis'
import { GoogleAuth } from 'google-auth-library'

// Service Account 認證：equipment-cards-drive@...iam.gserviceaccount.com
// 已加入共用雲端硬碟「設備料卡規格書」，權限「內容管理員」
// 憑證檔案不進版控（見 .gitignore）：本機用 KEY_FILE，Vercel 沒有這個檔案，
// 改讀 GOOGLE_SERVICE_ACCOUNT_JSON 環境變數（service-account.json 整份內容）
const SCOPES = ['https://www.googleapis.com/auth/drive']
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

let cachedClient: drive_v3.Drive | null = null
let cachedAuth: GoogleAuth | null = null

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
