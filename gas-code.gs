/**
 * ============================================================
 * 湯気 YUGE Sauna & Spa - 予約フォーム受付GAS (v2)
 * ============================================================
 *
 * 【v2 変更点】
 *  - ユーザーへの受付完了メール自動送信を追加
 *  - 管理者通知メールもデフォルトで有効化
 *  - 「仮予約→スタッフ確認→正式確定」のフローに対応
 *
 * ============================================================
 * 【初回セットアップ手順】
 *
 * ▼ STEP 1: Google Sheetsの準備
 *   1. Google Driveで新しいスプレッドシートを作成
 *   2. タブ名（画面下）を「予約一覧」に変更
 *   3. 1行目に以下の見出しを入力:
 *      A1: 受付日時   B1: お名前      C1: メールアドレス
 *      D1: 電話番号   E1: プラン      F1: 希望日
 *      G1: 希望時間   H1: 人数        I1: 備考
 *      J1: ステータス
 *   4. URLから「シートID」をコピー
 *      例: docs.google.com/spreadsheets/d/【ここがID】/edit
 *
 * ▼ STEP 2: Apps Scriptの設定
 *   1. スプレッドシートで「拡張機能」→「Apps Script」を開く
 *   2. デフォルトのコードを全削除し、このファイルの内容を貼り付け
 *   3. 下の「SHEET_ID」「ADMIN_EMAIL」「SHOP_NAME」等を変更
 *   4. 保存（Cmd+S）
 *
 * ▼ STEP 3: デプロイ
 *   1. 右上「デプロイ」→「新しいデプロイ」
 *   2. 種類: ウェブアプリ
 *      - 説明: YUGE 予約フォーム v2
 *      - 次のユーザーとして実行: 自分
 *      - アクセスできるユーザー: 全員
 *   3. 「デプロイ」→ 初回は権限承認
 *   4. 発行されたウェブアプリURLをコピー
 *
 * ▼ STEP 4: script.js に GAS URL を設定
 *   script.js の GAS_URL に貼り付け
 *
 * ============================================================
 * 【既にv1をデプロイ済みの方へ（更新方法）】
 *
 *   1. Apps Scriptエディタで旧コードを全削除
 *   2. このv2のコードを貼り付け
 *   3. 保存
 *   4. 「デプロイ」→「デプロイを管理」
 *   5. 既存のデプロイの右上にある鉛筆アイコン(編集)をクリック
 *   6. バージョンを「新バージョン」に変更
 *   7. 説明に「v2 - 自動メール追加」などと入力
 *   8. 「デプロイ」ボタンをクリック
 *   ※ URLは変わらないので script.js の変更は不要
 *
 * ============================================================
 */

// ▼▼▼ ここを書き換えてください ▼▼▼
const SHEET_ID = '18aUJsTiCVWO2OdTZLz2EMJeCWpWL0LL9Zd9EY9r57wM';       // スプレッドシートのID
const SHEET_NAME = '予約一覧';                // タブ名
const ADMIN_EMAIL = 'reservation@yuge-sauna.jp';  // 管理者の通知先メール
const SHOP_NAME = '湯気 YUGE Sauna & Spa 神田';
const SHOP_TEL = '03-1234-5678';
const SHOP_ADDRESS = '〒101-0047 東京都千代田区内神田3-7-10 YUGE BLDG 5–7F';
// ▲▲▲ ここを書き換えてください ▲▲▲


/**
 * フォーム送信を受け取ってスプレッドシートに記録
 */
