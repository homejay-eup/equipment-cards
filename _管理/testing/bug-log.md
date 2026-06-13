# Bug Log — 設備料卡管理系統

> 格式：每個 Bug 一個區塊。嚴重度：P1（阻斷流程）/ P2（功能缺陷）/ P3（體驗問題）

---

## 範本

```
### BUG-XXX：標題

- **發現於**：Round X / Session S?
- **TC 編號**：TC-X.X
- **嚴重度**：P1 / P2 / P3
- **重現步驟**：
  1. 步驟一
  2. 步驟二
- **預期結果**：
- **實際結果**：
- **截圖**：（路徑或無）
- **狀態**：未修復 / 已修復（StepXX）
```

---

## Round 1（2026-06-13）

---

### BUG-001：/api/upload 照片上傳與刪除僅驗證登入，未驗證 CRUD 權限

- **發現於**：Round 1 / Session S1
- **TC 編號**：TC-1.6
- **嚴重度**：P1
- **位置**：`src/app/api/upload/route.ts`、`src/app/api/upload/[id]/route.ts`
- **描述**：
  三個 handler（POST 取得簽名、PATCH 寫入 URL、DELETE 刪除照片）全部只用本地 `requireAuth()`（僅檢查登入）。
  設計意圖應為「有 `create_delete_cards` 權限才可操作」，但現在 viewer 也能通過。
  修法：將三個 handler 的守衛改為 `requirePermission('create_delete_cards')`，
  使有 CRUD 權限的非管理員角色可用，無權限的 viewer 被擋住。
- **預期結果**：需有 `create_delete_cards` 權限才能上傳/刪除照片
- **實際結果**：任何登入者（含 viewer）均可操作
- **狀態**：未修復

---

### ~~BUG-002~~：DELETE /api/issues/[id] 的 crud_cards check（已確認為設計正確）

- **結論**：需求為「只有建立者能刪自己的議題」，非建立者不應能刪。
  `requirePermission('crud_cards')` 若 DB 未定義此 key，永遠回傳 null，等同於只有建立者能刪，行為正確。
  `hasCrudCards` 判斷是死代碼（dead condition），可日後清理，但不影響功能。
- **狀態**：關閉（非 Bug，為 tech debt）
