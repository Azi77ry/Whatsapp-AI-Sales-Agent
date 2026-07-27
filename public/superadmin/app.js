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
      <td style="font-size:13px; color:var(--sa-text-muted)">${new Date(m.createdAt).toLocaleDateString()}</td>
      <td class="action-btns">
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
