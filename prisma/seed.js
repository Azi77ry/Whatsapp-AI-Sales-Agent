// Script ya kujaza bidhaa na merchant wa mfano kwenye database
// Endesha kwa: npm run db:seed

require("dotenv").config({ override: true });
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

const sampleProducts = [
  {
    name: "Jezi ya Barcelona 2025/26",
    category: "Jezi",
    price: 35000,
    stock: 20,
    colors: "Bluu na Nyekundu,Njano",
    sizes: "S,M,L,XL,XXL",
    description: "Jezi rasmi ya nyumbani ya Barcelona, msimu 2025/26.",
  },
  {
    name: "Jezi ya Manchester United",
    category: "Jezi",
    price: 35000,
    stock: 15,
    colors: "Nyekundu",
    sizes: "S,M,L,XL",
    description: "Jezi rasmi ya nyumbani ya Man United.",
  },
  {
    name: "Simu ya Samsung A15",
    category: "Simu",
    price: 320000,
    stock: 8,
    colors: "Nyeusi,Bluu",
    sizes: null,
    description: "RAM 4GB, ROM 128GB, kamera 50MP.",
  },
  {
    name: "Simu ya iPhone 13",
    category: "Simu",
    price: 950000,
    stock: 3,
    colors: "Nyeusi,Nyeupe,Nyekundu",
    sizes: null,
    description: "128GB, imetumika kidogo (used), hali nzuri.",
  },
  {
    name: "Laptop HP EliteBook",
    category: "Laptop",
    price: 850000,
    stock: 5,
    colors: "Kijivu",
    sizes: null,
    description: "Core i5, RAM 8GB, SSD 256GB.",
  },
  {
    name: "Smartwatch T500",
    category: "Smartwatch",
    price: 45000,
    stock: 25,
    colors: "Nyeusi,Waridi,Bluu",
    sizes: null,
    description: "Inapima mapigo ya moyo, hatua za mwendo, na arifa za simu.",
  },
  {
    name: "Calculator Casio FX-991",
    category: "Calculator",
    price: 28000,
    stock: 30,
    colors: null,
    sizes: null,
    description: "Scientific calculator, inafaa kwa shule na chuo.",
  },
  {
    name: "Kifuniko cha Simu (Phone Case)",
    category: "Accessories",
    price: 8000,
    stock: 50,
    colors: "Nyeusi,Uwazi,Bluu",
    sizes: null,
    description: "Kinga bora ya simu dhidi ya mikwaruzo na kuanguka.",
  },
];

async function main() {
  console.log("Inaanza kuandaa default Merchant...");
  
  // Hash password ya default: 'admin123'
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash("admin123", salt);

  // Upsert merchant mwenye ID 1
  const defaultMerchant = await prisma.merchant.upsert({
    where: { id: 1 },
    update: {
      businessName: "Aziry Tech Store",
      email: "admin@admin.com",
      phone: "255616650076",
      passwordHash,
    },
    create: {
      id: 1,
      businessName: "Aziry Tech Store",
      email: "admin@admin.com",
      phone: "255616650076",
      passwordHash,
    },
  });
  console.log(`Default Merchant '${defaultMerchant.businessName}' ameandaliwa kikamilifu!`);

  // Futa bidhaa za zamani ili kuepuka duplicate wakati wa re-seeding
  await prisma.product.deleteMany({});
  console.log("Bidhaa za zamani zimefutwa.");

  console.log("Inaanza kujaza bidhaa za mfano...");
  for (const product of sampleProducts) {
    await prisma.product.create({
      data: {
        ...product,
        merchantId: defaultMerchant.id,
      },
    });
  }
  console.log(`Bidhaa ${sampleProducts.length} zimeongezwa kikamilifu kwa ajili ya Merchant ID 1!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
