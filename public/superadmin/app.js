// SuperAdmin JS Logic — Enhanced Version
// Improvements: Health Monitor, Recent Signups, Expiring Banner, Bot Toggle, Reset AI Usage, Auto-refresh
const SA_BASE = "/api/superadmin";

// ── Toast Notifications ───────────────────────────────────────────────────────
function showToast(message, type = "success") {
  const containerId = "toast-container";
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    Object.assign(container.style, { position:"fixed", bottom:"24px", right:"24px", zIndex:"10000", display:"flex", flexDirection:"column", gap:"10px" });
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "sa-toast";
  const iconColor = type === "error" ? "var(--sa-danger)" : "var(--sa-success)";
  const iconBg   = type === "error" ? "rgba(255,51,102,0.15)" : "rgba(0,220,130,0.15)";
  const iconSvg  = type === "error"
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

  toast.innerHTML = `
    <div style="background:${iconBg};color:${iconColor};width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${iconSvg}</div>
    <span style="line-height:1.4;">${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);
  requestAnimationFrame(() => { toast.style.transform = "translateX(0)"; toast.style.opacity = "1"; });
  setTimeout(() => {
    toast.style.transform = "translateX(120%)";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000)    return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("sw-TZ", { day:"2-digit", month:"short", year:"numeric" });
}

function timeAgo(d) {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return "Sasa hivi";
  if (m < 60)  return `Dakika ${m} zilizopita`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `Saa ${h} zilizopita`;
  const days = Math.floor(h / 24);
  return `Siku ${days} zilizopita`;
}

// ── API Helper ────────────────────────────────────────────────────────────────
async function saFetch(path, options = {}) {
  const token = localStorage.getItem("sa_token");
  const res = await fetch(SA_BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) handleLogout();
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Hitilafu imetokea kwenye seva");
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
document.getElementById("loginBtn").addEventListener("click", async () => {
  const email    = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl  = document.getElementById("loginError");
  errorEl.textContent = "";
  if (!email || !password) return (errorEl.textContent = "Tafadhali jaza taarifa zote.");
  try {
    const res  = await fetch("/api/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ email, password }) });
    const data = await res.json();
    if (!res.ok) return (errorEl.textContent = data.error || "Imeshindwa kuingia.");
    if (data.merchant.role !== "superadmin") return (errorEl.textContent = "⛔ Huna mamlaka ya SuperAdmin.");
    localStorage.setItem("sa_token", data.token);
    showApp();
    showToast("Karibu kwenye Control Tower, SuperAdmin!", "success");
  } catch {
    errorEl.textContent = "Hitilafu ya mtandao.";
  }
});

function handleLogout() {
  localStorage.removeItem("sa_token");
  window.location.reload();
}
document.getElementById("logoutBtn").addEventListener("click", handleLogout);

// ── Navigation ────────────────────────────────────────────────────────────────
document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.getAttribute("data-view");
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(`view-${target}`).classList.add("active");
  });
});

// ── Show App ──────────────────────────────────────────────────────────────────
function showApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  loadStats();
  loadMerchants();
  loadSettings();
  loadWhatsappSessions();
  loadHealth();
  startAutoRefresh();
}

if (localStorage.getItem("sa_token")) showApp();

// ── Auto-refresh (every 30s for Health & Sessions) ────────────────────────────
let autoRefreshInterval = null;
function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(() => {
    const activeView = document.querySelector(".view.active");
    if (!activeView) return;
    if (activeView.id === "view-health")   loadHealth();
    if (activeView.id === "view-whatsapp") loadWhatsappSessions();
  }, 30000);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const data = await saFetch("/stats");
    document.getElementById("statTotalMerchants").textContent     = formatNumber(data.totalMerchants);
    document.getElementById("statActiveMerchants").textContent    = formatNumber(data.activeMerchants);
    document.getElementById("statSuspendedMerchants").textContent = formatNumber(data.suspendedMerchants);
    document.getElementById("statTotalConversations").textContent = formatNumber(data.totalConversations);
    document.getElementById("statTotalOrders").textContent        = formatNumber(data.totalOrders);
    document.getElementById("statTotalAiUsage").textContent       = formatNumber(data.totalAiUsage);
    document.getElementById("statTotalMessages").textContent      = formatNumber(data.totalMessages);
  } catch (err) { console.error(err); }
}

// ── Merchants ─────────────────────────────────────────────────────────────────
let allMerchants = [];

async function loadMerchants() {
  try {
    const data = await saFetch("/merchants");
    allMerchants = data.merchants;
    renderMerchants(allMerchants);
    renderRecentSignups(allMerchants);
    renderExpiringBanner(allMerchants);
  } catch (err) {
    document.getElementById("merchantsBody").innerHTML = `<tr><td colspan="7" style="color:var(--sa-danger)">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderMerchants(merchants) {
  const tbody = document.getElementById("merchantsBody");
  tbody.innerHTML = "";
  if (merchants.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Hakuna maduka yaliyopatikana</td></tr>`;
    return;
  }

  merchants.forEach(m => {
    const tr = document.createElement("tr");
    if (m.expiringSoon)        tr.classList.add("row-expiring-soon");
    else if (m.subscriptionExpired) tr.classList.add("row-expired");

    const statusBadge = m.status === "active"
      ? `<span class="badge active">Active</span>`
      : `<span class="badge suspended">Suspended</span>`;

    const subColor = m.subscriptionExpired ? "var(--sa-danger)" : m.expiringSoon ? "#ffb703" : "var(--sa-text-muted)";
    const subLabel = m.subscriptionExpired ? "⚠ Expired" : m.expiringSoon ? "⏰ Inakwisha" : (m.subscriptionPlan || "—");

    tr.innerHTML = `
      <td><strong>${escapeHtml(m.businessName)}</strong></td>
      <td>
        <div style="font-size:13px">${escapeHtml(m.email)}</div>
        <div style="font-size:12px;color:var(--sa-text-muted)">${escapeHtml(m.phone || "Hakuna Namba")}</div>
      </td>
      <td>${statusBadge}</td>
      <td style="font-size:13px;">
        🛍 ${m._count?.products ?? 0} &nbsp;
        💬 ${m._count?.conversations ?? 0} &nbsp;
        📦 ${m._count?.orders ?? 0}
      </td>
      <td>
        <span style="color:var(--sa-primary)">${formatNumber(m.aiUsage)}</span>
        <span style="color:var(--sa-text-muted)"> / ${m.aiLimit}</span>
      </td>
      <td style="font-size:12px;">
        <div style="color:${subColor};font-weight:600;">${subLabel}</div>
        <div style="color:var(--sa-text-muted);">${m.subscriptionEndDate ? formatDate(m.subscriptionEndDate) : "N/A"}</div>
        <div style="color:var(--sa-text-muted);font-size:11px;">${timeAgo(m.createdAt)}</div>
      </td>
      <td class="action-btns">
        <button class="btn-icon" title="Login As (Impersonate)" style="color:#00dc82" onclick="impersonateMerchant(${m.id})">🦸‍♂️</button>
        <button class="btn-icon" title="Kifurushi (Subscription)" style="color:var(--sa-primary)" onclick="openSubModal(${m.id},'${escapeHtml(m.businessName)}')">📅</button>
        <button class="btn-icon" title="Edit AI Limit" onclick="openLimitModal(${m.id},'${escapeHtml(m.businessName)}',${m.aiLimit})">⚡</button>
        <button class="btn-icon" title="Reset AI Usage → 0" style="color:#00b4d8" onclick="resetAiUsage(${m.id},'${escapeHtml(m.businessName)}')">🔄</button>
        ${m.status === "active"
          ? `<button class="btn-icon" style="color:var(--sa-danger)" title="Suspend" onclick="openActionModal('suspend',${m.id},'${escapeHtml(m.businessName)}')">⏸</button>`
          : `<button class="btn-icon" style="color:var(--sa-success)" title="Activate" onclick="openActionModal('activate',${m.id},'${escapeHtml(m.businessName)}')">▶</button>`}
        <button class="btn-icon" title="Delete" style="color:#ff3366" onclick="openActionModal('delete',${m.id},'${escapeHtml(m.businessName)}')">🗑</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderRecentSignups(merchants) {
  const container = document.getElementById("recentSignupsList");
  const badge     = document.getElementById("recentSignupsBadge");
  const sorted    = [...merchants].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
  badge.textContent = `Wapya ${sorted.length}`;

  if (sorted.length === 0) {
    container.innerHTML = `<div class="loading-text">Hakuna wasajili bado.</div>`;
    return;
  }
  container.innerHTML = sorted.map(m => `
    <div class="signup-card">
      <div class="signup-avatar">🏪</div>
      <div>
        <div class="signup-name">${escapeHtml(m.businessName)}</div>
        <div class="signup-meta">${escapeHtml(m.email)}</div>
        <div class="signup-meta">${timeAgo(m.createdAt)}</div>
      </div>
      <span class="signup-plan">${m.subscriptionPlan || "trial"}</span>
    </div>
  `).join("");
}

function renderExpiringBanner(merchants) {
  const banner   = document.getElementById("expiringBanner");
  const expiring = merchants.filter(m => m.expiringSoon);
  if (expiring.length === 0) { banner.classList.add("hidden"); return; }
  banner.classList.remove("hidden");
  banner.innerHTML = `⏰ <strong>${expiring.length} duka</strong> lina/zina subscription inayokwisha ndani ya siku 7: 
    ${expiring.map(m => `<strong>${escapeHtml(m.businessName)}</strong> (${formatDate(m.subscriptionEndDate)})`).join(", ")}`;
}

document.getElementById("merchantSearch").addEventListener("input", e => {
  const q        = e.target.value.toLowerCase();
  const filtered = allMerchants.filter(m =>
    m.businessName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
  );
  renderMerchants(filtered);
});

// ── Reset AI Usage ────────────────────────────────────────────────────────────
async function resetAiUsage(id, name) {
  if (!confirm(`Je, una uhakika unataka kufuta AI Usage ya "${name}" (kutoka 0)?`)) return;
  try {
    await saFetch(`/merchants/${id}/reset-ai-usage`, { method: "PUT" });
    showToast(`AI Usage ya ${name} imefutwa kuwa 0`, "success");
    loadMerchants();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ── Action Modal ──────────────────────────────────────────────────────────────
let pendingAction = null;
const actionModal = document.getElementById("actionModal");

function openActionModal(action, id, name) {
  pendingAction = { action, id };
  const title = document.getElementById("actionModalTitle");
  const msg   = document.getElementById("actionModalMsg");
  if (action === "suspend") {
    title.textContent = "Fungia Duka (Suspend)";
    msg.textContent   = `Je, una uhakika unataka kusimamisha duka la "${name}"?`;
  } else if (action === "activate") {
    title.textContent = "Fungulia Duka (Activate)";
    msg.textContent   = `Je, uruhusu duka la "${name}" kuendelea kutumia mfumo?`;
  } else if (action === "delete") {
    title.textContent = "Futa Kabisa (Delete)";
    msg.innerHTML     = `⚠️ Duka la "${name}" litafutwa pamoja na data zake zote.<br><b>Hii hatua hairudishwi nyuma!</b>`;
  }
  actionModal.classList.add("active");
}

document.getElementById("actionModalClose").onclick  = () => actionModal.classList.remove("active");
document.getElementById("actionModalCancel").onclick = () => actionModal.classList.remove("active");
document.getElementById("actionModalBtn").onclick    = async () => {
  if (!pendingAction) return;
  const btn = document.getElementById("actionModalBtn");
  btn.disabled = true; btn.textContent = "Tafadhali subiri...";
  try {
    const { action, id } = pendingAction;
    if (action === "suspend" || action === "activate") {
      const status = action === "suspend" ? "suspended" : "active";
      await saFetch(`/merchants/${id}/status`, { method:"PUT", body:JSON.stringify({ status }) });
      showToast(`Duka sasa ni ${status}`, "success");
    } else if (action === "delete") {
      await saFetch(`/merchants/${id}`, { method:"DELETE" });
      showToast("Duka limefutwa kabisa", "success");
    }
    actionModal.classList.remove("active");
    loadMerchants(); loadStats();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false; btn.textContent = "Thibitisha";
  }
};

// ── Limit Modal ───────────────────────────────────────────────────────────────
let limitTarget = null;
const limitModal = document.getElementById("limitModal");

function openLimitModal(id, name, limit) {
  limitTarget = { id };
  document.getElementById("limitModalName").textContent = name;
  document.getElementById("limitInput").value = limit;
  limitModal.classList.add("active");
}
document.getElementById("limitModalClose").onclick  = () => limitModal.classList.remove("active");
document.getElementById("limitModalCancel").onclick = () => limitModal.classList.remove("active");
document.getElementById("limitModalBtn").onclick    = async () => {
  if (!limitTarget) return;
  const newLimit = parseInt(document.getElementById("limitInput").value, 10);
  if (isNaN(newLimit) || newLimit < 0) return showToast("Weka namba sahihi", "error");
  const btn = document.getElementById("limitModalBtn");
  btn.disabled = true;
  try {
    await saFetch(`/merchants/${limitTarget.id}/ai-limit`, { method:"PUT", body:JSON.stringify({ aiLimit: newLimit }) });
    showToast(`Limit mpya imehifadhiwa: ${newLimit}`, "success");
    limitModal.classList.remove("active");
    loadMerchants();
  } catch (err) { showToast(err.message, "error"); }
  finally { btn.disabled = false; }
};

// ── Subscription Modal ────────────────────────────────────────────────────────
let subTarget = null;
const subModal = document.getElementById("subModal");

function openSubModal(id, name) {
  subTarget = { id };
  document.getElementById("subModalName").textContent = name;
  document.getElementById("subMonths").value = "1";
  document.getElementById("subPlan").value   = "monthly";
  subModal.classList.add("active");
}
document.getElementById("subModalClose").onclick  = () => subModal.classList.remove("active");
document.getElementById("subModalCancel").onclick = () => subModal.classList.remove("active");
document.getElementById("subModalBtn").onclick    = async () => {
  if (!subTarget) return;
  const monthsToAdd     = parseInt(document.getElementById("subMonths").value, 10);
  const plan            = document.getElementById("subPlan").value;
  if (isNaN(monthsToAdd) || monthsToAdd < 0) return showToast("Weka miezi sahihi", "error");
  const btn = document.getElementById("subModalBtn");
  btn.disabled = true; btn.textContent = "Inaongeza...";
  try {
    await saFetch(`/merchants/${subTarget.id}/subscription`, { method:"PUT", body:JSON.stringify({ subscriptionPlan:plan, monthsToAdd }) });
    showToast("Mteja ameongezewa kifurushi chake", "success");
    subModal.classList.remove("active");
    loadMerchants();
  } catch (err) { showToast(err.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "Hifadhi (Save)"; }
};

// ── Settings ──────────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const data = await saFetch("/settings");
    document.getElementById("broadcastMessage").value  = data.broadcastMessage || "";
    document.getElementById("broadcastActive").checked = data.broadcastActive || false;
    document.getElementById("defaultAiLimit").value    = data.defaultAiLimit || 50;
  } catch (err) { console.error("Failed to load settings:", err); }
}

document.getElementById("saveBroadcastBtn").addEventListener("click", async () => {
  const btn = document.getElementById("saveBroadcastBtn");
  btn.disabled = true; btn.textContent = "Inahifadhi...";
  try {
    await saFetch("/settings", { method:"PUT", body:JSON.stringify({
      broadcastMessage: document.getElementById("broadcastMessage").value,
      broadcastActive:  document.getElementById("broadcastActive").checked,
    }) });
    showToast("Tangazo limehifadhiwa", "success");
  } catch (err) { showToast(err.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "Hifadhi Tangazo"; }
});

document.getElementById("saveLimitBtn").addEventListener("click", async () => {
  const btn = document.getElementById("saveLimitBtn");
  btn.disabled = true; btn.textContent = "Inahifadhi...";
  try {
    const defaultAiLimit = parseInt(document.getElementById("defaultAiLimit").value, 10);
    if (isNaN(defaultAiLimit) || defaultAiLimit < 0) throw new Error("Weka namba sahihi.");
    await saFetch("/settings", { method:"PUT", body:JSON.stringify({ defaultAiLimit }) });
    showToast("Default Limit imehifadhiwa", "success");
  } catch (err) { showToast(err.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "Hifadhi Limit"; }
});

// ── Impersonate ───────────────────────────────────────────────────────────────
async function impersonateMerchant(id) {
  try {
    const data = await saFetch(`/merchants/${id}/impersonate`, { method:"POST" });
    showToast(`Inaandaa Dashboard ya ${data.merchant.businessName}...`, "success");
    const saToken = localStorage.getItem("sa_token");
    localStorage.setItem("token", data.token);
    window.open("/dashboard/", "_blank");
  } catch (err) { showToast(err.message, "error"); }
}

// ── WhatsApp Sessions ─────────────────────────────────────────────────────────
async function loadWhatsappSessions() {
  try {
    const data = await saFetch("/whatsapp-sessions");
    renderWhatsappSessions(data.sessions);
  } catch (err) {
    document.getElementById("whatsappBody").innerHTML = `<tr><td colspan="5" style="color:var(--sa-danger)">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderWhatsappSessions(sessions) {
  const tbody = document.getElementById("whatsappBody");
  tbody.innerHTML = "";
  if (sessions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Hakuna sessions zilizopatikana</td></tr>`;
    return;
  }
  sessions.forEach(s => {
    const tr = document.createElement("tr");
    let statusBadge;
    if (s.status === "connected" || s.status === "open")
      statusBadge = `<span class="badge active">Connected</span>`;
    else if (s.status === "connecting")
      statusBadge = `<span class="badge" style="background:#ffb020;color:#000;">Connecting...</span>`;
    else if (s.status === "qr")
      statusBadge = `<span class="badge" style="background:#00d2ff;color:#000;">Waiting QR</span>`;
    else
      statusBadge = `<span class="badge suspended">Disconnected</span>`;

    const botChecked = s.botActive !== false ? "checked" : "";

    tr.innerHTML = `
      <td><strong>${escapeHtml(s.businessName)}</strong></td>
      <td>${escapeHtml(s.phone || "N/A")}</td>
      <td>${statusBadge}</td>
      <td>
        <label class="bot-toggle" title="${s.botActive !== false ? "Bot: ON" : "Bot: OFF"}">
          <input type="checkbox" ${botChecked} onchange="toggleBotStatus(${s.id}, this.checked, '${escapeHtml(s.businessName)}')">
          <span class="bot-toggle-slider"></span>
        </label>
      </td>
      <td class="action-btns">
        <button class="btn-icon" style="color:var(--sa-danger)" title="Force Disconnect" onclick="disconnectWhatsappSession(${s.id},'${escapeHtml(s.businessName)}')">🔌</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function toggleBotStatus(id, active, name) {
  try {
    await saFetch(`/merchants/${id}/bot-status`, { method:"PUT", body:JSON.stringify({ botActive: active }) });
    showToast(`Bot ya ${name} ${active ? "imewashwa ✅" : "imezimwa ⏸"}`, "success");
  } catch (err) {
    showToast(err.message, "error");
    loadWhatsappSessions(); // revert UI on error
  }
}

async function disconnectWhatsappSession(id, name) {
  if (!confirm(`Je, una uhakika unataka kukata muunganiko wa WhatsApp wa "${name}"?`)) return;
  try {
    await saFetch(`/whatsapp-sessions/${id}/disconnect`, { method:"POST" });
    showToast(`WhatsApp Session ya ${name} imekatwa.`, "success");
    loadWhatsappSessions();
  } catch (err) { showToast(err.message, "error"); }
}

// ── System Health ─────────────────────────────────────────────────────────────
async function loadHealth() {
  try {
    const data = await saFetch("/health");

    // Server
    document.getElementById("hUptime").textContent    = data.server.uptime;
    document.getElementById("hStartedAt").textContent = new Date(data.server.startedAt).toLocaleString("sw-TZ");
    document.getElementById("hNodeVersion").textContent = data.server.nodeVersion;
    document.getElementById("hPlatform").textContent    = data.server.platform;

    // Memory
    const heapUsed  = parseFloat(data.memory.heapUsedMB);
    const heapTotal = parseFloat(data.memory.heapTotalMB);
    const pct       = heapTotal > 0 ? Math.min((heapUsed / heapTotal) * 100, 100).toFixed(0) : 0;
    document.getElementById("hHeapUsed").textContent  = `${data.memory.heapUsedMB} MB`;
    document.getElementById("hHeapTotal").textContent = `${data.memory.heapTotalMB} MB`;
    document.getElementById("hRss").textContent       = `${data.memory.rssMB} MB`;
    document.getElementById("hMemBar").style.width    = `${pct}%`;
    document.getElementById("hMemPercent").textContent = `${pct}% inatumika`;

    // WhatsApp
    document.getElementById("hWaTotalMerchants").textContent = data.whatsapp.totalMerchants;
    document.getElementById("hWaConnected").textContent      = data.whatsapp.connected;
    document.getElementById("hWaDisconnected").textContent   = data.whatsapp.disconnected;

    // Database
    const dbStatusEl = document.getElementById("hDbStatus");
    if (data.database.status === "ok") {
      dbStatusEl.textContent  = "✅ Connected";
      dbStatusEl.style.color  = "var(--sa-success)";
    } else {
      dbStatusEl.textContent  = "❌ Error";
      dbStatusEl.style.color  = "var(--sa-danger)";
    }
    document.getElementById("hDbPing").textContent        = data.database.pingMs !== null ? `${data.database.pingMs} ms` : "—";
    document.getElementById("hLastChecked").textContent   = new Date().toLocaleTimeString("sw-TZ");
  } catch (err) {
    console.error("Health load failed:", err);
  }
}
