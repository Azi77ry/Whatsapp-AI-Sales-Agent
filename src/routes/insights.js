// API kwa "AI Business Advisor" - sehemu ya dashboard inayompa muuzaji ushauri ki-SaaS
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const {
  computeBusinessStats,
  findPotentialCustomers,
  generateBusinessAdvice,
  answerBusinessQuestion,
  findReEngagedCustomers,
} = require("../ai/businessAdvisor");

// Msaidizi mdogo wa kuendesha async handlers kwa usalama
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch((err) => {
  console.error(`⚠️  Insights Error [${req.method} ${req.path}]:`, err.message);
  res.status(500).json({ error: "Hitilafu ya seva imetokea. Jaribu tena." });
});

// Secure all endpoints with authMiddleware
router.use(authMiddleware);

router.get("/stats", wrap(async (req, res) => {
  const stats = await computeBusinessStats(req.merchantId);
  res.json(stats);
}));

router.get("/potential-customers", wrap(async (req, res) => {
  const customers = await findPotentialCustomers(req.merchantId);
  res.json(customers);
}));

router.get("/re-engaged", wrap(async (req, res) => {
  const customers = await findReEngagedCustomers(req.merchantId);
  res.json(customers);
}));

router.get("/advice", wrap(async (req, res) => {
  const advice = await generateBusinessAdvice(req.merchantId);
  res.json({ advice });
}));

router.post("/ask", wrap(async (req, res) => {
  const { question } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: "Andika swali kwanza" });
  }
  const answer = await answerBusinessQuestion(question.trim(), req.merchantId);
  res.json({ answer });
}));

module.exports = router;
