const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("⏳ Kuanzisha data za majaribio ya Chati (Reports) na Mazungumzo (Conversations)...");

  // 1. Tafuta Merchant 1
  const merchant = await prisma.merchant.findUnique({ where: { id: 1 } });
  if (!merchant) {
    console.error("❌ Hitilafu: Tafadhali hakikisha umekimbiza kwanza seed.js ya msingi.");
    process.exit(1);
  }

  // 2. Futa data zote za zamani ili kuepuka migongano ya foreign keys
  await prisma.message.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.specialRequest.deleteMany({});
  await prisma.conversation.deleteMany({});

  // 3. Tengeneza Mazungumzo na Ujumbe (Conversations & Messages)
  const customers = [
    { name: "John Doe", phone: "255712345678", summary: "Anataka kununua Laptop ya HP" },
    { name: "Aisha Salum", phone: "255754987654", summary: "Ulizia jezi ya Barcelona" },
    { name: "Salum Juma", phone: "255655112233", summary: "Alikuwa anataka smartwatch ila bei ilizidi bajeti" }
  ];

  const now = new Date();
  const createdConvs = [];

  for (let i = 0; i < customers.length; i++) {
    const cust = customers[i];
    
    // Tofautisha nyakati za mazungumzo
    const convTime = new Date();
    convTime.setHours(now.getHours() - (i * 3) - 1);

    const conversation = await prisma.conversation.create({
      data: {
        merchant: { connect: { id: merchant.id } },
        customerPhone: cust.phone,
        customerName: cust.name,
        contextSummary: cust.summary,
        status: "active",
        createdAt: convTime,
        updatedAt: convTime,
      }
    });
    createdConvs.push(conversation);

    // Ujumbe wa mfano
    const msgTime1 = new Date(convTime);
    msgTime1.setMinutes(convTime.getMinutes() - 10);
    const msgTime2 = new Date(convTime);
    msgTime2.setMinutes(convTime.getMinutes() - 5);
    const msgTime3 = new Date(convTime);

    await prisma.message.createMany({
      data: [
        {
          conversationId: conversation.id,
          sender: "customer",
          content: i === 0 ? "Habari, napenda kuulizia bei ya HP Elitebook?" : i === 1 ? "Mambo, jezi mpya za Barcelona zipo size L?" : "Mambo vipi, Smartwatch T500 inauzwa shilingi ngapi?",
          createdAt: msgTime1,
        },
        {
          conversationId: conversation.id,
          sender: "ai",
          content: i === 0 ? "Habari! HP EliteBook ipo kwa TZS 850,000 tu. RAM ni 8GB na SSD 256GB. Ungependa kuagiza?" : i === 1 ? "Habari! Ndio zipo kwa TZS 35,000. Je, ungependa tukuletee wapi?" : "Habari! Smartwatch T500 inauzwa TZS 45,000 tu. Ina tracking nzuri za afya na hatua.",
          createdAt: msgTime2,
        },
        {
          conversationId: conversation.id,
          sender: "customer",
          content: i === 0 ? "Sawa, nahitaji moja. Delivery ni kiasi gani hadi Ubungo?" : i === 1 ? "Ndio, nahitaji moja delivery Kariakoo." : "Aisee bei imezidi kidogo bajeti yangu ya TZS 30,000.",
          createdAt: msgTime3,
        }
      ]
    });
  }

  // 4. Tengeneza Oda za Miezi/Siku zilizopita kwa ajili ya Chati (Sales Reports)
  const ordersData = [
    { conversationIdx: 0, customerPhone: "255712345678", customerName: "John Doe", items: "Laptop HP EliteBook", total: 850000, status: "delivered", daysAgo: 0 },
    { conversationIdx: 1, customerPhone: "255754987654", customerName: "Aisha Salum", items: "Jezi ya Barcelona L", total: 35000, status: "delivered", daysAgo: 1 },
    { conversationIdx: 2, customerPhone: "255655112233", customerName: "Salum Juma", items: "Smartwatch T500", total: 45000, status: "delivered", daysAgo: 2 },
    { conversationIdx: 0, customerPhone: "255711223344", customerName: "Jane Rose", items: "Simu Samsung A15", total: 320000, status: "delivered", daysAgo: 3 },
    { conversationIdx: 1, customerPhone: "255788998877", customerName: "Khalfan", items: "Jezi ya Man United M", total: 35000, status: "pending", daysAgo: 0 }
  ];

  for (const ord of ordersData) {
    const orderTime = new Date();
    orderTime.setDate(now.getDate() - ord.daysAgo);
    orderTime.setHours(12 - ord.daysAgo);

    const conv = createdConvs[ord.conversationIdx];

    await prisma.order.create({
      data: {
        merchant: { connect: { id: merchant.id } },
        conversation: { connect: { id: conv.id } },
        customerPhone: ord.customerPhone,
        customerName: ord.customerName,
        productName: ord.items,
        unitPrice: ord.total,
        status: ord.status,
        quantity: 1,
        deliveryType: "delivery",
        address: "Dar es Salaam",
        createdAt: orderTime,
        updatedAt: orderTime,
      }
    });
  }

  // 5. Tengeneza Special Requests
  const conv2 = createdConvs[2];
  await prisma.specialRequest.create({
    data: {
      merchant: { connect: { id: merchant.id } },
      conversation: { connect: { id: conv2.id } },
      customerPhone: "255655112233",
      customerName: "Salum Juma",
      productName: "Smartwatch T500",
      notes: "Mteja anaulizia punguzo la smartwatch T500 kutoka 45k hadi 30k.",
      deliveryType: "delivery",
      status: "new",
    }
  });

  console.log("✅ Data zote za majaribio zimepandikizwa kwa mafanikio!");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
