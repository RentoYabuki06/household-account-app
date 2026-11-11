-- レシート読み取りの 1 日あたりの回数の上限。
-- サーバー（service_role）だけが操作できる。ブラウザ（anon）からは見えず、触れない。

create table if not exists public.receipt_scans (
  day   date primary key,          -- 日本時間の日付
  count integer not null default 0
);
alter table public.receipt_scans enable row level security; -- ポリシーなし = anon・authenticated は不可
grant all on public.receipt_scans to service_role;

-- 今日の回数が上限未満なら 1 増やして true、上限に達していれば増やさず false を返す（原子的）
create or replace function public.consume_receipt_scan(max_per_day integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.receipt_scans as r (day, count)
  values ((now() at time zone 'Asia/Tokyo')::date, 1)
  on conflict (day) do update set count = r.count + 1
  where r.count < max_per_day
  returning r.count into v_count;
  return v_count is not null;
end;
$$;

revoke all on function public.consume_receipt_scan(integer) from public, anon, authenticated;
grant execute on function public.consume_receipt_scan(integer) to service_role;
