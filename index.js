const { Telegraf } = require('telegraf');
const { kv } = require('@vercel/kv');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Pesan Start
bot.start((ctx) => {
  ctx.reply(
    "Bot Aktif! Kirim file untuk simpan.\n\n" +
    "/list - Lihat file\n" +
    "/get <nama> - Ambil file\n" +
    "/delete <nama> - Hapus file"
  );
});

// Simpan File
bot.on('document', async (ctx) => {
  const fileId = ctx.message.document.file_id;
  const fileName = ctx.message.document.file_name || `file_${Date.now()}`;
  try {
    await kv.hset('my_files', { [fileName]: fileId });
    ctx.reply(`✅ "${fileName}" tersimpan!`);
  } catch (e) { ctx.reply('❌ Gagal simpan.'); }
});

// Lihat Daftar File
bot.command('list', async (ctx) => {
  try {
    const files = await kv.hgetall('my_files');
    if (!files) return ctx.reply('📂 Kosong.');
    let msg = '📂 **Daftar File:**\n\n' + Object.keys(files).join('\n');
    ctx.reply(msg);
  } catch (e) { ctx.reply('❌ Error.'); }
});

// Ambil File
bot.command('get', async (ctx) => {
  const name = ctx.message.text.split(' ').slice(1).join(' ');
  if (!name) return ctx.reply('Gunakan: /get <nama>');
  try {
    const id = await kv.hget('my_files', name);
    if (id) await ctx.replyWithDocument(id);
    else ctx.reply('❌ Tidak ada.');
  } catch (e) { ctx.reply('❌ Error.'); }
});

// Hapus File
bot.command('delete', async (ctx) => {
  const name = ctx.message.text.split(' ').slice(1).join(' ');
  if (!name) return ctx.reply('Gunakan: /delete <nama>');
  try {
    await kv.hdel('my_files', name);
    ctx.reply(`🗑️ "${name}" dihapus!`);
  } catch (e) { ctx.reply('❌ Error.'); }
});

// Export untuk Vercel
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    await bot.handleUpdate(req.body, res);
  } else {
    res.status(200).send('Bot Berjalan!');
  }
};
