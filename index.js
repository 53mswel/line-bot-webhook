import express from "express";
import line from "@line/bot-sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import csvWriter from "csv-writer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

if (!config.channelAccessToken || !config.channelSecret) {
  throw new Error("LINE_CHANNEL_ACCESS_TOKEN または LINE_CHANNEL_SECRET が設定されていません。");
}

const client = new line.Client(config);
const app = express();
app.use(express.json());

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// 📌 Webhook 受信（メッセージを保存するだけ）
app.post("/webhook", (req, res) => {
  const events = req.body.events;
  events.forEach((event) => {
    if (event.type === "message" && event.message.type === "text") {
      const userId = event.source.userId;
      const text = event.message.text;
      const date = new Date().toISOString().split("T")[0];
      const filePath = path.join(DATA_DIR, `${date}.csv`);

      const row = `${userId},${text},${new Date().toISOString()}\n`;
      fs.appendFileSync(filePath, row, "utf8");
    }
  });
  res.status(200).send("OK");
});

// 📌 CSVを送信する関数
async function sendCsvToLine() {
  const date = new Date().toISOString().split("T")[0];
  const filePath = path.join(DATA_DIR, `${date}.csv`);

  if (!fs.existsSync(filePath)) {
    console.log("本日のCSVはまだありません。");
    return;
  }

  await client.pushMessage("U21ee3139f0313a2c74d50f0b4a615e05", {
    type: "text",
    text: `CSVファイル (${date}) を送信します。`,
  });

  const csvData = fs.readFileSync(filePath, "utf8");
  const tempFile = path.join(DATA_DIR, `temp-${date}.txt`);
  fs.writeFileSync(tempFile, csvData, "utf8");

  await client.pushMessage("U21ee3139f0313a2c74d50f0b4a615e05", {
    type: "text",
    text: csvData, // LINEにはファイル添付APIがないので内容を直接送信
  });

  fs.unlinkSync(tempFile);
}

// 📌 テスト用エンドポイント（手動でCSV送信）
app.get("/test-send", async (req, res) => {
  try {
    await sendCsvToLine();
    res.send("テスト送信完了！");
  } catch (err) {
    console.error(err);
    res.status(500).send("テスト送信失敗");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
