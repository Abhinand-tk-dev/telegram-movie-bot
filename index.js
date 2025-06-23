require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const genreMap = {
  action: 28,
  comedy: 35,
  drama: 18,
  horror: 27,
  scifi: 878,
  romance: 10749,
};

// Store genre movie pages per user
const userGenreState = {};

console.log("🤖 Bot is running...");

// /recommend command
bot.onText(/\/recommend (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const rawGenre = match[1].toLowerCase().replace(/[-\s]/g, "");
  const genreId = genreMap[rawGenre];

  if (!genreId) {
    return bot.sendMessage(chatId, "❌ Unknown genre. Try: action, comedy, drama, horror, scifi, romance");
  }

  try {
    const res = await axios.get(`${TMDB_BASE_URL}/discover/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        with_genres: genreId,
        sort_by: "popularity.desc",
      },
    });

    const movies = res.data.results;
    userGenreState[chatId] = { genreId, page: 0, movies };
    sendMovieBatch(chatId, movies, 0);
  } catch (err) {
    console.error("❌ Recommend error:", err.message);
    bot.sendMessage(chatId, "⚠️ Error fetching recommendations.");
  }
});

// Handle inline button (next/prev)
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const state = userGenreState[chatId];
  if (!state) return;

  if (data === "next") {
    state.page++;
    sendMovieBatch(chatId, state.movies, state.page);
  } else if (data === "prev" && state.page > 0) {
    state.page--;
    sendMovieBatch(chatId, state.movies, state.page);
  }

  bot.answerCallbackQuery(query.id);
});

// Send batch of movies (5 per page)
function sendMovieBatch(chatId, movies, page) {
  const start = page * 5;
  const end = start + 5;
  const batch = movies.slice(start, end);

  if (batch.length === 0) {
    bot.sendMessage(chatId, "❌ No more results.");
    return;
  }

  batch.forEach((movie) => {
    const poster = movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : null;

    const caption = `
🎬 *${movie.title}* (${movie.release_date?.split("-")[0]})
⭐ *Rating:* ${movie.vote_average}/10
📝 ${movie.overview?.substring(0, 300)}...
    `.trim();

    if (poster) {
      bot.sendPhoto(chatId, poster, {
        caption,
        parse_mode: "Markdown",
      });
    } else {
      bot.sendMessage(chatId, caption, { parse_mode: "Markdown" });
    }
  });

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "⏮️ Prev", callback_data: "prev" },
        { text: "⏭️ Next", callback_data: "next" },
      ],
    ],
  };

  bot.sendMessage(chatId, `Page ${page + 1}`, {
    reply_markup: inlineKeyboard,
  });
}

// /trailer command
bot.onText(/\/trailer (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];

  try {
    const res = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
      params: { api_key: TMDB_API_KEY, query },
    });

    const movie = res.data.results[0];
    if (!movie) return bot.sendMessage(chatId, "❌ Movie not found.");

    const videoRes = await axios.get(`${TMDB_BASE_URL}/movie/${movie.id}/videos`, {
      params: { api_key: TMDB_API_KEY },
    });

    const trailer = videoRes.data.results.find(
      (v) => (v.type === "Trailer" || v.type === "Teaser") && v.site === "YouTube"
    );

    const trailerLink = trailer
      ? `https://www.youtube.com/watch?v=${trailer.key}`
      : "❌ Trailer not found.";

    const poster = movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : null;

    const caption = `
🎬 *${movie.title}* (${movie.release_date?.split("-")[0]})
⭐ *Rating:* ${movie.vote_average}/10
📝 ${movie.overview?.substring(0, 400)}...

🔗 [Watch Trailer](${trailerLink})
    `.trim();

    if (poster) {
      bot.sendPhoto(chatId, poster, {
        caption,
        parse_mode: "Markdown",
      });
    } else {
      bot.sendMessage(chatId, caption, { parse_mode: "Markdown" });
    }
  } catch (err) {
    console.error("❌ Trailer error:", err.message);
    bot.sendMessage(chatId, "⚠️ Error fetching trailer.");
  }
});

// /start command
bot.onText(/\/start/, (msg) => {
  const welcome = `
👋 *Hi ${msg.from.first_name || "there"}!*

Welcome to *🎬 MovieBot* — your personal movie assistant.

Here's what I can do for you:

🎞️ */trailer <movie name>*  
_Get the official trailer, rating, overview & poster._

🍿 */recommend <genre>*  
_Discover top-rated movies in your favorite genre._

💡 *Available genres:*  
_action, comedy, drama, horror, romance, scifi_

📌 *Examples:*
\`/trailer Dune Part Two\`  
\`/recommend scifi\`

🎬 *Made with ❤️ by Abhinand Tk — your movie buddy (and an unknown guy)*
  `.trim();

  bot.sendMessage(msg.chat.id, welcome, {
    parse_mode: "Markdown",
  });
});
