// 把純文字中的 http/https 網址轉成可點擊連結（顯示縮短版，hover 看完整網址）。
// 文字節點由 React 自動跳脫，不使用 dangerouslySetInnerHTML；只認 http(s)，不會產生 javascript: 連結。

// 網址結尾不吃全形/中文標點與空白、引號、角括號
const URL_PATTERN = /https?:\/\/[^\s<>"'，。；：！？、）」』】》]+/g
// 句尾半形標點不算網址的一部分（例如「見 https://a.com/x.」的最後一個點）
const TRAILING_PUNCT = /[.,;:!?)\]]+$/

const SHORT_MAX_LENGTH = 30

function shortenUrl(url: string): string {
  const withoutProtocol = url.replace(/^https?:\/\//, '')
  if (withoutProtocol.length <= SHORT_MAX_LENGTH) return withoutProtocol
  try {
    const { host } = new URL(url)
    return `${host}/…`
  } catch {
    return `${withoutProtocol.slice(0, SHORT_MAX_LENGTH)}…`
  }
}

export default function LinkifiedText({ text }: { text: string }) {
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0

  for (const match of Array.from(text.matchAll(URL_PATTERN))) {
    const raw = match[0]
    const start = match.index ?? 0
    const url = raw.replace(TRAILING_PUNCT, '')
    if (!url || url === 'http://' || url === 'https://') continue

    if (start > lastIndex) nodes.push(text.slice(lastIndex, start))
    nodes.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        className="text-[#7a5230] underline decoration-[#c49a72] underline-offset-2 hover:text-[#5c3d20] break-all"
      >
        {shortenUrl(url)}
      </a>,
    )
    lastIndex = start + url.length
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))

  return <>{nodes}</>
}
