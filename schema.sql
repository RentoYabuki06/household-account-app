-- Supabase SQL Editor で実行してください
create table if not exists public.expenses (
  id             uuid primary key default gen_random_uuid(),
  used_at        timestamptz not null,
  store          text        not null,
  amount         integer     not null,
  category       text        default '未分類',
  payment_method text        check (payment_method in ('三井住友カード', 'PayPay', '現金', 'その他')),
  source         text        check (source in ('auto', 'manual')),
  memo           text,
  created_at     timestamptz default now()
);

create index if not exists expenses_used_at_idx on public.expenses (used_at desc);

-- Row Level Security
-- 注意: anon キーはフロントエンドに公開されます。以下のポリシーは
-- 「anon キーを知っている人は全操作可能」という個人利用向けの緩い設定です。
-- 他人に URL を知られたくない場合は Supabase Auth を導入し、
-- to authenticated に変更してください。
alter table public.expenses enable row level security;

create policy "anon select" on public.expenses for select to anon using (true);
create policy "anon insert" on public.expenses for insert to anon with check (true);
create policy "anon delete" on public.expenses for delete to anon using (true);
