const { Telegraf } = require('telegraf');
const { kv } = require('@vercel/kv');

// Mengambil token dari Environment Variables
const bot = new Telegraf(process.env.BOT_TOKEN);

// --- 1. LOGIKA BOT TELEGRAM ---
bot.start((ctx) => ctx.reply("Halo! Bot sudah aktif dan langsung berjalan! 🚀 Silakan kirim file."));

bot.on('document', async (ctx) => {
  const fileId = ctx.message.document.file_id;
  const fileName = ctx.message.document.file_name || `file_${Date.now()}`;
  
  try {
    await kv.hset('my_files', { [fileName]: fileId });
    ctx.reply(`✅ File "${fileName}" berhasil masuk ke Web Dashboard!`);
  } catch (error) {
    ctx.reply('❌ Gagal menyimpan file ke database.');
  }
});

// --- 2. LOGIKA WEB DASHBOARD & AUTO-SETUP ---
module.exports = async (req, res) => {
  // Mengambil URL otomatis dari Vercel
  const hostUrl = `https://${req.headers.host}`;

  // A. Jika menerima pesan dari Telegram
  if (req.method === 'POST') {
    return await bot.handleUpdate(req.body, res);
  }

  // B. Fitur Hapus File
  if (req.url.startsWith('/api/delete')) {
    const name = new URL(req.url, hostUrl).searchParams.get('name');
    await kv.hdel('my_files', name);
    return res.redirect('/');
  }

  // C. FITUR AUTO-SETUP WEBHOOK (Langsung Berjalan)
  if (req.url.startsWith('/api/setup')) {
    try {
      // Menyuruh bot secara otomatis mendaftarkan link Vercel ini ke Telegram
      await bot.telegram.setWebhook(hostUrl);
      return res.send(`
        <div style="font-family:sans-serif; text-align:center; margin-top:50px;">
          <h1 style="color:green;">✅ Bot Berhasil Diaktifkan!</h1>
          <p>Bot sudah terhubung ke <b>${hostUrl}</b>.</p>
          <p>Silakan buka Telegram dan chat bot kamu sekarang.</p>
          <a href="/" style="background:#0088cc; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Kembali ke Dashboard</a>
        </div>
      `);
    } catch (error) {
      return res.send(`<h1 style="color:red;">❌ Gagal! Pastikan BOT_TOKEN di Vercel sudah benar.</h1>`);
    }
  }

  // D. Tampilan Utama Website
  const files = await kv.hgetall('my_files') || {};
  const fileRows = Object.keys(files).map(name => `
    <tr>
      <td style="padding:10px; border-bottom:1px solid #ddd;">${name}</td>
      <td style="padding:10px; border-bottom:1px solid #ddd;">
        <a href="/api/delete?name=${name}" style="color:red; text-decoration:none; font-weight:bold;">[Hapus]</a>
      </td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bot Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: sans-serif; padding: 20px; background: #f4f4f9; }
        .container { max-width: 600px; margin: auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
        .btn-setup { background: #28a745; color: white; padding: 15px 20px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 18px; font-weight: bold; margin-bottom: 20px; box-shadow: 0 4px #1e7e34; transition: 0.2s;}
        .btn-setup:active { transform: translateY(4px); box-shadow: 0 0 #1e7e34; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; text-align: left; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🤖 Web Dashboard Bot</h1>
        
        <a href="/api/setup" class="btn-setup">🚀 Klik Ini Untuk Mengaktifkan Bot</a>
        
        <p style="color:#666; font-size:14px;">(Klik tombol di atas sekali saja setelah deploy)</p>

        <table>
          <thead>
            <tr style="background:#eee;">
              <th style="padding:10px;">Nama File Tersimpan</th>
              <th style="padding:10px; width:80px;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${fileRows || '<tr><td colspan="2" style="text-align:center; padding:20px; color:#888;">Belum ada file yang di-upload ke Bot.</td></tr>'}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
};
