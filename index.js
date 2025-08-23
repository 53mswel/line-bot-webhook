require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");

const app = express();

// ==== 環境変数から設定を取得 ====
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

if (!config.channelAccessToken || !config.channelSecret) {
  throw new Error("LINE_CHANNEL_ACCESS_TOKEN または LINE_CHANNEL_SECRET が設定されていません。");
}

const client = new line.Client(config);

// ==== 参加希望リストを保存するメモリDB ====
let participantList = [];

// ==== 過去日付の参加者を自動削除する関数 ====
function cleanUpOldEntries() {
  const today = new Date().toISOString().split("T")[0];
  participantList = participantList.filter((p) => p.date >= today);
}
setInterval(cleanUpOldEntries, 60 * 60 * 1000); // 1時間ごとに実行

// ==== Webhookエンドポイント ====
app.post("/webhook", line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// ==== イベント処理 ====
async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text.trim();

  // ✅ テストモードと本番モードを切り替え
  const mode = process.env.MODE || "test"; // test or production

  if (mode === "test") {
    // テスト用挙動
    if (userMessage.startsWith("予約 ")) {
      const date = userMessage.replace("予約 ", "");
      participantList.push({ userId: event.source.userId, date });
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: `✅ [テスト] ${date} に予約しました。`,
      });
    } else if (userMessage === "一覧") {
      cleanUpOldEntries();
      return client.replyMessage(event.replyToken, {
        type: "text",
        text:
          participantList.length === 0
            ? "📭 [テスト] 現在の参加者はいません。"
            : participantList.map((p) => `・${p.userId} : ${p.date}`).join("\n"),
      });
    }
  } else {
    // 本番用挙動
    if (userMessage.startsWith("希望日 ")) {
      const date = userMessage.replace("希望日 ", "");
      participantList.push({ userId: event.source.userId, date });
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: `✅ ${date} に参加希望を登録しました。`,
      });
    } else if (userMessage === "参加者リスト") {
      cleanUpOldEntries();
      return client.replyMessage(event.replyToken, {
        type: "text",
        text:
          participantList.length === 0
            ? "📭 現在の参加者はいません。"
            : participantList.map((p) => `・${p.userId} : ${p.date}`).join("\n"),
      });
    }
  }

  // デフォルト応答
  return client.replyMessage(event.replyToken, {
    type: "text",
    text: "📌 日付を入力して予約してください。\n例: 希望日 2025-08-30",
  });
}

// ==== サーバー起動 ====
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on ${port}`);
});
