// Script ya kupandisha hadhi akaunti kuwa Super-Admin
// Matumizi: node scripts/seedAdmin.js azirytech@gmail.com

const prisma = require("../src/db/client");

async function seedAdmin() {
  const email = process.argv[2];

  if (!email) {
    console.log("❌ Matumizi: node scripts/seedAdmin.js <email>");
    console.log("   Mfano: node scripts/seedAdmin.js azirytech@gmail.com");
    process.exit(1);
  }

  const merchant = await prisma.merchant.findUnique({ where: { email } });

  if (!merchant) {
    console.log(`❌ Hakuna akaunti yenye email: ${email}`);
    process.exit(1);
  }

  if (merchant.role === "superadmin") {
    console.log(`✅ "${merchant.businessName}" tayari ni Super-Admin.`);
    process.exit(0);
  }

  await prisma.merchant.update({
    where: { email },
    data: { role: "superadmin" },
  });

  console.log(`🎉 "${merchant.businessName}" (${email}) sasa ni SUPER-ADMIN!`);
  console.log(`🔗 Ingia kwenye: http://localhost:3000/superadmin/`);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("❌ Hitilafu:", err.message);
  process.exit(1);
});
