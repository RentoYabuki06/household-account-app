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

-- Row Level Security: ログインなしの個人利用向け設定。
-- anon キー（ブラウザに公開される）を知っていれば誰でも閲覧・追加・削除できる。
-- 利用履歴の閲覧は許容する前提。守りたくなったら Supabase Auth を導入し to authenticated に絞る。
-- GAS からの書き込みは service_role キー（RLS をバイパス）を使う。
alter table public.expenses enable row level security;

create policy "anon select" on public.expenses for select to anon using (true);
create policy "anon insert" on public.expenses for insert to anon with check (true);
create policy "anon delete" on public.expenses for delete to anon using (true);

-- Data API の「Automatically expose new tables」を OFF にしたプロジェクト向けの明示的な権限付与。
grant select, insert, delete on public.expenses to anon;
grant all on public.expenses to service_role;
