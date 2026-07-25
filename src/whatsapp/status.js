// Hii ni daraja inayoelekeza kwenye manager.js ili kulinda utangamano wa code za zamani (backwards compatibility).
const manager = require("./manager");

function setConnectionStatus(status, qr = null) {
  // Kwa default tunaweka merchant ya kwanza (ID 1)
  manager.setConnectionStatus(1, status, qr);
}

function getConnectionStatus() {
  return manager.getConnectionStatus(1);
}

function setBotActive(active) {
  manager.setBotActive(1, active);
}

function isBotActive() {
  return manager.isBotActive(1);
}

module.exports = { setConnectionStatus, getConnectionStatus, setBotActive, isBotActive };
