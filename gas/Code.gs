/**
 * 三井住友カードの利用通知・三井住友銀行の入出金通知メール -> Supabase 連携
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
 * 取り込む通知は SOURCES を参照（カードの利用、銀行の口座出金、銀行の口座引き落とし事前通知）。
 *
 * 二重登録の防止: Gmail のメッセージ ID（銀行の引き落とし事前通知は日付・内容・金額から作る ID）を source_id に保存し、
 * 同じ ID は無視する（Supabase 側の unique 制約）。
 */

// 取り込み対象のメール。どれも「送信元」「件名の一部」「本文 -> expenses の行（配列）」の組で定義する。
//  card         ... 三井住友カードの利用通知（送信元 statement@vpass.ne.jp）
//  bankWithdraw ... 三井住友銀行の口座出金通知（PAYPAY チャージ、キャッシュカードでの出金など）
//  bankDebit    ... 三井住友銀行の口座引き落としの事前通知（水道料、ローンなど。複数明細がありうる）
// 銀行の振込入金・振込受付の通知は、本文に金額がないので対象外。
var BANK_SENDER = 'SMBC_service@dn.smbc.co.jp';
// カード代金の引き落としは、カードの利用通知（card）と二重になるので取り込まない。
// 他社カード（楽天カード・JCB など）の引き落としは、アプリ内に明細がないので取り込む。
var SKIP_DEBIT_PATTERN = /ミツイスミトモカード|三井住友カード/;

var SOURCES = [
  { name: 'card', sender: 'statement@vpass.ne.jp', subject: 'ご利用のお知らせ', parse: parseCardMail_ },
  { name: 'bankWithdraw', sender: BANK_SENDER, subject: '口座出金のお知らせ', parse: parseBankWithdrawMail_ },
  { name: 'bankDebit', sender: BANK_SENDER, subject: '口座引き落としの事前お知らせ', parse: parseBankDebitMail_ },
];

function searchQuery_(src, unreadOnly) {
  return (unreadOnly ? 'label:unread ' : '') + 'from:' + src.sender + ' subject:"' + src.subject + '"';
}

/** 新着（未読）を取り込む。1 日 1 回のトリガーから呼ばれる */
function syncSmbcMails() {
  SOURCES.forEach(function (src) {
    var threads = GmailApp.search(searchQuery_(src, true), 0, 50);
    threads.forEach(function (thread) {
      thread.getMessages().forEach(function (msg) {
        if (!msg.isUnread() || !isTarget_(msg, src)) return;

        var rows = src.parse(msg);
        if (!rows) {
          console.warn('パース失敗: ' + msg.getSubject());
          return; // 未読のまま残す（手動確認用）
        }
        if (rows.length === 0) { msg.markRead(); return; } // 取り込み対象の明細がない（カード代金のみ等）
        var res = postRows_(rows);
        if (res.ok) {
          msg.markRead(); // 成功時のみ既読化 -> 失敗分は次回再試行
        } else {
          console.error('Supabase error ' + res.code + ': ' + res.text);
        }
      });
    });
  });
}

/**
 * 過去の通知をすべて取り込む。既読・未読は変更しない。
 * GAS の実行時間制限（6 分）に備え、進捗を BACKFILL_OFFSET_<source> に保存する。
 * 「完了」とログに出るまで繰り返し実行すればよい。重複は登録されない。
 */
function backfillSmbcMails() {
  var started = Date.now();
  var props = PropertiesService.getScriptProperties();
  var PAGE = 50;
  var inserted = 0, skipped = 0;

  for (var i = 0; i < SOURCES.length; i++) {
    var src = SOURCES[i];
    var key = 'BACKFILL_OFFSET_' + src.name;
    if (props.getProperty(key) === 'done') continue; // この種類は取り込み済み
    var offset = parseInt(props.getProperty(key) || '0', 10);
    var done = false;

    while (Date.now() - started < 4 * 60 * 1000) {
      var threads = GmailApp.search(searchQuery_(src, false), offset, PAGE); // 既読・未読を問わない
      if (threads.length === 0) {
        props.setProperty(key, 'done');
        done = true;
        break;
      }

      var rows = [];
      threads.forEach(function (thread) {
        thread.getMessages().forEach(function (msg) {
          if (!isTarget_(msg, src)) return;
          var parsed = src.parse(msg);
          if (parsed) rows = rows.concat(parsed);
          else { skipped++; console.warn('パース失敗: ' + msg.getId() + ' ' + msg.getDate()); }
        });
      });

      if (rows.length > 0) {
        var res = postRows_(rows);
        if (!res.ok) throw new Error('Supabase error ' + res.code + ': ' + res.text);
        inserted += rows.length;
      }
      offset += threads.length;
      props.setProperty(key, String(offset));
    }
    if (!done) {
      console.log('時間切れ。もう一度実行すると続きから再開します（' + src.name + ' offset=' + offset + '）');
      return;
    }
  }
  resetBackfill();
  console.log('完了。送信対象 ' + inserted + ' 件、パース失敗 ' + skipped + ' 件（このセッション分）');
}

/** 取り込みをやり直したいとき用: 進捗をリセット */
function resetBackfill() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('BACKFILL_OFFSET'); // 旧形式（カードのみの時代）の進捗
  SOURCES.forEach(function (src) { props.deleteProperty('BACKFILL_OFFSET_' + src.name); });
}

