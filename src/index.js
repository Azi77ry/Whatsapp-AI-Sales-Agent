const config = require("./config");
const app = require("./app");
const { initializeAllSessions } = require("./whatsapp/manager");
const { startReEngagementJob } = require("./jobs/reEngagement");
const { startBackupJob } = require("./jobs/backupSession");
const { startSessionHealthMonitor } = require("./jobs/sessionHealthMonitor");

app.listen(config.port, () => {
  console.log(`\n🌐 SaaS Admin dashboard: http://localhost:${config.port}`);
  console.log(`🔑 Wafanyabiashara wanaweza kujisajili kupitia register.html\n`);

  // Anzisha re-engagement cron job (kila saa kwa wote)
  startReEngagementJob();

  // Anzisha backup cron job (kila siku saa 8 usiku)
  startBackupJob();

  // Anzisha WhatsApp Session Health Monitor (inakagua kila dakika 5)
  startSessionHealthMonitor();

  // Kwenye kuanza kwa server, anzisha WhatsApp sessions zote zilizounganishwa kabla
  initializeAllSessions().catch((err) => {
    console.error("Imeshindwa kuanzisha active sessions za WhatsApp kwenye startup:", err);
  });
});

