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

-- Row Level Security: ログイン済み(authenticated)ユーザーのみ操作可能。
-- anon キー単体ではアクセスできない。
-- 重要: Supabase ダッシュボードの Authentication > Sign In / Providers で
--       「Allow new users to sign up」を OFF にし、自分のユーザーは手動で作成すること。
--       サインアップが開いていると、誰でも authenticated になれてしまう。
-- GAS からの書き込みは service_role キー（RLS をバイパス）を使う。
alter table public.expenses enable row level security;

create policy "authenticated select" on public.expenses for select to authenticated using (true);
create policy "authenticated insert" on public.expenses for insert to authenticated with check (true);
create policy "authenticated delete" on public.expenses for delete to authenticated using (true);
