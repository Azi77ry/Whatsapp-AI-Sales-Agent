// FALLBACK SYSTEM - Inatumika pale AI providers ZOTE zimeshindwa kufanya kazi.
// Imeboreshwa sana: inatumia database halisi, state machine ya mazungumzo,
// na mantiki ya kina inayofanana na AI ya kweli.

const prisma = require("../db/client");

// ─── Normalize text ────────────────────────────────────────────────────
function norm(t) { return (t || "").toLowerCase().trim(); }

// ─── Keyword matcher (returns true if any keyword found in text) ────────
function has(text, ...keywords) {
  const t = norm(text);
  return keywords.some(k => t.includes(k));
}

// ─── Product formatter ──────────────────────────────────────────────────
function fmtProduct(p) {
  const stockLabel = p.stock > 0 ? `✅ Ipo (${p.stock})` : `❌ Haipatikani`;
  const extras = [
    p.colors && `Rangi: ${p.colors}`,
    p.sizes && `Size: ${p.sizes}`,
  ].filter(Boolean).join(" | ");
  return `*${p.name}* — TZS ${Number(p.price).toLocaleString()}${extras ? ` | ${extras}` : ""} | ${stockLabel}`;
}

// ─── Search products from DB ────────────────────────────────────────────
async function findProducts(text, merchantId) {
  const mId = parseInt(merchantId, 10);
  const words = norm(text).split(/\s+/).filter(w => w.length > 2);
  if (!words.length) return [];
  const all = await prisma.product.findMany({ where: { merchantId: mId, isActive: true } });
  return all.filter(p => {
    const hay = `${p.name} ${p.category} ${p.description || ""}`.toLowerCase();
    return words.some(w => hay.includes(w));
  }).slice(0, 6);
}

// ─── Get all categories ─────────────────────────────────────────────────
async function getCategories(merchantId) {
  const mId = parseInt(merchantId, 10);
  const cats = await prisma.product.findMany({
    where: { merchantId: mId, isActive: true },
    select: { category: true },
    distinct: ["category"],
  });
  return cats.map(c => c.category);
}

// ─── State: read/write order-collection state from conversation.status ──
async function getState(conversationId) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true },
  });
  if (conv?.status?.startsWith("{")) {
    try { return JSON.parse(conv.status); } catch { return {}; }
  }
  return {};
}

async function setState(conversationId, obj) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: JSON.stringify(obj) },
  });
}

async function clearState(conversationId) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "active" },
  });
}

// ─── Save order/special_request to DB ──────────────────────────────────
async function saveOrder(state, conversationId, customerPhone, merchantId) {
  const mId = parseInt(merchantId, 10);
  const product = await prisma.product.findFirst({
    where: { merchantId: mId, name: { contains: state.product }, isActive: true },
  });

  if (product && product.stock >= (state.quantity || 1)) {
    const order = await prisma.order.create({
      data: {
        merchantId: mId,
        conversationId,
        customerName: state.name,
        customerPhone,
        productId: product.id,
        productName: product.name,
        quantity: state.quantity || 1,
        color: state.color || null,
        size: state.size || null,
        deliveryType: state.delivery,
        address: state.address || null,
        unitPrice: product.price,
        status: "pending",
      },
    });
    await prisma.product.update({
      where: { id: product.id },
      data: { stock: { decrement: state.quantity || 1 } },
    });
    return { type: "order", id: order.id, price: product.price };
  } else {
    // Special request
    const req = await prisma.specialRequest.create({
      data: {
        merchantId: mId,
        conversationId,
        customerName: state.name,
        customerPhone,
        productName: state.product,
        quantity: state.quantity || 1,
        color: state.color || null,
        size: state.size || null,
        deliveryType: state.delivery,
        address: state.address || null,
        status: "new",
      },
    });
    return { type: "special", id: req.id };
  }
}

