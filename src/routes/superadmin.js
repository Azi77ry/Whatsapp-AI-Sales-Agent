// Super-Admin API Routes — Kusimamia mfumo mzima wa SaaS
// Routes zote hizi zinalindwa na superAdminAuth middleware

const express = require("express");
const router = express.Router();
const prisma = require("../db/client");
const jwt = require("jsonwebtoken");
const config = require("../config");
const superAdminAuth = require("../middleware/superAdminAuth");
const { getSettings, saveSettings } = require("../utils/platformSettings");
const { activeSessions, getConnectionStatus, stopSession, setBotActive, isBotActive } = require("../whatsapp/manager");

const serverStartTime = Date.now();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
  console.error(`⚠️  SuperAdmin API Error [${req.method} ${req.path}]:`, err.message);
  res.status(500).json({ error: "Hitilafu ya seva imetokea." });
});

// Linda routes zote kwa Super-Admin pekee
router.use(superAdminAuth);

// ── TAKWIMU KUU (Platform Stats) ─────────────────────────────
router.get("/stats", wrap(async (req, res) => {
  const merchantFilter = { role: "merchant" };
  const [
    totalMerchants,
    activeMerchants,
    suspendedMerchants,
    totalConversations,
    totalOrders,
    totalMessages,
  ] = await Promise.all([
    prisma.merchant.count({ where: merchantFilter }),
    prisma.merchant.count({ where: { ...merchantFilter, status: "active" } }),
    prisma.merchant.count({ where: { ...merchantFilter, status: "suspended" } }),
    prisma.conversation.count(),
    prisma.order.count(),
    prisma.message.count(),
  ]);

  // Jumla ya AI usage kwa merchants wote
  const aiUsageAgg = await prisma.merchant.aggregate({
    _sum: { aiUsage: true },
    where: merchantFilter,
  });

  res.json({
    totalMerchants,
    activeMerchants,
    suspendedMerchants,
    totalConversations,
    totalOrders,
    totalMessages,
    totalAiUsage: aiUsageAgg._sum.aiUsage || 0,
  });
}));

// ── AFYA YA MFUMO (System Health) ────────────────────────────
router.get("/health", wrap(async (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
  const uptimeHours = Math.floor(uptimeSeconds / 3600);
  const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
  const uptimeSecs = uptimeSeconds % 60;
  const memUsage = process.memoryUsage();

  // Count active WhatsApp sessions
  const merchants = await prisma.merchant.findMany({
    where: { role: "merchant" },
    select: { id: true },
  });

  let connectedCount = 0;
  let disconnectedCount = 0;
  merchants.forEach(m => {
    const s = getConnectionStatus(m.id);
    if (s.status === "open" || s.status === "connected") connectedCount++;
    else disconnectedCount++;
  });

  // DB ping
  let dbStatus = "ok";
  let dbPingMs = null;
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbPingMs = Date.now() - t0;
  } catch (e) {
    dbStatus = "error";
  }

  res.json({
    server: {
      uptime: `${uptimeHours}h ${uptimeMinutes}m ${uptimeSecs}s`,
      uptimeSeconds,
      startedAt: new Date(serverStartTime).toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
    },
    memory: {
      heapUsedMB: (memUsage.heapUsed / 1024 / 1024).toFixed(1),
      heapTotalMB: (memUsage.heapTotal / 1024 / 1024).toFixed(1),
      rssMB: (memUsage.rss / 1024 / 1024).toFixed(1),
    },
    whatsapp: {
      totalMerchants: merchants.length,
      connected: connectedCount,
      disconnected: disconnectedCount,
    },
    database: {
      status: dbStatus,
      pingMs: dbPingMs,
    },
  });
}));


// ── ORODHA YA WAFANYABIASHARA (Merchants List) ──────────────
router.get("/merchants", wrap(async (req, res) => {
  const merchants = await prisma.merchant.findMany({
    where: { role: "merchant" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      businessName: true,
      email: true,
      phone: true,
      status: true,
      aiLimit: true,
      aiUsage: true,
      subscriptionPlan: true,
      subscriptionEndDate: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          products: true,
          conversations: true,
          orders: true,
        },
      },
    },
  });

  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const merchantsWithFlags = merchants.map(m => ({
    ...m,
    expiringSoon: m.subscriptionEndDate
      ? m.subscriptionEndDate > now && m.subscriptionEndDate <= sevenDaysLater
      : false,
    subscriptionExpired: m.subscriptionEndDate ? m.subscriptionEndDate < now : false,
  }));

  res.json({ merchants: merchantsWithFlags });
}));


