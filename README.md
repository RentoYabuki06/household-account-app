# My家計簿

三井住友カードの利用通知メールを GAS で自動取り込みし、PayPay・現金は手入力できる PWA 家計簿。
Next.js + Supabase + Google Apps Script。

## セットアップ

1. **Supabase**: プロジェクトを作り、SQL Editor で `schema.sql` を実行。続けて自分の Gmail を登録する。
   `insert into public.allowed_users (email) values ('あなたのGmail');`
2. **Google Cloud**: 「APIとサービス > 認証情報」で OAuth クライアント ID（ウェブアプリケーション）を作成。
   承認済みのリダイレクト URI に `https://<プロジェクトREF>.supabase.co/auth/v1/callback` を追加。
3. **Supabase の Google 有効化**: Authentication > Sign In / Providers > Google を ON にし、クライアント ID とシークレットを入力。
   Authentication > URL Configuration の Site URL に本番 URL、Redirect URLs に本番 URL と `http://localhost:3000` を追加。
4. **Vercel**: この GitHub リポジトリを Import し、環境変数 `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定してデプロイ。
5. **GAS**: `gas/Code.gs` を貼り、スクリプト プロパティに `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を登録。`setupTrigger()` を一度実行。
6. **スマホ**: 本番 URL を開き、Google でログイン。共有メニューから「ホーム画面に追加」。

ローカル開発は `.env.local.example` を `.env.local` にコピーして `npm run dev`。
