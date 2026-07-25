const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const prisma = require("../db/client");
const config = require("../config");
const { sendMessage } = require("../whatsapp/sender");
const mailer = require("../services/mailer");

const router = express.Router();

// 🛡️ Ulinzi: Rate Limiting kwa Login (Kuzuia Brute-force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Dakika 15
  max: 5, // Majaribio 5 tu ndani ya dakika 15 kwa kila IP
  message: { error: "Umejaribu kuingia mara nyingi sana. Tafadhali subiri dakika 15." },
  standardHeaders: true,
  legacyHeaders: false,
});

// 🛡️ Ulinzi: Rate Limiting kwa Register (Kuzuia Spam)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // Saa 1
  max: 3, // Usajili 3 tu kwa saa 1 kwa kila IP
  message: { error: "Umesajili akaunti nyingi sana kwa muda mfupi. Tafadhali subiri saa 1." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Usajili (Register)
router.post("/register", registerLimiter, async (req, res) => {
  const { businessName, email, phone, password } = req.body;

  if (!businessName || !email || !phone || !password) {
    return res.status(400).json({ error: "Tafadhali jaza taarifa zote: businessName, email, phone, na password." });
  }

  const cleanPhone = phone.replace(/[^0-9]/g, "");
  if (cleanPhone.length < 9) {
    return res.status(400).json({ error: "Namba ya WhatsApp si halali. Mfano: 255712345678" });
  }

  try {
    // Angalia kama email au simu tayari imesajiliwa
    const existingEmail = await prisma.merchant.findUnique({ where: { email } });
    if (existingEmail) {
      return res.status(400).json({ error: "Barua pepe hii tayari imesajiliwa." });
    }

    const existingPhone = await prisma.merchant.findUnique({ where: { phone: cleanPhone } });
    if (existingPhone) {
      return res.status(400).json({ error: "Namba hii ya simu tayari imesajiliwa." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const merchant = await prisma.merchant.create({
      data: {
        businessName,
        email,
        phone: cleanPhone,
        passwordHash,
        subscriptionPlan: "free_trial",
        subscriptionEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        isTrialUsed: false,
      },
    });

    const token = jwt.sign(
      { merchantId: merchant.id, email: merchant.email, role: "merchant" },
      config.jwtSecret,
      { expiresIn: "30d" }
    );

    res.status(201).json({
      message: "Usajili umefanikiwa kikamilifu! 🎉",
      token,
      merchant: {
        id: merchant.id,
        businessName: merchant.businessName,
        email: merchant.email,
        phone: merchant.phone,
      },
    });

    // Tuma barua pepe ya karibu
    mailer.sendWelcomeEmail(merchant.email, merchant.businessName).catch(console.error);

  } catch (err) {
    console.error("Usajili umeshindwa:", err);
    res.status(500).json({ error: "Hitilafu imetokea wakati wa usajili." });
  }
});

// Kuingia (Login)
router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Barua pepe (email) na password zinahitajika." });
  }

  try {
    const merchant = await prisma.merchant.findUnique({ where: { email } });
    if (!merchant) {
      return res.status(400).json({ error: "Barua pepe au password si sahihi." });
    }

    const isMatch = await bcrypt.compare(password, merchant.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: "Barua pepe au password si sahihi." });
    }

    // Angalia kama akaunti imesimamishwa (suspended)
    if (merchant.status === "suspended") {
      return res.status(403).json({ error: "Akaunti yako imesimamishwa. Wasiliana na msimamizi." });
    }

    const token = jwt.sign(
      { merchantId: merchant.id, email: merchant.email, role: merchant.role || "merchant" },
      config.jwtSecret,
      { expiresIn: "30d" }
    );

    res.json({
      message: "Umeingia kwa mafanikio! 🔑",
      token,
      merchant: {
        id: merchant.id,
        businessName: merchant.businessName,
        email: merchant.email,
        role: merchant.role || "merchant",
      },
    });
  } catch (err) {
    console.error("Login imeshindwa:", err);
    res.status(500).json({ error: "Hitilafu imetokea wakati wa kuingia." });
  }
});

