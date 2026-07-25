// AI Business Advisor - inatumika kuchambua mauzo na wateja kwa merchant maalum.
// Inaelekeza Prisma queries zote kwenye merchantId ya mtumiaji aliyebofya ripoti.

const prisma = require("../db/client");
const { callAISimple } = require("./callAISimple");
const config = require("../config");
const { decrypt } = require("../utils/crypto");

const LOW_STOCK_THRESHOLD = 5; // Bidhaa zenye stock chini ya hii zinaonywa
const ENGAGEMENT_MESSAGE_THRESHOLD = 3; // Namba ya ujumbe inayodokeza mteja yuko engaged
// ---- 1. Takwimu za msingi za biashara ----
async function computeBusinessStats(merchantId = 1) {
  const mId = parseInt(merchantId, 10);
  const [totalCustomers, totalPersonal, orders, products, conversationsWithOrders, totalReEngaged] =
    await Promise.all([
      prisma.conversation.count({ where: { merchantId: mId, contactType: "customer" } }),
      prisma.conversation.count({ where: { merchantId: mId, contactType: "personal" } }),
      prisma.order.findMany({ where: { merchantId: mId } }),
      prisma.product.findMany({ where: { merchantId: mId, isActive: true } }),
      prisma.conversation.count({
        where: { merchantId: mId, contactType: "customer", orders: { some: {} } },
      }),
      prisma.conversation.count({ where: { merchantId: mId, reEngagedAt: { not: null } } }),
    ]);

  const ordersByStatus = { pending: 0, confirmed: 0, delivered: 0, cancelled: 0 };
  let revenue = 0;
  const productSales = {};

  for (const o of orders) {
    ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
    if (o.status === "delivered" && o.unitPrice) {
      revenue += o.unitPrice * o.quantity;
    }
    if (o.status !== "cancelled") {
      productSales[o.productName] = (productSales[o.productName] || 0) + o.quantity;
    }
  }

  const topProducts = Object.entries(productSales)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  const lowStockProducts = products
    .filter((p) => p.stock <= LOW_STOCK_THRESHOLD)
    .map((p) => ({ name: p.name, stock: p.stock }));

  const conversionRate =
    totalCustomers > 0 ? Math.round((conversationsWithOrders / totalCustomers) * 100) : 0;

  return {
    totalCustomers,
    totalPersonalContacts: totalPersonal,
    totalOrders: orders.length,
    ordersByStatus,
    estimatedRevenue: Math.round(revenue),
    conversionRate,
    topProducts,
    lowStockProducts,
    totalActiveProducts: products.length,
    totalReEngaged,
  };
}

