-- 自動取り込みの二重登録防止: Gmail のメッセージ ID を保存し、重複を無視できるようにする
-- 手入力の行は source_id が null。unique 制約は null の重複を許す
alter table public.expenses add column if not exists source_id text unique;
