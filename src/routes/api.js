// REST API kwa Admin Dashboard - Phase 5
// Imeboreshwa kwa Multi-Tenant SaaS (JWT Auth + Scoped Queries)

const express = require("express");
const router = express.Router();
const prisma = require("../db/client");
const { getSettings } = require("../utils/platformSettings");
const { sendMessage } = require("../whatsapp/sender");
const manager = require("../whatsapp/manager");
const authMiddleware = require("../middleware/auth");
const { decrypt } = require("../utils/crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../../public/uploads/products", String(req.merchantId));
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Msaidizi mdogo: inachukua sync au async route handler na kuimarishia try/catch otomatikal
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
  console.error(`⚠️  API Error [${req.method} ${req.path}]:`, err.message);
  res.status(500).json({ error: "Hitilafu ya seva imetokea. Jaribu tena." });
});

// Linda endpoints zote za chini kwa kutumia JWT auth middleware
router.use(authMiddleware);

// ── Mazungumzo (Conversations) ──────────────────────────────────────────────
// Pata orodha ya mazungumzo yote ya duka hili
router.get("/conversations", wrap(async (req, res) => {
  const mId = parseInt(req.merchantId, 10);
  const page = parseInt(req.query.page || "1", 10);
  const limit = 30;
  const skip = (page - 1) * limit;

  const [total, conversations] = await Promise.all([
    prisma.conversation.count({ where: { merchantId: mId } }),
    prisma.conversation.findMany({
      where: { merchantId: mId },
      orderBy: { updatedAt: "desc" },
      skip,
      take: limit,
      include: {
        _count: { select: { messages: true, orders: true } },
      },
    }),
  ]);

  res.json({
    total,
    page,
    pages: Math.ceil(total / limit),
    conversations: conversations.map(c => ({
      id: c.id,
      customerName: c.customerName || "Haijulikani",
      customerPhone: c.customerPhone,
      messageCount: c._count.messages,
      orderCount: c._count.orders,
      needsHuman: c.needsHuman,
      contextSummary: c.contextSummary || null,
      updatedAt: c.updatedAt,
      createdAt: c.createdAt,
    })),
  });
}));

// Pata meseji zote za mazungumzo maalum (full chat history)
router.get("/conversations/:id/messages", wrap(async (req, res) => {
  const mId = parseInt(req.merchantId, 10);
  const convId = parseInt(req.params.id, 10);

  // Hakikisha mazungumzo haya ni ya duka hili (security check)
  const conversation = await prisma.conversation.findFirst({
    where: { id: convId, merchantId: mId },
  });
  if (!conversation) {
    return res.status(404).json({ error: "Mazungumzo hayapatikani." });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId: convId },
    orderBy: { createdAt: "asc" },
  });

  res.json({
    conversation: {
      id: conversation.id,
      customerName: conversation.customerName || "Haijulikani",
      customerPhone: conversation.customerPhone,
      contextSummary: conversation.contextSummary || null,
      needsHuman: conversation.needsHuman,
    },
    messages: messages.map(m => ({
      id: m.id,
      sender: m.sender,
      content: decrypt(m.content),
      createdAt: m.createdAt,
    })),
  });
}));

// ---- 1. WHATSAPP MULTI-SESSION CONTROLS ----

router.get("/whatsapp-status", wrap((req, res) => {
  res.json(manager.getConnectionStatus(req.merchantId));
}));

router.post("/whatsapp-connect", wrap(async (req, res) => {
  const statusInfo = manager.getConnectionStatus(req.merchantId);
  if (statusInfo.status === "disconnected" || statusInfo.status === "qr") {
    // Anzisha session ya WhatsApp ya merchant huyu ki-async
    manager.startSession(req.merchantId).catch((err) => {
      console.error(`Kosa la kuanzisha session ya Merchant #${req.merchantId}:`, err);
    });
    res.json({ success: true, message: "Kujaribu kuunganisha upya..." });
  } else {
    res.json({ success: true, message: "Tayari inajaribu kuunganisha au imeunganishwa." });
  }
}));

