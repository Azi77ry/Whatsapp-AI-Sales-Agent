#!/usr/bin/env node
// cPanel Cron Job: shughulikia matukio ya webhook ya WhatsApp yaliyobaki kwenye foleni.
// cPanel (Passenger) inaweza kulaza app ikiwa haina trafiki, hivyo cron hii inahakikisha
// retries na matukio yaliyokwama yanashughulikiwa hata app ikiwa imelala.
//
// cPanel -> Cron Jobs -> kila dakika (* * * * *):
//   cd /home/<user>/<app> && /home/<user>/nodevenv/<app>/<version>/bin/node scripts/drain-webhook-queue.js >> logs/cron-webhook.log 2>&1

const path = require("path");
process.chdir(path.join(__dirname, ".."));

const config = require("../src/config");
const prisma = require("../src/db/client");
const worker = require("../src/services/webhookWorker");
const manager = require("../src/whatsapp/manager");

(async () => {
  if (!config.features.cloudApi) {
    console.log("FEATURE_CLOUD_API=false - hakuna cha kufanya.");
    return;
  }
  await manager.loadBotStates();
  const processed = await worker.drain({ maxMs: 50e3 }); // chini ya dakika 1 ili cron zisipishane
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: "cron.drain", processed }));
})()
  .catch((err) => {
    console.error("cron.drain.failed", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit();
  });
