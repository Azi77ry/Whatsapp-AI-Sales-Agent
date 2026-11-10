const Baileys = require("@whiskeysockets/baileys");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} = Baileys;
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const path = require("path");
const fs = require("fs");
const prisma = require("../db/client");
const { handleIncomingMessage } = require("./messageHandler");
const { enqueueSend, invalidateState } = require("./sendQueue");

// Safely define makeInMemoryStore for Baileys v6.7+ compatibility
let makeInMemoryStore = Baileys.makeInMemoryStore;
if (typeof makeInMemoryStore !== "function") {
  makeInMemoryStore = ({ logger } = {}) => {
    const chats = new Map();
    const messages = new Map();
    const contacts = new Map();

    return {
      chats,
      messages,
      contacts,
      bind: (ev) => {
        ev.on("messages.upsert", ({ messages: newMsgs }) => {
          for (const msg of newMsgs || []) {
            if (!msg.key || !msg.key.remoteJid || !msg.key.id) continue;
            const jid = msg.key.remoteJid;
            if (!messages.has(jid)) messages.set(jid, new Map());
            messages.get(jid).set(msg.key.id, msg);
          }
        });
      },
      loadMessage: async (jid, id) => {
        return messages.get(jid)?.get(id);
      },
      toJSON: () => ({}),
      readFromFile: (filePath) => {},
      writeToFile: (filePath) => {}
    };
  };
}

const SESSION_BASE_DIR = path.join(__dirname, "../../sessions");

// Ramani ya kuhifadhi sessions hai za WhatsApp
const activeSessions = new Map();

// STORE: Hifadhi ya ndani kwa ajili ya kutatua matatizo ya @lid (Error 463)
const stores = new Map();

// Hifadhi ya muda ya hali ya muunganiko kwa kila merchant
const connectionStatuses = new Map();

// Hifadhi ya kama bot ipo active au imezimwa kwa kila merchant
const botActiveStatuses = new Map();

// Map/Set ya kufuata merchants walio kwenye mchakato wa kuingiza Pairing Code
const pairingPendingMerchants = new Set();

// 🛡️ ANTI-BAN: Kuhesabu idadi ya kujaribu kuunganika tena (Exponential Backoff)
const reconnectAttempts = new Map();
const MAX_RECONNECT_ATTEMPTS = 10;

// 🛡️ ANTI-BAN: Kikomo cha ujumbe wa siku na warm-up sasa vipo kwenye sendQueue.js
// (vinahifadhiwa kwenye database ili visipotee server ikiwashwa upya)

/**
 * Hifadhi kwenye DB kwamba namba imefungiwa (403) ili isiunganishwe tena kiotomatiki baada ya restart
 */
async function markBanned(mId, banned) {
  try {
    await prisma.merchant.update({
      where: { id: mId },
      data: banned ? { waBanned: true, waBannedAt: new Date() } : { waBanned: false, waBannedAt: null },
    });
    invalidateState(mId);
  } catch (err) {
    console.error(`Kosa la kuhifadhi hali ya ban (Merchant #${mId}):`, err.message);
  }
}

/**
 * Baada ya kuunganika: hifadhi namba iliyounganishwa na tarehe iliyounganishwa (kwa ajili ya warm-up).
 * Namba mpya (au namba tofauti na ya awali) inaanza warm-up upya.
 */
async function recordLinkedNumber(mId, sock, sessionDir) {
  try {
    const waPhone = (sock?.user?.id || "").split(":")[0].split("@")[0] || null;
    const merchant = await prisma.merchant.findUnique({
      where: { id: mId },
      select: { waLinkedAt: true, waPhone: true, waBanned: true },
    });
    if (!merchant) return;

    const data = {};
    if (merchant.waBanned) {
      // Imeunganika tena kwa mafanikio - kwa hiyo haijafungiwa tena (mf. rufaa imekubaliwa au namba mpya)
      data.waBanned = false;
      data.waBannedAt = null;
    }
    if (!merchant.waLinkedAt || (waPhone && merchant.waPhone !== waPhone)) {
      // Tumia tarehe creds.json ilipoundwa - kwa sessions za zamani hii inaonyesha zilipounganishwa kweli
      let linkedAt = new Date();
      try {
        const stat = fs.statSync(path.join(sessionDir, "creds.json"));
        if (stat.birthtimeMs > 0) linkedAt = stat.birthtime;
      } catch (_) {}
      if (merchant.waPhone && waPhone && merchant.waPhone !== waPhone) linkedAt = new Date();
      data.waLinkedAt = linkedAt;
      data.waPhone = waPhone;
    }
    if (Object.keys(data).length > 0) {
      await prisma.merchant.update({ where: { id: mId }, data });
      invalidateState(mId);
    }
  } catch (err) {
    console.error(`Kosa la kuhifadhi namba iliyounganishwa (Merchant #${mId}):`, err.message);
  }
}