router.post("/whatsapp-disconnect", wrap(async (req, res) => {
  await manager.stopSession(req.merchantId, true); // fanya logout na ufute session folder
  res.json({ success: true, message: "Umeunganishwa upya na WhatsApp imefutwa." });
}));

router.post("/whatsapp-pair-code", wrap(async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: "Namba ya simu inahitajika." });
  }
  const code = await manager.requestPairingCode(req.merchantId, phoneNumber);
  res.json({ success: true, code });
}));

router.post("/bot-toggle", wrap((req, res) => {
  const { active } = req.body;
  if (typeof active !== "boolean") {
    return res.status(400).json({ error: "'active' lazima iwe true au false" });
  }
  manager.setBotActive(req.merchantId, active);
  const label = active ? "imewashwa" : "imezimwa";
  console.log(`🤖 Merchant #${req.merchantId} - Bot ime${label} na admin.`);
  res.json({ success: true, botActive: active, message: `Bot ${label} kikamilifu.` });
}));

// ---- 2. PRODUCTS (Scoped to req.merchantId) ----

router.get("/products", wrap(async (req, res) => {
  const products = await prisma.product.findMany({
    where: { merchantId: req.merchantId },
    orderBy: { id: "desc" },
  });
  res.json(products);
}));

router.post("/products/upload", upload.single("image"), wrap(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Tafadhali chagua picha." });
  }
  // Tengeneza URL inayoweza kufikiwa public (mfano: /uploads/products/1/12345.png)
  const imageUrl = `/uploads/products/${req.merchantId}/${req.file.filename}`;
  res.json({ imageUrl });
}));

router.post("/products", wrap(async (req, res) => {
  const { name, category, price, stock, colors, sizes, description, imageUrl } = req.body;
  const product = await prisma.product.create({
    data: {
      merchantId: req.merchantId, // SaaS scoping
      name,
      category,
      price: parseFloat(price),
      stock: parseInt(stock, 10) || 0,
      colors: colors || null,
      sizes: sizes || null,
      description: description || null,
      imageUrl: imageUrl || null,
    },
  });
  res.json(product);
}));

router.put("/products/:id", wrap(async (req, res) => {
  const { id } = req.params;
  const { name, category, price, stock, colors, sizes, description, isActive, imageUrl } = req.body;
  const prodId = parseInt(id, 10);

  // Thibitisha uandishi/umiliki
  const existing = await prisma.product.findFirst({
    where: { id: prodId, merchantId: req.merchantId },
  });
  if (!existing) return res.status(404).json({ error: "Bidhaa haipo" });

  const product = await prisma.product.update({
    where: { id: prodId },
    data: {
      ...(name !== undefined && { name }),
      ...(category !== undefined && { category }),
      ...(price !== undefined && { price: parseFloat(price) }),
      ...(stock !== undefined && { stock: parseInt(stock, 10) }),
      ...(colors !== undefined && { colors }),
      ...(sizes !== undefined && { sizes }),
      ...(description !== undefined && { description }),
      ...(isActive !== undefined && { isActive }),
      ...(imageUrl !== undefined && { imageUrl }),
    },
  });
  res.json(product);
}));

router.delete("/products/:id", wrap(async (req, res) => {
  const { id } = req.params;
  const prodId = parseInt(id, 10);

  const existing = await prisma.product.findFirst({
    where: { id: prodId, merchantId: req.merchantId },
  });
  if (!existing) return res.status(404).json({ error: "Bidhaa haipo" });

  await prisma.product.update({
    where: { id: prodId },
    data: { isActive: false }, // soft delete
  });
  res.json({ success: true });
}));

// ---- 3. ORDERS (Scoped to req.merchantId) ----

