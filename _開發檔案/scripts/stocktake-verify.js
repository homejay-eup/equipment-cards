// Step 54 驗收：讀盤點表試算表的內容與格式；--write 會在 E2 填數字看盤差、把 C3 倉別改成 B（測讀回），--clear 還原
// 用法：node _開發檔案/scripts/stocktake-verify.js <spreadsheetId> [--write|--clear]
const path = require('path')
const { google } = require('googleapis')
const auth = new google.auth.GoogleAuth({ keyFile: path.resolve(__dirname, '..', 'service-account.json'), scopes: ['https://www.googleapis.com/auth/drive'] })
;(async () => {
  const id = process.argv[2]
  const sheets = google.sheets({ version: 'v4', auth })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'properties.title,sheets(properties(title,gridProperties.frozenRowCount),conditionalFormats,bandedRanges,basicFilter)' })
  const sh = meta.data.sheets[0]
  const tab = sh.properties.title
  if (process.argv.includes('--write')) {
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: id, requestBody: { valueInputOption: 'USER_ENTERED', data: [
      { range: `'${tab}'!E2`, values: [[999]] }, { range: `'${tab}'!E3`, values: [[0]] }, { range: `'${tab}'!C3`, values: [['B']] }] } })
  }
  if (process.argv.includes('--clear')) {
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: id, requestBody: { valueInputOption: 'USER_ENTERED', data: [
      { range: `'${tab}'!E2:E3`, values: [[''], ['']] }, { range: `'${tab}'!C3`, values: [['']] }] } })
  }
  const v = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `'${tab}'!A1:F4` })
  const f = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `'${tab}'!F2:F3`, valueRenderOption: 'FORMULA' })
  const cnt = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `'${tab}'!A:A` })
  console.log(JSON.stringify({
    title: meta.data.properties.title, tab, frozen: sh.properties.gridProperties.frozenRowCount,
    condRules: (sh.conditionalFormats || []).length, banding: (sh.bandedRanges || []).length, filter: !!sh.basicFilter,
    rows: cnt.data.values.length - 1, top: v.data.values, formulas: f.data.values,
  }))
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
