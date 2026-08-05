/**
 * WhatsApp Session Health Monitor Job
 * Inakagua kila dakika 5 kama sessions za WhatsApp za wafanyabiashara wote
 * bado zipo hai (connected). Kama session inaonekana kuwa imejitenga (disconnected),
 * inatuma taarifa ya haraka kwa barua pepe ya mfanyabiashara.
 */

const cron = require("node-cron");
const prisma = require("../db/client");
const mailer = require("../services/mailer");

// Hifadhi ya muda: inakumbuka ni lini mwisho wa tuma taarifa (kuzuia spam za email)
const lastAlertSentAt = new Map(); // merchantId -> timestamp
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // Saa moja (usitume taarifa mara kwa mara)

/**
 * Angalia kama merchant anapaswa kupata taarifa ya onyo
 */
function shouldSendAlert(merchantId) {
  if (!lastAlertSentAt.has(merchantId)) return true;
  const lastSent = lastAlertSentAt.get(merchantId);
  return Date.now() - lastSent > ALERT_COOLDOWN_MS;
}

/**
 * Tuma taarifa ya email kwamba WhatsApp session imejitenga
 */
async function sendDisconnectAlert(merchant) {
  const alertEmail = merchant.notificationEmail || merchant.email;
  if (!alertEmail) return;

  const now = new Date().toLocaleString("sw-TZ", { timeZone: "Africa/Dar_es_Salaam" });

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0; }
    .container { max-width: 500px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 32px 24px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 22px; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px; }
    .body { padding: 32px 24px; }
    .alert-box { background: #fef2f2; border: 2px solid #fca5a5; border-radius: 10px; padding: 20px; margin: 20px 0; }
    .steps { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px 20px; border-radius: 4px; margin-top: 20px; }
    .footer { background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ WhatsApp Imejitenga!</h1>
      <p>Taarifa ya Dharura — Mfumo wa AI Sales Agent</p>
    </div>
    <div class="body">
      <p>Habari <strong>${merchant.businessName}</strong>,</p>
      <p>Mfumo wetu umegundua kwamba WhatsApp ya biashara yako <strong>"${merchant.businessName}"</strong> imejitenga (disconnected) kwenye seva yetu.</p>
      
      <div class="alert-box">
        <strong>📋 Taarifa za Tatizo:</strong><br><br>
        🏪 Duka: <strong>${merchant.businessName}</strong><br>
        🕐 Wakati: ${now}<br>
        ❌ Hali: <strong>Disconnected — AI haiwezi kujibu wateja wako kwa sasa</strong>
      </div>

      <div class="steps">
        <strong>✅ Hatua za Kurekebisha:</strong>
        <ol style="margin: 10px 0 0; padding-left: 20px;">
          <li>Tembelea dashboard yako: <a href="${process.env.APP_URL || 'http://localhost:3000'}/dashboard">Dashboard</a></li>
          <li>Bonyeza kitufe cha "Unganisha WhatsApp"</li>
          <li>Scan QR Code mpya au tumia Pairing Code kuunganisha tena</li>
        </ol>
      </div>

      <p style="margin-top: 20px; font-size: 14px; color: #475569;">
        Kama una maswali, wasiliana nasi haraka ili tukusaidie.
      </p>
    </div>
    <div class="footer">
      WhatsApp AI Sales Agent — Aziry Tech © ${new Date().getFullYear()}<br>
      Taarifa hii imetumwa kiotomatiki na mfumo wa afya ya WhatsApp session.
    </div>
  </div>
</body>
</html>`;

  try {
    const transporter = mailer._createTransporter ? mailer._createTransporter() : null;

    if (!transporter) {
      // Fallback: onyesha kwenye console
      console.warn(`\n⚠️  [SESSION HEALTH ALERT] Merchant #${merchant.id} (${merchant.businessName}) WhatsApp disconnected!`);
      console.warn(`   📧 Would send alert to: ${alertEmail}`);
      console.warn(`   ℹ️  Configure SMTP in .env to enable email alerts.\n`);
      return;
    }

    await transporter.sendMail({
      from: `"Aziry Tech SaaS" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: alertEmail,
      subject: `⚠️ WhatsApp Imejitenga — ${merchant.businessName} (Hatua Inahitajika!)`,
      html: htmlBody,
      text: `WhatsApp ya biashara yako "${merchant.businessName}" imejitenga. Tafadhali ingia kwenye dashboard yako na uunganishe tena.`,
    });

    console.log(`📧 [Health Monitor] Alert email imetumwa kwa ${alertEmail} kwa Merchant #${merchant.id}`);
  } catch (err) {
    console.error(`❌ [Health Monitor] Imeshindwa kutuma alert email:`, err.message);
  }
}

/**
 * Kazi kuu ya kukagua hali ya sessions zote za WhatsApp
 */
async function runSessionHealthCheck() {
  try {
    // Pata manager bila circular dependency
    const manager = require("../whatsapp/manager");

    // Pata wafanyabiashara wote wanaofanya kazi (active/non-suspended)
    const merchants = await prisma.merchant.findMany({
      where: { status: "active", role: "merchant" },
      select: {
        id: true,
        businessName: true,
        email: true,
        notificationEmail: true,
      },
    });

    for (const merchant of merchants) {
      try {
        const statusInfo = manager.getConnectionStatus(merchant.id);

        // Kama session iko disconnected na sio kwenye pairing mode
        if (statusInfo.status === "disconnected") {
          // Angalia kama kuna creds za zamani (merchant aliwahi kuunganisha)
          const path = require("path");
          const fs = require("fs");
          const sessionDir = path.join(__dirname, "../../sessions", `merchant_${merchant.id}`);
          const credsFile = path.join(sessionDir, "creds.json");

          if (fs.existsSync(credsFile)) {
            // Merchant alikuwa ameunganisha lakini sasa amekatika — tuma taarifa
            if (shouldSendAlert(merchant.id)) {
              console.log(`⚠️  [Health Monitor] Merchant #${merchant.id} (${merchant.businessName}) is disconnected — sending alert`);
              await sendDisconnectAlert(merchant);
              lastAlertSentAt.set(merchant.id, Date.now());
            }
          }
          // Kama hakuna creds file, merchant hajawahi kuunganisha — usitume taarifa
        } else if (statusInfo.status === "open" || statusInfo.status === "connected") {
          // Session ipo hai — futa kumbukumbu ya taarifa kama ilikuwepo
          if (lastAlertSentAt.has(merchant.id)) {
            lastAlertSentAt.delete(merchant.id);
            console.log(`✅ [Health Monitor] Merchant #${merchant.id} (${merchant.businessName}) is back online.`);
          }
        }
      } catch (merchantErr) {
        // Usisimamishe loop kwa kosa la merchant mmoja
        console.error(`⚠️  [Health Monitor] Kosa kwa Merchant #${merchant.id}:`, merchantErr.message);
      }
    }
  } catch (err) {
    console.error("❌ [Session Health Monitor] Kosa kubwa:", err.message);
  }
}

/**
 * Anzisha kazi ya Health Monitor (inafanya kazi kila dakika 5)
 */
function startSessionHealthMonitor() {
  console.log("❤️  Session Health Monitor: Imeanzishwa (Inakagua kila dakika 5)");

  // Kagua mara moja mwanzoni (baada ya dakika 2 za mwanzo ili sessions zianzishe)
  setTimeout(() => {
    runSessionHealthCheck();
  }, 2 * 60 * 1000);

  // Kisha kagua kila dakika 5
  cron.schedule("*/5 * * * *", () => {
    runSessionHealthCheck();
  });
}

module.exports = { startSessionHealthMonitor };
