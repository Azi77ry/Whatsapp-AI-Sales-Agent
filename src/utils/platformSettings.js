const fs = require('fs');
const path = require('path');

const settingsPath = path.join(__dirname, '..', '..', 'platform-settings.json');

const defaultSettings = {
  broadcastMessage: "",
  broadcastActive: false,
  defaultAiLimit: 100
};

function getSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return { ...defaultSettings, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error("Error reading platform settings:", err);
  }
  return defaultSettings;
}

function saveSettings(newSettings) {
  try {
    const current = getSettings();
    const updated = { ...current, ...newSettings };
    fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  } catch (err) {
    console.error("Error saving platform settings:", err);
    throw err;
  }
}

module.exports = {
  getSettings,
  saveSettings
};
