const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const path = require("path");
const fs = require("fs");
const prisma = require("../db/client");
const { handleIncomingMessage } = require("./messageHandler");

const SESSION_BASE_DIR = path.join(__dirname, "../../sessions");

// Ramani ya kuhifadhi sessions hai za WhatsApp
const activeSessions = new Map();

// STORE: Hifadhi ya ndani kwa ajili ya kutatua matatizo ya @lid (Error 463)
const stores = new Map();

// Hifadhi ya muda ya hali ya muunganiko kwa kila merchant
const connectionStatuses = new Map();

// Hifadhi ya kama bot ipo active au imezimwa kwa kila merchant
const botActiveStatuses = new Map();

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
  botActiveStatuses.set(merchantId, active);
}

/**
 * Angalia kama bot ipo active kwa merchant
 */
function isBotActive(merchantId) {
  if (!botActiveStatuses.has(merchantId)) {
    botActiveStatuses.set(merchantId, true);
  }
  return botActiveStatuses.get(merchantId);
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

  setConnectionStatus(mId, "connecting");

  const sessionDir = path.join(SESSION_BASE_DIR, `merchant_${mId}`);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();
  
  // Hifadhi ya ndani (Store) kutatua Error 463 ya @lid
  if (!stores.has(merchantId)) {
    const store = makeInMemoryStore({ logger: pino({ level: "silent" }) });
    store.readFromFile(path.join(sessionDir, 'baileys_store_multi.json'));
    setInterval(() => {
      store.writeToFile(path.join(sessionDir, 'baileys_store_multi.json'));
    }, 10_000);
    stores.set(merchantId, store);
  }
  const store = stores.get(merchantId);

  const msgRetryCounterCache = new Map(); // Njia mbadala ya NodeCache

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "warn" }),
    printQRInTerminal: false,
    msgRetryCounterCache,
    generateHighQualityLinkPreview: true,
    browser: ["Ubuntu", "Chrome", "110.0.5481.192"], // 🛡️ ZUIA WHATSAPP KUZUIA MUUNGANIKO (Fixes 408 Timeout)
    connectTimeoutMs: 60000, // Sekunde 60 kuzuia Time Out
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
    markOnlineOnConnect: false, // Inasaidia kuzuia kukwama wakati wa kuunganisha
    syncFullHistory: false, // Zima usomaji wa meseji za zamani ili isikwame
    shouldSyncHistoryMessage: () => false, // Zuia kabisa process za historia
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
      console.log(`⚙️ QR code mpya tayari kwa Merchant #${mId}`);
      setConnectionStatus(mId, "qr", qr);
    }

    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`🔌 Muunganiko wa Merchant #${mId} umekatika. Kuunganisha upya: ${shouldReconnect}`);

      activeSessions.delete(mId);

      if (shouldReconnect) {
        setConnectionStatus(mId, "connecting");
        startSession(mId).catch((err) => console.error(`Error reconnecting Merchant #${mId}:`, err));
      } else {
        console.log(`❌ Merchant #${mId} ametoka kwenye akaunti (logged out). Inasafisha folda la session.`);
        setConnectionStatus(mId, "disconnected");
        // Futa faili za session ili kuruhusu login upya
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (e) {
          console.error("Kosa la kufuta faili za session:", e.message);
        }
      }
    } else if (connection === "open") {
      console.log(`✅ Merchant #${mId} ameunganishwa na WhatsApp kikamilifu!`);
      setConnectionStatus(mId, "connected");
    }
  });

  sock.ev.on("creds.update", saveCreds);

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
 * Tuma ujumbe kupitia WhatsApp ya merchant husika
 */
async function sendMessage(merchantId, customerPhone, text) {
  const mId = parseInt(merchantId, 10);
  const sock = activeSessions.get(mId);

  if (!sock) {
    console.warn(`⚠️  Haiwezi kutuma ujumbe - WhatsApp ya Merchant #${mId} haijaunganishwa.`);
    return false;
  }

  try {
    await sock.sendMessage(customerPhone, { text });
    return true;
  } catch (err) {
    console.error(`⚠️  Imeshindwa kutuma ujumbe kwa ${customerPhone} (Merchant #${mId}):`, err.message);
    return false;
  }
}

/**
 * Anzisha session zote ambazo tayari zimeshakuwa zimeunganishwa kabla (creds.json zipo)
 */
async function initializeAllSessions() {
  console.log("🚀 Inatafuta na kuanzisha zilizokuwa WhatsApp sessions hai...");
  try {
    const merchants = await prisma.merchant.findMany({ select: { id: true } });

    for (const merchant of merchants) {
      const sessionDir = path.join(SESSION_BASE_DIR, `merchant_${merchant.id}`);
      const credsFile = path.join(sessionDir, "creds.json");

      // Anzisha tu kama tayari mteja amesha-scan kabla (creds zipo)
      if (fs.existsSync(credsFile)) {
        startSession(merchant.id).catch((err) => {
          console.error(`Kosa la kuanzisha session ya Merchant #${merchant.id}:`, err);
        });
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
  const sock = activeSessions.get(mId);
  
  if (!sock) {
    throw new Error("WhatsApp haijaunganishwa bado. Bofya 'Anzisha WhatsApp Upya' kwanza.");
  }

  if (sock.authState.creds.registered) {
    throw new Error("Akaunti yako tayari imeunganishwa!");
  }

  // Safisha namba ya simu (ondoa alama za + na spaces)
  const cleanNumber = phoneNumber.replace(/[^0-9]/g, "");
  
  try {
    const code = await sock.requestPairingCode(cleanNumber);
    return code;
  } catch (err) {
    console.error(`Kosa wakati wa kuomba pairing code (Merchant #${mId}):`, err.message);
    throw new Error("Imeshindwa kutengeneza code. Hakikisha namba ipo sahihi (mfano: 255712...).");
  }
}

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
};