/**
 * Pata hali ya sasa ya muunganiko wa WhatsApp ya merchant
 */
function getConnectionStatus(merchantId) {
  if (!connectionStatuses.has(merchantId)) {
    connectionStatuses.set(merchantId, { status: "disconnected", qr: null });
  }
  const status = connectionStatuses.get(merchantId);
  const botActive = botActiveStatuses.has(merchantId) ? botActiveStatuses.get(merchantId) : true;
  return { ...status, botActive };
}

/**
 * Weka hali ya muunganiko wa WhatsApp ya merchant
 */
function setConnectionStatus(merchantId, status, qr = null) {
  connectionStatuses.set(merchantId, { status, qr });
}

/**
 * Wezesha au zima bot kwa merchant
 */
function setBotActive(merchantId, active) {
  const mId = parseInt(merchantId, 10);
  botActiveStatuses.set(mId, active);
  // V2: hifadhi kwenye DB ili isirudi "on" kila server ikiwashwa upya
  prisma.merchant
    .update({ where: { id: mId }, data: { botActive: Boolean(active) } })
    .catch((err) => console.error(`Kosa la kuhifadhi botActive (Merchant #${mId}):`, err.message));
}

/** Pakia hali za bot on/off kutoka DB (wakati wa kuanza, au kwenye process ya cron) */
async function loadBotStates() {
  const rows = await prisma.merchant.findMany({ select: { id: true, botActive: true } });
  for (const r of rows) botActiveStatuses.set(r.id, r.botActive);
}

/**
 * Angalia kama bot ipo active kwa merchant
 */
function isBotActive(merchantId) {
  const mId = parseInt(merchantId, 10);
  return botActiveStatuses.has(mId) ? botActiveStatuses.get(mId) : true;
}

/** V2: merchant aliye kwenye Cloud API hahudumiwi na Baileys (namba moja = adapter moja) */
async function isOnCloudApi(mId) {
  try {
    return await require("../integrations/whatsapp/connectionService").merchantUsesCloudApi(mId);
  } catch (err) {
    console.error(`Kosa la kuangalia Cloud API (Merchant #${mId}):`, err.message);
    return false;
  }
}

/**
 * Anzisha muunganiko wa WhatsApp kwa merchant mmoja
 */
