// SuperAdmin JS Logic — Premium Enterprise Version (English)
const SA_BASE = "/api/superadmin";

// ── Global State ──────────────────────────────────────────────────────────────
let allMerchants = [];
let autoRefreshInterval = null;
let pendingAction = null;
let limitTarget = null;
let subTarget = null;

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
  const iconColor = type === "error" ? "var(--rose)" : "var(--emerald)";
  const iconBg   = type === "error" ? "rgba(244,63,94,0.15)" : "rgba(16,185,129,0.15)";
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
  return new Date(d).toLocaleDateString("en-US", { day:"2-digit", month:"short", year:"numeric" });
}

function timeAgo(d) {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return "Just now";
  if (m < 60)  return `${m} mins ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h} hours ago`;
  const days = Math.floor(h / 24);
  return `${days} days ago`;
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
    throw new Error(err.error || "A server error occurred");
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
document.getElementById("loginBtn").addEventListener("click", async () => {
  const email    = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl  = document.getElementById("loginError");
  errorEl.textContent = "";
  if (!email || !password) return (errorEl.textContent = "Please fill in all credentials.");
  
  const btn = document.getElementById("loginBtn");
  btn.disabled = true;
  btn.textContent = "Authenticating...";

  try {
    const res  = await fetch("/api/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ email, password }) });
    const data = await res.json();
    if (!res.ok) return (errorEl.textContent = data.error || "Authentication failed.");
    if (data.merchant.role !== "superadmin") return (errorEl.textContent = "⛔ Unauthorized: SuperAdmin privileges required.");
    localStorage.setItem("sa_token", data.token);
    showApp();
    showToast("Welcome to the Control Center!", "success");
  } catch {
    errorEl.textContent = "Network error occurred.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign In to Control Center";
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
    if (document.getElementById("statWhatsappConnected")) {
      document.getElementById("statWhatsappConnected").textContent = formatNumber(data.whatsappConnected || 0);
    }
    if (document.getElementById("statWhatsappDisconnected")) {
      document.getElementById("statWhatsappDisconnected").textContent = formatNumber(data.whatsappDisconnected || 0);
    }
  } catch (err) { console.error(err); }
}

// ── Merchants ─────────────────────────────────────────────────────────────────
async function loadMerchants() {
  try {
    const data = await saFetch("/merchants");
    allMerchants = data.merchants;
    renderMerchants(allMerchants);
    renderRecentSignups(allMerchants);
    renderExpiringBanner(allMerchants);
  } catch (err) {
    document.getElementById("merchantsBody").innerHTML = `<tr><td colspan="7" style="color:var(--rose)">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderMerchants(merchants) {
  const tbody = document.getElementById("merchantsBody");
  tbody.innerHTML = "";
  if (merchants.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 40px; color: var(--text-muted);">No merchants found.</td></tr>`;
    return;
  }

  merchants.forEach(m => {
    const tr = document.createElement("tr");
    if (m.expiringSoon)        tr.classList.add("row-expiring-soon");
    else if (m.subscriptionExpired) tr.classList.add("row-expired");

    const statusBadge = m.status === "active"
      ? `<span class="badge active">Active</span>`
      : `<span class="badge suspended">Suspended</span>`;

    const subColor = m.subscriptionExpired ? "var(--rose)" : m.expiringSoon ? "var(--amber)" : "var(--text-muted)";
    const subLabel = m.subscriptionExpired ? "⚠ Expired" : m.expiringSoon ? "⏰ Expiring Soon" : (m.subscriptionPlan || "—");

    tr.innerHTML = `
      <td><strong>${escapeHtml(m.businessName)}</strong></td>
      <td>
        <div style="font-size:13px">${escapeHtml(m.email)}</div>
        <div class="text-muted" style="font-size:12px; margin-top:2px;">${escapeHtml(m.phone || "No phone")}</div>
      </td>
      <td>
        <div style="margin-bottom: 4px;">${statusBadge}</div>
        <div>
          ${m.whatsappStatus === 'connected' 
            ? '<span class="badge" style="background: rgba(16,185,129,0.1); color: var(--emerald); border-color: rgba(16,185,129,0.2);">📱 WA: Connected</span>' 
            : '<span class="badge" style="background: rgba(245,158,11,0.1); color: var(--amber); border-color: rgba(245,158,11,0.2);">🔌 WA: Disconnected</span>'}
        </div>
      </td>
      <td style="font-size:13px;">
        🛍 ${m._count?.products ?? 0} &nbsp;
        💬 ${m._count?.conversations ?? 0} &nbsp;
        📦 ${m._count?.orders ?? 0}
      </td>
      <td>
        <span class="text-indigo" style="font-weight:600">${formatNumber(m.aiUsage)}</span>
        <span class="text-muted"> / ${m.aiLimit}</span>
      </td>
      <td style="font-size:12px;">
        <div style="color:${subColor};font-weight:600;">${subLabel}</div>
        <div class="text-muted" style="margin-top:2px;">${m.subscriptionEndDate ? formatDate(m.subscriptionEndDate) : "N/A"}</div>
        <div class="text-muted" style="font-size:11px; margin-top:2px;">Joined ${timeAgo(m.createdAt)}</div>
      </td>
      <td class="action-btns">
        <button class="btn-icon" title="Login As (Impersonate)" onclick="impersonateMerchant(${m.id})">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </button>
        <button class="btn-icon" title="Manage Subscription" onclick="openSubModal(${m.id},'${escapeHtml(m.businessName)}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
        </button>
        <button class="btn-icon" title="Edit AI Limit" onclick="openLimitModal(${m.id},'${escapeHtml(m.businessName)}',${m.aiLimit})">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </button>
        <button class="btn-icon" title="Reset AI Usage to 0" onclick="resetAiUsage(${m.id},'${escapeHtml(m.businessName)}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
        ${m.status === "active"
          ? `<button class="btn-icon" title="Suspend Account" onclick="openActionModal('suspend',${m.id},'${escapeHtml(m.businessName)}')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="10" x2="10" y1="15" y2="9"/><line x1="14" x2="14" y1="15" y2="9"/></svg></button>`
          : `<button class="btn-icon" title="Activate Account" onclick="openActionModal('activate',${m.id},'${escapeHtml(m.businessName)}')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg></button>`}
        <button class="btn-icon" title="Delete Account" onclick="openActionModal('delete',${m.id},'${escapeHtml(m.businessName)}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderRecentSignups(merchants) {
  const container = document.getElementById("recentSignupsList");
  const badge     = document.getElementById("recentSignupsBadge");
  const sorted    = [...merchants].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
  badge.textContent = `${sorted.length} New`;

  if (sorted.length === 0) {
    container.innerHTML = `<div class="loading-text">No recent signups.</div>`;
    return;
  }
  container.innerHTML = sorted.map(m => `
    <div class="signup-card">
      <div class="signup-avatar">🏢</div>
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
  banner.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    <strong>${expiring.length} account(s)</strong> have a subscription expiring within 7 days: 
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
  if (!confirm(`Are you sure you want to reset AI Token Usage for "${name}" to 0?`)) return;
  try {
    await saFetch(`/merchants/${id}/reset-ai-usage`, { method: "PUT" });
    showToast(`AI Usage for ${name} reset to 0`, "success");
    loadMerchants();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ── Action Modal ──────────────────────────────────────────────────────────────
const actionModal = document.getElementById("actionModal");

function openActionModal(action, id, name) {
  pendingAction = { action, id };
  const title = document.getElementById("actionModalTitle");
  const msg   = document.getElementById("actionModalMsg");
  if (action === "suspend") {
    title.textContent = "Suspend Account";
    msg.textContent   = `Are you sure you want to suspend "${name}"? They will lose access immediately.`;
  } else if (action === "activate") {
    title.textContent = "Activate Account";
    msg.textContent   = `Are you sure you want to reactivate "${name}"?`;
  } else if (action === "delete") {
    title.textContent = "Permanently Delete Account";
    msg.innerHTML     = `⚠️ You are about to permanently delete "${name}" and all associated data (orders, messages, etc).<br><br><b>This action cannot be undone!</b>`;
  }
  actionModal.classList.add("active");
}

document.getElementById("actionModalClose").onclick  = () => actionModal.classList.remove("active");
document.getElementById("actionModalCancel").onclick = () => actionModal.classList.remove("active");
document.getElementById("actionModalBtn").onclick    = async () => {
  if (!pendingAction) return;
  const btn = document.getElementById("actionModalBtn");
  
  if (pendingAction.action === "delete") {
    btn.classList.add("btn-danger");
    btn.classList.remove("btn-primary");
  }
  
  btn.disabled = true; btn.textContent = "Processing...";
  try {
    const { action, id } = pendingAction;
    if (action === "suspend" || action === "activate") {
      const status = action === "suspend" ? "suspended" : "active";
      await saFetch(`/merchants/${id}/status`, { method:"PUT", body:JSON.stringify({ status }) });
      showToast(`Account successfully ${status}`, "success");
    } else if (action === "delete") {
      await saFetch(`/merchants/${id}`, { method:"DELETE" });
      showToast("Account permanently deleted", "success");
    }
    actionModal.classList.remove("active");
    loadMerchants(); loadStats();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false; btn.textContent = "Confirm Action";
    btn.classList.remove("btn-danger");
    btn.classList.add("btn-primary");
  }
};

// ── Limit Modal ───────────────────────────────────────────────────────────────
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
  if (isNaN(newLimit) || newLimit < 0) return showToast("Enter a valid number", "error");
  const btn = document.getElementById("limitModalBtn");
  btn.disabled = true;
  try {
    await saFetch(`/merchants/${limitTarget.id}/ai-limit`, { method:"PUT", body:JSON.stringify({ aiLimit: newLimit }) });
    showToast(`New limit saved: ${newLimit} tokens`, "success");
    limitModal.classList.remove("active");
    loadMerchants();
  } catch (err) { showToast(err.message, "error"); }
  finally { btn.disabled = false; }
};

// ── Subscription Modal ────────────────────────────────────────────────────────
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
  if (isNaN(monthsToAdd) || monthsToAdd < 0) return showToast("Enter a valid number of months", "error");
  const btn = document.getElementById("subModalBtn");
  btn.disabled = true; btn.textContent = "Updating...";
  try {
    await saFetch(`/merchants/${subTarget.id}/subscription`, { method:"PUT", body:JSON.stringify({ subscriptionPlan:plan, monthsToAdd }) });
    showToast("Subscription updated successfully", "success");
    subModal.classList.remove("active");
    loadMerchants();
  } catch (err) { showToast(err.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "Apply Changes"; }
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
  btn.disabled = true; btn.textContent = "Saving...";
  try {
    await saFetch("/settings", { method:"PUT", body:JSON.stringify({
      broadcastMessage: document.getElementById("broadcastMessage").value,
      broadcastActive:  document.getElementById("broadcastActive").checked,
    }) });
    showToast("Announcement settings saved", "success");
  } catch (err) { showToast(err.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "Save Announcement"; }
});

document.getElementById("saveLimitBtn").addEventListener("click", async () => {
  const btn = document.getElementById("saveLimitBtn");
  btn.disabled = true; btn.textContent = "Saving...";
  try {
    const defaultAiLimit = parseInt(document.getElementById("defaultAiLimit").value, 10);
    if (isNaN(defaultAiLimit) || defaultAiLimit < 0) throw new Error("Enter a valid number.");
    await saFetch("/settings", { method:"PUT", body:JSON.stringify({ defaultAiLimit }) });
    showToast("Default limits saved", "success");
  } catch (err) { showToast(err.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "Save Default Limit"; }
});

// ── Impersonate ───────────────────────────────────────────────────────────────
async function impersonateMerchant(id) {
  try {
    const data = await saFetch(`/merchants/${id}/impersonate`, { method:"POST" });
    showToast(`Initiating dashboard for ${data.merchant.businessName}...`, "success");
    localStorage.setItem("token", data.token); // merchant token
    window.open("/dashboard/", "_blank");
  } catch (err) { showToast(err.message, "error"); }
}

// ── WhatsApp Sessions ─────────────────────────────────────────────────────────
async function loadWhatsappSessions() {
  try {
    const data = await saFetch("/whatsapp-sessions");
    renderWhatsappSessions(data.sessions);
  } catch (err) {
    document.getElementById("whatsappBody").innerHTML = `<tr><td colspan="5" style="color:var(--rose)">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderWhatsappSessions(sessions) {
  const tbody = document.getElementById("whatsappBody");
  tbody.innerHTML = "";
  if (sessions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 40px; color: var(--text-muted);">No active sessions found</td></tr>`;
    return;
  }
  sessions.forEach(s => {
    const tr = document.createElement("tr");
    let statusBadge;
    if (s.status === "connected" || s.status === "open")
      statusBadge = `<span class="badge active">Connected</span>`;
    else if (s.status === "connecting")
      statusBadge = `<span class="badge connecting">Connecting...</span>`;
    else if (s.status === "qr")
      statusBadge = `<span class="badge waiting">Waiting for QR</span>`;
    else
      statusBadge = `<span class="badge suspended">Disconnected</span>`;

    const botChecked = s.botActive !== false ? "checked" : "";

    tr.innerHTML = `
      <td><strong>${escapeHtml(s.businessName)}</strong></td>
      <td class="mono" style="font-size:13px">${escapeHtml(s.phone || "N/A")}</td>
      <td>${statusBadge}</td>
      <td>
        <label class="bot-toggle" title="${s.botActive !== false ? "Bot is ON" : "Bot is OFF"}">
          <input type="checkbox" ${botChecked} onchange="toggleBotStatus(${s.id}, this.checked, '${escapeHtml(s.businessName)}')">
          <span class="bot-toggle-slider"></span>
        </label>
      </td>
      <td class="action-btns">
        <button class="btn-icon" style="color:var(--rose); border-color:rgba(244,63,94,0.3)" title="Force Disconnect Device" onclick="disconnectWhatsappSession(${s.id},'${escapeHtml(s.businessName)}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a4 4 0 0 0-8 0v8a4 4 0 0 0 8 0V8z"/><path d="M12 22v-2"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function toggleBotStatus(id, active, name) {
  try {
    await saFetch(`/merchants/${id}/bot-status`, { method:"PUT", body:JSON.stringify({ botActive: active }) });
    showToast(`Bot for ${name} is now ${active ? "ON ✅" : "OFF ⏸"}`, "success");
  } catch (err) {
    showToast(err.message, "error");
    loadWhatsappSessions(); // revert UI on error
  }
}

async function disconnectWhatsappSession(id, name) {
  if (!confirm(`Are you sure you want to force disconnect the WhatsApp session for "${name}"?\nThey will need to scan the QR code again.`)) return;
  try {
    await saFetch(`/whatsapp-sessions/${id}/disconnect`, { method:"POST" });
    showToast(`WhatsApp Session for ${name} has been disconnected.`, "success");
    loadWhatsappSessions();
  } catch (err) { showToast(err.message, "error"); }
}

// ── System Health ─────────────────────────────────────────────────────────────
async function loadHealth() {
  try {
    const data = await saFetch("/health");

    // Server
    document.getElementById("hUptime").textContent    = data.server.uptime;
    document.getElementById("hStartedAt").textContent = new Date(data.server.startedAt).toLocaleString("en-US");
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
    document.getElementById("hMemPercent").textContent = `${pct}% used`;

    // WhatsApp
    document.getElementById("hWaTotalMerchants").textContent = data.whatsapp.totalMerchants;
    document.getElementById("hWaConnected").textContent      = data.whatsapp.connected;
    document.getElementById("hWaDisconnected").textContent   = data.whatsapp.disconnected;

    // Database
    const dbStatusEl = document.getElementById("hDbStatus");
    if (data.database.status === "ok") {
      dbStatusEl.textContent  = "Operational";
      dbStatusEl.className    = "health-value ok";
    } else {
      dbStatusEl.textContent  = "Error";
      dbStatusEl.className    = "health-value error";
    }
    document.getElementById("hDbPing").textContent        = data.database.pingMs !== null ? `${data.database.pingMs} ms` : "—";
    document.getElementById("hLastChecked").textContent   = new Date().toLocaleTimeString("en-US");
  } catch (err) {
    console.error("Health load failed:", err);
  }
}
