# Delta 測試協議 — 新功能上線後的差量測試規則

## 原則

新功能只跑「必跑 + 煙霧測試」，不跑完整 8 個 Session。
完整測試（全 8 Session）只在以下情況執行：
- 架構異動（middleware、auth、RLS 大改）
- 大版本 release
- 超過 3 個 Session 的受影響範圍

---

## 受影響 Session 對照表

每個新 Step 的規格文件應填寫：

```markdown
## 受影響測試 Session
- 必跑：S? — （直接影響的功能）
- 煙霧測試：S? — （可能被連帶影響的）
```

### 功能類型 → 建議 Session

| 功能類型 | 必跑 Session | 煙霧測試 |
|---------|------------|---------|
| 料卡欄位新增/修改 | S5（CRUD）| S3（搜尋）|
| 篩選/搜尋邏輯 | S3 | S4 |
| Tracker 功能 | S6 | — |
| 權限/角色異動 | S1（靜態）+ S8（雙帳號）| S7 |
| 帳號管理 | S7 + S8（雙帳號）| S1（靜態）|
| 新增可見/不可見的 UI 功能 | S8（雙帳號）| 對應功能 Session |
| UI 元件異動 | 對應功能 Session | — |
| API route 新增 | S1（靜態）| 對應功能 |
| Schema 異動 | S1（靜態）| 對應功能 |

---

## Delta 測試 SOP

1. 查看新功能的 Step 規格文件中「受影響測試 Session」欄位
2. 執行必跑 Session
3. 執行煙霧測試 Session（可縮短，只跑主要 TC）
4. 結果寫回 `bug-log.md`，輪次標記為「Delta - StepXX」
5. 更新 `playbook.md` 新增一輪

---

## 快速煙霧測試（每次部署前可跑）

以下為最短的核心路徑驗證，約 5 分鐘：

1. 首頁正常載入（有卡片顯示）
2. 搜尋「Sony」有結果
3. 點開任一卡片 Lightbox 正常
4. 管理員能進入 `/admin/users`
5. Tracker 頁面正常載入（若有部門設定）
