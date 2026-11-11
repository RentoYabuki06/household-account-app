# 019 README に機能一覧を追加

## 目的
README を読んだ人が、どんな機能があるかを把握できるようにする。

## 変更内容
- `README.md`: 「機能」節を追加（入力・履歴 / 月次分析 / 月次推移 / カード利用の自動取り込み / その他）。

## 設計判断
- 記述は、コード（`ExpenseApp.tsx`、`AnalysisTab.tsx`、`TrendTab.tsx`、`ReceiptScanner.tsx`、`gas/Code.gs`、`schema.sql`）を読んで書いた。
- 任意の機能（レシート読み取り、GAS 連携）には「任意」と明記した。

## 動作確認
- 未確認: 実機での各機能の動作。文面はコードの読み取りに基づく。