/** 送信元と件名が、その種類の通知メールのものか */
function isTarget_(msg, src) {
  return msg.getFrom().indexOf(src.sender) >= 0 && msg.getSubject().indexOf(src.subject) >= 0;
}

/** 三井住友カードの通知 -> 1 行。パース失敗時は null */
function parseCardMail_(msg) {
  var parsed = parseBody_(msg.getPlainBody());
  if (!parsed) return null;
  return [{
    used_at: parsed.usedAt,
    store: parsed.store,
    amount: parsed.amount,
    payment_method: '三井住友カード',
    source: 'auto',
    source_id: msg.getId(),
  }];
}

/** 三井住友銀行の口座出金通知 -> 1 行。パース失敗時は null */
function parseBankWithdrawMail_(msg) {
  var p = parseBankWithdraw_(msg.getPlainBody());
  if (!p) return null;
  return [{
    used_at: p.usedAt,
    store: p.store,
    amount: p.amount,
    payment_method: '三井住友銀行',
    source: 'auto',
    source_id: msg.getId(),
  }];
}

/** 三井住友銀行の口座引き落とし事前通知 -> 明細ごとの行（カード代金は除く）。パース失敗時は null */
function parseBankDebitMail_(msg) {
  var items = parseBankDebit_(msg.getPlainBody());
  if (!items) return null;
  var seen = {};
  var rows = [];
  items.forEach(function (it) {
    if (SKIP_DEBIT_PATTERN.test(it.store)) return;
    // 同じ引き落としの通知が複数回届いても重複しないよう、日付・内容・金額から ID を作る。
    // 同じ内容・金額の明細が 1 通に複数あるときだけ連番で区別する
    var base = 'smbc-bank-debit:' + it.date + ':' + it.store + ':' + it.amount;
    seen[base] = (seen[base] || 0) + 1;
    rows.push({
      used_at: it.date + 'T00:00:00+09:00',
      store: it.store,
      amount: it.amount,
      payment_method: '三井住友銀行',
      source: 'auto',
      source_id: base + ':' + seen[base],
    });
  });
  return rows;
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

var pad2_ = function (n) { return ('0' + n).slice(-2); };

/** 「1,234円」の数字部分を整数にする。失敗時は NaN */
function parseYen_(text) {
  return parseInt(text.replace(/[,，]/g, ''), 10);
}

/**
 * 口座出金通知の本文から出金日時・金額・内容を抽出。失敗時は null
 * 実メール: 出金日　：　2026年11月12日 / 出金額　：　10,000円 / 内容　　：　PAYPAY
 *          （2026年11月12日12時21分現在（配信番号：…））
 */
function parseBankWithdraw_(body) {
  var dateM = body.match(/出金日\s*[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
  var amountM = body.match(/出金額\s*[：:]\s*([\d,，]+)円/);
  var contentM = body.match(/内容\s*[：:]\s*(.+)/);
  if (!dateM || !amountM || !contentM) return null;
  var amount = parseYen_(amountM[1]);
  if (isNaN(amount)) return null;

  var date = dateM[1] + '-' + pad2_(dateM[2]) + '-' + pad2_(dateM[3]);
  // 時刻は「○時○分現在」から取る。出金日と日付が一致するときだけ使う（なければ 0 時）
  var hh = '00', mm = '00';
  var timeM = body.match(/(\d{4})年(\d{1,2})月(\d{1,2})日(\d{1,2})時(\d{1,2})分現在/);
  if (timeM && timeM[1] + '-' + pad2_(timeM[2]) + '-' + pad2_(timeM[3]) === date) {
    hh = pad2_(timeM[4]); mm = pad2_(timeM[5]);
  }

  var content = contentM[1].trim().normalize('NFKC');
  var store;
  if (/pay\s*pay|ペイペイ/i.test(content)) store = 'PayPayチャージ';
  else if (/^カード/.test(content)) store = 'ATM出金'; // キャッシュカードでの出金（カード番号の下 3 桁などは載せない）
  else store = content;

  return { usedAt: date + 'T' + hh + ':' + mm + ':00+09:00', store: store, amount: amount };
}

/**
 * 口座引き落とし事前通知の本文から、引落予定日と明細（金額・内容）を抽出。失敗時は null
 * 実メール: 口座引落予定日： 2026年10月27日 / ◆明細１ 引落金額： 7,900円 / 内容 ： APアプラス（明細は複数ありうる）
 */
function parseBankDebit_(body) {
  var dateM = body.match(/口座引落予定日\s*[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!dateM) return null;
  var date = dateM[1] + '-' + pad2_(dateM[2]) + '-' + pad2_(dateM[3]);

  var chunks = body.split('◆明細').slice(1);
  var items = [];
  for (var i = 0; i < chunks.length; i++) {
    var amountM = chunks[i].match(/引落金額\s*[：:]\s*([\d,，]+)円/);
    var contentM = chunks[i].match(/内容\s*[：:]\s*(.+)/);
    if (!amountM || !contentM) return null; // 読めない明細があるときは全体を失敗にして、手動確認に回す
    var amount = parseYen_(amountM[1]);
    if (isNaN(amount)) return null;
    items.push({ date: date, amount: amount, store: contentM[1].trim().normalize('NFKC') });
  }
  return items.length > 0 ? items : null;
}

/** 一度だけ実行: 1 日 1 回（朝 6 時台）のトリガー登録。既存のトリガーは置き換える */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncSmbcMails') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncSmbcMails').timeBased().everyDays(1).atHour(6).create();
}
