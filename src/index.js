const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("./config");
const authRoutes = require("./routes/auth");
const apiRoutes = require("./routes/api");
const insightsRoutes = require("./routes/insights");
const superadminRoutes = require("./routes/superadmin");
const { initializeAllSessions } = require("./whatsapp/manager");
const { startReEngagementJob } = require("./jobs/reEngagement");
const { startBackupJob } = require("./jobs/backupSession");

const app = express();

app.use(cors());
app.use(express.json());

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
app.use("/api/auth", authRoutes); // Usajili na Kuingia
app.use("/api", apiRoutes);
app.use("/api/insights", insightsRoutes);
app.use("/api/superadmin", superadminRoutes);

app.listen(config.port, () => {
  console.log(`\n🌐 SaaS Admin dashboard: http://localhost:${config.port}`);
  console.log(`🔑 Wafanyabiashara wanaweza kujisajili kupitia register.html\n`);

  // Anzisha re-engagement cron job (kila saa kwa wote)
  startReEngagementJob();

  // Anzisha backup cron job (kila siku saa 8 usiku)
  startBackupJob();

  // Kwenye kuanza kwa server, anzisha WhatsApp sessions zote zilizounganishwa kabla
  initializeAllSessions().catch((err) => {
    console.error("Imeshindwa kuanzisha active sessions za WhatsApp kwenye startup:", err);
  });
});
