// CLI script ya kureset password ya mfanyabiashara
// Matumizi: node scripts/reset-password.js <email> <new_password>

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log("\n❌ Hitilafu: Tafadhali weka barua pepe na neno jipya la siri.");
    console.log("Matumizi: node scripts/reset-password.js <email> <new_password>");
    console.log("Mfano: node scripts/reset-password.js maziwa@gmail.com mpya123\n");
    process.exit(1);
  }

  const email = args[0].trim().toLowerCase();
  const newPassword = args[1];

  console.log(`⏳ Kujaribu kureset password kwa: ${email}...`);

  // Tafuta mfanyabiashara
  const merchant = await prisma.merchant.findUnique({
    where: { email },
  });

  if (!merchant) {
    console.error(`❌ Hitilafu: Mfanyabiashara mwenye barua pepe "${email}" hajapatikana kwenye database.`);
    process.exit(1);
  }

  // Hash password mpya
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  // Sasisha database
  await prisma.merchant.update({
    where: { id: merchant.id },
    data: { passwordHash },
  });

  console.log(`\n✅ Imekamilika! Password ya duka "${merchant.businessName}" imesasishwa kwa mafanikio.`);
  console.log(`🔑 Login Email: ${email}`);
  console.log(`🔒 New Password: ${newPassword}\n`);
}

main()
  .catch((e) => {
    console.error("❌ Hitilafu ya kiufundi imetokea:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
