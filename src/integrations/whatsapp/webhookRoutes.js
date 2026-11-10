// GET/POST /webhooks/whatsapp
// ⚠️ Lazima ipachikwe KABLA ya express.json() - uthibitisho wa sahihi unahitaji body halisi (raw bytes).

const express = require("express");
const rateLimit = require("express-rate-limit");
const controller = require("./webhookController");

const router = express.Router();

// Kinga dhidi ya mafuriko ya maombi yasiyo na sahihi (Meta yenyewe haikaribii kiwango hiki kwa IP moja)
const limiter = rateLimit({ windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false });

router.get("/", limiter, controller.verify);
router.post("/", limiter, express.raw({ type: () => true, limit: "2mb" }), controller.receive);

module.exports = router;