router.get("/notifications/poll", wrap(async (req, res) => {
  const sinceStr = req.query.since;
  if (!sinceStr) return res.json({ newOrders: 0, orders: [] });

  const sinceDate = new Date(sinceStr);
  if (isNaN(sinceDate.getTime())) return res.json({ newOrders: 0, orders: [] });

  const newOrders = await prisma.order.findMany({
    where: {
      merchantId: req.merchantId,
      createdAt: { gt: sinceDate }
    },
    include: { product: true },
    orderBy: { createdAt: "desc" }
  });

  res.json({ newOrders: newOrders.length, orders: newOrders });
}));

router.get("/orders", wrap(async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { merchantId: req.merchantId },
    orderBy: { id: "desc" },
    include: { product: true },
  });
  res.json(orders);
}));

function buildOrderStatusMessage(order, status) {
  const details = [];
  if (order.color) details.push(order.color);
  if (order.size) details.push(`Size ${order.size}`);
  const productLine = details.length > 0
    ? `${order.productName} (${details.join(", ")})`
    : order.productName;

  if (status === "paid") {
    return `✅ *Malipo Yamepokelewa!*\n\nTumepokea muamala wako kwa oda ya:\n🛍️ ${productLine} (Oda #${order.id}).\n\nOda yako sasa inashughulikiwa na utapewa taarifa ya uwasilishaji hivi punde. Asante! 🙏`;
  }
  if (status === "confirmed") {
    return `✅ *Oda Yako Imethibitishwa!*\n\n🛍️ ${productLine}\n🔖 Oda #${order.id}\n\nTunaandaa bidhaa yako, itakuwa tayari hivi karibuni. Asante kwa uvumilivu wako! 😊`;
  }
  if (status === "delivered") {
    return `📦 *Oda Imefikishwa!*\n\n🛍️ ${productLine}\n🔖 Oda #${order.id}\n\nAsante sana kwa kununua nasi! Tunatumaini utapenda bidhaa yako. Karibu tena! 🎉`;
  }
  if (status === "cancelled") {
    return `❌ *Oda Imeghairiwa*\n\n🛍️ ${productLine}\n🔖 Oda #${order.id}\n\nSamahani kwa usumbufu wowote. Kama kuna swali lolote, tuandikie hapa hapa - tuko tayari kukusaidia.`;
  }
  return null;
}

router.put("/orders/:id", wrap(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const orderId = parseInt(id, 10);

  const existingOrder = await prisma.order.findFirst({
    where: { id: orderId, merchantId: req.merchantId },
  });
  if (!existingOrder) {
    return res.status(404).json({ error: "Oda haipo au huna mamlaka nayo." });
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: { status },
  });

  let notified = false;
  if (existingOrder.status !== status) {
    const message = buildOrderStatusMessage(order, status);
    if (message) {
      notified = await sendMessage(order.customerPhone, message, req.merchantId);
    }

    if (status === "cancelled" && order.productId) {
      await prisma.product.update({
        where: { id: order.productId },
        data: { stock: { increment: order.quantity } },
      });
    }
  }

  res.json({ ...order, customerNotified: notified });
}));

// ---- 4. CONVERSATIONS (Scoped to req.merchantId) ----
// (Orodha ya mazungumzo ipo juu, hapa tumebakiza routes nyingine za mazungumzo)

router.put("/conversations/:id/contact-type", wrap(async (req, res) => {
  const { id } = req.params;
  const { contactType } = req.body;
  const convId = parseInt(id, 10);

  if (!["customer", "personal"].includes(contactType)) {
    return res.status(400).json({ error: "contactType lazima iwe 'customer' au 'personal'" });
  }

  const existing = await prisma.conversation.findFirst({
    where: { id: convId, merchantId: req.merchantId },
  });
  if (!existing) return res.status(404).json({ error: "Mazungumzo hayapo" });

  const conversation = await prisma.conversation.update({
    where: { id: convId },
    data: { contactType },
  });
  res.json(conversation);
}));

