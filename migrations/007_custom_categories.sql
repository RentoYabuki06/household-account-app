-- カテゴリを DB で管理し、画面から追加できるようにする。
-- 追加のみ対応（名前の変更・削除は未対応）。expenses.category は文字列のまま（外部キーは張らない）。

create table if not exists public.categories (
  name       text primary key,
  color      text not null,           -- グラフの色（#rrggbb）
  sort_order integer not null default 0,
  created_at timestamptz default now()
);
alter table public.categories enable row level security;

drop policy if exists "anon select" on public.categories;
create policy "anon select" on public.categories for select to anon using (true);
drop policy if exists "anon insert" on public.categories;
create policy "anon insert" on public.categories for insert to anon with check (true);
grant select, insert on public.categories to anon;
grant all on public.categories to service_role;

insert into public.categories (name, color, sort_order) values
  ('コーヒー', '#92400e', 1), ('食費', '#ea580c', 2), ('日用品', '#0d9488', 3),
  ('書籍', '#2563eb', 4), ('交通費', '#7c3aed', 5), ('交際費', '#db2777', 6),
  ('サブスクリプション', '#0891b2', 7), ('医療費', '#dc2626', 8), ('美容', '#c026d3', 9),
  ('その他', '#64748b', 10)
on conflict (name) do nothing;