// ── TAARIFA ZA MFANYABIASHARA MMOJA ─────────────────────────
router.get("/merchants/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const merchant = await prisma.merchant.findUnique({
    where: { id },
    select: {
      id: true,
      businessName: true,
      email: true,
      phone: true,
      status: true,
      role: true,
      aiLimit: true,
      aiUsage: true,
      businessContext: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          products: true,
          conversations: true,
          orders: true,
        },
      },
    },
  });

  if (!merchant || merchant.role === "superadmin") {
    return res.status(404).json({ error: "Mfanyabiashara hajapatikana." });
  }

  res.json({ merchant });
}));

// ── SIMAMISHA AU RUHUSU MFANYABIASHARA (Suspend / Activate) ─
router.put("/merchants/:id/status", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;

  if (!["active", "suspended"].includes(status)) {
    return res.status(400).json({ error: "Status lazima iwe 'active' au 'suspended'." });
  }

  // Usimamishe Super-Admin mwenyewe
  const target = await prisma.merchant.findUnique({ where: { id } });
  if (!target) {
    return res.status(404).json({ error: "Mfanyabiashara hajapatikana." });
  }
  if (target.role === "superadmin") {
    return res.status(403).json({ error: "Huwezi kusimamisha Super-Admin." });
  }

  const updated = await prisma.merchant.update({
    where: { id },
    data: { status },
    select: { id: true, businessName: true, status: true },
  });

  const action = status === "suspended" ? "imesimamishwa" : "imeamilishwa";
  console.log(`🔒 Super-Admin: Akaunti ya "${updated.businessName}" ${action}.`);

  res.json({
    message: `Akaunti ya "${updated.businessName}" ${action} kwa mafanikio.`,
    merchant: updated,
  });
}));

// ── BORESHA KIFURUSHI (Upgrade Subscription) ────────────────
router.put("/merchants/:id/subscription", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { subscriptionPlan, monthsToAdd } = req.body;

  const target = await prisma.merchant.findUnique({ where: { id } });
  if (!target) {
    return res.status(404).json({ error: "Mfanyabiashara hajapatikana." });
  }

  let newEndDate = target.subscriptionEndDate ? new Date(target.subscriptionEndDate) : new Date();
  if (newEndDate < new Date()) newEndDate = new Date(); // If expired, start from today

  if (monthsToAdd) {
    newEndDate.setMonth(newEndDate.getMonth() + parseInt(monthsToAdd, 10));
  }

  const updated = await prisma.merchant.update({
    where: { id },
    data: {
      subscriptionPlan: subscriptionPlan || target.subscriptionPlan,
      subscriptionEndDate: newEndDate,
    }
  });

  console.log(`💳 Super-Admin: Akaunti ya "${target.businessName}" imepewa kifurushi cha ${subscriptionPlan || 'nyongeza'}. Mwisho: ${newEndDate}`);

  res.json({
    message: `Kifurushi kimeboreshwa kikamilifu.`,
    merchant: updated,
  });
}));

// ── BADILISHA KIKOMO CHA AI (AI Limit) ──────────────────────
router.put("/merchants/:id/ai-limit", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { aiLimit } = req.body;

  if (!aiLimit || aiLimit < 0) {
    return res.status(400).json({ error: "aiLimit lazima iwe namba chanya." });
  }

  const updated = await prisma.merchant.update({
    where: { id },
    data: { aiLimit: parseInt(aiLimit, 10) },
    select: { id: true, businessName: true, aiLimit: true },
  });

  res.json({ message: `Kikomo cha AI kimebadilishwa kuwa ${updated.aiLimit}.`, merchant: updated });
}));

// ── RESET AI USAGE ───────────────────────────────────────────
router.put("/merchants/:id/reset-ai-usage", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);

  const target = await prisma.merchant.findUnique({ where: { id } });
  if (!target || target.role === "superadmin") {
    return res.status(404).json({ error: "Mfanyabiashara hajapatikana." });
  }

  const updated = await prisma.merchant.update({
    where: { id },
    data: { aiUsage: 0 },
    select: { id: true, businessName: true, aiUsage: true },
  });

  console.log(`🔄 Super-Admin: AI Usage ya "${target.businessName}" imesasishwa kuwa 0.`);
  res.json({ message: `AI Usage ya "${updated.businessName}" imefutwa.`, merchant: updated });
}));

