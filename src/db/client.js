// Prisma client moja inayoshirikiwa na sehemu zote za app
// (huku ni tabia nzuri ili kuepuka kufungua connections nyingi za database)

require("dotenv").config({ override: true });
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

module.exports = prisma;
