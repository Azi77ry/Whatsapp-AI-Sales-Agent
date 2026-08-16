const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const rateLimit = require("express-rate-limit");
const config = require("./config");
const authRoutes = require("./routes/auth");
const apiRoutes = require("./routes/api");
const insightsRoutes = require("./routes/insights");
const superadminRoutes = require("./routes/superadmin");
const billingRoutes = require("./routes/billing");
const { initializeAllSessions } = require("./whatsapp/manager");
const { startReEngagementJob } = require("./jobs/reEngagement");
const { startBackupJob } = require("./jobs/backupSession");
const { startSessionHealthMonitor } = require("./jobs/sessionHealthMonitor");

const app = express();

// 🛡️ Security Headers
app.use(helmet({
  contentSecurityPolicy: false, // Tunazima CSP kwa muda ili isizuie scripts/styles za frontend yetu (inaweza kusanidiwa vizuri baadaye)
  crossOriginEmbedderPolicy: false, // Ili kuruhusu picha kutoka nje kama zipo
}));

// 🛡️ CORS Control - Ruhusu tu domains zinazohitajika
// Kwa sasa tunaruhusu zote (au unaweza kuweka domain yako halisi)
app.use(cors({
  origin: "*", // Badilisha hii kuwa ['https://yoursaas.com'] kwenye production
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// 🛡️ Global API rate limiter (kuzuia DDoS na abuse kwenye /api/*)
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Dakika 15
  max: 200, // Maombi 200 tu kwa kila IP kwa dakika 15
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Maombi mengi sana. Tafadhali subiri dakika chache kisha jaribu tena." },
  skip: (req) => {
    // Acha static files na upload endpoints zipite bila kizuizi
    return req.path.startsWith("/uploads") || req.method === "GET";
  },
});

// Landing Page (Introduction Website)
app.use(express.static(path.join(__dirname, "../public/landing")));

// Admin dashboard (static files)
app.use("/dashboard", express.static(path.join(__dirname, "../public/dashboard")));

// Super-Admin dashboard (static files)
app.use("/superadmin", express.static(path.join(__dirname, "../public/superadmin")));
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));
app.get("/superadmin", (req, res) => {
  res.redirect("/superadmin/");
});

// API za Auth na Mipangilio ya SaaS
app.use("/api/auth", authRoutes); // Usajili na Kuingia (already has per-route rate limiters)
app.use("/api", globalApiLimiter, apiRoutes);
app.use("/api/insights", insightsRoutes);
app.use("/api/superadmin", superadminRoutes);
app.use("/api/billing", billingRoutes); // Njia mpya ya malipo ya AzamPay

app.listen(config.port, () => {
  console.log(`\n🌐 SaaS Admin dashboard: http://localhost:${config.port}`);
  console.log(`🔑 Wafanyabiashara wanaweza kujisajili kupitia register.html\n`);

  // Anzisha re-engagement cron job (kila saa kwa wote)
  startReEngagementJob();

  // Anzisha backup cron job (kila siku saa 8 usiku)
  startBackupJob();

  // Anzisha WhatsApp Session Health Monitor (inakagua kila dakika 5)
  startSessionHealthMonitor();

  // Kwenye kuanza kwa server, anzisha WhatsApp sessions zote zilizounganishwa kabla
  initializeAllSessions().catch((err) => {
    console.error("Imeshindwa kuanzisha active sessions za WhatsApp kwenye startup:", err);
  });
});