// ── TOGGLE BOT ACTIVE STATUS ─────────────────────────────────
router.put("/merchants/:id/bot-status", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { botActive } = req.body;

  if (typeof botActive !== "boolean") {
    return res.status(400).json({ error: "botActive lazima iwe true au false." });
  }

  const target = await prisma.merchant.findUnique({ where: { id } });
  if (!target || target.role === "superadmin") {
    return res.status(404).json({ error: "Mfanyabiashara hajapatikana." });
  }

  setBotActive(id, botActive);
  const state = botActive ? "imewashwa" : "imezimwa";
  console.log(`🤖 Super-Admin: Bot ya "${target.businessName}" ${state}.`);
  res.json({ message: `Bot ya "${target.businessName}" ${state}.`, botActive });
}));


// ── FUTA MFANYABIASHARA KABISA (Delete Merchant) ────────────
router.delete("/merchants/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);

  const target = await prisma.merchant.findUnique({ where: { id } });
  if (!target) {
    return res.status(404).json({ error: "Mfanyabiashara hajapatikana." });
  }
  if (target.role === "superadmin") {
    return res.status(403).json({ error: "Huwezi kufuta Super-Admin." });
  }

  // Prisma cascade itafuta products, conversations, orders, messages zote
  await prisma.merchant.delete({ where: { id } });

  console.log(`🗑️  Super-Admin: Akaunti ya "${target.businessName}" (${target.email}) imefutwa kabisa.`);

  res.json({ message: `Akaunti ya "${target.businessName}" imefutwa kwa mafanikio.` });
}));

// ── Mipangilio ya Mfumo (Platform Settings) ──────────────────
router.get("/settings", wrap(async (req, res) => {
  res.json(getSettings());
}));

router.put("/settings", wrap(async (req, res) => {
  const updated = saveSettings(req.body);
  console.log(`⚙️ Super-Admin: Mipangilio imesasishwa.`);
  res.json({ message: "Mipangilio imehifadhiwa.", settings: updated });
}));

// ── IMPERSONATE (LOGIN AS MERCHANT) ─────────────────────────
router.post("/merchants/:id/impersonate", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const merchant = await prisma.merchant.findUnique({ where: { id } });
  
  if (!merchant) {
    return res.status(404).json({ error: "Mfanyabiashara hajapatikana." });
  }
  
  if (merchant.role === "superadmin") {
    return res.status(403).json({ error: "Huwezi kujifanya (impersonate) Super-Admin." });
  }

  // Generate a short-lived token for impersonation
  const token = jwt.sign(
    { merchantId: merchant.id, email: merchant.email, role: merchant.role || "merchant" },
    config.jwtSecret,
    { expiresIn: "2h" } 
  );

  console.log(`🦸‍♂️ Super-Admin ameanza kumsimamia (impersonate) mfanyabiashara "${merchant.businessName}".`);

  res.json({ token, merchant: { id: merchant.id, businessName: merchant.businessName, email: merchant.email } });
}));

// ── PLATFORM SETTINGS ───────────────────────────────────────
router.get("/settings", wrap(async (req, res) => {
  const settings = getSettings();
  res.json(settings);
}));

router.put("/settings", wrap(async (req, res) => {
  const { broadcastMessage, broadcastActive, defaultAiLimit } = req.body;
  const updates = {};
  if (broadcastMessage !== undefined) updates.broadcastMessage = broadcastMessage;
  if (broadcastActive !== undefined) updates.broadcastActive = broadcastActive;
  if (defaultAiLimit !== undefined) updates.defaultAiLimit = defaultAiLimit;
  
  const updated = saveSettings(updates);
  res.json({ message: "Mipangilio imehifadhiwa kikamilifu.", settings: updated });
}));

// ── WHATSAPP SESSIONS MANAGEMENT ─────────────────────────
router.get("/whatsapp-sessions", wrap(async (req, res) => {
  // Pata wafanyabiashara wote
  const merchants = await prisma.merchant.findMany({
    where: { role: "merchant" },
    select: { id: true, businessName: true, phone: true }
  });

  const sessionsInfo = merchants.map(m => {
    const status = getConnectionStatus(m.id);
    return {
      id: m.id,
      businessName: m.businessName,
      phone: m.phone,
      status: status.status,
      botActive: status.botActive,
    };
  });

  res.json({ sessions: sessionsInfo });
}));

router.post("/whatsapp-sessions/:id/disconnect", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  console.log(`🔌 Super-Admin anakata session ya WhatsApp kwa Merchant #${id}`);
  
  // logout = true inafuta kabisa session (creds.json) ili arudie ku-scan
  await stopSession(id, true);
  
  res.json({ message: "WhatsApp session imekatwa kikamilifu." });
}));

module.exports = router;
