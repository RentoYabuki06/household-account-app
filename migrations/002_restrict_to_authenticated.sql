-- 既存 DB 向け: anon の全操作を廃止し、ログイン済みユーザーのみに絞る
drop policy if exists "anon select" on public.expenses;
drop policy if exists "anon insert" on public.expenses;
drop policy if exists "anon delete" on public.expenses;

create policy "authenticated select" on public.expenses for select to authenticated using (true);
create policy "authenticated insert" on public.expenses for insert to authenticated with check (true);
create policy "authenticated delete" on public.expenses for delete to authenticated using (true);
