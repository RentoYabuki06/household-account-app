/**
 * 三井住友カード利用通知メール -> Supabase 連携
 *
 * 事前設定: GAS エディタの「プロジェクトの設定 > スクリプト プロパティ」に
 *   SUPABASE_URL                例: https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   Supabase の secret key（sb_secret_…）。RLS をバイパスする秘密鍵。
 *                               フロントエンドや GitHub には絶対に置かない。GAS のスクリプト プロパティだけに保存
 * を登録。
 *
 * 使い方:
 *   1. backfillSmbcMails() を実行 ... 過去の通知をまとめて取り込む（時間切れなら再実行で続きから）
 *   2. setupTrigger() を一度実行 ... 以後 1 日 1 回（朝 6 時台）に新着を自動取り込み
 *
 * 二重登録の防止: Gmail のメッセージ ID を source_id に保存し、同じ ID は無視する（Supabase 側の unique 制約）。
 */

// 実メールの送信元は statement@vpass.ne.jp、件名は「ご利用のお知らせ【三井住友カード】」
var SENDER = 'statement@vpass.ne.jp';
var SUBJECT_KEYWORD = 'ご利用のお知らせ';
var SEARCH_QUERY = 'label:unread from:' + SENDER + ' subject:"' + SUBJECT_KEYWORD + '"';
var BACKFILL_QUERY = 'from:' + SENDER + ' subject:"' + SUBJECT_KEYWORD + '"'; // 既読・未読を問わない

/** 新着（未読）を取り込む。1 日 1 回のトリガーから呼ばれる */
function syncSmbcMails() {
  var threads = GmailApp.search(SEARCH_QUERY, 0, 50);
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      if (!msg.isUnread() || !isTarget_(msg)) return;

      var row = toRow_(msg);
      if (!row) {
        console.warn('パース失敗: ' + msg.getSubject());
        return; // 未読のまま残す（手動確認用）
      }
      var res = postRows_([row]);
      if (res.ok) {
        msg.markRead(); // 成功時のみ既読化 -> 失敗分は次回再試行
      } else {
        console.error('Supabase error ' + res.code + ': ' + res.text);
      }
    });
  });
}

/**
 * 過去の通知をすべて取り込む。既読・未読は変更しない。
 * GAS の実行時間制限（6 分）に備え、進捗を BACKFILL_OFFSET に保存する。
 * 「完了」とログに出るまで繰り返し実行すればよい。重複は登録されない。
 */
function backfillSmbcMails() {
  var started = Date.now();
  var props = PropertiesService.getScriptProperties();
  var offset = parseInt(props.getProperty('BACKFILL_OFFSET') || '0', 10);
  var PAGE = 50;
  var inserted = 0, skipped = 0;

  while (Date.now() - started < 4 * 60 * 1000) {
    var threads = GmailApp.search(BACKFILL_QUERY, offset, PAGE);
    if (threads.length === 0) {
      props.deleteProperty('BACKFILL_OFFSET');
      console.log('完了。送信対象 ' + inserted + ' 件、パース失敗 ' + skipped + ' 件（このセッション分）');
      return;
    }

    var rows = [];
    threads.forEach(function (thread) {
      thread.getMessages().forEach(function (msg) {
        if (!isTarget_(msg)) return;
        var row = toRow_(msg);
        if (row) rows.push(row);
        else { skipped++; console.warn('パース失敗: ' + msg.getId() + ' ' + msg.getDate()); }
      });
    });

    if (rows.length > 0) {
      var res = postRows_(rows);
      if (!res.ok) throw new Error('Supabase error ' + res.code + ': ' + res.text);
      inserted += rows.length;
    }
    offset += threads.length;
    props.setProperty('BACKFILL_OFFSET', String(offset));
  }
  console.log('時間切れ。もう一度実行すると続きから再開します（offset=' + offset + '）');
}

/** 取り込みをやり直したいとき用: 進捗をリセット */
function resetBackfill() {
  PropertiesService.getScriptProperties().deleteProperty('BACKFILL_OFFSET');
}

/** 送信元と件名が通知メールのものか */
function isTarget_(msg) {
  return msg.getFrom().indexOf(SENDER) >= 0 && msg.getSubject().indexOf(SUBJECT_KEYWORD) >= 0;
}

/** メッセージ -> expenses の 1 行。パース失敗時は null */
function toRow_(msg) {
  var parsed = parseBody_(msg.getPlainBody());
  if (!parsed) return null;
  return {
    used_at: parsed.usedAt,
    store: parsed.store,
    amount: parsed.amount,
    payment_method: '三井住友カード',
    source: 'auto',
    source_id: msg.getId(),
  };
}

/** Supabase へ一括 INSERT。source_id が重複する行は無視する */
function postRows_(rows) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL');
  var key = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です');

  var res = UrlFetchApp.fetch(url + '/rest/v1/expenses?on_conflict=source_id', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    payload: JSON.stringify(rows),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  return { ok: code >= 200 && code < 300, code: code, text: res.getContentText() };
}

/** 本文から利用日時・利用先・利用金額を抽出。失敗時は null */
function parseBody_(body) {
  // 全角コロン/半角コロン両対応
  // 実メール: ◇利用日：2026/11/10 12:56 / ◇利用先：... / ◇利用金額：450円
  var dateM = body.match(/利用日(?:時)?[：:]\s*(\d{4})[\/年\-](\d{1,2})[\/月\-](\d{1,2})日?\s*(\d{1,2}):(\d{2})/);
  var storeM = body.match(/利用先[：:]\s*(.+)/);
  // 返品は ◇利用金額：-24,200円 のようにマイナスで届く
  var amountM = body.match(/利用金額[：:]\s*([-−－]?[\d,，]+)/);
  if (!dateM || !storeM || !amountM) return null;

  var pad = function (n) { return ('0' + n).slice(-2); };
  var usedAt = dateM[1] + '-' + pad(dateM[2]) + '-' + pad(dateM[3]) +
    'T' + pad(dateM[4]) + ':' + dateM[5] + ':00+09:00'; // JST

  var amount = parseInt(amountM[1].replace(/[−－]/g, '-').replace(/[,，]/g, ''), 10);
  if (isNaN(amount)) return null;

  // 全角英数（例: ＡＭＡＺＯＮ．ＣＯ．ＪＰ）を半角に正規化
  var store = storeM[1].trim().normalize('NFKC');

  return { usedAt: usedAt, store: store, amount: amount };
}

/** 一度だけ実行: 1 日 1 回（朝 6 時台）のトリガー登録。既存のトリガーは置き換える */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncSmbcMails') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncSmbcMails').timeBased().everyDays(1).atHour(6).create();
}
