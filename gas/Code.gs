/**
 * 三井住友カード利用通知メール -> Supabase 連携
 *
 * 事前設定: GAS エディタの「プロジェクトの設定 > スクリプト プロパティ」に
 *   SUPABASE_URL      例: https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY Supabase の service_role key（RLS をバイパスする秘密鍵。
 *                             フロントエンドや GitHub には絶対に置かない。GAS のスクリプト プロパティだけに保存）
 * を登録。その後 setupTrigger() を一度実行すると 10 分おきに自動実行されます。
 */

// 実メールの送信元は statement@vpass.ne.jp、件名は「ご利用のお知らせ【三井住友カード】」
var SEARCH_QUERY = 'label:unread from:statement@vpass.ne.jp subject:"ご利用のお知らせ"';

function syncSmbcMails() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL');
  var key = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です');

  var threads = GmailApp.search(SEARCH_QUERY, 0, 50);
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      if (!msg.isUnread()) return;

      var parsed = parseBody_(msg.getPlainBody());
      if (!parsed) {
        console.warn('パース失敗: ' + msg.getSubject());
        return; // 未読のまま残す（手動確認用）
      }

      var res = UrlFetchApp.fetch(url + '/rest/v1/expenses', {
        method: 'post',
        contentType: 'application/json',
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          Prefer: 'return=minimal',
        },
        payload: JSON.stringify({
          used_at: parsed.usedAt,
          store: parsed.store,
          amount: parsed.amount,
          payment_method: '三井住友カード',
          source: 'auto',
        }),
        muteHttpExceptions: true,
      });

      var code = res.getResponseCode();
      if (code >= 200 && code < 300) {
        msg.markRead(); // 成功時のみ既読化 -> 失敗分は次回再試行
      } else {
        console.error('Supabase error ' + code + ': ' + res.getContentText());
      }
    });
  });
}

/** 本文から利用日時・利用先・利用金額を抽出。失敗時は null */
function parseBody_(body) {
  // 全角コロン/半角コロン両対応
  // 実メール: ◇利用日：2026/11/10 12:56 / ◇利用先：... / ◇利用金額：450円
  var dateM = body.match(/利用日(?:時)?[：:]\s*(\d{4})[\/年\-](\d{1,2})[\/月\-](\d{1,2})日?\s*(\d{1,2}):(\d{2})/);
  var storeM = body.match(/利用先[：:]\s*(.+)/);
  var amountM = body.match(/利用金額[：:]\s*([\d,，]+)/);
  if (!dateM || !storeM || !amountM) return null;

  var pad = function (n) { return ('0' + n).slice(-2); };
  var usedAt = dateM[1] + '-' + pad(dateM[2]) + '-' + pad(dateM[3]) +
    'T' + pad(dateM[4]) + ':' + dateM[5] + ':00+09:00'; // JST

  var amount = parseInt(amountM[1].replace(/[,，]/g, ''), 10);
  if (isNaN(amount)) return null;

  return { usedAt: usedAt, store: storeM[1].trim(), amount: amount };
}

/** 一度だけ実行: 10 分おきのトリガー登録 */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncSmbcMails') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncSmbcMails').timeBased().everyMinutes(10).create();
}
