interface CloudinaryLoaderParams {
  src: string
  width: number
  quality?: number
}

// 讓 next/image 直接用 Cloudinary 自己的轉檔服務（f_auto 依瀏覽器自動選格式、
// c_limit 只縮小不放大、q_auto 自動壓縮），不再經過 Vercel Image Optimization，
// 避免撞到 Vercel Hobby 方案的圖片最佳化額度上限。
export default function cloudinaryLoader({ src, width, quality }: CloudinaryLoaderParams): string {
  const params = ['f_auto', 'c_limit', `w_${width}`, `q_${quality ?? 'auto'}`]
  return src.replace('/upload/', `/upload/${params.join(',')}/`)
}