router.get("/conversations/:id/messages", wrap(async (req, res) => {
  const { id } = req.params;
  const convId = parseInt(id, 10);
  const { decrypt } = require("../utils/crypto");

  const existing = await prisma.conversation.findFirst({
    where: { id: convId, merchantId: req.merchantId },
  });
  if (!existing) return res.status(404).json({ error: "Mazungumzo hayapo" });

  const messages = await prisma.message.findMany({
    where: { conversationId: convId },
    orderBy: { createdAt: "asc" },
  });
  
  // Decrypt ujumbe kabla ya kuupeleka kwenye UI
  const decryptedMessages = messages.map(m => ({
    ...m,
    content: decrypt(m.content)
  }));
  
  res.json({ messages: decryptedMessages, conversation: existing });
}));

// ---- 5. DASHBOARD STATS (Scoped to req.merchantId) ----

router.get("/stats", wrap(async (req, res) => {
  const mId = req.merchantId;
  const [productCount, orderCount, conversationCount, pendingOrders, reEngagedCount, pendingSpecialRequests] = await Promise.all([
    prisma.product.count({ where: { merchantId: mId, isActive: true } }),
    prisma.order.count({ where: { merchantId: mId } }),
    prisma.conversation.count({ where: { merchantId: mId } }),
    prisma.order.count({ where: { merchantId: mId, status: "pending" } }),
    prisma.conversation.count({ where: { merchantId: mId, reEngagedAt: { not: null } } }),
    prisma.specialRequest.count({ where: { merchantId: mId, status: { in: ["new", "sourcing"] } } }),
  ]);
  res.json({ productCount, orderCount, conversationCount, pendingOrders, reEngagedCount, pendingSpecialRequests });
}));

// ---- 6. SPECIAL REQUESTS (Scoped to req.merchantId) ----

router.get("/special-requests", wrap(async (req, res) => {
  const requests = await prisma.specialRequest.findMany({
    where: { merchantId: req.merchantId },
    orderBy: { id: "desc" },
    include: { conversation: { select: { customerName: true } } },
  });
  res.json(requests);
}));

router.put("/special-requests/:id", wrap(async (req, res) => {
  const { id } = req.params;
  const { status, adminNotes, quotedPrice } = req.body;
  const reqId = parseInt(id, 10);

  const existing = await prisma.specialRequest.findFirst({
    where: { id: reqId, merchantId: req.merchantId },
  });
  if (!existing) return res.status(404).json({ error: "Ombi halipo au huna mamlaka nalo." });

  const updated = await prisma.specialRequest.update({
    where: { id: reqId },
    data: {
      ...(status !== undefined && { status }),
      ...(adminNotes !== undefined && { adminNotes }),
      ...(quotedPrice !== undefined && { quotedPrice: parseFloat(quotedPrice) }),
    },
  });

  let customerNotified = false;
  if (status === "found" && existing.status !== "found" && updated.quotedPrice) {
    const priceStr = updated.quotedPrice.toLocaleString();
    const deliveryInfo = updated.deliveryType === "delivery"
      ? `📦 Delivery kwa: ${updated.address || "anuani yako"}`
      : "🏠 Pickup dukani";
    const msg =
      `🎉 *Habari nzuri, ${updated.customerName}!*\n\n` +
      `Tumeipata *${updated.productName}* uliyoiomba!\n\n` +
      `💰 Bei halisi: TZS *${priceStr}*\n` +
      `${deliveryInfo}\n🔖 Ombi #SR-${updated.id}\n\n` +
      `Je, unataka kuendelea? Tuambie ili tukuandalie haraka! ✅`;
    customerNotified = await sendMessage(updated.customerPhone, msg, req.merchantId);
  }

  if (status === "fulfilled" && existing.status !== "fulfilled") {
    const msg =
      `📦 *Ombi Lako Limetimizwa!*\n\n` +
      `🛍️ *${updated.productName}*\n🔖 Ombi #SR-${updated.id}\n\n` +
      `Asante sana kwa kutuamini! Karibu tena. 🎉`;
    customerNotified = await sendMessage(updated.customerPhone, msg, req.merchantId);
  }

  res.json({ ...updated, customerNotified });
}));

