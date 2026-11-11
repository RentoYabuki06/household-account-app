-- カテゴリ自動分類: 店名のキーワード -> カテゴリのルールを DB に持ち、INSERT 時に自動で付ける。
-- GAS の自動取り込みも手入力も同じルールで分類される（未分類のままのものは画面で手動分類）。

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
  ('ネイル', '美容'), ('エステ', '美容'), ('理容', '美容'), ('QB HOUSE', '美容'), ('QBハウス', '美容')
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
