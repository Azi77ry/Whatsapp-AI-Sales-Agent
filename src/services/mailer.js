// src/services/mailer.js
// Huduma ya kutuma barua pepe (email) kwa kutumia Nodemailer.
// Inaunga mkono: SMTP ya kawaida (Gmail, Mailtrap, SendGrid, Hostinger, n.k.)
// Kama SMTP haijawekwa, inaanguka kwa "console fallback" (inaonyesha OTP kwenye console tu).

const nodemailer = require("nodemailer");
const config = require("../config");

// Unda transporter ya Nodemailer ukitumia mipangilio kutoka config/env
function createTransporter() {
  if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
    return null; // SMTP haijawekwa — itumia console fallback
  }

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: parseInt(config.smtpPort, 10) || 587,
    secure: parseInt(config.smtpPort, 10) === 465, // true kwa port 465 (SSL), false kwa 587 (TLS)
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
    tls: {
      rejectUnauthorized: false, // Ruhusu self-signed certs (kwa majaribio)
    },
  });
}

/**
 * Tuma barua pepe ya OTP ya kurejesha password.
 * @param {string} toEmail - Barua pepe ya mpokeaji
 * @param {string} businessName - Jina la biashara
 * @param {string} otp - Nambari ya OTP ya tarakimu 6
 * @returns {Promise<boolean>} - true kama imetumwa, false kama imeshindwa
 */
async function sendPasswordResetEmail(toEmail, businessName, otp) {
  const transporter = createTransporter();

  if (!transporter) {
    // Console fallback — inafaa kwa mazingira ya majaribio bila SMTP
    console.log("\n📧 [EMAIL FALLBACK — SMTP haijawekwa]");
    console.log(`   To: ${toEmail}`);
    console.log(`   Duka: ${businessName}`);
    console.log(`   OTP Code: ${otp}\n`);
    return false;
  }

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0; }
    .container { max-width: 480px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px 24px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 22px; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px; }
    .body { padding: 32px 24px; }
    .otp-box { background: #f0f4ff; border: 2px dashed #4f46e5; border-radius: 10px; text-align: center; padding: 24px; margin: 24px 0; }
    .otp-code { font-size: 42px; font-weight: 800; color: #4f46e5; letter-spacing: 10px; font-family: monospace; }
    .warning { background: #fff7ed; border-left: 4px solid #f97316; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #92400e; margin-top: 20px; }
    .footer { background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Rejesha Password Yako</h1>
      <p>WhatsApp AI SaaS Agent — Aziry Tech</p>
    </div>
    <div class="body">
      <p>Habari <strong>${businessName}</strong>,</p>
      <p>Tunapokea ombi la kubadilisha neno lako la siri. Tumia msimbo huu wa OTP kubadilisha password yako:</p>
      
      <div class="otp-box">
        <div style="font-size:13px; color:#64748b; margin-bottom:8px;">Msimbo wako wa OTP</div>
        <div class="otp-code">${otp}</div>
        <div style="font-size:12px; color:#94a3b8; margin-top:10px;">Utaisha muda wake baada ya dakika 15</div>
      </div>

      <p style="font-size:14px; color:#475569;">Weka msimbo huu kwenye ukurasa wa kurejesha password. Msimbo huu ni wa <strong>matumizi moja tu</strong>.</p>

      <div class="warning">
        ⚠️ Kama haukuomba kubadilisha password, puuza barua pepe hii. Akaunti yako iko salama.
      </div>
    </div>
    <div class="footer">
      Barua pepe hii imetumwa na mfumo wa WhatsApp AI SaaS wa Aziry Tech.<br>
      Usishiriki msimbo huu na mtu yeyote.
    </div>
  </div>
</body>
</html>`;

  try {
    const info = await transporter.sendMail({
      from: `"Aziry Tech SaaS" <${config.smtpFrom || config.smtpUser}>`,
      to: toEmail,
      subject: `🔐 Msimbo wako wa kurejesha password — ${otp}`,
      html: htmlBody,
      text: `Msimbo wako wa OTP wa kurejesha password ni: ${otp}\nUtatumika kwa dakika 15 tu. Usishiriki na mtu yeyote.`,
    });

    console.log(`✅ Email ya OTP imetumwa kwa ${toEmail} (MessageId: ${info.messageId})`);
    return true;
  } catch (err) {
    console.error(`❌ Imeshindwa kutuma email ya OTP kwa ${toEmail}:`, err.message);
    return false;
  }
}

/**
 * Tuma barua pepe ya karibu (welcome) baada ya kusajiliwa.
 * @param {string} toEmail
 * @param {string} businessName
 * @returns {Promise<boolean>}
 */
async function sendWelcomeEmail(toEmail, businessName) {
  const transporter = createTransporter();

  if (!transporter) {
    console.log(`📧 [Welcome Email FALLBACK] Kutuma kwa: ${toEmail} (${businessName})`);
    return false;
  }

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0; }
    .container { max-width: 480px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 32px 24px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 22px; font-weight: 700; }
    .body { padding: 32px 24px; }
    .step { display: flex; align-items: flex-start; margin-bottom: 16px; }
    .step-num { background: #ecfdf5; color: #059669; font-weight: 700; border-radius: 50%; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px; flex-shrink: 0; font-size: 13px; }
    .footer { background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Karibu, ${businessName}!</h1>
      <p style="color:rgba(255,255,255,0.9); margin:6px 0 0; font-size:14px;">Akaunti yako ya WhatsApp AI Agent imefunguliwa</p>
    </div>
    <div class="body">
      <p>Habari <strong>${businessName}</strong>! Usajili wako umefanikiwa. Unaweza kuanza sasa hivi kwa hatua hizi:</p>

      <div class="step"><span class="step-num">1</span><span>Ingia kwenye dashboard yako na uunganishe WhatsApp ya biashara yako (scan QR code)</span></div>
      <div class="step"><span class="step-num">2</span><span>Ongeza bidhaa zako kwenye sehemu ya "Bidhaa"</span></div>
      <div class="step"><span class="step-num">3</span><span>Weka maelezo ya biashara yako kwenye "Mipangilio" ili AI ijue vizuri kujibu</span></div>
      <div class="step"><span class="step-num">4</span><span>Subiri — AI itaanza kujibu wateja wako kiotomatiki! 🤖</span></div>

      <p style="margin-top:24px; font-size:14px; color:#475569;">
        Una maswali? Wasiliana nasi wakati wowote.
      </p>
    </div>
    <div class="footer">
      WhatsApp AI SaaS Agent — Aziry Tech &copy; ${new Date().getFullYear()}
    </div>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"Aziry Tech SaaS" <${config.smtpFrom || config.smtpUser}>`,
      to: toEmail,
      subject: `🎉 Karibu kwenye WhatsApp AI Agent — ${businessName}!`,
      html: htmlBody,
    });
    console.log(`✅ Welcome email imetumwa kwa ${toEmail}`);
    return true;
  } catch (err) {
    console.error(`❌ Imeshindwa kutuma welcome email kwa ${toEmail}:`, err.message);
    return false;
  }
}

module.exports = { sendPasswordResetEmail, sendWelcomeEmail, _createTransporter: createTransporter };
