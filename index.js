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

// 環境変数確認ログ（デプロイ後に一度だけでOK）
console.log("LINE_ACCESS_TOKEN:", LINE_ACCESS_TOKEN ? "OK" : "NOT SET");
console.log("ADMIN_USER_ID:", ADMIN_USER_ID ? "OK" : "NOT SET");

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

// Webhook処理
app.post('/webhook', (req, res) => {
  const events = req.body.events;
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

// cron設定：毎週土曜9時にCSV生成＆送信
cron.schedule('0 9 * * 6', async () => {
  console.log('Cron: 週次CSV生成開始');
  for (const date in userDataByDate) {
    const filePath = await exportCSVByDate(date, userDataByDate[date]);
    await sendFileToLine(ADMIN_USER_ID, filePath);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