async function startSession(merchantId) {
  const mId = parseInt(merchantId, 10);
  console.log(`📱 Anzisha WhatsApp Session kwa Merchant #${mId}...`);

  // Kama tayari ipo active, usianzishe upya
  if (activeSessions.has(mId)) {
    console.log(`⚠️  Session kwa Merchant #${mId} tayari ipo hai.`);
    return activeSessions.get(mId);
  }

  if (await isOnCloudApi(mId)) {
    console.warn(`☁️  Merchant #${mId} yupo kwenye WhatsApp Cloud API - Baileys session haitaanzishwa.`);
    return null;
  }

  setConnectionStatus(mId, "connecting");

  const sessionDir = path.join(SESSION_BASE_DIR, `merchant_${mId}`);
  
  // HAKIKISHA FOLDER LIPO ILI KUZUIA ENOENT ERROR KWENYE STORE
  const fs = require('fs');
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();
  
  // Hifadhi ya ndani (Store) kutatua Error 463 ya @lid
  if (!stores.has(merchantId)) {
    const store = makeInMemoryStore({ logger: pino({ level: "silent" }) });
    
    const storePath = path.join(sessionDir, 'baileys_store_multi.json');
    try {
      store.readFromFile(storePath);
    } catch (e) {} // It's fine if it doesn't exist yet

    // FIX: Optimized store write to prevent I/O DoS.
    // We bind a function to write the store periodically ONLY if it changed, 
    // or we just write it on graceful shutdown. For Baileys, we'll write it on disconnect.
    store.writeToFile = () => {
      try {
        if (fs.existsSync(sessionDir)) {
          const fs = require('fs');
          fs.writeFileSync(storePath, JSON.stringify(store.toJSON()));
        }
      } catch (e) {}
    };
    
    stores.set(merchantId, store);
  }
  const store = stores.get(merchantId);

  const msgRetryCounterCache = new Map(); // Njia mbadala ya NodeCache

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }), // Punguza noise ya logs
    printQRInTerminal: false,
    msgRetryCounterCache,
    generateHighQualityLinkPreview: false, // 🛡️ ANTI-BAN: Zima link preview - inasababisha spam detection
    // 🛡️ ANTI-BAN: Tumia macOS Safari fingerprint - inafanana zaidi na mtumiaji wa kawaida
    browser: ["WhatsApp Sales Bot", "Safari", "17.0"],
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000, // 🛡️ ANTI-BAN: Piga ping polepole zaidi (25s badala ya 10s)
    markOnlineOnConnect: false, // Usionyeshe "online" muda wote - simu ya mmiliki iendelee kupata notifications
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    retryRequestDelayMs: 2000, // Subiri kati ya maombi ya retry
    getMessage: async (key) => {
      if (store) {
        const msg = await store.loadMessage(key.remoteJid, key.id);
        return msg?.message || undefined;
      }
      return { conversation: "..." };
    }
  });

  // Unganisha store na socket
  store.bind(sock.ev);

  activeSessions.set(mId, sock);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      if (!pairingPendingMerchants.has(mId)) {
        console.log(`⚙️ QR code mpya tayari kwa Merchant #${mId}`);
        setConnectionStatus(mId, "qr", qr);
      } else {
        console.log(`⚙️ Merchant #${mId} yupo kwenye Pairing Mode - inapuuza QR code update.`);
      }
    }

    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      const isRegistered = !isLoggedOut && Boolean(sock?.authState?.creds?.registered || sock?.authState?.creds?.me || sock?.authState?.creds?.account);
      const isPairingPending = pairingPendingMerchants.has(mId);

      // 🛡️ ANTI-BAN: Gundua kama namba imefungiwa/kusimamishwa na WhatsApp
      // Status 401 = Logged Out, 403 = Forbidden/Banned, 440 = Replaced by another session
      const isBanned = statusCode === 403;
      const isReplaced = statusCode === 440; // Mtu mwingine ameingia kwenye namba hii

      console.log(`🔌 Muunganiko wa Merchant #${mId} umekatika (Status Code: ${statusCode}, Registered: ${isRegistered}, Banned: ${isBanned}, Replaced: ${isReplaced}).`);

      activeSessions.delete(mId);
      
      // Save store before reconnecting/cleaning up
      const store = stores.get(merchantId);
      if (store && store.writeToFile) {
         store.writeToFile();
      }

      // 🚨 KAMA NAMBA IMEFUNGIWA (403) — USIJARIBU KUUNGANIKA TENA!
      if (isBanned) {
        console.error(`🚫 MERCHANT #${mId} AMEFUNGIWA NA WHATSAPP (Status 403)! Inasimamisha bot otomatiki.`);
        setConnectionStatus(mId, "banned");
        setBotActive(mId, false); // Zima bot otomatiki
        reconnectAttempts.delete(mId);
        await markBanned(mId, true); // Hifadhi kwenye DB ili isiunganishwe tena baada ya restart
        return;
      }

      // 🚨 KAMA SESSION IMECHUKULIWA NA KIFAA KINGINE (440)
      if (isReplaced) {
        console.warn(`⚠️ Merchant #${mId} - Session imechukuliwa na kifaa kingine! Inasimamisha...`);
        setConnectionStatus(mId, "disconnected");
        reconnectAttempts.delete(mId);
        return;
      }

      if (isRegistered) {
        // 🛡️ ANTI-BAN: Exponential Backoff — kila kujaribu tena kunaongeza muda
        const attempts = (reconnectAttempts.get(mId) || 0) + 1;
        reconnectAttempts.set(mId, attempts);

        if (attempts > MAX_RECONNECT_ATTEMPTS) {
          console.error(`❌ Merchant #${mId} - Imeshindwa kuunganika tena mara ${MAX_RECONNECT_ATTEMPTS}. Inaacha kujaribu.`);
          setConnectionStatus(mId, "disconnected");
          reconnectAttempts.delete(mId);
          return;
        }

        // Delay ya exponential: 5s, 10s, 20s, 40s, 80s... (max 5 dakika)
        const baseDelay = Math.min(300000, 5000 * Math.pow(2, attempts - 1));
        const jitter = Math.floor(Math.random() * 3000); // Ongeza nasibu 0-3s
        const reconnectDelay = baseDelay + jitter;
        
        setConnectionStatus(mId, "connecting");
        console.log(`⏳ Merchant #${mId} - Jaribio #${attempts}/${MAX_RECONNECT_ATTEMPTS}: Itaunganika tena baada ya sekunde ${Math.round(reconnectDelay/1000)}...`);
        setTimeout(() => {
          startSession(mId).catch((err) => console.error(`Error reconnecting Merchant #${mId}:`, err));
        }, reconnectDelay);
      } else if (isPairingPending) {
        // WAKATI WA PAIRING CODE: Socket inajifunga kiotomatiki baada ya kutoa code ili kusubiri simu.
        // USIANZISHE socket mpya ya QR! Subiri tu mteja aingize code kwenye simu yake.
        console.log(`⏳ Merchant #${mId} yupo kwenye mchakato wa Pairing Code. Inasubiri simu ithibitishe...`);
        setConnectionStatus(mId, "connecting");
      } else {
        console.log(`❌ Merchant #${mId} ametoka kwenye akaunti (logged out). Inasafisha folda la session.`);
        setConnectionStatus(mId, "disconnected");
        reconnectAttempts.delete(mId);
        // Futa faili za session ili kuruhusu login upya tu kama hajasajiliwa
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (e) {
          console.error("Kosa la kufuta faili za session:", e.message);
        }
      }
    } else if (connection === "open") {
      console.log(`✅ Merchant #${mId} ameunganishwa na WhatsApp kikamilifu!`);
      pairingPendingMerchants.delete(mId);
      reconnectAttempts.delete(mId); // Reset reconnect counter baada ya kuunganika
      setConnectionStatus(mId, "connected");
      recordLinkedNumber(mId, sock, sessionDir);
    }
  });

  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
      // Kama creds zimesajiliwa mpya kutoka kwenye pairing code (creds.registered === true au creds.me ipo)
      const isNowRegistered = Boolean(sock?.authState?.creds?.registered || sock?.authState?.creds?.me);
      if (isNowRegistered && !activeSessions.has(mId)) {
        console.log(`🎉 Pairing imefanikiwa kwa Merchant #${mId}! Inazindua session iliyosajiliwa...`);
        pairingPendingMerchants.delete(mId);
        startSession(mId).catch(console.error);
      }
    } catch (err) {
      console.error(`Kosa la kuhifadhi creds kwa Merchant #${mId}:`, err);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        await handleIncomingMessage(sock, msg, mId);
      } catch (err) {
        console.error(`Hitilafu ya kushughulikia ujumbe (Merchant #${mId}):`, err);
      }
    }
  });

  return sock;
}

