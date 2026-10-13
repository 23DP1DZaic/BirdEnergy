// Used for local development with seperate telegram test bot token
// dont run with production bot token

import { initializeApp } from "firebase-admin/app";
import { existsSync } from "node:fs";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-birdenergy";
process.env.GOOGLE_CLOUD_PROJECT = "demo-birdenergy";

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN");
}

initializeApp({ projectId: "demo-birdenergy" });

const possiblePaths = [
  "./lib/botcommand.js",
  "./lib/src/botcommand.js",
  "./dist/botcommand.js",
  "./dist/src/botcommand.js",
];

const botPath = possiblePaths.find((path) => existsSync(path));

if (!botPath) {
  throw new Error("Could not find compiled botcommand.js");
}

const { bot } = await import(botPath);

console.log("Connecting to Telegram...");

await bot.telegram.deleteWebhook({
  drop_pending_updates: true,
});

console.log("Webhook cleared successfully.");

bot.catch((error) => {
  console.error("Bot error:", error);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

console.log("Starting Telegram bot...");

await bot.launch();

console.log("BirdEnergy development bot is running!");