/**
 * ============================================================
 * 湯気 YUGE Sauna & Spa - 予約フォーム受付GAS (v3)
 * ============================================================
 *
 * 【v3 変更点】
 *  - 性別(男性/女性)フィールドを追加
 *  - 予約枠の満席判定機能を追加
 *  - フロントから空き状況を問い合わせできるAPIを追加
 *
 * ============================================================
 * 【セットアップ】
 *
 * ▼ STEP 1: スプレッドシートの見出しを更新
 *   既存のJ1「ステータス」はそのまま。
 *   K1に「性別」を追加してください。
 *
 *   A1: 受付日時   B1: お名前      C1: メールアドレス
 *   D1: 電話番号   E1: プラン      F1: 希望日
 *   G1: 希望時間   H1: 人数        I1: 備考
 *   J1: ステータス K1: 性別        ← 新規追加
 *
 * ▼ STEP 2: 予約枠の設定
 *   下の MALE_DAILY_CAPACITY / FEMALE_DAILY_CAPACITY で
 *   1日あたりの受付上限を調整してください。
 *
 * ▼ STEP 3: デプロイを更新
 *   「デプロイ」→「デプロイを管理」→ 鉛筆アイコン
 *   →「新バージョン」を選択 → デプロイ
 *
 * ============================================================
 */

// ▼▼▼ ここを書き換えてください ▼▼▼
const SHEET_ID = '18aUJsTiCVWO2OdTZLz2EMJeCWpWL0LL9Zd9EY9r57wM';
const SHEET_NAME = '予約一覧';
const ADMIN_EMAIL = 'natsukingstone@gmail.com';
const SHOP_NAME = '湯気 YUGE Sauna & Spa 神田';
const SHOP_TEL = '03-1234-5678';
const SHOP_ADDRESS = '〒101-0047 東京都千代田区内神田3-7-10 YUGE BLDG 5–7F';

// ▼ 予約枠（1日あたりの受付上限）
// テスト時は少ない数値(3など)にすると満席判定の動作確認がしやすいです
const MALE_DAILY_CAPACITY = 20;      // 男性エリア: 20名/日
const FEMALE_DAILY_CAPACITY = 25;    // 女性エリア: 25名/日
// ▲▲▲ ここを書き換えてください ▲▲▲


/**
 * フォーム送信を受け取ってスプレッドシートに記録
 */