/**
 * Zima session ya WhatsApp kwa merchant mmoja
 */
async function stopSession(merchantId, logout = false) {
  const mId = parseInt(merchantId, 10);
  const sock = activeSessions.get(mId);

  if (sock) {
    try {
      if (logout) {
        await sock.logout();
      } else {
        sock.end();
      }
    } catch (e) {
      console.error(`Hitilafu wakati wa kufunga socket (Merchant #${mId}):`, e.message);
    }
    activeSessions.delete(mId);
  }
  
  // Save store on manual stop
  const store = stores.get(merchantId);
  if (store && store.writeToFile) {
      store.writeToFile();
  }

  setConnectionStatus(mId, "disconnected");

  if (logout) {
    const sessionDir = path.join(SESSION_BASE_DIR, `merchant_${mId}`);
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log(`🗑️ Folda ya session imefutwa kwa ajili ya Merchant #${mId}`);
    } catch (e) {
      console.error("Kosa la kufuta faili za session:", e.message);
    }
  }
}

/**
 * Tuma ujumbe kupitia WhatsApp ya merchant husika (unapita kwenye foleni ya usalama)
 * @param {"reply"|"transactional"|"marketing"} kind - aina ya ujumbe (inaamua kikomo na nafasi kati ya ujumbe)
 */
