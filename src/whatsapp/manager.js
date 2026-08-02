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
    logger: pino({ level: "warn" }),
    printQRInTerminal: false,
    msgRetryCounterCache,
    generateHighQualityLinkPreview: true,
    browser: Browsers.ubuntu("Chrome"), // Signature inayotambuliwa vyema na pairing code protocol
    connectTimeoutMs: 120000,
    defaultQueryTimeoutMs: 120000,
    keepAliveIntervalMs: 10000,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
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
      const isRegistered = Boolean(sock?.authState?.creds?.registered || sock?.authState?.creds?.me || sock?.authState?.creds?.account);
      const isPairingPending = pairingPendingMerchants.has(mId);

      console.log(`🔌 Muunganiko wa Merchant #${mId} umekatika (Status Code: ${statusCode}, Registered: ${isRegistered}, PairingPending: ${isPairingPending}).`);

      activeSessions.delete(mId);
      
      // Save store before reconnecting/cleaning up
      const store = stores.get(merchantId);
      if (store && store.writeToFile) {
         store.writeToFile();
      }

      if (isRegistered) {
        setConnectionStatus(mId, "connecting");
        startSession(mId).catch((err) => console.error(`Error reconnecting Merchant #${mId}:`, err));
      } else if (isPairingPending) {
        // WAKATI WA PAIRING CODE: Socket inajifunga kiotomatiki baada ya kutoa code ili kusubiri simu.
        // USIANZISHE socket mpya ya QR! Subiri tu mteja aingize code kwenye simu yake.
        console.log(`⏳ Merchant #${mId} yupo kwenye mchakato wa Pairing Code. Inasubiri simu ithibitishe...`);
        setConnectionStatus(mId, "connecting");
      } else {
        console.log(`❌ Merchant #${mId} ametoka kwenye akaunti (logged out). Inasafisha folda la session.`);
        setConnectionStatus(mId, "disconnected");
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
      setConnectionStatus(mId, "connected");
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
