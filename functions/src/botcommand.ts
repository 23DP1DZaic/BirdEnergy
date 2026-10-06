import { Telegraf, Markup } from "telegraf";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is not configured");
}

export const bot = new Telegraf(token);

const GAME_URL =
  "https://t.me/BirdEnergy_testbot/birdenergygame";

bot.start(async (ctx) => {
  await ctx.reply(
    "🐦 Welcome to Bird Energy!\nTap the button below to start playing.",
    Markup.inlineKeyboard([
      Markup.button.url(
        "🎮 Play",
        GAME_URL
      ),
    ])
  );
});