async function sendMessage(merchantId, customerPhone, text, kind = "transactional") {
  const mId = parseInt(merchantId, 10);

  if (!activeSessions.get(mId)) {
    console.warn(`⚠️  Haiwezi kutuma ujumbe - WhatsApp ya Merchant #${mId} haijaunganishwa.`);
    return false;
  }

  try {
    return await enqueueSend(mId, kind, async () => {
      // Pata socket wakati wa kutuma (huenda imeunganika upya wakati ujumbe ukisubiri kwenye foleni)
      const sock = activeSessions.get(mId);
      if (!sock) throw new Error("WhatsApp haijaunganishwa");
      await sock.sendMessage(customerPhone, { text });
    });
  } catch (err) {
    console.error(`⚠️  Imeshindwa kutuma ujumbe kwa ${customerPhone} (Merchant #${mId}):`, err.message);
    return false;
  }
}

/**
 * Mmiliki wa namba iliyofungiwa anataka kuunganisha upya (mf. baada ya rufaa au kwa namba mpya).
 * Futa creds za zamani (hazifanyi kazi tena) ili aanze na QR/Pairing mpya.
 * waBanned inafutwa tu pale muunganiko mpya utakapofanikiwa (recordLinkedNumber).
 */
async function resetBannedSession(merchantId) {
  const mId = parseInt(merchantId, 10);
  await stopSession(mId, false);
  try {
    fs.rmSync(path.join(SESSION_BASE_DIR, `merchant_${mId}`), { recursive: true, force: true });
  } catch (e) {
    console.error("Kosa la kufuta faili za session:", e.message);
  }
}

/**
 * Anzisha session zote ambazo tayari zimeshakuwa zimeunganishwa kabla (creds.json zipo)
 */
async function initializeAllSessions() {
  console.log("🚀 Inatafuta na kuanzisha zilizokuwa WhatsApp sessions hai...");
  try {
    await loadBotStates();
    const merchants = await prisma.merchant.findMany({ select: { id: true, waBanned: true } });

    for (const merchant of merchants) {
      // 🚫 Namba iliyofungiwa na WhatsApp isiunganishwe tena kiotomatiki - mmiliki aunganishe mwenyewe
      if (merchant.waBanned) {
        console.warn(`🚫 Merchant #${merchant.id} - Namba ilifungiwa na WhatsApp. Inarukwa (haiunganishwi kiotomatiki).`);
        setConnectionStatus(merchant.id, "banned");
        continue;
      }

      const sessionDir = path.join(SESSION_BASE_DIR, `merchant_${merchant.id}`);
      const credsFile = path.join(sessionDir, "creds.json");

      // Anzisha TU kama akaunti ilishasajiliwa kikamilifu (creds zipo NA isRegistered === true)
      if (fs.existsSync(credsFile)) {
        try {
          const credsData = JSON.parse(fs.readFileSync(credsFile, "utf-8"));
          const isRegistered = Boolean(credsData && (credsData.registered || credsData.me || credsData.account));
          if (isRegistered) {
            console.log(`🔄 Re-establishing active WhatsApp session for Merchant #${merchant.id}...`);
            startSession(merchant.id).catch((err) => {
              console.error(`Kosa la kuanzisha session ya Merchant #${merchant.id}:`, err);
            });
          }
        } catch (e) {}
      }
    }
  } catch (err) {
    console.error("Imeshindwa initialize sessions za WhatsApp:", err);
  }
}

/**
 * Omba Pairing Code kwa ajili ya kuunganisha kupitia namba ya simu
 */
