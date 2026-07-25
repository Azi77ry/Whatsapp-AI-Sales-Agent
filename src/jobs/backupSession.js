// src/jobs/backupSession.js
// Kazi hii inaendesha (cron) kila siku usiku wa manane kufanya backup ya /sessions
// Hii inasaidia kuzuia kupotea kwa connection za WhatsApp kama server ikipata hitilafu.

const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const SESSIONS_DIR = path.join(__dirname, "../../sessions");
const BACKUPS_DIR = path.join(__dirname, "../../backups");

/**
 * Zips the sessions directory.
 */
function runSessionBackup() {
  console.log("📦 Inaanza kufanya backup ya WhatsApp sessions...");
  
  try {
    if (!fs.existsSync(SESSIONS_DIR)) {
      console.log("ℹ️ Folder la sessions halipo, hakuna cha kubackup.");
      return;
    }

    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const zipFilePath = path.join(BACKUPS_DIR, `sessions_backup_${timestamp}.zip`);

    const zip = new AdmZip();
    zip.addLocalFolder(SESSIONS_DIR);
    zip.writeZip(zipFilePath);

    console.log(`✅ Backup imefanikiwa! Imehifadhiwa kama: ${zipFilePath}`);

    // Optional: Futa backups za zamani (mfano, zilizozidi siku 7) ili kuokoa nafasi
    cleanupOldBackups();

  } catch (err) {
    console.error("❌ Imeshindwa kufanya backup ya sessions:", err);
  }
}

/**
 * Inafuta backups zote zilizo zidi siku 7.
 */
function cleanupOldBackups() {
  try {
    const files = fs.readdirSync(BACKUPS_DIR);
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    let deletedCount = 0;
    files.forEach(file => {
      const filePath = path.join(BACKUPS_DIR, file);
      const stats = fs.statSync(filePath);
      
      // Kama faili ni backup zip na ina umri zaidi ya siku 7, ifute
      if (file.endsWith(".zip") && (now - stats.mtimeMs > SEVEN_DAYS_MS)) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    });

    if (deletedCount > 0) {
      console.log(`🧹 Imefuta backups ${deletedCount} za zamani (zilizozidi siku 7).`);
    }
  } catch (err) {
    console.error("❌ Imeshindwa kusafisha backups za zamani:", err);
  }
}

/**
 * Anzisha cron job kwa ajili ya backup
 */
function startBackupJob() {
  // Endesha kila siku saa 8 usiku (02:00 AM)
  cron.schedule("0 2 * * *", () => {
    runSessionBackup();
  });
  
  console.log("⏰ Session Backup cron job imeanzishwa (inaendeshwa kila siku 02:00 AM).");
}

module.exports = { startBackupJob, runSessionBackup };
