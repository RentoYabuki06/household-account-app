-- 三井住友銀行の通知メール取り込み用: 支払い方法に「三井住友銀行」を追加し、水道光熱費のカテゴリとルールを足す。

alter table public.expenses drop constraint if exists expenses_payment_method_check;
alter table public.expenses add constraint expenses_payment_method_check
  check (payment_method in ('三井住友カード', '三井住友銀行', 'PayPay', '現金', 'その他'));

insert into public.categories (name, color, sort_order) values
  ('水道光熱費', '#ca8a04', 11)
on conflict (name) do nothing;

insert into public.category_rules (keyword, category) values
  ('水道料', '水道光熱費'), ('水道局', '水道光熱費'), ('電力', '水道光熱費'),
  ('東京ガス', '水道光熱費'), ('大阪ガス', '水道光熱費')
on conflict (keyword) do nothing;
