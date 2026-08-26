// Step 42：任務板「複合內容」（文字＋圖片＋表格）共用型別。
// EditIssueDialog／NewIssueDialog 的「說明」欄位、IssueDetailDialog 的「更新紀錄」
// 新增/編輯都共用這套型別，跟後端 src/lib/richContentValidation.ts 的形狀一致。

export type TableData = { rows: string[][]; hasHeader: boolean }

export interface RichImage {
  public_id: string
  url: string
}

// 待上傳/已上傳的圖片（可編輯狀態使用）：uploading 中還沒有 public_id/url，
// 上傳失敗時 error 有值、public_id/url 皆為 undefined。
export interface PendingImage {
  tempId: string
  uploading: boolean
  public_id?: string
  url?: string
  error?: string
}
