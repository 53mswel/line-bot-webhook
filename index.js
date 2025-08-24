const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const { createObjectCsvWriter } = require('csv-writer');
const { Client } = require('@line/bot-sdk');
const cron = require('node-cron');

const app = express();
app.use(bodyParser.json());

// 環境変数
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_CHANNEL_SECRET) {
  throw new Error("LINE_CHANNEL_ACCESS_TOKEN または LINE_CHANNEL_SECRET が設定されていません。");
}

const client = new Client({
  channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: LINE_CHANNEL_SECRET,
});

const PORT = process.env.PORT || 3000;

// サーバー側で参加者IDを日付ごとに管理
let userDataByDate = {}; // { '9月2日': ['Uxxxx', 'Uyyyy'], ... }

// CSV生成関数（ID＋名前）
async function exportCSVByDate(date, userIds) {
  const fileName = `participants_${date}.csv`;
  const filePath = `/tmp/${fileName}`;

  // プロフィール取得
  const records = [];
  for (const id of userIds) {
    try {
      const profile = await client.getProfile(id);
      records.push({ userId: id, name: profile.displayName });
    } catch (err) {
      console.log(`プロフィール取得失敗: ${id}`, err.message);
      records.push({ userId: id, name: '' });
    }
  }

  const csvWriter = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: 'userId', title: 'UserID' },
      { id: 'name', title: 'Name' },
    ],
  });

  await csvWriter.writeRecords(records);
  console.log(`CSV generated: ${filePath}`);
  return filePath;
}

// 管理者LINEに送信（テキストで通知）
async function sendFileToLine(userId, filePath) {
  await client.pushMessage(userId, {
    type: 'text',
    text: `参加者CSVが生成されました: ${filePath}`,
  });
  console.log(`File sent to LINE admin: ${filePath}`);
}

// Webhook処理（参加日ごとにユーザーIDを追加）
app.post('/webhook', (req, res) => {
  const events = req.body.events || [];
  events.forEach(event => {
    if (event.type === 'message' && event.message.type === 'text') {
      const userId = event.source.userId;
      const dateText = event.message.text; // 例: "9月2日に参加する"

      if (!userDataByDate[dateText]) userDataByDate[dateText] = [];
      if (!userDataByDate[dateText].includes(userId)) {
        userDataByDate[dateText].push(userId);
      }
      console.log(`📥 ${userId} を ${dateText} に追加`);
    }
  });
  res.sendStatus(200);
});

// cron設定：毎週日曜15:00にCSV生成＆送信
cron.schedule('0 6 * * 0', async () => {
  console.log('Cron: 週次CSV生成開始');
  const today = new Date();

  for (const date in userDataByDate) {
    const filePath = await exportCSVByDate(date, userDataByDate[date]);
    await sendFileToLine(ADMIN_USER_ID, filePath);
  }

  // 過去の参加日リストを削除
  for (const date in userDataByDate) {
    const [month, day] = date.match(/\d+/g) || [];
    if (month && day) {
      const d = new Date();
      d.setMonth(parseInt(month)-1);
      d.setDate(parseInt(day));
      d.setHours(0,0,0,0);
      if (d < today) {
        delete userDataByDate[date];
        console.log(`Past date ${date} removed from server memory`);
      }
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
