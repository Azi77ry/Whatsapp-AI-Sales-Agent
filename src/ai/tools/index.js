// Hizi ni "tools" (function calling) ambazo AI inaweza kuita
// badala ya kubahatisha majibu kuhusu bidhaa, bei, stock, au kutengeneza oda.
// Imeboreshwa kwa Multi-Tenant SaaS: Inachuja na kuhifadhi data kulingana na merchantId ya duka.

const { SchemaType } = require("@google/generative-ai");
const prisma = require("../../db/client");

// ---- 1. Schema za tools (zinazotumwa kwa Gemini API) ----
const toolDefinitions = [
  {
    name: "search_products",
    description:
      "Tafuta bidhaa kwenye database kwa jina au category (mfano: 'Jezi', 'Simu', 'Laptop'). Taarifa inayorudishwa inajumuisha bidhaa zilizopo stock NA zile zilizo out-of-stock (inStock: false). Tumia hii KWANZA kabla ya kumjibu mteja chochote kuhusu bidhaa - ikionyesha bidhaa zilizopo dukani zetu, halafu AI inaweza pia kutaja bidhaa nyingine za soko zinazofanana.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description:
            "Neno la kutafutia - jina la bidhaa au category, mfano 'jezi' au 'samsung'",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_all_categories",
    description:
      "Pata orodha ya categories zote za bidhaa zilizopo dukani. Tumia hii mteja akiuliza 'mna bidhaa gani' kwa ujumla.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: "create_order",
    description:
      "Tengeneza oda mpya kwa bidhaa ILIYOPO kwenye database (ina stock). Tumia hii tu kama search_products ilirudisha bidhaa yenye inStock: true. Kama bidhaa haipo DB au haina stock, tumia badala yake 'create_special_request'.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        customerName: { type: SchemaType.STRING, description: "Jina la mteja" },
        productName: { type: SchemaType.STRING, description: "Jina la bidhaa anayonunua" },
        quantity: { type: SchemaType.INTEGER, description: "Idadi anayotaka, default 1" },
        color: { type: SchemaType.STRING, description: "Rangi aliyochagua, kama ipo" },
        size: { type: SchemaType.STRING, description: "Size aliyochagua, kama ipo" },
        deliveryType: {
          type: SchemaType.STRING,
          format: "enum",
          enum: ["delivery", "pickup"],
          description: "Je, mteja anataka delivery au pickup",
        },
        address: {
          type: SchemaType.STRING,
          description: "Anuani ya delivery - lazima ijazwe kama deliveryType ni 'delivery'",
        },
      },
      required: ["customerName", "productName", "deliveryType"],
    },
  },
  {
    name: "create_special_request",
    description:
      "Hifadhi ombi la mteja kwa bidhaa ambayo HAIPO kwenye database yetu au haina stock. Tumia hii badala ya kusema 'bidhaa haipo' — mfumo wetu ni kama wakala wa Kariakoo: tunakubali ombi lolote na tunatafuta bidhaa sokoni. Lazima ukusanye jina la mteja, bidhaa anayotaka, delivery type, na anuani (kama delivery) kabla ya kuita tool hii. estimatedPrice ni bei ya soko unayoijua kwa ujuzi wako (ukadiriaji tu).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        customerName: { type: SchemaType.STRING, description: "Jina la mteja" },
        productName: {
          type: SchemaType.STRING,
          description: "Jina kamili la bidhaa aliyoomba (kama alivyosema mteja)",
        },
        quantity: { type: SchemaType.INTEGER, description: "Idadi anayotaka, default 1" },
        color: { type: SchemaType.STRING, description: "Rangi/model aliyoomba, kama ipo" },
        size: { type: SchemaType.STRING, description: "Size aliyoomba, kama ipo" },
        deliveryType: {
          type: SchemaType.STRING,
          format: "enum",
          enum: ["delivery", "pickup"],
          description: "Je, mteja anataka delivery au pickup",
        },
        address: {
          type: SchemaType.STRING,
          description: "Anuani ya delivery, kama deliveryType ni 'delivery'",
        },
        notes: {
          type: SchemaType.STRING,
          description:
            "Maelezo ya ziada kutoka mteja: specs, model number, rangi nyingine, budget, n.k",
        },
        estimatedPrice: {
          type: SchemaType.NUMBER,
          description:
            "Bei ya soko unayoijua kwa ujuzi wako wa jumla (ukadiriaji tu, kwa TZS). Weka 0 kama hujui kabisa.",
        },
      },
      required: ["customerName", "productName", "deliveryType"],
    },
  },
];

