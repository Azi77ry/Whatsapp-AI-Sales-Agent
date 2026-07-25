// Muunganiko na WhatsApp kupitia Baileys (njia isiyo rasmi - unofficial)
// MUHIMU: Soma README kuhusu hatari za njia hii kabla ya kutumia kwenye namba kuu ya biashara.

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const path = require("path");

const { handleIncomingMessage } = require("./messageHandler");
const { setSocket } = require("./sender");
const { setConnectionStatus } = require("./status");

const SESSION_DIR = path.join(__dirname, "../../sessions");

async function startWhatsApp() {
  setConnectionStatus("connecting");
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }), // badilisha kuwa "info" ukitaka kuona logs zaidi
    printQRInTerminal: false,
  });

  // Weka sock hii ipatikane kwa dashboard/API (mfano: kutuma arifa za oda)
  setSocket(sock);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 Scan QR code hii kwa simu yako ya WhatsApp (Linked Devices):\n");
      qrcode.generate(qr, { small: true });
      setConnectionStatus("qr", qr);
    }

    if (connection === "close") {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log("Muunganiko umekatika. Kuunganisha upya:", shouldReconnect);
      if (shouldReconnect) {
        setConnectionStatus("connecting");
        startWhatsApp();
      } else {
        console.log("Umetoka kwenye account (logged out). Futa folder ya 'sessions' na anzisha upya kwa QR mpya.");
        setConnectionStatus("disconnected");
      }
    } else if (connection === "open") {
      console.log("✅ Umeunganishwa na WhatsApp kikamilifu!");
      setConnectionStatus("connected");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        await handleIncomingMessage(sock, msg);
      } catch (err) {
        console.error("Hitilafu ya kushughulikia ujumbe:", err);
      }
    }
  });

  return sock;
}

module.exports = { startWhatsApp };
