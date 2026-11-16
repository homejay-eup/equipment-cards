// Step 54 一次性檢查：網站的 Service Account 看得到哪些共用雲端硬碟、能不能用 Sheets API。
// 用法：node _開發檔案/scripts/stocktake-drive-check.js [--make-folder]
//   --make-folder：在「設備料卡規格書」共用雲端硬碟根目錄建立「盤點表」資料夾（已存在就沿用），印出資料夾 ID。
const path = require('path')
const { google } = require('googleapis')
const auth = new google.auth.GoogleAuth({
  keyFile: path.resolve(__dirname, '..', 'service-account.json'),
  scopes: ['https://www.googleapis.com/auth/drive'],
})
;(async () => {
  const drive = google.drive({ version: 'v3', auth })
  const { data } = await drive.drives.list({ pageSize: 50 })
  console.log('shared drives:', JSON.stringify((data.drives || []).map(d => ({ id: d.id, name: d.name }))))
  const target = (data.drives || []).find(d => d.name.includes('設備料卡') || d.name.includes('規格書'))
  if (!target) return console.log('找不到設備料卡規格書')
  const q = `name='盤點表' and mimeType='application/vnd.google-apps.folder' and '${target.id}' in parents and trashed=false`
  const found = await drive.files.list({ q, corpora: 'drive', driveId: target.id, includeItemsFromAllDrives: true, supportsAllDrives: true, fields: 'files(id,name)' })
  let folder = found.data.files[0]
  if (!folder && process.argv.includes('--make-folder')) {
    folder = (await drive.files.create({ requestBody: { name: '盤點表', mimeType: 'application/vnd.google-apps.folder', parents: [target.id] }, supportsAllDrives: true, fields: 'id,name' })).data
    console.log('created folder')
  }
  console.log('stocktake folder:', JSON.stringify(folder || null))
  if (folder && process.argv.includes('--make-folder')) {
    // Sheets API 測試：建一份測試表 → 寫一格 → 丟回收桶
    const sheets = google.sheets({ version: 'v4', auth })
    const f = (await drive.files.create({ requestBody: { name: '_測試_可刪', mimeType: 'application/vnd.google-apps.spreadsheet', parents: [folder.id] }, supportsAllDrives: true, fields: 'id' })).data
    await sheets.spreadsheets.values.update({ spreadsheetId: f.id, range: 'A1', valueInputOption: 'RAW', requestBody: { values: [['ok']] } })
    await drive.files.update({ fileId: f.id, requestBody: { trashed: true }, supportsAllDrives: true })
    console.log('sheets api: ok')
  }
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