// ---- 2. Utekelezaji halisi wa kila tool ----

async function searchProducts({ query, merchantId = 1 }) {
  const mId = parseInt(merchantId, 10);
  // Tumia search ya case-insensitive: jaribu query asili NA ya lowercase
  const queryLower = query.toLowerCase();
  const queryTitle = query.charAt(0).toUpperCase() + query.slice(1).toLowerCase();

  const products = await prisma.product.findMany({
    where: {
      merchantId: mId, // SaaS filtering
      isActive: true,
      OR: [
        { name: { contains: query } },
        { name: { contains: queryLower } },
        { name: { contains: queryTitle } },
        { category: { contains: query } },
        { category: { contains: queryLower } },
        { category: { contains: queryTitle } },
        { description: { contains: query } },
        { description: { contains: queryLower } },
      ],
    },
    take: 10,
    orderBy: { stock: "desc" },
  });

  if (products.length === 0) {
    return {
      found: false,
      message: `Hakuna bidhaa inayofanana na "${query}" kwenye stock yetu. Tumia create_special_request kukusanya ombi la mteja.`,
    };
  }

  return {
    found: true,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      stock: p.stock,
      inStock: p.stock > 0,
      colors: p.colors ? p.colors.split(",") : null,
      sizes: p.sizes ? p.sizes.split(",") : null,
      description: p.description,
      imageUrl: p.imageUrl || null,
    })),
  };
}

async function getAllCategories({ merchantId = 1 }) {
  const mId = parseInt(merchantId, 10);
  const categories = await prisma.product.findMany({
    where: { merchantId: mId, isActive: true }, // SaaS filtering
    select: { category: true },
    distinct: ["category"],
  });
  return { categories: categories.map((c) => c.category) };
}

async function createOrder({
  customerName,
  productName,
  quantity = 1,
  color,
  size,
  deliveryType,
  address,
  conversationId,
  customerPhone,
  merchantId = 1,
}) {
  const mId = parseInt(merchantId, 10);

  // ULINZI: Angalia oda ya duplicate (dakika 30 zilizopita)
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const existingOrder = await prisma.order.findFirst({
    where: {
      merchantId: mId, // SaaS filtering
      conversationId,
      productName: { contains: productName },
      createdAt: { gte: thirtyMinutesAgo },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingOrder) {
    return {
      success: true,
      duplicate: true,
      orderId: existingOrder.id,
      message: `Oda ya "${existingOrder.productName}" tayari ipo (Oda #${existingOrder.id}). USITENGENEZE oda nyingine.`,
    };
  }

  // Tafuta product kwenye DB
  const product = await prisma.product.findFirst({
    where: { merchantId: mId, name: { contains: productName }, isActive: true },
  });

  if (product && product.stock < quantity) {
    return {
      success: false,
      message: `Stock ya "${product.name}" imebaki ${product.stock} tu. Fikiria kutumia create_special_request badala yake.`,
    };
  }

  if (deliveryType === "delivery" && !address) {
    return {
      success: false,
      message: "Address inahitajika kwa delivery. Muulize mteja anuani yake kwanza.",
    };
  }

  const order = await prisma.order.create({
    data: {
      merchantId: mId, // SaaS field
      conversationId,
      customerName,
      customerPhone,
      productId: product ? product.id : null,
      productName: product ? product.name : productName,
      quantity,
      color: color || null,
      size: size || null,
      deliveryType,
      address: address || null,
      unitPrice: product ? product.price : null,
      status: "pending",
    },
  });

  // Punguza stock kama product ipo
  if (product) {
    await prisma.product.update({
      where: { id: product.id },
      data: { stock: { decrement: quantity } },
    });
  }

  // Hakikisha UI na LLM inajua oda imetengenezwa mara moja bila kusubiri compaction
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (conv) {
    const newSummary = (conv.contextSummary ? conv.contextSummary + "\n" : "") + `✅ ODA MPYA: ${productName} (Oda #${order.id})`;
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { contextSummary: newSummary }
    });
  }

  return {
    success: true,
    orderId: order.id,
    message: `Oda #${order.id} imehifadhiwa kikamilifu.`,
  };
}

