const express = require('express');
const line = require('@line/bot-sdk');

const app = express();

// 環境変数から読み込み（RenderのEnvironment Variablesに設定する）
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);

// Webhookエンドポイント
app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    const results = await Promise.all(events.map(handleEvent));
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

// イベント処理
async function handleEvent(event) {
  // ポストバックアクションが返ってきた場合
  if (event.type === 'postback') {
    const selectedDate = event.postback.data; 
    // 例: "9月2日" がここに入る

    const replyMessage = {
      type: 'text',
      text: `${selectedDate}に参加する`
    };

    return client.replyMessage(event.replyToken, replyMessage);
  }

  // それ以外のイベントは無視
  return Promise.resolve(null);
}

// Renderで動かす用ポート設定
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
