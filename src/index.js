const config = require("./config");
const app = require("./app");
const { initializeAllSessions } = require("./whatsapp/manager");
const { startReEngagementJob } = require("./jobs/reEngagement");
const { startBackupJob } = require("./jobs/backupSession");
const { startSessionHealthMonitor } = require("./jobs/sessionHealthMonitor");
const webhookWorker = require("./services/webhookWorker");
const manager = require("./whatsapp/manager");
const prisma = require("./db/client");

app.listen(config.port, () => {
  console.log(`\n🌐 SaaS Admin dashboard: http://localhost:${config.port}`);
  console.log(`🔑 Wafanyabiashara wanaweza kujisajili kupitia register.html\n`);

  // Anzisha re-engagement cron job (kila saa kwa wote)
  startReEngagementJob();

  // Anzisha backup cron job (kila siku saa 8 usiku)
  startBackupJob();

  // Anzisha WhatsApp Session Health Monitor (inakagua kila dakika 5)
  startSessionHealthMonitor();

  // Kwenye kuanza kwa server, anzisha WhatsApp sessions zote zilizounganishwa kabla (Baileys - njia ya zamani)
  if (config.features.baileys) {
    initializeAllSessions().catch((err) => {
      console.error("Imeshindwa kuanzisha active sessions za WhatsApp kwenye startup:", err);
    });
  } else {
    manager.loadBotStates().catch(() => {});
  }

  // V2: worker ya matukio ya Meta Cloud API
  if (config.features.cloudApi && config.features.inProcessWorker) {
    webhookWorker.start();
  }
});

// Kuzima kwa usalama: maliza tukio linaloshughulikiwa, hifadhi sessions za Baileys, funga DB
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`🛑 ${signal}: inazima mfumo kwa usalama...`);
  const force = setTimeout(() => process.exit(1), 25000);
  try {
    await webhookWorker.stop();
    await manager.gracefulShutdown();
    await prisma.$disconnect();
  } finally {
    clearTimeout(force);
    process.exit(0);
  }
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
