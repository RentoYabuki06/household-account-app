-- Supabase SQL Editor で実行してください
create table if not exists public.expenses (
  id             uuid primary key default gen_random_uuid(),
  used_at        timestamptz not null,
  store          text        not null,
  amount         integer     not null,
  category       text        default '未分類',
  payment_method text        check (payment_method in ('三井住友カード', '三井住友銀行', 'PayPay', '現金', 'その他')),
  source         text        check (source in ('auto', 'manual')),
  memo           text,
  source_id      text unique, -- Gmail のメッセージ ID（自動取り込みの重複防止。手入力は null）
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

-- ===== カテゴリ自動分類（migrations/006_categories.sql と同じ内容）=====
create table if not exists public.category_rules (
  keyword  text primary key,  -- 店名に含まれる文字列（大文字小文字は区別しない）
  category text not null
);
alter table public.category_rules enable row level security;

drop policy if exists "anon select" on public.category_rules;
create policy "anon select" on public.category_rules for select to anon using (true);
drop policy if exists "anon insert" on public.category_rules;
create policy "anon insert" on public.category_rules for insert to anon with check (true);
drop policy if exists "anon update" on public.category_rules;
create policy "anon update" on public.category_rules for update to anon using (true) with check (true);
grant select, insert, update on public.category_rules to anon;
grant all on public.category_rules to service_role;

-- 画面からカテゴリを直せるように update を許可する
drop policy if exists "anon update" on public.expenses;
create policy "anon update" on public.expenses for update to anon using (true) with check (true);
grant update on public.expenses to anon;

-- INSERT 時、category が未指定または '未分類' なら、最も長く一致したキーワードのカテゴリを付ける
create or replace function public.classify_expense()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category is null or new.category = '未分類' then
    select r.category into new.category
    from public.category_rules r
    where position(lower(r.keyword) in lower(new.store)) > 0
    order by length(r.keyword) desc
    limit 1;
    new.category := coalesce(new.category, '未分類');
  end if;
  return new;
end;
$$;

drop trigger if exists classify_expense_trigger on public.expenses;
create trigger classify_expense_trigger
before insert on public.expenses
for each row execute function public.classify_expense();

-- 初期ルール（迷うものは入れず、未分類のまま画面で分類する）
insert into public.category_rules (keyword, category) values
  ('TULLYS', 'コーヒー'), ('STARBUCKS', 'コーヒー'), ('スターバックス', 'コーヒー'),
  ('ドトール', 'コーヒー'), ('DOUTOR', 'コーヒー'), ('コメダ', 'コーヒー'),
  ('エクセルシオール', 'コーヒー'), ('珈琲', 'コーヒー'), ('COFFEE', 'コーヒー'),
  ('はま寿司', '食費'), ('なか卯', '食費'), ('壱角家', '食費'), ('すき家', '食費'),
  ('吉野家', '食費'), ('松屋', '食費'), ('マクドナルド', '食費'), ('サイゼリヤ', '食費'),
  ('ガスト', '食費'), ('スシロー', '食費'), ('くら寿司', '食費'),
  ('セブン', '食費'), ('ローソン', '食費'), ('ファミリーマート', '食費'), ('ファミマ', '食費'),
  ('イオン', '食費'), ('業務ス', '食費'), ('成城石井', '食費'), ('SEIJOISHII', '食費'),
  ('まいばすけっと', '食費'),
  ('KUSURINOFUKUTARO', '日用品'), ('ツルハ', '日用品'), ('マツモトキヨシ', '日用品'),
  ('マツキヨ', '日用品'), ('ウエルシア', '日用品'), ('スギ薬局', '日用品'),
  ('ダイソー', '日用品'), ('DAISO', '日用品'), ('ニトリ', '日用品'), ('無印', '日用品'),
  ('紀伊國屋', '書籍'), ('KINOKUNIYA', '書籍'), ('丸善', '書籍'), ('ジュンク堂', '書籍'),
  ('蔦屋', '書籍'), ('TSUTAYA', '書籍'), ('ブックオフ', '書籍'), ('BOOKOFF', '書籍'),
  ('三省堂', '書籍'), ('有隣堂', '書籍'), ('書店', '書籍'),
  ('JR東日本', '交通費'), ('SUICA', '交通費'), ('PASMO', '交通費'),
  ('メトロ', '交通費'), ('都営', '交通費'),
  ('NETFLIX', 'サブスクリプション'), ('SPOTIFY', 'サブスクリプション'),
  ('YOUTUBE', 'サブスクリプション'), ('DISNEY', 'サブスクリプション'),
  ('ADOBE', 'サブスクリプション'), ('OPENAI', 'サブスクリプション'),
  ('ANTHROPIC', 'サブスクリプション'), ('CLAUDE', 'サブスクリプション'),
  ('ICLOUD', 'サブスクリプション'), ('AMAZON PRIME', 'サブスクリプション'),
  ('クリニック', '医療費'), ('病院', '医療費'), ('医院', '医療費'), ('薬局', '医療費'),
  ('歯科', '医療費'), ('皮膚科', '医療費'), ('内科', '医療費'), ('調剤', '医療費'),
  ('美容室', '美容'), ('美容院', '美容'), ('ヘアサロン', '美容'), ('SALON', '美容'),
  ('ネイル', '美容'), ('エステ', '美容'), ('理容', '美容'), ('QB HOUSE', '美容'), ('QBハウス', '美容'),
  ('水道料', '水道光熱費'), ('水道局', '水道光熱費'), ('電力', '水道光熱費'),
  ('東京ガス', '水道光熱費'), ('大阪ガス', '水道光熱費')
on conflict (keyword) do nothing;

-- 既存の未分類の行にも、ルールを当てはめる
update public.expenses e
set category = (
  select r.category from public.category_rules r
  where position(lower(r.keyword) in lower(e.store)) > 0
  order by length(r.keyword) desc limit 1
)
where e.category = '未分類'
  and exists (
    select 1 from public.category_rules r
    where position(lower(r.keyword) in lower(e.store)) > 0
  );

-- ===== カテゴリ管理（migrations/007_custom_categories.sql と同じ内容）=====
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
  ('その他', '#64748b', 10), ('水道光熱費', '#ca8a04', 11)
on conflict (name) do nothing;

-- ===== レシート読み取りの回数の上限（migrations/008_receipt_scan_limit.sql と同じ内容）=====
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