function doPost(e) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);

    if (!sheet) {
      throw new Error('シート「' + SHEET_NAME + '」が見つかりません');
    }

    // 入力データを取得
    const data = {
      name: e.parameter.name || '',
      email: e.parameter.email || '',
      phone: e.parameter.phone || '',
      plan: e.parameter.plan || '',
      date: e.parameter.date || '',
      time: e.parameter.time || '',
      people: e.parameter.people || '',
      notes: e.parameter.notes || ''
    };

    // タイムスタンプを日本時間で記録
    const now = Utilities.formatDate(
      new Date(),
      'Asia/Tokyo',
      'yyyy-MM-dd HH:mm:ss'
    );

    // スプレッドシートに行を追加（ステータスは「仮予約」で初期化）
    sheet.appendRow([
      now,
      data.name,
      data.email,
      data.phone,
      data.plan,
      data.date,
      data.time,
      data.people,
      data.notes,
      '仮予約'
    ]);

    // ユーザーへ自動返信メール送信
    sendUserConfirmationEmail(data);

    // 管理者へ通知メール送信
    sendAdminNotificationEmail(data, now);

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error(error);
    return ContentService
      .createTextOutput(JSON.stringify({
        result: 'error',
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


/**
 * GETリクエスト（動作確認用）
 */
function doGet(e) {
  return ContentService
    .createTextOutput('YUGE Reservation API is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}


/**
 * ユーザーへの仮予約受付完了メール
 */
function sendUserConfirmationEmail(data) {
  if (!data.email) return;

  const subject = '【' + SHOP_NAME + '】仮予約を受け付けました';

  const body = [
    data.name + ' 様',
    '',
    'この度は ' + SHOP_NAME + ' にご予約いただき、',
    '誠にありがとうございます。',
    '',
    '以下の内容で仮予約を受け付けました。',
    'スタッフが内容を確認のうえ、改めて予約確定のご連絡をいたします。',
    '今しばらくお待ちくださいませ。',
    '',
    '─────────────────────────',
    '【ご予約内容】',
    '─────────────────────────',
    '■ お名前       : ' + data.name + ' 様',
    '■ ご希望プラン : ' + data.plan,
    '■ ご希望日     : ' + data.date,
    '■ ご希望時間   : ' + data.time,
    '■ 人数         : ' + data.people + '名',
    '■ お電話番号   : ' + data.phone,
    '■ ご要望・備考 : ' + (data.notes || '（なし）'),
    '─────────────────────────',
    '',
    '※ このメールは自動送信です。',
    '※ 本メールは仮予約受付のご連絡であり、予約確定ではございません。',
    '※ ご予約の確定はスタッフからの確認メールをもってご案内いたします。',
    '※ 1営業日経っても確定連絡がない場合は、お手数ですが下記までお問い合わせください。',
    '',
    '─────────────────────────',
    SHOP_NAME,
    SHOP_ADDRESS,
    'TEL: ' + SHOP_TEL + '（受付 10:00–22:00）',
    '営業時間: 7:00–24:00（最終入館 23:00）',
    '─────────────────────────'
  ].join('\n');

  try {
    MailApp.sendEmail({
      to: data.email,
      subject: subject,
      body: body,
      name: SHOP_NAME
    });
  } catch (err) {
    console.error('User email failed:', err);
  }
}


/**
 * 管理者への新規予約通知メール
 */
function sendAdminNotificationEmail(data, receivedAt) {
  const subject = '【新規仮予約】' + data.name + ' 様 / ' + data.date + ' ' + data.time;

  const body = [
    SHOP_NAME + ' に新しい仮予約が入りました。',
    'スプレッドシートで詳細を確認し、確定連絡を行ってください。',
    '',
    '─────────────────────────',
    '【予約内容】',
    '─────────────────────────',
    '■ 受付日時     : ' + receivedAt,
    '■ お名前       : ' + data.name + ' 様',
    '■ メール       : ' + data.email,
    '■ 電話         : ' + data.phone,
    '■ プラン       : ' + data.plan,
    '■ 希望日       : ' + data.date,
    '■ 希望時間     : ' + data.time,
    '■ 人数         : ' + data.people + '名',
    '■ 備考         : ' + (data.notes || '（なし）'),
    '─────────────────────────',
    '',
    '▼ スプレッドシートを開く',
    'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit',
    ''
  ].join('\n');

  try {
    MailApp.sendEmail(ADMIN_EMAIL, subject, body);
  } catch (err) {
    console.error('Admin email failed:', err);
  }
}
