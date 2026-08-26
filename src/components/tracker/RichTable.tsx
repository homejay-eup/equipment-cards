'use client'

import type { TableData } from './richContentTypes'

// 真表格渲染（非簡易文字表格）。任務「說明」欄位跟更新紀錄的送出預覽/清單顯示共用。
export default function RichTable({ data }: { data: TableData }) {
  const { rows, hasHeader } = data
  const headerRow = hasHeader ? rows[0] : null
  const bodyRows = hasHeader ? rows.slice(1) : rows
  return (
    <table className="w-full text-xs border-collapse">
      {headerRow && (
        <thead>
          <tr>
            {headerRow.map((cell, i) => (
              <th
                key={i}
                className="border border-[rgba(122,82,48,.15)] bg-[rgba(122,82,48,.06)] px-2 py-1.5 text-left font-semibold text-[#6b4f38] whitespace-pre-wrap"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {bodyRows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td
                key={ci}
                className="border border-[rgba(122,82,48,.1)] px-2 py-1.5 text-[#4a3422] whitespace-pre-wrap"
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
