-- 店家的菜單照片連結（貼圖片網址，不上傳檔案）
ALTER TABLE shops ADD COLUMN menu_image_url TEXT NOT NULL DEFAULT '';
