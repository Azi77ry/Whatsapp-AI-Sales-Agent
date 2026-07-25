// Super-Admin Dashboard Logic — Kamili

const API_BASE = "/api";
const SA_BASE = "/api/superadmin";

// ── HELPERS ──────────────────────────────────────
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
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
    const err = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      handleLogout();
    }
    throw new Error(err.error || "Hitilafu imetokea");
  }
  return res.json();
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("sw", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

// ── LOGIN ────────────────────────────────────────
document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";

  if (!email || !password) {
    errorEl.textContent = "Jaza email na password.";
    return;
  }

  try {
    const res = await fetch(API_BASE + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || "Imeshindwa kuingia.";
      return;
    }

    if (data.merchant.role !== "superadmin") {
      errorEl.textContent = "⛔ Akaunti hii si ya Super-Admin. Ufikiaji umekataliwa.";
      return;
    }

    localStorage.setItem("sa_token", data.token);
    localStorage.setItem("sa_info", JSON.stringify(data.merchant));
    showApp();
  } catch (err) {
    errorEl.textContent = "Hitilafu ya mtandao. Jaribu tena.";
  }
});

document.getElementById("loginPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("loginBtn").click();
});
document.getElementById("loginEmail").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("loginPassword").focus();
});

function handleLogout() {
  localStorage.removeItem("sa_token");
  localStorage.removeItem("sa_info");
  window.location.reload();
}

document.getElementById("logoutBtn").addEventListener("click", handleLogout);

// ── APP INIT ─────────────────────────────────────
function showApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");

  // Show admin name
  try {
    const info = JSON.parse(localStorage.getItem("sa_info"));
    if (info) {
      document.getElementById("adminName").textContent = info.businessName || "Super Admin";
    }
  } catch (e) { /* ignore */ }

  loadOverview();
}

// Auto-login
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("sa_token");
  const info = localStorage.getItem("sa_info");
  if (token && info) {
    try {
      const merchant = JSON.parse(info);
      if (merchant.role === "superadmin") {
        showApp();
        return;
      }
    } catch (e) { /* ignore */ }
  }
  document.getElementById("loginScreen").classList.remove("hidden");
});

// ── NAVIGATION ───────────────────────────────────
document.querySelectorAll(".nav-item").forEach((btn) => {
  if (btn.id === "logoutBtn") return;
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => {
      if (b.id !== "logoutBtn") b.classList.remove("active");
    });
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("view-" + btn.dataset.view).classList.add("active");

    if (btn.dataset.view === "overview") loadOverview();
    if (btn.dataset.view === "merchants") loadMerchants();
  });
});

// ── OVERVIEW ─────────────────────────────────────
async function loadOverview() {
  try {
    const data = await saFetch("/stats");
    document.getElementById("statTotalMerchants").textContent = formatNumber(data.totalMerchants);
    document.getElementById("statActiveMerchants").textContent = formatNumber(data.activeMerchants);
    document.getElementById("statSuspendedMerchants").textContent = formatNumber(data.suspendedMerchants);
    document.getElementById("statTotalConversations").textContent = formatNumber(data.totalConversations);
    document.getElementById("statTotalOrders").textContent = formatNumber(data.totalOrders);
    document.getElementById("statTotalAiUsage").textContent = formatNumber(data.totalAiUsage);
    document.getElementById("statTotalMessages").textContent = formatNumber(data.totalMessages);

    // Load recent merchants for overview table
    loadRecentMerchants();
  } catch (err) {
    console.error("Overview error:", err);
  }
}