// ---- 2. Wateja wanaoweza kununua ----
async function findPotentialCustomers(merchantId = 1) {
  const mId = parseInt(merchantId, 10);
  const candidates = await prisma.conversation.findMany({
    where: {
      merchantId: mId,
      contactType: "customer",
      orders: { none: { status: { in: ["confirmed", "delivered"] } } },
    },
    include: {
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 6 },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  const engaged = candidates
    .filter((c) => c._count.messages >= ENGAGEMENT_MESSAGE_THRESHOLD)
    .slice(0, 10);

  if (engaged.length === 0) return [];

  const conversationSummaries = engaged
    .map((c, i) => {
      const recentMsgs = c.messages
        .slice()
        .reverse()
        .map((m) => `${m.sender === "customer" ? "Mteja" : "AI"}: ${decrypt(m.content)}`)
        .join("\n");
      return `Mteja #${i + 1} (${c.customerName || "Haijulikani"}):\n${recentMsgs}`;
    })
    .join("\n\n---\n\n");

  const prompt = `Wewe ni mchambuzi wa mauzo. Hapa chini kuna mazungumzo ya wateja kadhaa na muuzaji (AI). Kwa kila mteja, chambua kama ana nia ya kununua (lakini bado hajakamilisha oda) na toa: (1) sababu fupi ya sentensi moja kwa Kiswahili, (2) kiwango cha uwezekano wa kununua: "Juu", "Wastani", au "Chini".
 
${conversationSummaries}
 
Jibu KWA JSON TU (bila maandishi mengine, bila markdown fences), kwa muundo huu hasa:
[{"index": 1, "reason": "...", "likelihood": "Juu"}, {"index": 2, "reason": "...", "likelihood": "Wastani"}]`;

  try {
    const text = await callAISimple(prompt);
    if (!text) throw new Error("Jibu tupu kutoka kwa providers zote");

    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
    const analysis = JSON.parse(cleaned);

    return engaged.map((c, i) => {
      const match = analysis.find((a) => a.index === i + 1) || {};
      return {
        customerName: c.customerName || "Haijulikani",
        customerPhone: c.customerPhone,
        messageCount: c._count.messages,
        reason: match.reason || "Ana mazungumzo mengi lakini bado hajakamilisha oda.",
        likelihood: match.likelihood || "Wastani",
      };
    });
  } catch (err) {
    console.error("⚠️  Imeshindwa kuchambua wateja kwa AI:", err.message);
    return engaged.map((c) => ({
      customerName: c.customerName || "Haijulikani",
      customerPhone: c.customerPhone,
      messageCount: c._count.messages,
      reason: "Ana mazungumzo mengi lakini bado hajakamilisha oda.",
      likelihood: "Wastani",
    }));
  }
}

// ---- 3. Ushauri wa biashara kutoka AI ----
async function generateBusinessAdvice(merchantId = 1) {
  const mId = parseInt(merchantId, 10);
  const stats = await computeBusinessStats(mId);

  const prompt = `Wewe ni mshauri wa biashara mwenye uzoefu, unayemsaidia mmiliki wa duka dogo la mtandaoni (WhatsApp) Tanzania. Hapa chini kuna takwimu za biashara yake:
 
- Idadi ya wateja: ${stats.totalCustomers}
- Oda zote: ${stats.totalOrders} (Pending: ${stats.ordersByStatus.pending}, Confirmed: ${stats.ordersByStatus.confirmed}, Delivered: ${stats.ordersByStatus.delivered}, Cancelled: ${stats.ordersByStatus.cancelled})
- Mapato yaliyokadiriwa (oda zilizofikishwa): TZS ${stats.estimatedRevenue.toLocaleString()}
- Kiwango cha "conversion" (wateja waliokamilisha oda): ${stats.conversionRate}%
- Bidhaa zinazouzwa zaidi: ${stats.topProducts.map((p) => `${p.name} (${p.qty})`).join(", ") || "Hakuna data ya kutosha bado"}
- Bidhaa zenye stock ndogo (chini ya ${LOW_STOCK_THRESHOLD}): ${stats.lowStockProducts.map((p) => `${p.name} (${p.stock})`).join(", ") || "Hakuna"}
 
Mpe ushauri WA VITENDO (siyo wa jumla jumla) wa mambo 4-6 anayoweza kufanya SASA kuongeza mauzo, kuboresha "conversion rate", na kuongeza faida. Andika kwa Kiswahili, muundo wa bullet points fupi (tumia *neno* kwa bold kwenye kichwa cha kila wazo), zenye vitendo halisi anavyoweza kufanya wiki hii - siyo maneno ya jumla kama "boresha huduma". Kama kuna stock ndogo, itaje wazi kwa jina. Kama conversion rate ni ndogo, pendekeza jinsi ya kuboresha mazungumzo ya AI au follow-up ya wateja.`;

  const result = await callAISimple(prompt);
  if (result) return result;

  return "Samahani, huduma ya AI haipo sasa hivi (tatizo la mtandao au API quota imefikiwa). Jaribu tena baadaye.";
}

// ---- 4. Swali lolote kuhusu biashara (Q&A huru na AI) ----
async function answerBusinessQuestion(question, merchantId = 1) {
  const mId = parseInt(merchantId, 10);
  const stats = await computeBusinessStats(mId);
  const products = await prisma.product.findMany({ where: { merchantId: mId, isActive: true } });

  const productList = products
    .map((p) => `${p.name} (${p.category}) - TZS ${p.price.toLocaleString()}, Stock: ${p.stock}`)
    .join("\n");

  const prompt = `Wewe ni mshauri wa biashara mwenye uzoefu unayemsaidia mmiliki wa duka la WhatsApp Tanzania. Hii ndiyo hali ya biashara yake sasa:
 
TAKWIMU: Wateja ${stats.totalCustomers}, Oda ${stats.totalOrders} (${JSON.stringify(stats.ordersByStatus)}), Mapato TZS ${stats.estimatedRevenue.toLocaleString()}, Conversion rate ${stats.conversionRate}%
 
BIDHAA ZILIZOPO:
${productList}
 
Swali la mmiliki wa duka: "${question}"
 
Jibu kwa Kiswahili, kwa ufupi na uwazi, ukitumia takwimu/bidhaa halisi zilizoko juu pale inapofaa. Kama swali haliwezi kujibiwa vizuri na taarifa ulizonazo, sema hivyo kwa uwazi badala ya kubahatisha.`;

  const result = await callAISimple(prompt);
  if (result) return result;

  return "Samahani, imeshindwa kujibu swali kwa sasa (tatizo la mtandao au API quota imefikiwa). Jaribu tena baadaye.";
}

// ---- 5. Wateja waliofanyiwa Cart Re-engagement ----
async function findReEngagedCustomers(merchantId = 1) {
  const mId = parseInt(merchantId, 10);
  const reEngaged = await prisma.conversation.findMany({
    where: {
      merchantId: mId,
      reEngagedAt: { not: null },
    },
    include: {
      _count: { select: { messages: true, orders: true } },
    },
    orderBy: { reEngagedAt: "desc" },
    take: 25,
  });

  return reEngaged.map((c) => ({
    customerName: c.customerName || "Haijulikani",
    customerPhone: c.customerPhone,
    messageCount: c._count.messages,
    orderCount: c._count.orders,
    reEngagedAt: c.reEngagedAt,
  }));
}

module.exports = {
  computeBusinessStats,
  findPotentialCustomers,
  generateBusinessAdvice,
  answerBusinessQuestion,
  findReEngagedCustomers,
};
