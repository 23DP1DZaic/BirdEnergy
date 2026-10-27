import { Telegraf, Markup, Input, type Context } from "telegraf";
import path from "node:path";
import { getFirestore } from "firebase-admin/firestore";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is not configured");
}

export const bot = new Telegraf(token);

const GAME_URL =
  "https://t.me/BirdEnergy_testbot/birdenergygame";

/**
 * Latvian score label: "1 punkts", "21 punkts", "2 punkti", "11 punkti".
 * The language takes the singular only after a final 1 that is not part of 11.
 */
function scoreLabel(score: number): string {
  const mod10 = Math.abs(score) % 10;
  const mod100 = Math.abs(score) % 100;
  return `${score} ${mod10 === 1 && mod100 !== 11 ? "punkts" : "punkti"}`;
}

bot.start(async (ctx) => {
  await ctx.reply(
    "🐦 Sveiki Bird Energy botā!\n\n" +
    "Gatavs lidot? Izvēlies zemāk, ar ko sākt!",
    Markup.inlineKeyboard([
      [Markup.button.url("🎮 Spēlēt Bird Energy", GAME_URL)],
      [
        Markup.button.callback("👤 Profils", "show_profile"),
        Markup.button.callback("🏆 Reitings", "show_top"),
      ],
      [Markup.button.callback("❓ Kā spēlēt", "show_howtoplay")],
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
      await ctx.reply("Reitingā vēl nav neviena spēlētāja.");
      return;
    }

    const medals = ["🥇", "🥈", "🥉"];

    const players = snapshot.docs.map((doc, index) => {
      const data = doc.data();

      const name =
        data.inGameName ||
        data.username ||
        data.firstName ||
        "Spēlētājs";

      const score = data.bestScore ?? 0;

      const position = medals[index] || `${index + 1}.`;

      return `${position} ${name} — ${scoreLabel(score)}`;
    });

    await ctx.reply(
      "🏆 Bird Energy reitings\n\n" + players.join("\n"),
      Markup.inlineKeyboard([
        Markup.button.url("🎮 Spēlēt Bird Energy", GAME_URL),
      ])
    );
  } catch (error) {
    console.error("Leaderboard command failed:", error);
    await ctx.reply("Neizdevās ielādēt reitingu.");
  }
}

async function sendProfile(ctx: Context) {
  try {
    if (!ctx.from) {
      await ctx.reply("Nevarēju noteikt tavu Telegram kontu.");
      return;
    }

    const uid = `tg-${ctx.from.id}`;
    const db = getFirestore();

    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      await ctx.reply(
        "Tev vēl nav Bird Energy profila. Vispirms atver spēli!",
        Markup.inlineKeyboard([
          Markup.button.url("🎮 Spēlēt Bird Energy", GAME_URL),
        ])
      );
      return;
    }

    const data = userDoc.data()!;

    const name =
      data.inGameName ||
      data.username ||
      data.firstName ||
      "Spēlētājs";

    const message =
      "🐦 Bird Energy profils\n\n" +
      `Spēlētājs: ${name}\n` +
      `Labākais rezultāts: ${scoreLabel(data.bestScore ?? 0)}\n` +
      `Spēļu skaits: ${data.totalGames ?? 0}\n\n` +
      "Izskats:\n" +
      `Skini: #${data.preferredBird ?? 0}\n` +
      `Fons: #${data.preferredBackground ?? 0}\n` +
      `Zeme: #${data.preferredGround ?? 0}`;

    await ctx.reply(
      message,
      Markup.inlineKeyboard([
        Markup.button.url("👤 Atvērt profilu", GAME_URL),
      ])
    );
  } catch (error) {
    console.error("Profile command failed:", error);
    await ctx.reply("Neizdevās ielādēt profilu.");
  }
}

async function sendHowToPlay(ctx: Context) {
  const message =
    "🎮 Kā spēlēt Bird Energy\n\n" +
    "1. Atver spēli — tā sākas ar pieskārienu ekrānam.\n" +
    "2. Pieskaries ekrānam vai nospied Space, lai putns palēktos.\n" +
    "3. Lido starp caurulēm un izvairies no šķēršļiem.\n" +
    "4. Katra pārvarētā caurule dod punktu.\n" +
    "5. Pārspēj savu rekordu un kāp reitingā!";

  const keyboard = Markup.inlineKeyboard([
    Markup.button.url("🎮 Sākt spēlēt", GAME_URL),
  ]);

  try {
    const gifPath = path.join(__dirname, "../assets/howtoplay.gif");

    await ctx.replyWithAnimation(Input.fromLocalFile(gifPath), {
      caption: message,
      ...keyboard,
    });
  } catch (error) {
    console.error("Failed to send tutorial GIF:", error);
    await ctx.reply(message, keyboard);
  }
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
