const fs = require("fs");
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const cron = require("node-cron");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// 環境変数
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const PORT = process.env.PORT || 3000;

// 日付ごとにユーザーIDを保持するオブジェクト
let userDataByDate = {};

// ----------------------
// Webhook受信処理
// ----------------------
app.post("/webhook", (req, res) => {
  const events = req.body.events || [];
  
  events.forEach(event => {
    if (event.type === "message" && event.message.type === "text") {
      const userId = event.source.userId;
      const date = event.message.text.trim(); // 例: "2025-09-20"

      if (!userDataByDate[date]) userDataByDate[date] = [];
      if (!userDataByDate[date].includes(userId)) {
        userDataByDate[date].push(userId);
        console.log(`📥 ${userId} を ${date} に追加`);
      }
    }
  });

  res.sendStatus(200);
});

// ----------------------
// CSV生成
// ----------------------
function exportCSVByDate(data) {
  const files = [];
  Object.keys(data).forEach(date => {
    const filename = path.join(__dirname, `joined_${date}.csv`);
    const content = data[date].join("\n");
    fs.writeFileSync(filename, content, "utf8");
    files.push({ date, filename });
  });
  return files;
}

// ----------------------
// LINEにファイル送信
// ----------------------
async function sendFileToLine(userId, filePath) {
  const fileName = path.basename(filePath);
  const fileData = fs.readFileSync(filePath);

  try {
    await axios.post(
      "https://api-data.line.me/v2/bot/message/push",
      {
        to: userId,
        messages: [
          {
            type: "file",
            originalContentUrl: "data:text/plain;base64," + fileData.toString("base64"),
            fileName: fileName
          }
        ]
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LINE_ACCESS_TOKEN}`
        }
      }
    );
    console.log(`✅ ${fileName} をLINEに送信しました`);
  } catch (err) {
    console.error("❌ 送信エラー:", err.response?.data || err.message);
  }
}

// ----------------------
// 週次送信タスク（毎週土曜9時）
// ----------------------
cron.schedule("0 9 * * 6", async () => {
  console.log("📤 週次レポート作成開始...");

  const today = new Date();

  const files = exportCSVByDate(userDataByDate);

  for (const file of files) {
    await sendFileToLine(ADMIN_USER_ID, file.filename);

    // 参加日が今日以降の場合、送信後に削除
    const fileDate = new Date(file.date);
    if (fileDate <= today) {
      delete userDataByDate[file.date];
      fs.unlinkSync(file.filename);
      console.log(`🗑 ${file.filename} を削除しました`);
    }
  }

  console.log("📤 週次レポート作成完了");
});

// ----------------------
// サーバー起動
// ----------------------
app.listen(PORT, () => {
  console.log(`LINEボットサーバー起動中: http://localhost:${PORT}`);
});
