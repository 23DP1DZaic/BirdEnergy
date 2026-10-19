import { Telegraf, Markup, type Context } from "telegraf";
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
    "🐦 Welcome to BirdEnergy!\n\n" +
    "Ready to fly? Choose an option below to get started!",
    Markup.inlineKeyboard([
      [Markup.button.url("🎮 Play BirdEnergy", GAME_URL)],
      [
        Markup.button.callback("👤 Profile", "show_profile"),
        Markup.button.callback("🏆 Leaderboard", "show_top"),
      ],
      [Markup.button.callback("❓ How to Play", "show_howtoplay")],
    ])
  );
});


async function sendLeaderboard(ctx: Context) {
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

    await ctx.reply(
      "🏆 BirdEnergy Leaderboard\n\n" + players.join("\n"),
      Markup.inlineKeyboard([
        Markup.button.url("🎮 Play BirdEnergy", GAME_URL),
      ])
    );
  } catch (error) {
    console.error("Leaderboard command failed:", error);
    await ctx.reply("Could not load the leaderboard.");
  }
}

async function sendProfile(ctx: Context) {
  try {
    if (!ctx.from) {
      await ctx.reply("Could not identify your Telegram account.");
      return;
    }

    const uid = `tg-${ctx.from.id}`;
    const db = getFirestore();

    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      await ctx.reply(
        "You don't have a BirdEnergy profile yet. Open the game first!",
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

    const message =
      "🐦 BirdEnergy Profile\n\n" +
      `Player: ${name}\n` +
      `Best Score: ${data.bestScore ?? 0}\n` +
      `Games Played: ${data.totalGames ?? 0}\n\n` +
      "Appearance:\n" +
      `Bird Skin: #${data.preferredBird ?? 0}\n` +
      `Background: #${data.preferredBackground ?? 0}\n` +
      `Terrain: #${data.preferredGround ?? 0}`;

    await ctx.reply(
      message,
      Markup.inlineKeyboard([
        Markup.button.url("👤 Open Profile", GAME_URL),
      ])
    );
  } catch (error) {
    console.error("Profile command failed:", error);
    await ctx.reply("Could not load your profile.");
  }
}

async function sendHowToPlay(ctx: Context) {
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
}

// Slash commands
bot.command(["top", "leaderboard"], sendLeaderboard);
bot.command(["me", "profile"], sendProfile);
bot.command("howtoplay", sendHowToPlay);

// Buttons from the /start menu
bot.action("show_profile", async (ctx) => {
  await ctx.answerCbQuery();
  await sendProfile(ctx);
});

bot.action("show_top", async (ctx) => {
  await ctx.answerCbQuery();
  await sendLeaderboard(ctx);
});

bot.action("show_howtoplay", async (ctx) => {
  await ctx.answerCbQuery();
  await sendHowToPlay(ctx);
});