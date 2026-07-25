// Script ya kusafisha database na kufuta session zote za WhatsApp ili kuanza upya
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();
const projectRoot = path.join(__dirname, "..");
const sessionsDir = path.join(projectRoot, "sessions");

async function main() {
  console.log("⏳ Inaanza kusafisha data zote kwenye database...");

  try {
    // Futa data kwa kufuata mlolongo wa foreign keys
    const messagesDeleted = await prisma.message.deleteMany({});
    console.log(`✅ Ujumbe wa mazungumzo uliofutwa: ${messagesDeleted.count}`);

    const ordersDeleted = await prisma.order.deleteMany({});
    console.log(`✅ Oda zilizofutwa: ${ordersDeleted.count}`);

    const specialRequestsDeleted = await prisma.specialRequest.deleteMany({});
    console.log(`✅ Maombi maalum yaliyofutwa: ${specialRequestsDeleted.count}`);

    const conversationsDeleted = await prisma.conversation.deleteMany({});
    console.log(`✅ Mazungumzo yaliyofutwa: ${conversationsDeleted.count}`);

    const productsDeleted = await prisma.product.deleteMany({});
    console.log(`✅ Bidhaa zilizofutwa: ${productsDeleted.count}`);

    const merchantsDeleted = await prisma.merchant.deleteMany({});
    console.log(`✅ Wafanyabiashara waliofutwa: ${merchantsDeleted.count}`);

    console.log("✅ Database imesafishwa kikamilifu.");
  } catch (err) {
    console.error("❌ Hitilafu ya kufuta data kwenye database:", err.message);
  }

  // Safisha folda la sessions (WhatsApp creds zote za merchants)
  if (fs.existsSync(sessionsDir)) {
    try {
      const items = fs.readdirSync(sessionsDir);
      items.forEach(item => {
        const itemPath = path.join(sessionsDir, item);
        if (fs.lstatSync(itemPath).isDirectory()) {
          fs.rmSync(itemPath, { recursive: true, force: true });
          console.log(`✅ Imefuta WhatsApp session folder ya: ${item}`);
        } else {
          fs.unlinkSync(itemPath);
        }
      });
      console.log("✅ Folda la 'sessions' limesafishwa kikamilifu.");
    } catch (err) {
      console.warn(`⚠️  Hitilafu ya kusafisha folda la sessions: ${err.message}`);
    }
  }

  console.log("\n🚀 Mfumo umesafishwa kikamilifu! Sasa unaweza kujaza default merchant kwa kuendesha:");
  console.log("   npm run db:seed\n");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
