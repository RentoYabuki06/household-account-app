# 003 Google ログインへの切り替えと許可リストによる RLS

## 目的
スマホで使いやすいよう、パスワード入力をやめて Google アカウントでログインする。Google アカウントのパスキーを使えば、スマホでは生体認証だけで入れる。

## 変更内容
- `components/LoginForm.tsx`: パスワードフォームを廃止し、「Google でログイン」ボタン（`signInWithOAuth`）に置き換え
- `migrations/003_google_auth_allowlist.sql`（新規）: `allowed_users` テーブル、`is_allowed()` 関数、許可リストで絞る RLS ポリシー
- `schema.sql`: 上記を反映した完成形に更新
- `README.md`（新規）: セットアップ手順（Supabase、Google Cloud、Vercel、GAS、スマホ）

## 設計判断
- **許可リスト方式にした。** Google ログインは誰でもアカウントを作れる。サインアップの無効化に頼ると設定ミスで穴が開くため、RLS 側で「許可したメールだけ」に絞った。002 の `to authenticated` だけでは、Google アカウントを持つ誰でも通れてしまう。
- **メールはリポジトリに書かない。** public リポジトリに個人のメールを載せないため、SQL Editor で手動登録する。
- **`is_allowed()` は `security definer`。** `allowed_users` をクライアントから読めないようにしたまま、ポリシーから参照するため。`search_path` を空にして乗っ取りを防ぎ、実行権限は authenticated にだけ付けた。
- **パスキーはアプリでは実装していない。** Supabase Auth はアプリ単独のパスキーログインに対応していない。Google 側のパスキーを使う形にした。
- セッションは Supabase クライアントの既定（localStorage、自動更新）に任せている。ログイン済みなら次回から自動でログインされる。

## 動作確認
- `next build` が通ることを確認した。
- 未確認: Google OAuth の実際のログイン、iOS のホーム画面 PWA でのリダイレクト動作、許可リスト外のアカウントが拒否されること。

## 注意点・残課題
- 手順は `README.md` のとおり。Google Cloud の OAuth 設定と Supabase の Google 有効化が必要。
- 許可リストの登録を忘れると、ログインはできるが一覧が空になり、追加も拒否される。
- iOS のホーム画面 PWA では、OAuth のリダイレクトでセッションが引き継がれない可能性がある。その場合は Safari で使う運用にするか、実機で再検討する。
- 002 のパスワード認証の手順（ユーザー手動作成など）は不要になった。
