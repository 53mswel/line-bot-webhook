const express = require('express');
const app = express();
const line = require('@line/bot-sdk');

app.use(express.json());

const config = {
  channelAccessToken: 'YOUR_CHANNEL_ACCESS_TOKEN',
  channelSecret: 'YOUR_CHANNEL_SECRET',
};

const client = new line.Client(config);

app.post('/webhook', (req, res) => {
  Promise.all(req.body.events.map((event) => {
    if (event.type === 'message' && event.message.type === 'text') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: event.message.text,
      });
    }
    return Promise.resolve(null);
  }))
  .then(() => res.sendStatus(200))
  .catch((err) => {
    console.error(err);
    res.sendStatus(500);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