// ─── MAIN FALLBACK FUNCTION ─────────────────────────────────────────────
async function fallbackReply(userMessage, conversationId, customerPhone, customerName, merchantId) {
  const msg = norm(userMessage);
  const state = await getState(conversationId);

  // ════════════════════════════════════════════════
  // STATE MACHINE: Collecting order details step-by-step
  // ════════════════════════════════════════════════
  if (state.step) {
    // Step 1: Got product name, now ask for name
    if (state.step === "ask_name") {
      await setState(conversationId, { ...state, step: "ask_delivery", name: userMessage.trim() });
      return `Asante ${userMessage.trim().split(" ")[0]}! 😊 Unataka *delivery* (tukuletee) au *pickup* (utakuja kuchukua)?`;
    }

    // Step 2: Got name, now ask delivery/pickup
    if (state.step === "ask_delivery") {
      if (has(msg, "delivery", "letea", "niletee", "tuma", "kuleta", "nipeleke")) {
        await setState(conversationId, { ...state, step: "ask_address", delivery: "delivery" });
        return `Sawa! Tuma anuani yako ya delivery (mtaa/jina la mahali) ili nikusaidie vizuri.`;
      } else if (has(msg, "pickup", "nitakuja", "nakuja", "nitachukua", "dukani", "nitapita", "kuchukua")) {
        await setState(conversationId, { ...state, step: "confirm", delivery: "pickup", address: null });
        const confirmMsg = buildConfirmMsg(state, customerName);
        return confirmMsg;
      } else {
        return `Samahani sikuelewa. Jibu tu *delivery* au *pickup*:\n- *Delivery* = Tukuletee nyumbani\n- *Pickup* = Utakuja kuchukua dukani`;
      }
    }

    // Step 3: Got delivery type, now ask address
    if (state.step === "ask_address") {
      await setState(conversationId, { ...state, step: "confirm", address: userMessage.trim() });
      const confirmMsg = buildConfirmMsg({ ...state, address: userMessage.trim() }, customerName);
      return confirmMsg;
    }

    // Step 4: Confirm — user says yes/no
    if (state.step === "confirm") {
      if (has(msg, "ndiyo", "yes", "sawa", "ok", "okay", "ndio", "naam", "kabisa", "sure", "poa", "thibitisha", "confirm", "1")) {
        const result = await saveOrder(state, conversationId, customerPhone, merchantId);
        await clearState(conversationId);
        if (result.type === "order") {
          return `✅ Oda #${result.id} imehifadhiwa!\n🛍️ ${state.product} | ${state.delivery === "pickup" ? "🏠 Pickup" : `📦 ${state.address}`}\n💰 TZS ${Number(result.price).toLocaleString()}\nAsante ${state.name?.split(" ")[0] || ""}! Tutawasiliana nawe hivi karibuni. 🎉`;
        } else {
          return `🔍 Ombi #SR-${result.id} limehifadhiwa!\n🛍️ ${state.product} | ${state.delivery === "pickup" ? "🏠 Pickup" : `📦 ${state.address}`}\nTutaitafuta sokoni na tutakujulisha bei halisi. Asante! 😊`;
        }
      } else if (has(msg, "hapana", "no", "siyo", "la", "acha", "sitaki", "cancel", "0")) {
        await clearState(conversationId);
        return `Sawa, nimefuta. Kama ukibadili mawazo niambie tu, nipo hapa! 😊`;
      } else {
        const confirmMsg = buildConfirmMsg(state, customerName);
        return `Tafadhali thibitisha kwa *ndiyo* au *hapana*:\n\n${confirmMsg}`;
      }
    }
  }

  // ════════════════════════════════════════════════
  // GREETINGS
  // ════════════════════════════════════════════════
  if (has(msg, "habari", "mambo", "hujambo", "hi", "hello", "salamu", "vipi", "shikamoo", "halo", "hey", "karibu", "salam", "niaje", "uko")) {
    const cats = await getCategories(merchantId);
    const catStr = cats.length ? `\nTuna: ${cats.join(", ")}` : "";
    const greets = [
      `Habari! 👋 Karibu *${customerName || "rafiki"}*! Nikusaidie nini leo?${catStr}`,
      `Mambo vipi ${customerName?.split(" ")[0] || ""}! 😊 Karibu sana dukani. Unatafuta nini leo?${catStr}`,
      `Karibu! Furaha kukuona. Nina bidhaa nyingi — niambie unatafuta nini.${catStr}`,
    ];
    return greets[Math.floor(Math.random() * greets.length)];
  }

  // ════════════════════════════════════════════════
  // WHAT DO YOU HAVE? / CATEGORIES
  // ════════════════════════════════════════════════
  if (has(msg, "mna nini", "mna bidhaa", "orodha", "bidhaa zote", "bidhaa gani", "mnauza nini", "mnauza", "kategori", "categories", "mna")) {
    const cats = await getCategories(merchantId);
    if (cats.length) {
      return `Dukani kwetu tuna:\n${cats.map(c => `• ${c}`).join("\n")}\n\nNiambie unataka category gani nikukuorodheshee zaidi! 😊`;
    }
    return `Tuna bidhaa mbalimbali dukani. Niambie unatafuta nini (mfano: Jezi, Simu, Laptop) nami nikutafutie!`;
  }

  // ════════════════════════════════════════════════
  // PRODUCT SEARCH — specific product mentioned
  // ════════════════════════════════════════════════
  if (has(msg, "natafuta", "ninahitaji", "ninaomba", "nataka", "nipe", "niletee", "ninaomba", "ninahitaji", "uko na", "mna", "kuna")) {
    const products = await findProducts(userMessage, merchantId);
    if (products.length) {
      const list = products.map(fmtProduct).join("\n");
      await setState(conversationId, { step: "ask_name", product: products[0].name });
      return `Nimeona hizi dukani:\n\n${list}\n\nUnataka ipi? Niambie ili nikuandalie oda! 👇`;
    } else {
      // Not in DB — still collect info for special request
      const productKeywords = userMessage.replace(/nataka|ninahitaji|ninaomba|nipe|niletee|ninataka/gi, "").trim();
      await setState(conversationId, { step: "ask_name", product: productKeywords || userMessage.trim() });
      return `Sawa, *${productKeywords || userMessage.trim()}* — tutaitafuta sokoni kwa ajili yako! 💪\n\nJina lako nani ili nikusaidie vizuri?`;
    }
  }

  // ════════════════════════════════════════════════
  // GENERAL PRODUCT SEARCH (no clear buy intent but mentions a product name)
  // ════════════════════════════════════════════════
  const products = await findProducts(userMessage, merchantId);
  if (products.length) {
    const list = products.map(fmtProduct).join("\n");
    return `Kuhusu unavyouliza, hizi ndizo bidhaa tunazo:\n\n${list}\n\nUnataka kununua? Niambie! 😊`;
  }

  // ════════════════════════════════════════════════
  // PRICE QUESTIONS
  // ════════════════════════════════════════════════
  if (has(msg, "bei", "pesa", "shilingi", "tzs", "gharama", "ngapi", "kiasi", "punguzo", "discount")) {
    return `Bei inategemea bidhaa unayotaka. Niambie *jina la bidhaa* nami nikuambie bei halisi! 💰`;
  }

  // ════════════════════════════════════════════════
  // DELIVERY / LOCATION QUESTIONS
  // ════════════════════════════════════════════════
  if (has(msg, "delivery", "nipeleke", "niletee", "peleka", "tuma", "utaleta", "mnafikia", "mnafikia wapi", "mnafika", "location")) {
    return `Tunafanya delivery sehemu nyingi! 🚚 Gharama inategemea umbali wako.\nNiambie uko wapi na nitakuambia gharama halisi.`;
  }

  // ════════════════════════════════════════════════
  // PICKUP QUESTIONS
  // ════════════════════════════════════════════════
  if (has(msg, "pickup", "nitakuja", "nakuja", "nitachukua", "dukani", "ninaweza kuja", "ninaweza kufika")) {
    return `Karibu sana dukani! 🏠 Tutakusubiri. Bidhaa yako itakuwa tayari inakusubiria.\nUnataka kununua nini? Niambie niihifadhie kwako!`;
  }

  // ════════════════════════════════════════════════
  // THANKS / GOODBYE
  // ════════════════════════════════════════════════
  if (has(msg, "asante", "shukrani", "ahsante", "thanks", "thank you", "sawa asante", "poa asante")) {
    return `Karibu sana! 😊 Furaha kukusaidia. Rudi wakati wowote! 🙏`;
  }

  if (has(msg, "kwaheri", "bye", "baadaye", "tutaonana", "nakwenda", "naenda")) {
    return `Kwaheri! 👋 Karibu tena wakati wowote. Tutakufurahia! 😊`;
  }

  // ════════════════════════════════════════════════
  // YES/NO standalone (after something was asked)
  // ════════════════════════════════════════════════
  if (has(msg, "ndiyo", "yes", "sawa", "ndio", "naam", "kabisa", "poa", "ok")) {
    return `Vizuri! 😊 Niambie zaidi — unataka kununua nini au nikusaidie na nini?`;
  }

  if (has(msg, "hapana", "no", "siyo", "la", "sitaki")) {
    return `Sawa kabisa! Kama ukibadili mawazo, nipo hapa muda wowote. 😊`;
  }

  // ════════════════════════════════════════════════
  // WHO ARE YOU / IDENTITY
  // ════════════════════════════════════════════════
  if (has(msg, "wewe ni nani", "jina lako", "who are you", "nani wewe", "mtu au ai", "robot", "bot")) {
    return `Mimi ni AI Sales Agent wa duka hili, nilijengwa kusaidia wateja haraka na urahisi. 🤖\nNikusaidie kununua bidhaa, kuuliza bei, au kitu kingine?`;
  }

  // ════════════════════════════════════════════════
  // HOW ARE YOU / FEELINGS
  // ════════════════════════════════════════════════
  if (has(msg, "uko sawa", "hali yako", "u sawa", "how are you", "unaendaje", "unakuwaje", "u freshi", "u poa", "uko freshi", "uko poa")) {
    const replies = [
      `Niko sawa kabisa, asante! 😊 Niko hapa nikusubiria. Nikusaidie nini leo?`,
      `Poa kabisa! 💪 Tayari kukusaidia. Unatafuta bidhaa gani?`,
      `Niko fresh! 😄 Wewe je? Karibu dukani — nikusaidie nini?`,
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  // ════════════════════════════════════════════════
  // COMPLIMENTS
  // ════════════════════════════════════════════════
  if (has(msg, "vizuri", "umefanya vizuri", "good job", "unajibu vizuri", "unapendeza", "unafahamu", "smart", "akili", "hongera", "bravo", "perfect")) {
    return `Asante sana! 😊 Ninajaribu kadri niwezavyo kukusaidia. Kuna bidhaa unayotaka kukuuliza au kununua?`;
  }

  // ════════════════════════════════════════════════
  // JOKES / FUN
  // ════════════════════════════════════════════════
  if (has(msg, "nichekesha", "jokes", "mzaha", "chekesha", "ucheshi", "funny", "haha", "lol", "😂", "joke")) {
    const jokes = [
      `😄 Haha! Sawa, hii ni ya bure: Muuzaji akimwambia mteja "Bei ni TZS 10,000" — mteja akajibu "Na kwa marafiki?" — muuzaji akasema "Marafiki wangu hawananunui!" 😂\n\nSawa sawa, unataka bidhaa gani leo?`,
      `😂 Muuza simu akasema: "Simu hii ina battery nzuri" — mteja akauliza: "Inachaji haraka?" — muuzaji: "Ndiyo! Unaweza kuichaji na macho tu ukiitazama!" 🤣\n\nHaha, sawa! Nikusaidie nini leo?`,
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  // ════════════════════════════════════════════════
  // SPORTS / FOOTBALL
  // ════════════════════════════════════════════════
  if (has(msg, "mpira", "football", "soccer", "simba", "yanga", "arsenal", "manchester", "barcelona", "chelsea", "real madrid", "liverpool", "mechi", "ligi", "fifa", "ucl", "champions")) {
    const replies = [
      `⚽ Haha, mpira! Naipenda pia. Lakini mimi ni bora zaidi kwenye kuuza bidhaa kuliko kucheza! 😄\n\nNa kwa kuongea — tuna jezi za timu nyingi! Unataka jezi ya timu gani?`,
      `⚽ Mpira ni msisimko! Lakini kazi yangu ni kukusaidia ununue vizuri. Tuna jezi za timu nyingi dukani! Unapenda timu gani?`,
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }

  // ════════════════════════════════════════════════
  // WEATHER / RANDOM TOPICS
  // ════════════════════════════════════════════════
  if (has(msg, "hali ya hewa", "mvua", "jua", "baridi", "weather", "joto")) {
    return `😄 Hali ya hewa mimi siijui vizuri, niulize Google! Lakini ninajua vizuri bidhaa za dukani hili. Nikusaidie nini leo?`;
  }

  // ════════════════════════════════════════════════
  // HELP / WHAT CAN YOU DO
  // ════════════════════════════════════════════════
  if (has(msg, "nikusaidie", "unaweza nini", "help", "msaada", "usaidizi", "naweza", "unajua nini", "fanya nini")) {
    const cats = await getCategories(merchantId);
    const catStr = cats.length ? `\n\nTuna: *${cats.join(", ")}*` : "";
    return `Naweza kukusaidia na haya:${catStr}\n\n• 🛍️ Kutafuta bidhaa na bei\n• 📦 Kuagiza na kuhifadhi oda yako\n• 🚚 Maelezo ya delivery\n• ❓ Maswali yoyote kuhusu duka\n\nUliza tu! 😊`;
  }

  // ════════════════════════════════════════════════
  // WAIT / DELAYED RESPONSE
  // ════════════════════════════════════════════════
  if (has(msg, "sawa", "ok", "okay", "poa", "got it", "nimeelewa", "sawa sawa")) {
    return `Vizuri! 😊 Kama una swali au unataka kununua kitu — nipo hapa!`;
  }

  // ════════════════════════════════════════════════
  // SHORT/UNCLEAR messages (emojis only, single word, etc.)
  // ════════════════════════════════════════════════
  if (msg.length <= 5 || /^[\p{Emoji}\s]+$/u.test(msg)) {
    const cats = await getCategories(merchantId);
    const catStr = cats.length ? ` Tuna: *${cats.join(", ")}*.` : "";
    return `Karibu! 😊${catStr} Niambie unataka nini nikuisaidie!`;
  }

  // ════════════════════════════════════════════════
  // DEFAULT — smart, never a dead end
  // ════════════════════════════════════════════════
  const cats = await getCategories(merchantId);
  const catStr = cats.length ? `\nTuna: *${cats.join(", ")}*` : "";
  const defaults = [
    `Nimesikia! 😊 Kama unatafuta bidhaa fulani niambie tu jina lake — nitakutafutia mara moja.${catStr}`,
    `Asante kwa kuwasiliana! Nikusaidie na nini leo? Unataka bidhaa au una swali?${catStr}`,
    `Karibu! Niambie unataka nini — niko tayari kukusaidia. 💪${catStr}`,
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

// ─── Helper: Build confirmation message ────────────────────────────────
function buildConfirmMsg(state, customerName) {
  const lines = [
    `Kabla sijaendelea, thibitisha:`,
    `👤 Jina: *${state.name || customerName || "—"}*`,
    `🛍️ Bidhaa: *${state.product || "—"}*`,
    state.color ? `🎨 Rangi: *${state.color}*` : null,
    state.size ? `📐 Size: *${state.size}*` : null,
    `📦 Aina: *${state.delivery === "pickup" ? "Pickup (Utakuja)" : "Delivery"}*`,
    state.address ? `📍 Anuani: *${state.address}*` : null,
    `\nJibu *ndiyo* kukubali au *hapana* kubatilisha.`,
  ].filter(Boolean);
  return lines.join("\n");
}

// ─── Init (no-op now, kept for backward compat) ────────────────────────
async function initFallbackNLP() {
  console.log("✅ Smart Fallback System iko tayari (database-powered).");
}

module.exports = { fallbackReply, initFallbackNLP };
