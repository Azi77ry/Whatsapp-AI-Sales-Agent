// Prisma client moja inayoshirikiwa na sehemu zote za app
// (huku ni tabia nzuri ili kuepuka kufungua connections nyingi za database)

require("dotenv").config({ override: process.env.NODE_ENV !== "test" });
const { PrismaClient } = require("@prisma/client");

// 🛡️ Tests hazipaswi KAMWE kugusa database isiyo ya localhost (mf. Supabase ya production)
if (process.env.NODE_ENV === "test") {
  const host = new URL(process.env.DATABASE_URL || "postgresql://invalid").hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`NODE_ENV=test lakini DATABASE_URL inaelekeza "${host}" - imezuiwa.`);
  }
}

const prisma = new PrismaClient();

module.exports = prisma;
