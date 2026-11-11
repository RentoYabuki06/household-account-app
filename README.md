# My家計簿

三井住友カードの利用通知メールを GAS で自動取り込みし、PayPay・現金は手入力できる PWA 家計簿。
Next.js + Supabase + Google Apps Script。

## セットアップ

1. **Supabase**: プロジェクトを作り、SQL Editor で `schema.sql` を実行。Project URL と publishable key（`sb_publishable_…`）を控える。
2. **Vercel**: この GitHub リポジトリを Import し、環境変数 `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY`（publishable key）を設定してデプロイ。
3. **GAS**: `gas/Code.gs` を貼り、スクリプト プロパティに `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY`（secret key `sb_secret_…`）を登録。`setupTrigger()` を一度実行。
4. **スマホ**: Vercel の URL を Safari で開き、共有メニューから「ホーム画面に追加」。

ログインはない。URL と publishable key を知っている人は誰でも閲覧・追加・削除できる（個人利用の前提）。

## レシート読み取り（任意）

撮影したレシートを Gemini（Google AI Studio の無料枠）で読み取り、入力フォームに自動で埋める。
サーバー側の環境変数（Vercel の Settings > Environment Variables）を設定すると有効になる。

| 変数 | 内容 |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio で発行した API キー。**課金は有効にしない**（無料枠だけで使う） |
| `GEMINI_MODEL` | 使うモデル。省略時は `gemini-3.5-flash-lite` |
| `RECEIPT_PASSPHRASE` | 読み取りを呼ぶための合言葉。長いランダムな文字列（例: `openssl rand -base64 24`） |
| `RECEIPT_DAILY_LIMIT` | 1 日の回数の上限。省略時は 30 |
| `SUPABASE_SERVICE_ROLE_KEY` | 回数の記録に使う Supabase の secret key（`sb_secret_…`）。サーバー専用 |

いずれも `NEXT_PUBLIC_` を付けない。Supabase では `migrations/008_receipt_scan_limit.sql`（新規なら `schema.sql`）を実行しておく。
無料枠では、送った内容が Google の製品改善に使われる。レシートの写真が外部に送られることを理解したうえで使うこと。

ローカル開発は `.env.local.example` を `.env.local` にコピーして `npm run dev`。
