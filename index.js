const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const { Client } = require('@line/bot-sdk');
const cron = require('node-cron');

const app = express();
app.use(bodyParser.json());

// 環境変数から取得
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

if (!LINE_ACCESS_TOKEN) {
  console.error('Error: LINE_ACCESS_TOKEN is not set.');
  process.exit(1);
}

if (!ADMIN_USER_ID) {
  console.error('Error: ADMIN_USER_ID is not set.');
  process.exit(1);
}

const client = new Client({
  channelAccessToken: LINE_ACCESS_TOKEN,
});

const PORT = process.env.PORT || 3000;

// 参加者データをサーバー内に保存（参加日ごと）
let userDataByDate = {}; // { '9月2日': ['Uxxxx', 'Uyyyy'], ... }

// CSV生成関数
async function exportCSVByDate(date, userIds) {
  const fileName = `participants_${date}.csv`;
  const filePath = `/tmp/${fileName}`;
  const csvContent = userIds.join('\n');
  fs.writeFileSync(filePath, csvContent);
  console.log(`CSV generated: ${filePath}`);
  return filePath;
}

// 管理者LINEにファイル送信
async function sendFileToLine(userId, filePath) {
  await client.pushMessage(userId, {
    type: 'text',
    text: `参加者CSV: ${filePath} が生成されました`,
  });
  console.log(`File sent to LINE admin: ${filePath}`);
}

// 日付文字列を Date オブジェクトに変換（例: "9月2日" → 今年の9月2日）
function parseDateString(dateStr) {
  const match = dateStr.match(/(\d+)月(\d+)日/);
  if (!match) return null;
  const year = new Date().getFullYear();
  const month = parseInt(match[1], 10) - 1; // JS の月は0始まり
  const day = parseInt(match[2], 10);
  return new Date(year, month, day);
}

// Webhook処理
app.post('/webhook', (req, res) => {
  const events = req.body.events || [];
  events.forEach((event) => {
    if (event.type === 'message' && event.message.type === 'text') {
      const userId = event.source.userId;
      const dateText = event.message.text; // 例: "9月2日に参加する"

      if (!userDataByDate[dateText]) {
        userDataByDate[dateText] = [];
      }
      if (!userDataByDate[dateText].includes(userId)) {
        userDataByDate[dateText].push(userId);
      }
      console.log(`📥 ${userId} を ${dateText} に追加`);

      // 確認メッセージ自動返信
      client.replyMessage(event.replyToken, {
        type: 'text',
        text: `${dateText} として登録しました！`,
      });
    }
  });
  res.sendStatus(200);
});

// cron設定：毎週土曜9時にCSV生成＆送信＋過去日削除
cron.schedule('0 9 * * 6', async () => {
  console.log('Cron: 週次CSV生成開始');

  const today = new Date();
  for (const date in userDataByDate) {
    const targetDate = parseDateString(date);
    if (!targetDate) continue;

    // CSV生成＋送信
    const filePath = await exportCSVByDate(date, userDataByDate[date]);
    await sendFileToLine(ADMIN_USER_ID, filePath);

    // 過去日の場合はリスト削除
    if (targetDate < today) {
      delete userDataByDate[date];
      console.log(`過去日データ削除: ${date}`);
    }
  }
});

// テスト用：サーバー起動時に最新データをCSV生成＋送信
(async () => {
  console.log('Test: CSV生成＋送信開始');
  const today = new Date();
  for (const date in userDataByDate) {
    const targetDate = parseDateString(date);
    if (!targetDate) continue;

    const filePath = await exportCSVByDate(date, userDataByDate[date]);
    await sendFileToLine(ADMIN_USER_ID, filePath);

    if (targetDate < today) {
      delete userDataByDate[date];
      console.log(`過去日データ削除: ${date}`);
    }
  }
})();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
