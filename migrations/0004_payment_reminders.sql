-- 記錄這個團的付款提醒信已經寄過，避免重複寄
ALTER TABLE groups ADD COLUMN reminder_sent_at TEXT;
