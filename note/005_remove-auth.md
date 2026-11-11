# 005 ログインをやめて anon 運用に戻す

## 目的
利用履歴が見られても問題ないという判断のもと、Google ログインの設定（Google Cloud、Supabase Provider、許可リスト）を省いて、すぐ使えるようにする。

## 変更内容
- `app/page.tsx`: セッション判定をやめ、`ExpenseApp` を直接表示
- `components/ExpenseApp.tsx`: ログアウトボタンと `onSignOut` を削除
- `components/LoginForm.tsx`: 削除
- `schema.sql`: anon 向けの RLS ポリシーと `grant` に戻し、許可リスト関連を削除
- `migrations/004_open_to_anon.sql`（新規）: 稼働中の DB を 003 の状態から戻す差分
- `README.md`: ログインなしの手順に更新

## 設計判断
- 認証（002・003）は履歴に残るので、必要になれば戻せる。
- GAS は service_role キーのままにした。anon でも動くが、キーの置き換えが不要で、RLS を絞り直したときにも影響を受けない。
- anon の権限は select / insert / delete のみ。`update` は付けない。

## 動作確認
- `next build` の結果は下記コミット時点で確認する。
- 未確認: Supabase での 004 の実行、ブラウザでの一覧・追加・削除、GAS の書き込み。

## 注意点・残課題
- URL と publishable key を知る人は、閲覧だけでなく追加・削除もできる。いたずらでデータが消されるリスクがある。
- すでに 003 まで SQL を実行済みの DB には、`migrations/004_open_to_anon.sql` を SQL Editor で実行すること。