async function createSpecialRequest({
  customerName,
  productName,
  quantity = 1,
  color,
  size,
  deliveryType,
  address,
  notes,
  estimatedPrice,
  conversationId,
  customerPhone,
  merchantId = 1,
}) {
  const mId = parseInt(merchantId, 10);

  if (deliveryType === "delivery" && !address) {
    return {
      success: false,
      message: "Address inahitajika kwa delivery. Muulize mteja anuani yake kwanza.",
    };
  }

  // Angalia kama ombi la bidhaa hii tayari lipo (dakika 30 zilizopita)
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const existingRequest = await prisma.specialRequest.findFirst({
    where: {
      merchantId: mId, // SaaS filtering
      conversationId,
      productName: { contains: productName },
      createdAt: { gte: thirtyMinutesAgo },
    },
  });

  if (existingRequest) {
    return {
      success: true,
      duplicate: true,
      requestId: existingRequest.id,
      message: `Ombi la "${productName}" tayari limehifadhiwa (Ombi #${existingRequest.id}). Mwambie mteja tutawasiliana naye hivi karibuni.`,
    };
  }

  const request = await prisma.specialRequest.create({
    data: {
      merchantId: mId, // SaaS field
      conversationId,
      customerName,
      customerPhone,
      productName,
      quantity,
      color: color || null,
      size: size || null,
      deliveryType,
      address: address || null,
      notes: notes || null,
      estimatedPrice: estimatedPrice && estimatedPrice > 0 ? estimatedPrice : null,
      status: "new",
    },
  });

  console.log(`🔍 Merchant #${mId} - Ombi Jipya la Bidhaa: ${productName} kutoka ${customerName} (${customerPhone}) — Ombi #${request.id}`);

  // Hakikisha UI na LLM inajua ombi limetengenezwa mara moja
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (conv) {
    const newSummary = (conv.contextSummary ? conv.contextSummary + "\n" : "") + `🔍 OMBI MAALUM: ${productName} (Ombi #${request.id})`;
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { contextSummary: newSummary }
    });
  }

  return {
    success: true,
    requestId: request.id,
    message: `Ombi #${request.id} la "${productName}" limehifadhiwa kikamilifu. Muuzaji ataitafuta bidhaa hii sokoni na atawasiliana na mteja hivi karibuni.`,
    estimatedPrice: request.estimatedPrice,
  };
}

// ---- 3. Router ya kuita function husika kwa jina la tool ----
async function executeTool(toolName, input, context) {
  // Changanya context ili merchantId ipatikane kwenye parameter zote
  const payload = { ...input, ...context };

  switch (toolName) {
    case "search_products":
      return searchProducts(payload);
    case "get_all_categories":
      return getAllCategories(payload);
    case "create_order":
      return createOrder(payload);
    case "create_special_request":
      return createSpecialRequest(payload);
    default:
      return { error: `Tool isiyojulikana: ${toolName}` };
  }
}

module.exports = { toolDefinitions, executeTool };
