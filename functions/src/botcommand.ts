import { Telegraf, Markup } from "telegraf";
import { getFirestore } from "firebase-admin/firestore";

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

bot.command(["top", "leaderboard"], async (ctx) => {
  try {
    const db = getFirestore();

    const snapshot = await db
      .collection("users")
      .orderBy("bestScore", "desc")
      .limit(10)
      .get();

    if (snapshot.empty) {
      await ctx.reply("No players on the leaderboard yet.");
      return;
    }

    const medals = ["🥇", "🥈", "🥉"];

    const players = snapshot.docs.map((doc, index) => {
      const data = doc.data();

      const name =
        data.inGameName ||
        data.username ||
        data.firstName ||
        "Player";

      const score = data.bestScore ?? 0;

      const position = medals[index] || `${index + 1}.`;

      return `${position} ${name} — ${score} points`;
    });

    const message =
      "🏆 BirdEnergy Leaderboard\n\n" +
      players.join("\n");

    await ctx.reply(
      message,
      Markup.inlineKeyboard([
        Markup.button.url("🎮 Play BirdEnergy", GAME_URL),
      ])
    );
  } catch (error) {
    console.error("Leaderboard command failed:", error);

    await ctx.reply(
      "Could not load the leaderboard. Please try again later."
    );
  }
});

bot.command(["me", "profile"], async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const uid = `tg-${telegramId}`;

    const db = getFirestore();
    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      await ctx.reply(
        "You don't have a BirdEnergy profile yet. Open the game and play your first match!",
        Markup.inlineKeyboard([
          Markup.button.url("🎮 Play BirdEnergy", GAME_URL),
        ])
      );
      return;
    }

    const data = userDoc.data()!;

    const name =
      data.inGameName ||
      data.username ||
      data.firstName ||
      "Player";

    const bestScore = data.bestScore ?? 0;
    const totalGames = data.totalGames ?? 0;

    const bird = data.preferredBird ?? 0;
    const background = data.preferredBackground ?? 0;
    const ground = data.preferredGround ?? 0;

    const message =
      `🐦 BirdEnergy Profile\n\n` +
      `Player: ${name}\n` +
      `Best Score: ${bestScore}\n` +
      `Games Played: ${totalGames}\n\n` +
      `Appearance:\n` +
      `Bird Skin: #${bird}\n` +
      `Background: #${background}\n` +
      `Terrain: #${ground}`;

    await ctx.reply(
      message,
      Markup.inlineKeyboard([
        Markup.button.url("👤 Open Profile", GAME_URL),
      ])
    );
  } catch (error) {
    console.error("Profile command failed:", error);

    await ctx.reply(
      "Could not load your profile. Please try again later."
    );
  }
});


bot.command("howtoplay", async (ctx) => {
  const message =
    "🎮 How to Play BirdEnergy\n\n" +
    "1. Tap Play to launch the game.\n" +
    "2. Tap the screen or press Space to make your bird jump.\n" +
    "3. Fly through the gaps between pipes.\n" +
    "4. Avoid obstacles to keep playing.\n" +
    "5. Beat your personal best and climb the leaderboard!";

  await ctx.reply(
    message,
    Markup.inlineKeyboard([
      Markup.button.url("🎮 Start Playing", GAME_URL),
    ])
  );
});