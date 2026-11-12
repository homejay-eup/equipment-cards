-- Step 53b：修正「價格版本」誤更新（已執行過 step53 的資料庫請執行這一份；可重複執行）
-- 問題：原本用 statement-level trigger，對不存在的品項做修改／刪除（0 列受影響）也會把價格版本更新成現在。
-- 修法：改成 row-level trigger，只有真的有資料列異動才更新版本。
-- 最後一行把價格版本還原成原 HTML 的 2026-11-09 10:59（台灣時間）：這段期間品項資料都沒有實際異動。
-- 之後若你還沒有實際改過品項，可直接執行；若已經改過品項，請刪掉最後一行（UPDATE residual_meta ...），不要還原。

DROP TRIGGER IF EXISTS residual_items_touch_meta_ins ON residual_items;
DROP TRIGGER IF EXISTS residual_items_touch_meta_upd ON residual_items;
DROP TRIGGER IF EXISTS residual_items_touch_meta_del ON residual_items;
DROP TRIGGER IF EXISTS residual_items_touch_meta ON residual_items;
CREATE TRIGGER residual_items_touch_meta AFTER INSERT OR UPDATE OR DELETE ON residual_items
  FOR EACH ROW EXECUTE FUNCTION touch_residual_meta();

UPDATE residual_meta SET updated_at = TIMESTAMPTZ '2026-11-09 10:59:00+08' WHERE id = 1;