async function loadRecentMerchants() {
  const tbody = document.getElementById("recentMerchantsBody");
  try {
    const data = await saFetch("/merchants");
    if (!data.merchants || data.merchants.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="loading-text">Hakuna maduka bado. Wafanyabiashara bado hawajajisajili.</td></tr>`;
      return;
    }
    tbody.innerHTML = "";
    // Show max 5 recent
    data.merchants.slice(0, 5).forEach((m) => {
      const tr = document.createElement("tr");
      const statusBadge = m.status === "active"
        ? `<span class="badge badge-active">Hai</span>`
        : `<span class="badge badge-suspended">Imesimamishwa</span>`;
      tr.innerHTML = `
        <td><strong>${escapeHtml(m.businessName)}</strong></td>
        <td>${escapeHtml(m.email)}</td>
        <td>${statusBadge}</td>
        <td>${m._count.conversations}</td>
        <td>${m._count.orders}</td>
        <td>${formatDate(m.createdAt)}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-text" style="color:var(--red);">Hitilafu: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// ── MERCHANTS TABLE ──────────────────────────────
let allMerchants = [];

async function loadMerchants() {
  const tbody = document.getElementById("merchantsBody");
  tbody.innerHTML = `<tr><td colspan="11" class="loading-text">Inapakia...</td></tr>`;

  try {
    const data = await saFetch("/merchants");
    allMerchants = data.merchants || [];
    renderMerchants(allMerchants);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="11" class="loading-text" style="color:var(--red);">Hitilafu: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderMerchants(merchants) {
  const tbody = document.getElementById("merchantsBody");

  if (merchants.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="loading-text">Hakuna wafanyabiashara wanaolingana na utafutaji wako.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  merchants.forEach((m, idx) => {
    const tr = document.createElement("tr");

    const statusBadge = m.status === "active"
      ? `<span class="badge badge-active">Hai</span>`
      : `<span class="badge badge-suspended">Simamishwa</span>`;

    const toggleBtn = m.status === "active"
      ? `<button class="btn-sm btn-suspend" data-action="suspend" data-id="${m.id}" data-name="${escapeHtml(m.businessName)}">⏸ Simamisha</button>`
      : `<button class="btn-sm btn-activate" data-action="activate" data-id="${m.id}" data-name="${escapeHtml(m.businessName)}">▶ Amilisha</button>`;

    const aiPercent = m.aiLimit > 0 ? Math.round((m.aiUsage / m.aiLimit) * 100) : 0;
    const aiColor = aiPercent >= 90 ? "var(--red)" : aiPercent >= 70 ? "var(--amber)" : "var(--green)";

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${escapeHtml(m.businessName)}</strong></td>
      <td>${escapeHtml(m.email)}</td>
      <td>${escapeHtml(m.phone || "—")}</td>
      <td>${statusBadge}</td>
      <td>${m._count.products}</td>
      <td>${m._count.conversations}</td>
      <td>${m._count.orders}</td>
      <td>
        <div style="font-size:12px;">
          <span style="color:${aiColor};font-weight:600;">${m.aiUsage}</span>
          <span style="color:var(--text-muted);">/ ${m.aiLimit}</span>
        </div>
        <div style="width:60px;height:4px;background:var(--bg);border-radius:2px;margin-top:4px;">
          <div style="width:${Math.min(aiPercent, 100)}%;height:100%;background:${aiColor};border-radius:2px;transition:width 0.3s;"></div>
        </div>
      </td>
      <td>${formatDate(m.createdAt)}</td>
      <td>
        <div class="actions-cell">
          ${toggleBtn}
          <button class="btn-sm btn-suspend" data-action="ai-limit" data-id="${m.id}" data-name="${escapeHtml(m.businessName)}" data-limit="${m.aiLimit}">🤖</button>
          <button class="btn-sm btn-delete" data-action="delete" data-id="${m.id}" data-name="${escapeHtml(m.businessName)}">🗑</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach event listeners for action buttons
  tbody.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const id = parseInt(btn.dataset.id, 10);
      const name = btn.dataset.name;

      if (action === "ai-limit") {
        showAiLimitModal(id, name, parseInt(btn.dataset.limit, 10));
      } else {
        confirmAction(action, id, name);
      }
    });
  });
}

// ── SEARCH ───────────────────────────────────────
document.getElementById("merchantSearch").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) {
    renderMerchants(allMerchants);
    return;
  }
  const filtered = allMerchants.filter((m) =>
    (m.businessName || "").toLowerCase().includes(q) ||
    (m.email || "").toLowerCase().includes(q) ||
    (m.phone || "").includes(q)
  );
  renderMerchants(filtered);
});

// ── CONFIRM MODAL ────────────────────────────────
let pendingAction = null;

function confirmAction(action, merchantId, businessName) {
  const modal = document.getElementById("confirmModal");
  const icon = document.getElementById("confirmIcon");
  const title = document.getElementById("confirmTitle");
  const msg = document.getElementById("confirmMessage");
  const okBtn = document.getElementById("confirmOk");

  if (action === "suspend") {
    icon.textContent = "⏸️";
    title.textContent = "Simamisha Akaunti?";
    msg.textContent = `Duka la "${businessName}" litasimamishwa. Hawataweza kuingia au kutumia AI hadi utakapoamilisha tena.`;
    okBtn.textContent = "⏸ Simamisha";
    okBtn.className = "btn-danger";
  } else if (action === "activate") {
    icon.textContent = "✅";
    title.textContent = "Amilisha Akaunti?";
    msg.textContent = `Duka la "${businessName}" litaamilishwa tena na litaweza kutumia mfumo kawaida.`;
    okBtn.textContent = "▶ Amilisha";
    okBtn.className = "btn-primary";
    okBtn.style.width = "auto";
  } else if (action === "delete") {
    icon.textContent = "🗑️";
    title.textContent = "Futa Akaunti Kabisa?";
    msg.innerHTML = `<strong style="color:var(--red);">⚠️ TAHADHARI:</strong> Duka la "${businessName}", bidhaa zake, mazungumzo, na oda ZOTE zitafutwa kabisa.<br><br>Hatua hii <strong>HAIWEZI kurudishwa!</strong>`;
    okBtn.textContent = "🗑 Futa Kabisa";
    okBtn.className = "btn-danger";
  }

  pendingAction = { action, merchantId };
  modal.classList.remove("hidden");
}

document.getElementById("confirmCancel").addEventListener("click", () => {
  document.getElementById("confirmModal").classList.add("hidden");
  pendingAction = null;
});

document.getElementById("confirmOk").addEventListener("click", async () => {
  if (!pendingAction) return;
  const { action, merchantId } = pendingAction;
  const okBtn = document.getElementById("confirmOk");
  const origText = okBtn.textContent;
  okBtn.disabled = true;
  okBtn.textContent = "Inafanya...";

  try {
    if (action === "suspend") {
      await saFetch(`/merchants/${merchantId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: "suspended" }),
      });
    } else if (action === "activate") {
      await saFetch(`/merchants/${merchantId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: "active" }),
      });
    } else if (action === "delete") {
      await saFetch(`/merchants/${merchantId}`, { method: "DELETE" });
    }

    document.getElementById("confirmModal").classList.add("hidden");
    pendingAction = null;
    loadMerchants();
    loadOverview();
  } catch (err) {
    alert("Hitilafu: " + err.message);
  } finally {
    okBtn.disabled = false;
    okBtn.textContent = origText;
  }
});

