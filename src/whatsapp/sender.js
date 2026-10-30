// Hii ni daraja inayoelekeza kwenye manager.js ili kulinda utangamano wa code za zamani (backwards compatibility).
const manager = require("./manager");

async function sendMessage(customerPhone, text, merchantId = 1, kind = "transactional") {
  // Katika multi-tenant SaaS, tunapita na merchantId. Default ni 1.
  // kind: "reply" | "transactional" | "marketing" - inaamua kikomo na nafasi kati ya ujumbe (sendQueue.js)
  return manager.sendMessage(merchantId, customerPhone, text, kind);
}

// Hifadhi sock ya kwanza tu kwa ajili ya debug kama inatumiwa
function setSocket(sock) {
  if (sock) {
    manager.activeSessions.set(1, sock);
  }
}

module.exports = { setSocket, sendMessage };
