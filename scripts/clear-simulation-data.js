const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("⏳ Inaanza kufuta data zote za uigizaji (simulated conversations and orders)...");

  try {
    // 1. Futa ujumbe wote wa mazungumzo
    const messagesDeleted = await prisma.message.deleteMany({});
    console.log(`✅ Ujumbe uliofutwa: ${messagesDeleted.count}`);

    // 2. Futa oda zote za majaribio
    const ordersDeleted = await prisma.order.deleteMany({});
    console.log(`✅ Oda zilizofutwa: ${ordersDeleted.count}`);

    // 3. Futa maombi maalum (special requests) ya majaribio
    const specialRequestsDeleted = await prisma.specialRequest.deleteMany({});
    console.log(`✅ Maombi maalum yaliyofutwa: ${specialRequestsDeleted.count}`);

    // 4. Futa mazungumzo yote
    const conversationsDeleted = await prisma.conversation.deleteMany({});
    console.log(`✅ Mazungumzo yaliyofutwa: ${conversationsDeleted.count}`);

    console.log("\n✅ Data zote za uigizaji zimefutwa kikamilifu! Wafanyabiashara na Bidhaa zao zimeachwa salama.");
  } catch (err) {
    console.error("❌ Hitilafu wakati wa kufuta data:", err.message);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
