const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply('Halo! Ini adalah menu utama. Silakan pilih:', {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '➡️ Menu Selanjutnya', callback_data: 'menu_lanjut' },
          { text: '❌ Tolak', callback_data: 'tolak' }
        ]
      ]
    }
  });
});

bot.action('menu_lanjut', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('Ini adalah isi dari Menu Selanjutnya!');
});

bot.action('tolak', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('Kamu menolak. Ditunggu kedatangannya kembali!');
});

// Handler utama tanpa folder
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body, res);
    } else {
      res.status(200).send('Bot berjalan sukses tanpa folder API!');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Error');
  }
};
