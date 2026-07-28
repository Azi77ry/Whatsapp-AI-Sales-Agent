// SuperAdmin JS Logic - Premium Version
const SA_BASE = "/api/superadmin";

function showToast(message, type = "success") {
  const containerId = "toast-container";
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "sa-toast";
  
  const iconColor = type === "error" ? "var(--sa-danger)" : "var(--sa-success)";
  const iconBg = type === "error" ? "rgba(255,51,102,0.15)" : "rgba(0,220,130,0.15)";
  const iconSvg = type === "error" 
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

  toast.innerHTML = `
    <div style="background: ${iconBg}; color: ${iconColor}; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
      ${iconSvg}
    </div>
    <span style="line-height:1.4;">${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transform = "translateX(0)";
    toast.style.opacity = "1";
  });

  setTimeout(() => {
    toast.style.transform = "translateX(120%)";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

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
    if (res.status === 401 || res.status === 403) {
      handleLogout();
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Hitilafu imetokea kwenye seva");
  }
  return res.json();
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";

  if (!email || !password) return errorEl.textContent = "Tafadhali jaza taarifa zote.";

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      return errorEl.textContent = data.error || "Imeshindwa kuingia.";
    }
    if (data.merchant.role !== "superadmin") {
      return errorEl.textContent = "⛔ Huna mamlaka ya SuperAdmin.";
    }

    localStorage.setItem("sa_token", data.token);
    showApp();
    showToast("Karibu kwenye Control Tower, SuperAdmin!", "success");
  } catch (err) {
    errorEl.textContent = "Hitilafu ya mtandao.";
  }
});

function handleLogout() {
  localStorage.removeItem("sa_token");
  window.location.reload();
}
document.getElementById("logoutBtn").addEventListener("click", handleLogout);

function showApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  loadStats();
  loadMerchants();
  loadSettings();
  loadWhatsappSessions();
}

// Navigation
document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
  btn.addEventListener("click", (e) => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.getAttribute("data-view");
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(`view-${target}`).classList.add("active");
  });
});

async function loadStats() {
  try {
    const data = await saFetch("/stats");
    document.getElementById("statTotalMerchants").textContent = formatNumber(data.totalMerchants);
    document.getElementById("statActiveMerchants").textContent = formatNumber(data.activeMerchants);
    document.getElementById("statSuspendedMerchants").textContent = formatNumber(data.suspendedMerchants);
    document.getElementById("statTotalConversations").textContent = formatNumber(data.totalConversations);
    document.getElementById("statTotalOrders").textContent = formatNumber(data.totalOrders);
    document.getElementById("statTotalAiUsage").textContent = formatNumber(data.totalAiUsage);
    document.getElementById("statTotalMessages").textContent = formatNumber(data.totalMessages);
  } catch (err) {
    console.error(err);
  }
}

let allMerchants = [];

async function loadMerchants() {
  try {
    const data = await saFetch("/merchants");
    allMerchants = data.merchants;
    renderMerchants(allMerchants);
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
    const statusBadge = m.status === "active" ? `<span class="badge active">Active</span>` : `<span class="badge suspended">Suspended</span>`;
    
    tr.innerHTML = `
      <td><strong>${escapeHtml(m.businessName)}</strong></td>
      <td>
        <div style="font-size:13px">${escapeHtml(m.email)}</div>
        <div style="font-size:12px; color:var(--sa-text-muted)">${escapeHtml(m.phone || 'Hakuna Namba')}</div>
      </td>
      <td>${statusBadge}</td>
      <td>${formatNumber(m._count?.orders || 0)}</td>
      <td><span style="color:var(--sa-primary)">${formatNumber(m.aiUsage)}</span> / ${m.aiLimit}</td>
      <td style="font-size:13px; color:var(--sa-text-muted)">
        <div>${m.subscriptionPlan || 'Hakuna'}</div>
        <div style="font-size:11px">${m.subscriptionEndDate ? new Date(m.subscriptionEndDate).toLocaleDateString() : 'N/A'}</div>
      </td>
      <td class="action-btns">
        <button class="btn-icon" title="Login As (Impersonate)" style="color:#00dc82" onclick="impersonateMerchant(${m.id})">🦸‍♂️</button>
        <button class="btn-icon" title="Kifurushi (Subscription)" style="color:var(--sa-primary)" onclick="openSubModal(${m.id}, '${escapeHtml(m.businessName)}')">📅</button>
        <button class="btn-icon" title="Edit AI Limit" onclick="openLimitModal(${m.id}, '${escapeHtml(m.businessName)}', ${m.aiLimit})">⚡</button>
        ${m.status === 'active' 
          ? `<button class="btn-icon" style="color:var(--sa-danger)" title="Suspend" onclick="openActionModal('suspend', ${m.id}, '${escapeHtml(m.businessName)}')">⏸</button>` 
          : `<button class="btn-icon" style="color:var(--sa-success)" title="Activate" onclick="openActionModal('activate', ${m.id}, '${escapeHtml(m.businessName)}')">▶</button>`}
        <button class="btn-icon" title="Delete" style="color:#ff3366" onclick="openActionModal('delete', ${m.id}, '${escapeHtml(m.businessName)}')">🗑</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById("merchantSearch").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = allMerchants.filter(m => 
    m.businessName.toLowerCase().includes(q) || 
    m.email.toLowerCase().includes(q)
  );
  renderMerchants(filtered);
});

