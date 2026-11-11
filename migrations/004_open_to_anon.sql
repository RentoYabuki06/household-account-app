-- 稼働中の DB 向け: Google ログインと許可リストをやめ、anon で操作できる構成に戻す
drop policy if exists "allowed select" on public.expenses;
drop policy if exists "allowed insert" on public.expenses;
drop policy if exists "allowed delete" on public.expenses;

drop function if exists public.is_allowed();
drop table if exists public.allowed_users;

create policy "anon select" on public.expenses for select to anon using (true);
create policy "anon insert" on public.expenses for insert to anon with check (true);
create policy "anon delete" on public.expenses for delete to anon using (true);

grant select, insert, delete on public.expenses to anon;
revoke all on public.expenses from authenticated;
