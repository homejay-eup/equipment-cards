# S2 — 靜態審查：元件邏輯

## 前置條件

- **類型**：純靜態程式碼閱讀
- **工具**：Read、Grep
- **帳號**：不需登入
- **時間預估**：25–35 分鐘

## 目標

驗證核心 UI 元件的狀態管理、prop 流向、錯誤處理是否正確，特別關注：
- Dialog 開關與暫存機制
- 搜尋/篩選狀態一致性
- 破壞性操作是否有 ConfirmDialog 守衛

---

## 測試案例

### TC-2.1：CardFormDialog — 暫存照片機制

**讀取**：`src/components/CardFormDialog.tsx`

**驗證項目**：
- [ ] 照片「暫存」→「儲存」機制：編輯過程中的照片異動是否只在按「儲存」後才呼叫 Cloudinary API？
- [ ] 「取消」時是否清理未提交的暫存照片（避免 Cloudinary 孤兒照片）？
- [ ] 新增模式 vs 編輯模式的初始狀態是否正確分開？
- [ ] 必填欄位（料號、品名）是否有 client-side 驗證？
- [ ] 料號重複時 API 回傳 409，UI 是否正確顯示錯誤訊息（而非靜默失敗）？

---

### TC-2.2：CardDetailDialog — Lightbox 行為

**讀取**：`src/components/CardDetailDialog.tsx`

**驗證項目**：
- [ ] 開啟/關閉 Dialog 時是否有 body scroll lock（避免背景捲動）？
- [ ] 照片輪播：左右箭頭、點縮圖切換是否正確更新 activeIndex？
- [ ] 無照片時是否有適當的空狀態顯示（非崩潰）？
- [ ] 管理員才顯示「編輯」入口，一般使用者看不到？
- [ ] 關閉 Dialog 後，再次開啟時 activeIndex 是否重置為 0？

---

### TC-2.3：PhotoWall — 搜尋與篩選狀態

**讀取**：`src/components/PhotoWall.tsx`

**驗證項目**：
- [ ] 搜尋詞 + 分類篩選 + 次級標籤 + 狀態篩選 → 多重條件是否 AND 邏輯（全部符合才顯示）？
- [ ] 清除搜尋時，篩選條件是否保留（只清搜尋詞，不清篩選）？
- [ ] URL 同步：篩選改變後 URL 是否即時更新？重新整理後是否能還原相同篩選狀態？
- [ ] 搜尋結果為零時，是否顯示「找不到」提示（非空白）？
- [ ] Fuse.js 純數字搜尋（如料號）是否走 includes 而非模糊算法？

---

### TC-2.4：SubfilterTagBar — 次級標籤

**讀取**：`src/components/SubfilterTagBar.tsx`

**驗證項目**：
- [ ] tags prop 為 undefined 或空陣列時是否有防護（不呼叫 .map 崩潰）？
- [ ] 選中標籤後，切換分類時次級標籤是否自動清除？
- [ ] 無次級標籤的分類，TagBar 是否正確隱藏？

---

### TC-2.5：BatchImportDialog — CSV 匯入

**讀取**：`src/components/BatchImportDialog.tsx`

**驗證項目**：
- [ ] CSV 欄位順序/名稱錯誤時，是否有清楚的錯誤提示？
- [ ] 匯入前是否有預覽（讓用戶確認欄位映射正確）？
- [ ] 料號重複衝突的處理方式（跳過 or 覆蓋 or 報錯）是否有對應 UI 回饋？
- [ ] 大批次匯入（100+ 筆）是否有 loading 狀態防止重複點擊？

---

### TC-2.6：ConfirmDialog — 破壞性操作守衛

**讀取**：`src/components/ConfirmDialog.tsx`；搜尋所有刪除操作呼叫點

**驗證項目**：
- [ ] 刪除料卡操作是否使用 ConfirmDialog（而非原生 confirm()）？
- [ ] 刪除議題是否使用 ConfirmDialog？
- [ ] 帳號停用/移除是否使用 ConfirmDialog？
- [ ] ConfirmDialog 的確認按鈕文字是否具體描述操作（而非只寫「確定」）？

```bash
# 用 Grep 搜尋確認所有破壞性操作呼叫點
grep -r "confirm\|ConfirmDialog" src/ --include="*.tsx"
```

---

### TC-2.7：GroupsPanel / 書籤功能

**讀取**：`src/components/GroupsPanel.tsx`

**驗證項目**：
- [ ] 新增/移除書籤後，UI 是否即時更新（無需重整）？
- [ ] 群組為空時是否顯示合適的空狀態？
- [ ] 書籤上限（若有）是否有 UI 提示？

---

### TC-2.8：Tracker 元件群

**讀取**：`src/components/NewIssueDialog.tsx`、`src/components/EditIssueDialog.tsx`、`src/components/IssueDetailDialog.tsx`

**驗證項目**：
- [ ] NewIssueDialog：標題（必填）、類型（必填）是否有 validation？
- [ ] EditIssueDialog：關閉後再開啟是否重置為原始值（非前次編輯狀態）？
- [ ] IssueDetailDialog：留言區 update 記錄是否按時間序正確排列？
- [ ] 建立者是否只能被自己或 admin 刪除議題？

---

### TC-2.9：UserMenu — Header 右上角

**讀取**：`src/components/UserMenu.tsx`

**驗證項目**：
- [ ] 登出後是否清除 session cookie 並 redirect 到 `/login`？
- [ ] 顯示的使用者名稱/頭像是否正確對應登入帳號？

---

## 完成標準

所有 TC 均通過 → 更新 `playbook.md` S2 狀態為 ✅
