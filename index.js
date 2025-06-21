require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Logs
console.log("✅ Bot is starting...");
console.log("Loaded ENV:");
console.log("TELEGRAM_TOKEN:", process.env.TELEGRAM_TOKEN ? "✅ Loaded" : "❌ Missing");
console.log("TMDB_API_KEY:", process.env.TMDB_API_KEY ? "✅ Loaded" : "❌ Missing");

if (!process.env.TELEGRAM_TOKEN || !process.env.TMDB_API_KEY) {
  console.error("❌ Missing TELEGRAM_TOKEN or TMDB_API_KEY in .env");
  process.exit(1);
}

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

console.log("🤖 Bot connected to Telegram successfully.");

// Handle any message for logging
bot.on("message", (msg) => {
  console.log("📩 Received message from Telegram:", msg.text);
});

// /start
bot.onText(/\/start/, (msg) => {
  console.log("⚡ /start command received");
  bot.sendMessage(msg.chat.id, `🎬 *Welcome to MovieBot!*

Available commands:
/trailer <movie name> – Get a movie trailer
/recommend <genre> – Get top movies by genre (with Next button)

Try:
/trailer Inception
/recommend action`, { parse_mode: "Markdown" });
});

// /trailer
bot.onText(/\/trailer (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  console.log(`🎥 /trailer command for: ${query}`);

  try {
    const res = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
      params: { api_key: TMDB_API_KEY, query },
    });

    console.log("🔎 TMDb search result:", res.data.results);

    const movie = res.data.results[0];
    if (!movie) {
      bot.sendMessage(chatId, "❌ Movie not found.");
      return;
    }

    const videoRes = await axios.get(`${TMDB_BASE_URL}/movie/${movie.id}/videos`, {
      params: { api_key: TMDB_API_KEY },
    });

    console.log("📺 Video results:", videoRes.data.results);

    const trailer = videoRes.data.results.find(
      (v) => v.type === "Trailer" && v.site === "YouTube"
    );

    if (trailer) {
      const url = `https://www.youtube.com/watch?v=${trailer.key}`;
      bot.sendMessage(chatId, `🎬 *${movie.title}* Trailer:\n${url}`, {
        parse_mode: "Markdown",
      });
    } else {
      bot.sendMessage(chatId, "❌ Trailer not found.");
    }
  } catch (err) {
    console.error("🚨 Error in /trailer command:", err.message);
    bot.sendMessage(chatId, "⚠️ Error fetching trailer.");
  }
});

// /recommend <genre>
bot.onText(/\/recommend (\w+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const genre = match[1].toLowerCase();
  const page = 1;
  sendMovies(chatId, genre, page);
});

// Send movie list with pagination
async function sendMovies(chatId, genre, page) {
  const genreMap = {
    action: 28,
    comedy: 35,
    drama: 18,
    horror: 27,
    'sci-fi': 878,
    romance: 10749,
  };

  const genreId = genreMap[genre];
  if (!genreId) {
    bot.sendMessage(chatId, "❌ Unknown genre. Try: action, comedy, drama, horror, sci-fi, romance");
    return;
  }

  try {
    const res = await axios.get(`${TMDB_BASE_URL}/discover/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        with_genres: genreId,
        sort_by: "popularity.desc",
        page,
      },
    });

    const movies = res.data.results.slice(0, 5).map(
      (m) => `🎬 ${m.title} (${m.release_date?.split("-")[0]})`
    );

    const text = `🔥 *Top ${genre} Movies - Page ${page}:*\n\n${movies.join("\n")}`;

    bot.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "➡️ Next",
              callback_data: `next_${genre}_${page + 1}`,
            },
          ],
        ],
      },
    });
  } catch (err) {
    console.error("🚨 Error in sendMovies:", err.message);
    bot.sendMessage(chatId, "⚠️ Error fetching recommendations.");
  }
}

// Handle inline keyboard button clicks
bot.on("callback_query", (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;

  if (data.startsWith("next_")) {
    const [_, genre, page] = data.split("_");
    sendMovies(msg.chat.id, genre, parseInt(page));
  }

  bot.answerCallbackQuery(callbackQuery.id); // remove spinner
});
