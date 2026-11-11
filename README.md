# My家計簿

三井住友カードの利用通知メールを GAS で自動取り込みし、PayPay・現金は手入力できる PWA 家計簿。
Next.js + Supabase + Google Apps Script。

## セットアップ

1. **Supabase**: プロジェクトを作り、SQL Editor で `schema.sql` を実行。Project URL と publishable key（`sb_publishable_…`）を控える。
2. **Vercel**: この GitHub リポジトリを Import し、環境変数 `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY`（publishable key）を設定してデプロイ。
3. **GAS**: `gas/Code.gs` を貼り、スクリプト プロパティに `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY`（secret key `sb_secret_…`）を登録。`setupTrigger()` を一度実行。
4. **スマホ**: Vercel の URL を Safari で開き、共有メニューから「ホーム画面に追加」。

ログインはない。URL と publishable key を知っている人は誰でも閲覧・追加・削除できる（個人利用の前提）。

ローカル開発は `.env.local.example` を `.env.local` にコピーして `npm run dev`。
