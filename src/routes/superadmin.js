// Super-Admin API Routes — Kusimamia mfumo mzima wa SaaS
// Routes zote hizi zinalindwa na superAdminAuth middleware

const express = require("express");
const router = express.Router();
const prisma = require("../db/client");
const superAdminAuth = require("../middleware/superAdminAuth");
const { getSettings, saveSettings } = require("../utils/platformSettings");

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

  res.json({ merchants });
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

module.exports = router;