// ── AI LIMIT MODAL ───────────────────────────────
let aiLimitTarget = null;

function showAiLimitModal(merchantId, name, currentLimit) {
  aiLimitTarget = { merchantId };
  document.getElementById("aiLimitMerchantName").textContent = `Duka: ${name}`;
  document.getElementById("aiLimitInput").value = currentLimit;
  document.getElementById("aiLimitModal").classList.remove("hidden");
}

document.getElementById("aiLimitCancel").addEventListener("click", () => {
  document.getElementById("aiLimitModal").classList.add("hidden");
  aiLimitTarget = null;
});

document.getElementById("aiLimitSave").addEventListener("click", async () => {
  if (!aiLimitTarget) return;
  const newLimit = parseInt(document.getElementById("aiLimitInput").value, 10);
  if (!newLimit || newLimit < 0) {
    alert("Weka namba sahihi.");
    return;
  }

  const btn = document.getElementById("aiLimitSave");
  btn.disabled = true;
  btn.textContent = "Inahifadhi...";

  try {
    await saFetch(`/merchants/${aiLimitTarget.merchantId}/ai-limit`, {
      method: "PUT",
      body: JSON.stringify({ aiLimit: newLimit }),
    });
    document.getElementById("aiLimitModal").classList.add("hidden");
    aiLimitTarget = null;
    loadMerchants();
  } catch (err) {
    alert("Hitilafu: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Hifadhi";
  }
});