// ── SUBMIT EMAIL OR PHONE FOR RESET CODE (Forgot Password) ──────────────────────
router.post("/forgot-password", async (req, res) => {
  const { emailOrPhone } = req.body;

  if (!emailOrPhone) {
    return res.status(400).json({ error: "Tafadhali weka barua pepe au namba ya simu aliyotumia kujiandikisha." });
  }

  try {
    const cleanPhone = emailOrPhone.replace(/[^0-9]/g, "");
    
    // Pata mfanyabiashara kwa email au phone
    const merchant = await prisma.merchant.findFirst({
      where: {
        OR: [
          { email: emailOrPhone.trim().toLowerCase() },
          { phone: cleanPhone.length > 5 ? cleanPhone : "invalid-phone-format-fallback" }
        ]
      }
    });

    if (!merchant) {
      // Usalama: usionyeshe kama email/namba haipo, toa tu ujumbe wa kawaida
      return res.json({ success: true, message: "Msimbo wa reset (OTP) umetumwa." });
    }

    // Zalisha OTP ya tarakimu 6
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // inakaa dakika 15

    // Hifadhi OTP kwenye database
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        resetToken: otp,
        resetTokenExpires: expires,
      },
    });

    // Chapisha kwenye Server Console (kwa ajili ya testing za haraka bila WhatsApp connection)
    console.log(`\n🔑 [PASSWORD RESET OTP]`);
    console.log(`👉 Duka: "${merchant.businessName}" (Email: ${merchant.email}, Phone: ${merchant.phone})`);
    console.log(`👉 Code: "${otp}" (Expires: ${expires.toLocaleTimeString()})\n`);

    // Tuma OTP kwa WhatsApp ya mfanyabiashara kwa kutumia namba kuu ya SaaS Platform (Merchant #1)
    if (merchant.phone) {
      const recipientJid = merchant.phone.includes("@") ? merchant.phone : `${merchant.phone}@s.whatsapp.net`;
      const msg = `🔐 *Msimbo wa Kurejesha Password*\n\n` +
                  `Habari *${merchant.businessName}*!\n` +
                  `Msimbo wako wa OTP wa kurejesha neno la siri kwenye jukwaa la SaaS ni: *${otp}*.\n\n` +
                  `Msimbo huu utamaliza muda wake baada ya dakika 15. Usishiriki msimbo huu na mtu yeyote! 🛡️`;

      // Kutuma kupitia Merchant 1 (SaaS main notifier line)
      const sent = await sendMessage(recipientJid, msg, 1);
      if (sent) {
        console.log(`✅ Ujumbe wa Reset OTP umetumwa kwa WhatsApp: ${merchant.phone}`);
      } else {
        console.warn(`⚠️  Msimbo wa OTP haukutumwa kwa WhatsApp (Session ya Admin/Merchant 1 haijaunganishwa).`);
      }
    }

    // Pia tuma kupitia barua pepe
    mailer.sendPasswordResetEmail(merchant.email, merchant.businessName, otp).catch(console.error);

    res.json({ success: true, message: "Msimbo wa kurejesha password (OTP) umetumwa kwenye WhatsApp na Barua pepe yako.", phone: merchant.phone });
  } catch (err) {
    console.error("Ombi la reset limeshindwa:", err);
    res.status(500).json({ error: "Kosa limetokea wakati wa kuandaa msimbo wa reset." });
  }
});

// ── SUBMIT CODE AND NEW PASSWORD (Reset Password) ─────────────────────────
router.post("/reset-password", async (req, res) => {
  const { emailOrPhone, otp, newPassword } = req.body;

  if (!emailOrPhone || !otp || !newPassword) {
    return res.status(400).json({ error: "Tafadhali jaza barua pepe au namba ya simu, OTP, na neno jipya la siri." });
  }

  try {
    const cleanPhone = emailOrPhone.replace(/[^0-9]/g, "");

    const merchant = await prisma.merchant.findFirst({
      where: {
        OR: [
          { email: emailOrPhone.trim().toLowerCase() },
          { phone: cleanPhone.length > 5 ? cleanPhone : "invalid-phone-format-fallback" }
        ]
      }
    });

    if (!merchant || !merchant.resetToken || !merchant.resetTokenExpires) {
      return res.status(400).json({ error: "Msimbo wa OTP si sahihi au umepitwa na wakati." });
    }

    // Angalia kama OTP ime-expire
    if (new Date() > merchant.resetTokenExpires) {
      return res.status(400).json({ error: "Msimbo wa OTP umeshapita muda wake wa matumizi. Omba upya." });
    }

    // Angalia kama OTP inafanana
    if (otp.trim() !== merchant.resetToken.trim()) {
      return res.status(400).json({ error: "Msimbo wa OTP si sahihi." });
    }

    // Hash password mpya
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Sasisha na ufute reset fields
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    res.json({ success: true, message: "Neno la siri limesasishwa kwa mafanikio! Sasa unaweza kuingia." });
  } catch (err) {
    console.error("Kureset password kumeshindwa:", err);
    res.status(500).json({ error: "Hitilafu imetokea wakati wa kubadilisha password." });
  }
});

module.exports = router;
