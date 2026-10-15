-- created_by 改存 Google 的 sub；名字與 email 另外記下來顯示用
ALTER TABLE shops ADD COLUMN created_by_name TEXT NOT NULL DEFAULT '';
ALTER TABLE shops ADD COLUMN created_by_email TEXT NOT NULL DEFAULT '';
ALTER TABLE menu_items ADD COLUMN created_by_name TEXT NOT NULL DEFAULT '';
ALTER TABLE menu_items ADD COLUMN created_by_email TEXT NOT NULL DEFAULT '';
ALTER TABLE groups ADD COLUMN created_by_name TEXT NOT NULL DEFAULT '';
ALTER TABLE groups ADD COLUMN created_by_email TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN created_by_name TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN created_by_email TEXT NOT NULL DEFAULT '';

-- 登入功能上線前的舊資料，created_by 存的是手填名字：沿用當顯示名稱
UPDATE shops SET created_by_name = created_by;
UPDATE menu_items SET created_by_name = created_by;
UPDATE groups SET created_by_name = created_by;
UPDATE orders SET created_by_name = created_by;
