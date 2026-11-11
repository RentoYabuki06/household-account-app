-- Google ログイン用: 許可リストに載ったメールアドレスだけがデータを操作できるようにする。
-- Google ログインは誰でもアカウントを作れてしまうため、RLS 側で本人だけに絞る。

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

drop policy if exists "authenticated select" on public.expenses;
drop policy if exists "authenticated insert" on public.expenses;
drop policy if exists "authenticated delete" on public.expenses;

create policy "allowed select" on public.expenses for select to authenticated using (public.is_allowed());
create policy "allowed insert" on public.expenses for insert to authenticated with check (public.is_allowed());
create policy "allowed delete" on public.expenses for delete to authenticated using (public.is_allowed());

-- 実行後、自分の Gmail を SQL Editor で手動登録すること（このファイルにはメールを書かない）:
--   insert into public.allowed_users (email) values ('あなたのGmail');