// Modals Logic
let pendingAction = null;
const actionModal = document.getElementById("actionModal");

function openActionModal(action, id, name) {
  pendingAction = { action, id };
  const title = document.getElementById("actionModalTitle");
  const msg = document.getElementById("actionModalMsg");
  
  if (action === "suspend") {
    title.textContent = "Fungia Duka (Suspend)";
    msg.textContent = `Je, una uhakika unataka kusimamisha duka la "${name}"?`;
  } else if (action === "activate") {
    title.textContent = "Fungulia Duka (Activate)";
    msg.textContent = `Je, uruhusu duka la "${name}" kuendelea kutumia mfumo?`;
  } else if (action === "delete") {
    title.textContent = "Futa Kabisa (Delete)";
    msg.innerHTML = `⚠️ Duka la "${name}" litafutwa pamoja na data zake zote. <br><b>Hii hatua hairudishwi nyuma!</b>`;
  }
  
  actionModal.classList.add("active");
}

document.getElementById("actionModalClose").onclick = () => actionModal.classList.remove("active");
document.getElementById("actionModalCancel").onclick = () => actionModal.classList.remove("active");

document.getElementById("actionModalBtn").onclick = async () => {
  if (!pendingAction) return;
  const btn = document.getElementById("actionModalBtn");
  btn.disabled = true;
  btn.textContent = "Tafadhali subiri...";

  try {
    const { action, id } = pendingAction;
    if (action === "suspend" || action === "activate") {
      const status = action === "suspend" ? "suspended" : "active";
      await saFetch(`/merchants/${id}/status`, {
        method: "PUT", body: JSON.stringify({ status })
      });
      showToast(`Duka sasa ni ${status}`, "success");
    } else if (action === "delete") {
      await saFetch(`/merchants/${id}`, { method: "DELETE" });
      showToast("Duka limefutwa kabisa", "success");
    }
    actionModal.classList.remove("active");
    loadMerchants();
    loadStats();
  } catch(err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Thibitisha";
  }
};

// Limit Modal
let limitTarget = null;
const limitModal = document.getElementById("limitModal");

function openLimitModal(id, name, limit) {
  limitTarget = { id };
  document.getElementById("limitModalName").textContent = name;
  document.getElementById("limitInput").value = limit;
  limitModal.classList.add("active");
}

document.getElementById("limitModalClose").onclick = () => limitModal.classList.remove("active");
document.getElementById("limitModalCancel").onclick = () => limitModal.classList.remove("active");

