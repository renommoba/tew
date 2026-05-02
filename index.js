const { Telegraf, Markup } = require('telegraf'); // Tambahkan Markup di sini

// MASUKKAN TOKEN KAMU DI SINI (Jangan hapus tanda kutipnya)
const bot = new Telegraf('8691842273:AAFwL5qYcsKLnKLP2upjhVmSt7XWSVJU5kE'); 

// 1. KETIK /START -> MUNCUL MENU
bot.start((ctx) => {
  ctx.reply(
    "Halo Bos! Selamat datang di Bot Vercel 🚀\n\nSilakan pilih menu di bawah ini:",
    // Ini kode untuk membuat tombol menu
    Markup.keyboard([
      ['📤 Upload File', '📂 Cek File'], // Baris pertama
      ['🗑️ Hapus File', '🌐 Info Web']   // Baris kedua
    ]).resize() // resize() berfungsi agar ukuran tombolnya pas dan rapi di layar HP
  );
});

// 2. LOGIKA KETIKA TOMBOL MENU DIKLIK
bot.hears('📤 Upload File', (ctx) => {
  ctx.reply("Silakan langsung kirim file (Dokumen/PDF/Zip) ke chat ini. Nanti otomatis ditangkap!");
});

bot.hears('📂 Cek File', (ctx) => {
  ctx.reply("Fitur Cek File: (Nanti kita sambungkan lagi ke database Vercel KV kalau test ini sukses!)");
});

bot.hears('🗑️ Hapus File', (ctx) => {
  ctx.reply("Fitur Hapus File: (Segera hadir setelah database disambung)");
});

bot.hears('🌐 Info Web', (ctx) => {
  ctx.reply("Bot ini berjalan 100% menggunakan Vercel Serverless! Sangat ringan dan gratis.");
});

// 3. LOGIKA KETIKA USER MENGIRIM FILE
bot.on('document', (ctx) => {
  ctx.reply("✅ Mantap, file berhasil ditangkap oleh Bot! (Mode test)");
});

// --- LOGIKA WEB & AUTO-SETUP ---
module.exports = async (req, res) => {
  const hostUrl = `https://${req.headers.host}`;

  // Menerima tembakan pesan dari Telegram
  if (req.method === 'POST') {
    return await bot.handleUpdate(req.body, res);
  }

  // Tombol Setup
  if (req.url.startsWith('/api/setup')) {
    try {
      await bot.telegram.setWebhook(hostUrl);
      return res.send(`<h1 style="color:green; text-align:center; margin-top:50px; font-family:sans-serif;">✅ SETUP SUKSES! Buka Telegram dan ketik /start.</h1>`);
    } catch (error) {
      return res.send(`<h1 style="color:red; text-align:center; margin-top:50px; font-family:sans-serif;">❌ GAGAL! Pastikan token benar.</h1>`);
    }
  }

  // Tampilan Web
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`
    <div style="text-align:center; margin-top:50px; font-family:sans-serif;">
      <h1>Bot Menu Interaktif</h1>
      <p>Klik tombol di bawah ini <b>SATU KALI SAJA</b> untuk menyambungkan Telegram ke Vercel.</p>
      <br>
      <a href="/api/setup" style="background:green; color:white; padding:15px 20px; text-decoration:none; border-radius:5px; font-weight:bold;">
        🚀 KLIK INI UNTUK SETUP
      </a>
    </div>
  `);
};
