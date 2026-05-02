const { Telegraf } = require('telegraf');
const { kv } = require('@vercel/kv');

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- LOGIKA BOT TELEGRAM ---
bot.start((ctx) => ctx.reply("Bot & Dashboard Aktif! Kirim file ke sini, lalu cek di website kamu."));
bot.on('document', async (ctx) => {
  const fileId = ctx.message.document.file_id;
  const fileName = ctx.message.document.file_name || `file_${Date.now()}`;
  await kv.hset('my_files', { [fileName]: fileId });
  ctx.reply(`✅ File "${fileName}" masuk ke dashboard!`);
});

// --- LOGIKA WEBSITE DASHBOARD ---
module.exports = async (req, res) => {
  // Jika ada update dari Telegram (Webhook)
  if (req.method === 'POST' && req.headers['x-telegram-bot-api-secret-token'] === undefined) {
    return await bot.handleUpdate(req.body, res);
  }

  // API untuk hapus file dari Website
  if (req.url.startsWith('/api/delete') && req.method === 'GET') {
    const name = new URL(req.url, `http://${req.headers.host}`).searchParams.get('name');
    await kv.hdel('my_files', name);
    return res.redirect('/');
  }

  // Tampilan Utama Website (HTML)
  const files = await kv.hgetall('my_files') || {};
  const fileRows = Object.keys(files).map(name => `
    <tr>
      <td style="padding:10px; border-bottom:1px solid #ddd;">${name}</td>
      <td style="padding:10px; border-bottom:1px solid #ddd;">
        <a href="/api/delete?name=${name}" style="color:red; text-decoration:none;">[Hapus]</a>
      </td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bot File Manager</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: sans-serif; padding: 20px; background: #f4f4f9; }
        .container { max-width: 600px; margin: auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        h1 { color: #333; text-align: center; }
        .info { background: #e7f3ff; padding: 10px; border-radius: 5px; font-size: 0.9em; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>My Bot Files</h1>
        <div class="info">Kirim file ke bot Telegram kamu, lalu refresh halaman ini.</div>
        <table>
          <thead>
            <tr style="background:#eee;">
              <th style="padding:10px; text-align:left;">Nama File</th>
              <th style="padding:10px; text-align:left;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${fileRows || '<tr><td colspan="2" style="text-align:center; padding:20px;">Belum ada file.</td></tr>'}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
};