document.getElementById("limitModalBtn").onclick = async () => {
  if (!limitTarget) return;
  const newLimit = parseInt(document.getElementById("limitInput").value, 10);
  if (isNaN(newLimit) || newLimit < 0) return showToast("Weka namba sahihi", "error");

  const btn = document.getElementById("limitModalBtn");
  btn.disabled = true;

  try {
    await saFetch(`/merchants/${limitTarget.id}/ai-limit`, {
      method: "PUT", body: JSON.stringify({ aiLimit: newLimit })
    });
    showToast(`Limit mpya imehifadhiwa: ${newLimit}`, "success");
    limitModal.classList.remove("active");
    loadMerchants();
  } catch(err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
};

if (localStorage.getItem("sa_token")) {
  showApp();
}

// Subscription Modal
let subTarget = null;
const subModal = document.getElementById("subModal");

function openSubModal(id, name) {
  subTarget = { id };
  document.getElementById("subModalName").textContent = name;
  document.getElementById("subMonths").value = "1";
  document.getElementById("subPlan").value = "monthly";
  subModal.classList.add("active");
}

document.getElementById("subModalClose").onclick = () => subModal.classList.remove("active");
document.getElementById("subModalCancel").onclick = () => subModal.classList.remove("active");

document.getElementById("subModalBtn").onclick = async () => {
  if (!subTarget) return;
  const monthsToAdd = parseInt(document.getElementById("subMonths").value, 10);
  const plan = document.getElementById("subPlan").value;
  if (isNaN(monthsToAdd) || monthsToAdd < 0) return showToast("Weka miezi sahihi", "error");

  const btn = document.getElementById("subModalBtn");
  btn.disabled = true;
  btn.textContent = "Inaongeza...";

  try {
    await saFetch(`/merchants/${subTarget.id}/subscription`, {
      method: "PUT", body: JSON.stringify({ subscriptionPlan: plan, monthsToAdd })
    });
    showToast(`Mteja ameongezewa kifurushi chake`, "success");
    subModal.classList.remove("active");
    loadMerchants();
  } catch(err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Hifadhi (Save)";
  }
};

// ── SETTINGS ──────────────────────────────────────
async function loadSettings() {
  try {
    const data = await saFetch("/settings");
    document.getElementById("broadcastMessage").value = data.broadcastMessage || "";
    document.getElementById("broadcastActive").checked = data.broadcastActive || false;
    document.getElementById("defaultAiLimit").value = data.defaultAiLimit || 50;
  } catch (err) {
    console.error("Failed to load settings:", err);
  }
}

document.getElementById("saveBroadcastBtn").addEventListener("click", async () => {
  const btn = document.getElementById("saveBroadcastBtn");
  btn.disabled = true;
  btn.textContent = "Inahifadhi...";
  try {
    const broadcastMessage = document.getElementById("broadcastMessage").value;
    const broadcastActive = document.getElementById("broadcastActive").checked;
    await saFetch("/settings", {
      method: "PUT",
      body: JSON.stringify({ broadcastMessage, broadcastActive })
    });
    showToast("Tangazo limehifadhiwa", "success");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Hifadhi Tangazo";
  }
});

document.getElementById("saveLimitBtn").addEventListener("click", async () => {
  const btn = document.getElementById("saveLimitBtn");
  btn.disabled = true;
  btn.textContent = "Inahifadhi...";
  try {
    const defaultAiLimit = parseInt(document.getElementById("defaultAiLimit").value, 10);
    if (isNaN(defaultAiLimit) || defaultAiLimit < 0) throw new Error("Weka namba sahihi.");
    await saFetch("/settings", {
      method: "PUT",
      body: JSON.stringify({ defaultAiLimit })
    });
    showToast("Default Limit imehifadhiwa", "success");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Hifadhi Limit";
  }
});

// ── IMPERSONATE (LOGIN AS) ──────────────────────────────────────
async function impersonateMerchant(id) {
  try {
    const data = await saFetch(`/merchants/${id}/impersonate`, { method: "POST" });
    showToast(`Inaandaa Dashboard ya ${data.merchant.businessName}...`, "success");
    
    // Simulia kuingia kwenye dashboard kwa kuweka token kwa muda
    // Lakini ili tusifute token ya SuperAdmin, tutafungua tab mpya
    // Tab mpya inahitaji token iwe kwenye localStorage yake, lakini localstorage inasharewa per domain
    // Hivyo tutatumia URL parameter kwa usalama na Dashboard itaidaka (Inahitaji dashboard app.js update kidogo)
    // Au kama simple hack: tunatengeneza URL iliyofichwa na kuingiza localStorage kule.
    
    // Njia bora: Hifadhi token ya zamani, weka mpya, fungua tab, kisha rudisha ya zamani.
    const saToken = localStorage.getItem("sa_token");
    localStorage.setItem("token", data.token); // Hii ni token inayotumiwa na Dashboard ya kawaida (merchant)
    
    window.open("/dashboard/", "_blank");
    
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ── WHATSAPP SESSIONS ───────────────────────────────────────────
async function loadWhatsappSessions() {
  try {
    const data = await saFetch("/whatsapp-sessions");
    renderWhatsappSessions(data.sessions);
  } catch (err) {
    document.getElementById("whatsappBody").innerHTML = `<tr><td colspan="4" style="color:var(--sa-danger)">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderWhatsappSessions(sessions) {
  const tbody = document.getElementById("whatsappBody");
  tbody.innerHTML = "";
  
  if (sessions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Hakuna sessions zilizopatikana</td></tr>`;
    return;
  }

  sessions.forEach(s => {
    const tr = document.createElement("tr");
    
    let statusBadge = "";
    if (s.status === "connected") statusBadge = `<span class="badge active">Connected</span>`;
    else if (s.status === "connecting") statusBadge = `<span class="badge" style="background:#ffb020; color:#000;">Connecting...</span>`;
    else if (s.status === "qr") statusBadge = `<span class="badge" style="background:#00d2ff; color:#000;">Waiting for QR</span>`;
    else statusBadge = `<span class="badge suspended">Disconnected</span>`;
    
    tr.innerHTML = `
      <td><strong>${escapeHtml(s.businessName)}</strong></td>
      <td>${escapeHtml(s.phone || 'N/A')}</td>
      <td>${statusBadge}</td>
      <td class="action-btns">
        <button class="btn-icon" style="color:var(--sa-danger)" title="Force Disconnect" onclick="disconnectWhatsappSession(${s.id}, '${escapeHtml(s.businessName)}')">🔌</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function disconnectWhatsappSession(id, name) {
  if (!confirm(`Je, una uhakika unataka kukata muunganiko wa WhatsApp wa "${name}"? Hii itamlazimu a-scan QR code upya.`)) return;
  
  try {
    await saFetch(`/whatsapp-sessions/${id}/disconnect`, { method: "POST" });
    showToast(`WhatsApp Session ya ${name} imekatwa.`, "success");
    loadWhatsappSessions();
  } catch (err) {
    showToast(err.message, "error");
  }
}
