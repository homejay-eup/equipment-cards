import { useState } from 'react'

interface UploadResult {
  public_id: string
  url: string
}

// 任務板「更新紀錄」貼圖上傳 hook。
// 跟 usePhotoUpload.ts 相同的「向自己 API 拿簽名 → 直傳 Cloudinary」風格，
// 但只需要前兩步：public_id/url 會跟文字/表格一起包進最後送出的
// POST /api/issues/[id]/updates body 一次寫入，不需要第三步 PATCH 寫回。
export function useUpdateAttachmentUpload(issueId: string) {
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File): Promise<UploadResult | null> {
    setError(null)
    try {
      // Step 1：向自己的 API 取得 Cloudinary 簽名
      const sigRes = await fetch(`/api/issues/${issueId}/updates/signature`, {
        method: 'POST',
      })
      if (!sigRes.ok) throw new Error('Failed to get upload signature')
      const { signature, timestamp, public_id, folder, api_key, cloud_name } =
        await sigRes.json()

      // Step 2：直接 POST 到 Cloudinary（檔案不過 Vercel）
      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', api_key)
      formData.append('timestamp', String(timestamp))
      formData.append('signature', signature)
      formData.append('public_id', public_id)
      formData.append('folder', folder)

      const cdnRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`,
        { method: 'POST', body: formData },
      )
      if (!cdnRes.ok) throw new Error('Cloudinary upload failed')
      const { secure_url } = await cdnRes.json()

      return { public_id, url: secure_url }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload error')
      return null
    }
  }

  return { upload, error }
}
