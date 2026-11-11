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

-- Row Level Security: Google ログイン済みかつ allowed_users に載ったメールのみ操作可能。
-- anon キー単体、および許可リスト外の Google アカウントではアクセスできない。
-- GAS からの書き込みは service_role キー（RLS をバイパス）を使う。
-- 作成後に自分の Gmail を手動登録すること（メールはリポジトリに書かない）:
--   insert into public.allowed_users (email) values ('あなたのGmail');
create table if not exists public.allowed_users (email text primary key);
alter table public.allowed_users enable row level security; -- ポリシーなし = クライアントからは読み書き不可

create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.allowed_users
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

revoke all on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;

alter table public.expenses enable row level security;

create policy "allowed select" on public.expenses for select to authenticated using (public.is_allowed());
create policy "allowed insert" on public.expenses for insert to authenticated with check (public.is_allowed());
create policy "allowed delete" on public.expenses for delete to authenticated using (public.is_allowed());
