-- 啟用 issues 表的 Realtime（讓任務板即時同步）
-- REPLICA IDENTITY FULL：確保 DELETE 事件能回傳完整舊記錄（含 id）
ALTER TABLE issues REPLICA IDENTITY FULL;

-- 將 issues 加入 supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE issues;
