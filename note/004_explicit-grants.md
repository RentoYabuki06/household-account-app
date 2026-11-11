# 004 テーブル権限の明示的な付与（auto-expose OFF 対応）

## 目的
Supabase プロジェクト作成時に「Automatically expose new tables」を OFF にした。この設定ではテーブルに Data API 用の権限が自動で付かないため、`schema.sql` に権限を明示する。

## 変更内容
- `schema.sql` の末尾に `grant select, insert, delete on public.expenses to authenticated;` と `grant all on public.expenses to service_role;` を追加

## 設計判断
- **anon には付与しない。** RLS に加えて権限の段でも未ログインを締め出す（多重防御）。
- **service_role にも付与が必要。** service_role は RLS をバイパスするが、テーブルの権限自体は必要。付けないと GAS の INSERT が拒否される。
- authenticated に update は付けない。アプリに編集機能がないため。編集機能を足すときに update を追加する。
- `allowed_users` には付与しない。`is_allowed()` が security definer で参照するため、クライアント側の権限は不要。

## 動作確認
- 未確認。Supabase 上で `schema.sql` を実行し、ログイン後の一覧・追加・削除と GAS の書き込みを実機で確かめる必要がある。

## 注意点・残課題
- 新しいテーブルを足すときは、RLS ポリシーに加えて `grant` も書くこと。