async function requestPairingCode(merchantId, phoneNumber) {
  const mId = parseInt(merchantId, 10);
  if (await isOnCloudApi(mId)) {
    throw new Error("Duka lako limeunganishwa kupitia WhatsApp Cloud API - QR/Pairing Code haihitajiki.");
  }

  // 1. Safisha na weka namba kwenye mfumo wa kimataifa (International Format)
  let cleanNumber = (phoneNumber || "").replace(/[^0-9]/g, "");
  if (cleanNumber.startsWith("0")) {
    cleanNumber = "255" + cleanNumber.slice(1);
  } else if (cleanNumber.startsWith("2550")) {
    cleanNumber = "255" + cleanNumber.slice(4);
  }

  if (cleanNumber.length < 10) {
    throw new Error("Namba ya simu si sahihi. Hakikisha namba yako iliyosajiliwa inaanza na 07... / 06... au 255...");
  }

  // 2. PAIRING CODE INAHITAJI FRESH SOCKET:
  // Kama kuna session inayojiandaa kwa QR mode, ifunge kwanza ili isiharibu Pairing Protocol
  let sock = activeSessions.get(mId);
  if (sock) {
    const isAlreadyRegistered = Boolean(sock.authState?.creds?.registered || sock.authState?.creds?.me || sock.authState?.creds?.account);
    if (isAlreadyRegistered) {
      throw new Error("Akaunti yako tayari imeunganishwa!");
    }
    await stopSession(mId, false);
  }

  // 3. Futa faili za zamani za creds ambazo hazijasajiliwa kikamilifu ili kuanza auth state safi
  const sessionDir = path.join(SESSION_BASE_DIR, `merchant_${mId}`);
  const credsFile = path.join(sessionDir, "creds.json");
  if (fs.existsSync(credsFile)) {
    try {
      const credsData = JSON.parse(fs.readFileSync(credsFile, "utf-8"));
      const isDirRegistered = Boolean(credsData && (credsData.registered || credsData.me || credsData.account));
      if (!isDirRegistered) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    } catch (e) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  }

  // 4. Weka merchant kwenye pairing pending mode KABLA ya kuanzisha socket mpya ili QR msikilizaji aipuuze
  pairingPendingMerchants.add(mId);
  setTimeout(() => pairingPendingMerchants.delete(mId), 180000); // 3 minutes timeout

  // Anzisha socket mpya kabisa mahususi kwa Pairing Code
  sock = await startSession(mId);

  // Subiri WebSocket ikamilishe mshiko (Handshake) na WhatsApp servers (hadi sekunde 6.5)
  for (let i = 0; i < 13; i++) {
    if (sock.ws && sock.ws.readyState === 1) break; // 1 = OPEN
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  try {
    // Omba pairing code kutoka WhatsApp servers
    const code = await sock.requestPairingCode(cleanNumber);
    return code;
  } catch (err) {
    console.error(`Kosa wakati wa kuomba pairing code (Merchant #${mId}):`, err.message);
    throw new Error(`Imeshindwa kutengeneza code (${err.message || 'Server timeout'}). Jaribu tena baada ya sekunde 5.`);
  }
}

// 🛡️ ANTI-BAN: Graceful Shutdown — Hifadhi sessions kabla ya kuzima
// Inazuia session corruption inayoweza kusababisha ban
async function gracefulShutdown() {
  console.log("🛑 Inazima mfumo kwa usalama — Inahifadhi sessions zote...");
  const shutdownPromises = [];
  for (const [mId, sock] of activeSessions) {
    try {
      const store = stores.get(mId);
      if (store && store.writeToFile) store.writeToFile();
      // Tuma signal ya kwaheri kwa WA servers (si logout, ni close salama)
      shutdownPromises.push(Promise.resolve().then(() => sock.end(undefined)).catch(() => {}));
    } catch (e) {}
  }
  await Promise.allSettled(shutdownPromises);
  console.log("✅ Sessions zote zimehifadhiwa. Mfumo umezimwa salama.");
}

// Signals (SIGTERM/SIGINT) zinasajiliwa na src/index.js ili kuzima worker ya V2 pia

module.exports = {
  startSession,
  stopSession,
  sendMessage,
  getConnectionStatus,
  setConnectionStatus,
  setBotActive,
  isBotActive,
  initializeAllSessions,
  activeSessions,
  requestPairingCode,
  resetBannedSession,
  loadBotStates,
  gracefulShutdown,
};