// ---- 7. MERCHANT SETTINGS (Scoped to req.merchantId) ----

router.get("/settings", wrap(async (req, res) => {
  const merchant = await prisma.merchant.findUnique({
    where: { id: req.merchantId },
    select: {
      businessName: true,
      businessContext: true,
      reEngagementMinHours: true,
      reEngagementMaxHours: true,
      reEngagementCooldownHours: true,
      reEngagementStartHour: true,
      reEngagementEndHour: true,
      subscriptionPlan: true,
      subscriptionEndDate: true,
    }
  });
  res.json(merchant);
}));

router.post("/settings", wrap(async (req, res) => {
  const {
    businessName,
    businessContext,
    reEngagementMinHours,
    reEngagementMaxHours,
    reEngagementCooldownHours,
    reEngagementStartHour,
    reEngagementEndHour,
    newPassword,
    oldPassword,
    verifyPhone,
  } = req.body;
  
  let passwordHash;
  if (newPassword && newPassword.trim().length > 0) {
    if (!oldPassword || !verifyPhone) {
      return res.status(400).json({ error: "Tafadhali jaza namba ya simu na neno siri la zamani ili kubadili neno siri." });
    }
    
    // Auth Check
    const merchant = await prisma.merchant.findUnique({ where: { id: req.merchantId } });
    if (merchant.phone !== verifyPhone.trim()) {
      return res.status(401).json({ error: "Namba ya simu si sahihi." });
    }
    
    const bcrypt = require("bcryptjs");
    const isMatch = await bcrypt.compare(oldPassword, merchant.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Neno siri la zamani si sahihi." });
    }

    const salt = await bcrypt.genSalt(10);
    passwordHash = await bcrypt.hash(newPassword, salt);
  }

  const updated = await prisma.merchant.update({
    where: { id: req.merchantId },
    data: {
      ...(businessName !== undefined && { businessName }),
      ...(businessContext !== undefined && { businessContext }),
      ...(reEngagementMinHours !== undefined && { reEngagementMinHours: parseInt(reEngagementMinHours, 10) }),
      ...(reEngagementMaxHours !== undefined && { reEngagementMaxHours: parseInt(reEngagementMaxHours, 10) }),
      ...(reEngagementCooldownHours !== undefined && { reEngagementCooldownHours: parseInt(reEngagementCooldownHours, 10) }),
      ...(reEngagementStartHour !== undefined && { reEngagementStartHour: parseInt(reEngagementStartHour, 10) }),
      ...(reEngagementEndHour !== undefined && { reEngagementEndHour: parseInt(reEngagementEndHour, 10) }),
      ...(passwordHash && { passwordHash }),
    }
  });

  res.json({ success: true, merchant: { id: updated.id, businessName: updated.businessName } });
}));

// Futa Akaunti (Delete Account)
router.delete("/settings/account", wrap(async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "Neno siri linahitajika ili kufuta akaunti." });
  }

  const merchant = await prisma.merchant.findUnique({ where: { id: req.merchantId } });
  
  const bcrypt = require("bcryptjs");
  const isMatch = await bcrypt.compare(password, merchant.passwordHash);
  if (!isMatch) {
    return res.status(401).json({ error: "Neno siri si sahihi. Hatuwezi kufuta akaunti." });
  }

  // Delete merchant completely. Prisma Cascade deletes all products, messages, orders, etc.
  await prisma.merchant.delete({ where: { id: req.merchantId } });
  
  res.json({ success: true, message: "Akaunti imefutwa kikamilifu." });
}));

// ── PLATFORM BROADCAST ──────────────────────────────────
router.get("/platform/broadcast", wrap(async (req, res) => {
  const settings = getSettings();
  res.json({
    active: settings.broadcastActive,
    message: settings.broadcastMessage
  });
}));

module.exports = router;
