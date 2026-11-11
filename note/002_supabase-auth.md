# 002 Supabase Auth（メール+パスワード）と RLS の authenticated 限定化

## 目的
anon キーを知っていれば誰でも全件を読み書きできる状態（001）を解消し、ログインした本人だけが家計簿を扱えるようにする。

## 変更内容
- `components/LoginForm.tsx`（新規）: メールアドレスとパスワードでログインするフォーム
- `components/ExpenseApp.tsx`（新規）: 旧 `app/page.tsx` の本体を移し、ヘッダーにログアウトボタンを追加
- `app/page.tsx`: セッションの有無で `LoginForm` と `ExpenseApp` を切り替える。`onAuthStateChange` でログイン・ログアウトに追従する
- `schema.sql`: RLS ポリシーを `to authenticated` に変更し、サインアップ無効化の注意を追記
- `migrations/002_restrict_to_authenticated.sql`（新規）: 稼働中の DB で anon ポリシーを消し、authenticated ポリシーを作る差分
- `gas/Code.gs`: 使うキーを anon から `SUPABASE_SERVICE_ROLE_KEY` に変更

## 設計判断
- **メール+パスワードを選び、マジックリンクは選ばなかった。** iOS ではホーム画面の PWA からメールのリンクを開くと Safari で開かれ、PWA 側にセッションが入らない。パスワード方式なら PWA の中で完結する。
- **GAS は service_role キーに切り替えた。** RLS を authenticated 限定にすると、anon キーを使う GAS の INSERT が拒否されるため。service_role は RLS をバイパスする。ブラウザには出ないが、GAS のスクリプト プロパティ以外には置かない。
- ポリシーは `using (true)` のままにした。ユーザーは本人 1 人だけの前提で、Sign up を閉じることで担保する。複数ユーザーにするときは `user_id` 列を足して `auth.uid()` で絞る必要がある。

## 動作確認
- `next build` が通ることを確認した。
- 未確認: Supabase への実際のログイン、RLS による anon の拒否、GAS の service_role での書き込み。いずれも Supabase 側の設定後に実機で確かめる必要がある。

## 注意点・残課題（手動で必要な作業）
1. Supabase ダッシュボードの Authentication > Sign In / Providers で「Allow new users to sign up」を **OFF** にする。ONのままだと、誰でも登録して authenticated になれ、ポリシーが意味を失う。
2. Authentication > Users で自分のユーザーを手動作成する（Auto Confirm User にチェック）。
3. 稼働中の DB なら `migrations/002_restrict_to_authenticated.sql` を SQL Editor で実行する。新規 DB なら `schema.sql` だけでよい。
4. GAS のスクリプト プロパティから `SUPABASE_ANON_KEY` を消し、`SUPABASE_SERVICE_ROLE_KEY` を登録する。
5. service_role キーは GitHub・フロントエンド・チャットに貼らない。漏れたら Supabase で再発行する。