function doPost(e) {
  console.log('=== doPost called ===');
  console.log('Parameters: ' + JSON.stringify(e.parameter));

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      const allSheets = ss.getSheets().map(function(s) { return s.getName(); });
      throw new Error('シート「' + SHEET_NAME + '」が見つかりません。利用可能: ' + allSheets.join(', '));
    }

    const data = {
      name: e.parameter.name || '',
      email: e.parameter.email || '',
      phone: e.parameter.phone || '',
      gender: e.parameter.gender || '',
      plan: e.parameter.plan || '',
      date: e.parameter.date || '',
      time: e.parameter.time || '',
      people: e.parameter.people || '',
      notes: e.parameter.notes || ''
    };

    // 満席チェック（フロントで弾かれているはずだが念のためサーバーサイドでも）
    const isFull = checkIfDateFull(sheet, data.date, data.gender, data.people);
    if (isFull) {
      console.warn('満席のため受付できません: ' + data.date + ' / ' + data.gender);
      return ContentService
        .createTextOutput(JSON.stringify({
          result: 'error',
          message: '満席のため受付できません'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

    // A〜K列の順で追加
    sheet.appendRow([
      now,           // A: 受付日時
      data.name,     // B: お名前
      data.email,    // C: メールアドレス
      data.phone,    // D: 電話番号
      data.plan,     // E: プラン
      data.date,     // F: 希望日
      data.time,     // G: 希望時間
      data.people,   // H: 人数
      data.notes,    // I: 備考
      '仮予約',      // J: ステータス
      data.gender    // K: 性別
    ]);
    console.log('Row appended successfully');

    sendUserConfirmationEmail(data);
    console.log('User email sent');

    sendAdminNotificationEmail(data, now);
    console.log('Admin email sent');

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error('ERROR: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


/**
 * GETリクエスト
 *  - ?action=availability → 満席日の一覧を返す
 *  - それ以外 → API稼働確認
 */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';

  if (action === 'availability') {
    return getAvailability();
  }

  return ContentService
    .createTextOutput('YUGE Reservation API is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}


/**
 * 性別ラベルから実際の男性人数・女性人数を返す
 * 「男性」→ {male: people, female: 0}
 * 「女性」→ {male: 0, female: people}
 * 「男女ペア」→ {male: 1, female: 1}
 * 「男性ペア」→ {male: 2, female: 0}
 * 「女性ペア」→ {male: 0, female: 2}
 */
function parseGenderToCount(gender, people) {
  const p = parseInt(people, 10) || 1;
  if (gender === '男女ペア') return { male: 1, female: 1 };
  if (gender === '男性ペア') return { male: 2, female: 0 };
  if (gender === '女性ペア') return { male: 0, female: 2 };
  if (gender === '男性') return { male: p, female: 0 };
  if (gender === '女性') return { male: 0, female: p };
  return { male: 0, female: 0 };
}


/**
 * 空き状況を返す
 */
function getAvailability() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('シートが見つかりません');

    const lastRow = sheet.getLastRow();
    const fullDates = { male: [], female: [] };

    if (lastRow < 2) {
      return jsonResponse({ result: 'success', fullDates: fullDates });
    }

    const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
    const counts = {};

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const dateCell = row[5];
      const peopleCell = row[7];
      const status = row[9];
      const gender = row[10];

      if (status === 'キャンセル') continue;

      let dateStr = '';
      if (dateCell instanceof Date) {
        dateStr = Utilities.formatDate(dateCell, 'Asia/Tokyo', 'yyyy-MM-dd');
      } else if (dateCell) {
        dateStr = String(dateCell);
      }
      if (!dateStr) continue;

      const c = parseGenderToCount(gender, peopleCell);
      if (!counts[dateStr]) counts[dateStr] = { male: 0, female: 0 };
      counts[dateStr].male += c.male;
      counts[dateStr].female += c.female;
    }

    for (const date in counts) {
      if (counts[date].male >= MALE_DAILY_CAPACITY) fullDates.male.push(date);
      if (counts[date].female >= FEMALE_DAILY_CAPACITY) fullDates.female.push(date);
    }

    return jsonResponse({
      result: 'success',
      fullDates: fullDates,
      capacity: { male: MALE_DAILY_CAPACITY, female: FEMALE_DAILY_CAPACITY }
    });

  } catch (error) {
    console.error('getAvailability error: ' + error.toString());
    return jsonResponse({ result: 'error', message: error.toString() });
  }
}


/**
 * 指定日・指定性別が満席かチェック（サーバーサイド検証用）
 */
function checkIfDateFull(sheet, targetDate, gender, people) {
  if (!targetDate || !gender) return false;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  let maleCount = 0;
  let femaleCount = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const dateCell = row[5];
    const peopleCell = row[7];
    const status = row[9];
    const rowGender = row[10];

    if (status === 'キャンセル') continue;

    let dateStr = '';
    if (dateCell instanceof Date) {
      dateStr = Utilities.formatDate(dateCell, 'Asia/Tokyo', 'yyyy-MM-dd');
    } else if (dateCell) {
      dateStr = String(dateCell);
    }
    if (dateStr !== targetDate) continue;

    const c = parseGenderToCount(rowGender, peopleCell);
    maleCount += c.male;
    femaleCount += c.female;
  }

  // 新規予約分を加算してチェック
  const newCount = parseGenderToCount(gender, people);
  if (maleCount + newCount.male > MALE_DAILY_CAPACITY) return true;
  if (femaleCount + newCount.female > FEMALE_DAILY_CAPACITY) return true;
  return false;
}


/**
 * JSONレスポンスのヘルパー
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
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
    '■ ご利用エリア : ' + data.gender + 'エリア',
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
    console.error('User email failed: ' + err.toString());
  }
}


/**
 * 管理者への新規予約通知メール
 */
function sendAdminNotificationEmail(data, receivedAt) {
  const subject = '【新規仮予約】' + data.name + ' 様 / ' + data.date + ' ' + data.time + ' / ' + data.gender;

  const body = [
    SHOP_NAME + ' に新しい仮予約が入りました。',
    'スプレッドシートで詳細を確認し、確定連絡を行ってください。',
    '',
    '─────────────────────────',
    '【予約内容】',
    '─────────────────────────',
    '■ 受付日時     : ' + receivedAt,
    '■ お名前       : ' + data.name + ' 様',
    '■ ご利用エリア : ' + data.gender + 'エリア',
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
    console.error('Admin email failed: ' + err.toString());
  }
}