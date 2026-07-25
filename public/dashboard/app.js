// Dashboard logic - Multi-Tenant SaaS App (vanilla JS, JWT auth)

// Apply Theme on load
const savedTheme = localStorage.getItem("merchant_theme");
if (savedTheme === "dark") {
  document.body.classList.add("dark-theme");
}

const API_BASE = "/api";

// ---- Helper: fetch iliyounganishwa na JWT auth token ----
async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("merchant_token");
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      // Kama token imeisha muda wake au imekataliwa, logout
      handleLogout();
    }
    throw new Error(err.error || "Hitilafu imetokea");
  }
  return res.json();
}

async function insightsFetch(path, options = {}) {
  return apiFetch("/insights" + path, options);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---- TOGGLE LOGIN/REGISTER/FORGOT PANELS ----
function showAuthPanel(panelId) {
  const panels = ["loginPanel", "registerPanel", "forgotPanel", "resetPanel"];
  panels.forEach(p => {
    const el = document.getElementById(p);
    if (p === panelId) el.classList.remove("hidden");
    else el.classList.add("hidden");
  });
  document.getElementById("loginError").textContent = "";
}

document.getElementById("toRegisterLink").addEventListener("click", (e) => {
  e.preventDefault();
  showAuthPanel("registerPanel");
});

document.getElementById("toLoginLink").addEventListener("click", (e) => {
  e.preventDefault();
  showAuthPanel("loginPanel");
});

document.getElementById("toForgotLink").addEventListener("click", (e) => {
  e.preventDefault();
  showAuthPanel("forgotPanel");
  document.getElementById("forgotEmail").focus();
});

// ---- LOGOUT LOGIC ----
function handleLogout() {
  localStorage.removeItem("merchant_token");
  localStorage.removeItem("merchant_info");
  document.body.classList.remove("dark-theme");
  document.getElementById("app").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
  showAuthPanel("loginPanel");
}

document.getElementById("forgotToLoginLink").addEventListener("click", (e) => {
  e.preventDefault();
  showAuthPanel("loginPanel");
});

document.getElementById("resetToLoginLink").addEventListener("click", (e) => {
  e.preventDefault();
  showAuthPanel("loginPanel");
});

// ---- LOGIN SUBMIT ----
document.getElementById("submitLoginBtn").addEventListener("click", handleLogin);
document.getElementById("loginPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});

async function handleLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");

  if (!email || !password) {
    errorEl.textContent = "Tafadhali jaza email na password.";
    return;
  }

  try {
    const res = await fetch(API_BASE + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok && data.token) {
      localStorage.setItem("merchant_token", data.token);
      localStorage.setItem("merchant_info", JSON.stringify(data.merchant));

      document.getElementById("merchantBrandName").textContent = data.merchant.businessName;
      document.getElementById("loginScreen").classList.add("hidden");
      document.getElementById("app").classList.remove("hidden");
      initDashboard();
    } else {
      errorEl.textContent = data.error || "Barua pepe au password si sahihi.";
    }
  } catch (e) {
    errorEl.textContent = "Imeshindwa kuunganisha na server.";
  }
}

// ---- REGISTER SUBMIT ----
document.getElementById("submitRegisterBtn").addEventListener("click", handleRegister);
document.getElementById("regPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleRegister();
});

async function handleRegister() {
  const businessName = document.getElementById("regBusinessName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const phone = document.getElementById("regPhone").value.trim();
  const password = document.getElementById("regPassword").value;
  const termsChecked = document.getElementById("regTerms").checked;
  const errorEl = document.getElementById("loginError");

  if (!businessName || !email || !phone || !password) {
    errorEl.textContent = "Tafadhali jaza taarifa zote.";
    return;
  }

  if (!termsChecked) {
    errorEl.textContent = "Lazima ukubali Vigezo na Masharti ya Faragha ili kuendelea.";
    return;
  }

  try {
    const res = await fetch(API_BASE + "/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName, email, phone, password }),
    });
    const data = await res.json();
    if (res.ok && data.token) {
      localStorage.setItem("merchant_token", data.token);
      localStorage.setItem("merchant_info", JSON.stringify(data.merchant));

      document.getElementById("merchantBrandName").textContent = data.merchant.businessName;
      document.getElementById("loginScreen").classList.add("hidden");
      document.getElementById("app").classList.remove("hidden");
      initDashboard();
    } else {
      errorEl.textContent = data.error || "Usajili umeshindwa.";
    }
  } catch (e) {
    errorEl.textContent = "Imeshindwa kuunganisha na server.";
  }
}

// ---- TERMS AND CONDITIONS MODAL ----
const termsModal = document.getElementById("termsModal");
const openTermsModal = document.getElementById("openTermsModal");
const closeTermsBtn = document.getElementById("closeTermsBtn");
const acceptTermsBtn = document.getElementById("acceptTermsBtn");
const regTermsCheckbox = document.getElementById("regTerms");

openTermsModal.addEventListener("click", (e) => {
  e.preventDefault();
  termsModal.classList.remove("hidden");
});

closeTermsBtn.addEventListener("click", () => {
  termsModal.classList.add("hidden");
});

acceptTermsBtn.addEventListener("click", () => {
  regTermsCheckbox.checked = true;
  termsModal.classList.add("hidden");
});

termsModal.addEventListener("click", (e) => {
  if (e.target === termsModal) {
    termsModal.classList.add("hidden");
  }
});

// ---- FORGOT PASSWORD SUBMIT ----
document.getElementById("submitForgotBtn").addEventListener("click", handleForgot);
document.getElementById("forgotEmailOrPhone").addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleForgot();
});

async function handleForgot() {
  const emailOrPhone = document.getElementById("forgotEmailOrPhone").value.trim();
  const errorEl = document.getElementById("loginError");
  const btn = document.getElementById("submitForgotBtn");

  if (!emailOrPhone) {
    errorEl.textContent = "Tafadhali weka barua pepe au namba ya simu.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "⏳ Inatuma...";
  errorEl.textContent = "";

  try {
    const res = await fetch(API_BASE + "/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailOrPhone }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      document.getElementById("resetSubText").textContent = `OTP imetumwa kwenye WhatsApp ya namba: ${data.phone || emailOrPhone}`;
      showAuthPanel("resetPanel");
      document.getElementById("resetOtp").focus();
    } else {
      errorEl.textContent = data.error || "Imeshindwa kutuma msimbo wa OTP.";
    }
  } catch (e) {
    errorEl.textContent = "Imeshindwa kuunganisha na server.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Tuma Msimbo (OTP)";
  }
}

// ---- RESET PASSWORD SUBMIT ----
document.getElementById("submitResetBtn").addEventListener("click", handleReset);
document.getElementById("resetNewPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleReset();
});

async function handleReset() {
  const emailOrPhone = document.getElementById("forgotEmailOrPhone").value.trim();
  const otp = document.getElementById("resetOtp").value.trim();
  const newPassword = document.getElementById("resetNewPassword").value;
  const errorEl = document.getElementById("loginError");
  const btn = document.getElementById("submitResetBtn");

  if (!otp || !newPassword) {
    errorEl.textContent = "Tafadhali jaza msimbo wa OTP na password mpya.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "⏳ Inasave...";
  errorEl.textContent = "";

  try {
    const res = await fetch(API_BASE + "/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailOrPhone, otp, newPassword }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showAuthPanel("loginPanel");
      // Weka email kwenye login ili waingie mara moja kama ni email
      if (emailOrPhone.includes("@")) {
        document.getElementById("loginEmail").value = emailOrPhone;
      } else {
        document.getElementById("loginEmail").value = "";
      }
      document.getElementById("loginPassword").value = "";
      errorEl.style.color = "var(--success)";
      errorEl.textContent = "✅ Neno la siri limebadilishwa! Ingia sasa.";
      setTimeout(() => {
        errorEl.style.color = "var(--danger)";
        if (errorEl.textContent.includes("✅")) errorEl.textContent = "";
      }, 5000);
    } else {
      errorEl.textContent = data.error || "Kosa la kubadilisha neno la siri.";
    }
  } catch (e) {
    errorEl.textContent = "Imeshindwa kuunganisha na server.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Hifadhi Password Mpya";
  }
}

// ---- LOGOUT ----
document.getElementById("logoutBtn").addEventListener("click", handleLogout);

function handleLogout() {
  localStorage.removeItem("merchant_token");
  localStorage.removeItem("merchant_info");
  window.location.reload();
}

// ---- NAVIGATION ----
document.querySelectorAll(".nav-item").forEach((btn) => {
  if (btn.id === "logoutBtn") return; // Usipendeze logout kama navigation tab
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("view-" + btn.dataset.view).classList.add("active");

    if (btn.dataset.view === "overview") loadOverview();
    if (btn.dataset.view === "products") loadProducts();
    if (btn.dataset.view === "orders") loadOrders();
    if (btn.dataset.view === "conversations") loadConversations();
    if (btn.dataset.view === "insights") loadInsights();
    if (btn.dataset.view === "settings") loadSettings();
  });
});

// Auto-Login Verification on Page Load
document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("merchant_token");
  const infoRaw = localStorage.getItem("merchant_info");
  if (token && infoRaw) {
    try {
      const merchant = JSON.parse(infoRaw);
      // Fanya test query kujua kama token ipo valid
      await fetch(API_BASE + "/stats", {
        headers: { "Authorization": `Bearer ${token}` }
      });

      document.getElementById("merchantBrandName").textContent = merchant.businessName;
      document.getElementById("loginScreen").classList.add("hidden");
      document.getElementById("app").classList.remove("hidden");
      initDashboard();
    } catch (e) {
      handleLogout();
    }
  }
});

function initDashboard() {
  loadOverview();
  checkWhatsAppStatus();
}

// ---- CONVERSATIONS ----
async function loadConversations(page = 1) {
  const list = document.getElementById("conversationsList");
  list.innerHTML = `<p style="color:var(--text-muted);padding:16px;">Inapakia...</p>`;

  try {
    const data = await apiFetch(`/conversations?page=${page}`);
    list.innerHTML = "";

    if (!data.conversations || data.conversations.length === 0) {
      list.innerHTML = `<p style="color:var(--text-muted);padding:16px;">Hakuna mazungumzo bado.</p>`;
      return;
    }

    data.conversations.forEach(conv => {
      const div = document.createElement("div");
      div.className = "conv-item";
      div.dataset.convId = conv.id;

      const timeAgo = formatTimeAgo(conv.updatedAt);
      const needsBadge = conv.needsHuman
        ? `<span style="background:#ef4444;color:#fff;font-size:10px;padding:2px 6px;border-radius:999px;font-weight:700;">Anahitaji Mmiliki</span>`
        : "";
      const ordersBadge = conv.orderCount > 0
        ? `<span style="background:#10b981;color:#fff;font-size:10px;padding:2px 6px;border-radius:999px;">Oda ${conv.orderCount}</span>`
        : "";

      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-weight:600;font-size:14px;">${escapeHtml(conv.customerName)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${conv.customerPhone}</div>
          </div>
          <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;">${timeAgo}</div>
        </div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          ${needsBadge}${ordersBadge}
          <span style="font-size:11px;color:var(--text-muted);">💬 ${conv.messageCount} ujumbe</span>
        </div>
        ${conv.contextSummary ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;border-top:1px solid var(--line);padding-top:6px;line-height:1.4;">${escapeHtml(conv.contextSummary.slice(0, 120))}${conv.contextSummary.length > 120 ? "..." : ""}</div>` : ""}
      `;

      div.addEventListener("click", () => {
        document.querySelectorAll(".conv-item").forEach(el => el.classList.remove("active"));
        div.classList.add("active");
        loadChatThread(conv.id, conv.customerName, conv.customerPhone);
      });

      list.appendChild(div);
    });

    // Pagination
    if (data.pages > 1) {
      const pag = document.createElement("div");
      pag.style.cssText = "display:flex;justify-content:center;gap:8px;padding:12px;";
      for (let i = 1; i <= data.pages; i++) {
        const btn = document.createElement("button");
        btn.className = i === page ? "btn-primary" : "btn-ghost";
        btn.style.cssText = "padding:4px 10px;font-size:12px;";
        btn.textContent = i;
        btn.addEventListener("click", () => loadConversations(i));
        pag.appendChild(btn);
      }
      list.appendChild(pag);
    }

  } catch (err) {
    list.innerHTML = `<p style="color:var(--danger);padding:16px;">Hitilafu: ${err.message}</p>`;
  }
}

async function loadChatThread(convId, name, phone) {
  const thread = document.getElementById("conversationThread");
  const header = document.getElementById("conversationThreadHeader");
  const headerName = document.getElementById("conversationThreadName");

  thread.innerHTML = `<p style="color:var(--text-muted);padding:16px;text-align:center;">Inapakia mazungumzo...</p>`;
  header.classList.remove("hidden");
  headerName.textContent = `${name} (${phone})`;

  try {
    const data = await apiFetch(`/conversations/${convId}/messages`);
    thread.innerHTML = "";

    if (!data.messages || data.messages.length === 0) {
      thread.innerHTML = `<p style="color:var(--text-muted);padding:16px;text-align:center;">Hakuna meseji bado.</p>`;
      return;
    }

    data.messages.forEach(msg => {
      const bubble = document.createElement("div");
      bubble.className = `chat-bubble ${msg.sender === "customer" ? "chat-customer" : "chat-ai"}`;

      // Format WhatsApp-style markdown
      const formatted = escapeHtml(msg.content)
        .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
        .replace(/_(.*?)_/g, "<em>$1</em>")
        .replace(/\n/g, "<br>");

      const time = new Date(msg.createdAt).toLocaleTimeString("sw", { hour: "2-digit", minute: "2-digit" });
      const dateLabel = new Date(msg.createdAt).toLocaleDateString("sw", { day: "numeric", month: "short" });

      bubble.innerHTML = `
        <div class="bubble-content">${formatted}</div>
        <div class="bubble-time">${dateLabel} ${time}</div>
      `;
      thread.appendChild(bubble);
    });

    // Show context summary if available
    if (data.conversation.contextSummary) {
      const summaryDiv = document.createElement("div");
      summaryDiv.style.cssText = "margin:12px;padding:10px 14px;background:var(--paper-raised);border-left:3px solid var(--accent);border-radius:6px;font-size:12px;color:var(--text-muted);";
      summaryDiv.innerHTML = `<strong style="color:var(--ink);">📊 Muhtasari wa AI:</strong> ${escapeHtml(data.conversation.contextSummary)}`;
      thread.insertBefore(summaryDiv, thread.firstChild);
    }

    // Scroll to bottom
    thread.scrollTop = thread.scrollHeight;

  } catch (err) {
    thread.innerHTML = `<p style="color:var(--danger);padding:16px;">Hitilafu: ${err.message}</p>`;
  }
}

function formatTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Sasa hivi";
  if (mins < 60) return `Dakika ${mins} zilizopita`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Saa ${hrs} zilizopita`;
  const days = Math.floor(hrs / 24);
  return `Siku ${days} zilizopita`;
}


async function loadOverview() {
  const stats = await apiFetch("/stats");
  document.getElementById("statProducts").textContent = stats.productCount;
  document.getElementById("statOrders").textContent = stats.orderCount;
  document.getElementById("statPending").textContent = stats.pendingOrders;
  document.getElementById("statConversations").textContent = stats.conversationCount;
  if (document.getElementById("statReEngaged")) {
    document.getElementById("statReEngaged").textContent = stats.reEngagedCount || 0;
  }
  if (document.getElementById("statSpecialRequests")) {
    document.getElementById("statSpecialRequests").textContent = stats.pendingSpecialRequests || 0;
  }
}

// ---- PRODUCTS ----
async function loadProducts() {
  const products = await apiFetch("/products");
  const tbody = document.querySelector("#productsTable tbody");
  tbody.innerHTML = "";

  products
    .filter((p) => p.isActive)
    .forEach((p) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.category)}</td>
        <td class="mono">${Number(p.price).toLocaleString()}</td>
        <td class="mono">${p.stock}</td>
        <td>${p.colors ? escapeHtml(p.colors) : "—"}</td>
        <td>${p.sizes ? escapeHtml(p.sizes) : "—"}</td>
        <td>
          <button class="btn-icon" onclick="editProduct(${p.id})">Hariri</button>
          <button class="btn-icon danger" onclick="deleteProduct(${p.id})">Futa</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
}

let allProductsCache = [];
async function editProduct(id) {
  if (allProductsCache.length === 0) allProductsCache = await apiFetch("/products");
  const p = allProductsCache.find((x) => x.id === id);
  openProductModal(p);
}

async function deleteProduct(id) {
  if (!confirm("Una uhakika unataka kuzima bidhaa hii?")) return;
  await apiFetch(`/products/${id}`, { method: "DELETE" });
  loadProducts();
}

document.getElementById("addProductBtn").addEventListener("click", () => openProductModal(null));
document.getElementById("cancelProductBtn").addEventListener("click", closeProductModal);

function openProductModal(product) {
  document.getElementById("productModalTitle").textContent = product ? "Hariri Bidhaa" : "Ongeza Bidhaa";
  document.getElementById("productId").value = product ? product.id : "";
  document.getElementById("pName").value = product ? product.name : "";
  document.getElementById("pPrice").value = product ? product.price : "";
  document.getElementById("pStock").value = product ? product.stock : "";
  document.getElementById("pColors").value = product ? product.colors || "" : "";
  document.getElementById("pSizes").value = product ? product.sizes || "" : "";
  document.getElementById("pDescription").value = product ? product.description || "" : "";

  // Jaza categories kwa nguvu kutoka kwa bidhaa zilizopo + za kawaida
  const defaultCategories = ["Jezi", "Simu", "Laptop", "Smartwatch", "Calculator", "Accessories"];
  const existingCategories = allProductsCache.map((p) => p.category).filter(Boolean);
  const allCategories = [...new Set([...defaultCategories, ...existingCategories])].sort();

  const catSelect = document.getElementById("pCategory");
  catSelect.innerHTML = allCategories
    .map((c) => `<option value="${escapeHtml(c)}" ${product && product.category === c ? "selected" : ""}>${escapeHtml(c)}</option>`)
    .join("");
  // Ongeza uwezekano wa kuandika category yoyote mpya
  catSelect.innerHTML += `<option value="__custom__">+ Ongeza Category Mpya...</option>`;

  if (product) catSelect.value = product.category;

  document.getElementById("productModal").classList.remove("hidden");
  document.getElementById("pName").focus();
}

function closeProductModal() {
  document.getElementById("productModal").classList.add("hidden");
}

// Kushughulikia chaguo la "Ongeza Category Mpya..." kwenye dropdown
document.getElementById("pCategory").addEventListener("change", function () {
  if (this.value === "__custom__") {
    const custom = prompt("Andika jina la category mpya:");
    if (custom && custom.trim()) {
      const opt = document.createElement("option");
      opt.value = custom.trim();
      opt.textContent = custom.trim();
      // Ingiza kabla ya chaguo la mwisho (__custom__)
      this.insertBefore(opt, this.lastElementChild);
      this.value = custom.trim();
    } else {
      this.value = this.options[0]?.value || "";
    }
  }
});

document.getElementById("productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("productId").value;
  const categoryVal = document.getElementById("pCategory").value;
  if (!categoryVal || categoryVal === "__custom__") {
    alert("Tafadhali chagua au andika category.");
    return;
  }
  const payload = {
    name: document.getElementById("pName").value,
    category: categoryVal,
    price: document.getElementById("pPrice").value,
    stock: document.getElementById("pStock").value,
    colors: document.getElementById("pColors").value,
    sizes: document.getElementById("pSizes").value,
    description: document.getElementById("pDescription").value,
  };

  if (id) {
    await apiFetch(`/products/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  } else {
    await apiFetch("/products", { method: "POST", body: JSON.stringify(payload) });
  }

  allProductsCache = [];
  closeProductModal();
  loadProducts();
});

// ---- ORDERS ----
async function loadOrders() {
  const orders = await apiFetch("/orders");
  const tbody = document.querySelector("#ordersTable tbody");
  tbody.innerHTML = "";

  orders.forEach((o) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">#${o.id}</td>
      <td>${escapeHtml(o.customerName)}</td>
      <td>${escapeHtml(o.productName)}</td>
      <td class="mono">${o.quantity}</td>
      <td>${o.deliveryType === "delivery" ? "Delivery" : "Pickup"} ${o.address ? "— " + escapeHtml(o.address) : ""}</td>
      <td>
        <select onchange="updateOrderStatus(${o.id}, this.value)" class="badge badge-${o.status}">
          <option value="pending" ${o.status === "pending" ? "selected" : ""}>Pending</option>
          <option value="confirmed" ${o.status === "confirmed" ? "selected" : ""}>Confirmed</option>
          <option value="delivered" ${o.status === "delivered" ? "selected" : ""}>Delivered</option>
          <option value="cancelled" ${o.status === "cancelled" ? "selected" : ""}>Cancelled</option>
        </select>
      </td>
      <td class="mono">${new Date(o.createdAt).toLocaleDateString("sw-TZ")}</td>
    `;
    tbody.appendChild(tr);
  });
  loadSpecialRequests();
}

async function updateOrderStatus(id, status) {
  const result = await apiFetch(`/orders/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
  if (["confirmed", "delivered", "cancelled"].includes(status)) {
    if (result.customerNotified) {
      showToast(`Mteja amearifiwa kuwa oda #${id} ni "${status}" ✅`);
    } else {
      showToast(`Status imebadilishwa, lakini mteja HAJAARIFIWA (WhatsApp haijaunganishwa?) ⚠️`);
    }
  }
}

function showToast(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.style.cssText = "position:fixed;bottom:24px;right:24px;background:#22304f;color:#fff;padding:12px 18px;border-radius:4px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,0.2);z-index:100;max-width:320px;";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.display = "block";
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => { toast.style.display = "none"; }, 4000);
}

// ---- SPECIAL REQUESTS (Kariakoo Broker Model) ----
let currentSrId = null;

async function loadSpecialRequests() {
  const requests = await apiFetch("/special-requests");
  const tbody = document.querySelector("#specialRequestsTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  // Update badge count
  const pending = requests.filter(r => ["new", "sourcing"].includes(r.status)).length;
  const badge = document.getElementById("specialRequestsBadge");
  if (badge) badge.textContent = pending > 0 ? pending : "";

  if (requests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--ink-soft);padding:20px;">Hakuna maombi maalum bado.</td></tr>`;
    return;
  }

  const statusLabels = { new: "🆕 Mpya", sourcing: "🔎 Inatafutwa", found: "✅ Imepatikana", fulfilled: "📦 Imetimizwa", cancelled: "❌ Imeghairiwa" };
  const statusColors = { new: "var(--mustard)", sourcing: "#5b8dd9", found: "var(--success)", fulfilled: "#666", cancelled: "var(--danger)" };

  requests.forEach((r) => {
    const estimatedStr = r.estimatedPrice ? `~TZS ${r.estimatedPrice.toLocaleString()}` : "—";
    const quotedStr = r.quotedPrice ? `TZS ${r.quotedPrice.toLocaleString()}` : "";
    const priceDisplay = quotedStr ? `<span style="color:var(--success);font-weight:600;">${quotedStr}</span><br><small style="color:var(--ink-soft);">${estimatedStr}</small>` : `<span style="color:var(--ink-soft);">${estimatedStr}</span>`;
    const deliveryStr = r.deliveryType === "delivery" ? `Delivery — ${r.address || ""}` : "Pickup";
    const color = statusColors[r.status] || "#999";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">#SR-${r.id}</td>
      <td>${escapeHtml(r.customerName)}<br><small class="mono" style="color:var(--ink-soft);">${r.customerPhone.replace("@s.whatsapp.net", "").replace("@lid", "")}</small></td>
      <td><strong>${escapeHtml(r.productName)}</strong>${r.color ? ` <small>(${escapeHtml(r.color)})</small>` : ""}${r.notes ? `<br><small style="color:var(--ink-soft);">${escapeHtml(r.notes)}</small>` : ""}</td>
      <td class="mono">${r.quantity}</td>
      <td>${priceDisplay}</td>
      <td style="font-size:12px;">${escapeHtml(deliveryStr)}</td>
      <td><span style="background:${color};color:white;padding:3px 8px;border-radius:4px;font-size:11px;white-space:nowrap;">${statusLabels[r.status] || r.status}</span></td>
      <td><button onclick="openSrPanel(${r.id}, '${r.status}', ${r.quotedPrice || 0}, '${escapeHtml((r.adminNotes || '').replace(/'/g, ''))}')" style="padding:5px 10px;font-size:12px;border:1px solid var(--line);border-radius:4px;cursor:pointer;background:var(--paper-raised);">✏️ Sasisha</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function openSrPanel(id, status, quotedPrice, adminNotes) {
  currentSrId = id;
  document.getElementById("srPanelId").textContent = id;
  document.getElementById("srStatusSelect").value = status;
  document.getElementById("srQuotedPrice").value = quotedPrice || "";
  document.getElementById("srAdminNotes").value = adminNotes || "";
  document.getElementById("srUpdatePanel").classList.remove("hidden");
  document.getElementById("srUpdatePanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

document.getElementById("srCancelBtn").addEventListener("click", () => {
  document.getElementById("srUpdatePanel").classList.add("hidden");
  currentSrId = null;
});

document.getElementById("srSaveBtn").addEventListener("click", async () => {
  if (!currentSrId) return;
  const status = document.getElementById("srStatusSelect").value;
  const quotedPrice = document.getElementById("srQuotedPrice").value;
  const adminNotes = document.getElementById("srAdminNotes").value;

  const result = await apiFetch(`/special-requests/${currentSrId}`, {
    method: "PUT",
    body: JSON.stringify({ status, quotedPrice: quotedPrice ? parseFloat(quotedPrice) : undefined, adminNotes }),
  });

  if (result.customerNotified) {
    showToast(`Mteja amearifiwa kikamilifu kuhusu ombi #SR-${currentSrId} ✅`);
  } else {
    showToast(`Ombi #SR-${currentSrId} limesasishwa. (Hakuna ujumbe wa mteja kwa status hii) 💾`);
  }
  document.getElementById("srUpdatePanel").classList.add("hidden");
  currentSrId = null;
  loadSpecialRequests();
});



// ---- AI INSIGHTS (Business Advisor) ----

// Inabadilisha *bold* na mistari kuwa HTML rahisi kwa maandishi ya AI
function formatAiText(text) {
  return text
    .split("\n")
    .map((line) => {
      let trimmed = line.trim();
      let isBullet = false;
      if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
        isBullet = true;
        trimmed = trimmed.slice(2);
      }
      let escaped = escapeHtml(trimmed).replace(/\*(.+?)\*/g, "<strong>$1</strong>");
      if (!trimmed) return `<div style="height:8px;"></div>`;
      return isBullet
        ? `<div style="margin:6px 0; padding-left:4px;">• ${escaped}</div>`
        : `<div style="margin:4px 0;">${escaped}</div>`;
    })
    .join("");
}

async function loadInsights() {
  const stats = await insightsFetch("/stats");
  document.getElementById("insStatRevenue").textContent =
    "TZS " + stats.estimatedRevenue.toLocaleString();
  document.getElementById("insStatConversion").textContent = stats.conversionRate + "%";
  document.getElementById("insStatCustomers").textContent = stats.totalCustomers;
  document.getElementById("insStatLowStock").textContent = stats.lowStockProducts.length;
  if (document.getElementById("insStatReEngaged")) {
    document.getElementById("insStatReEngaged").textContent = stats.totalReEngaged || 0;
  }

  loadPotentialCustomers();
  loadReEngagedCustomers();
}

async function loadPotentialCustomers() {
  const listEl = document.getElementById("potentialCustomersList");
  listEl.innerHTML = `<p class="conv-empty" style="margin:0;">Inapakia...</p>`;

  const customers = await insightsFetch("/potential-customers");

  if (customers.length === 0) {
    listEl.innerHTML = `<p class="conv-empty" style="margin:0;">Hakuna wateja wenye nia dhahiri kwa sasa - jaribu tena baadaye.</p>`;
    return;
  }

  listEl.innerHTML = customers
    .map((c) => {
      const badgeClass = c.likelihood.toLowerCase();
      return `
      <div class="lead-card">
        <div>
          <div class="lead-name">${escapeHtml(c.customerName)}</div>
          <div class="lead-phone">${escapeHtml(c.customerPhone.replace("@s.whatsapp.net", ""))} · ${c.messageCount} ujumbe</div>
          <div class="lead-reason">${escapeHtml(c.reason)}</div>
        </div>
        <span class="lead-badge ${badgeClass}">${escapeHtml(c.likelihood)}</span>
      </div>`;
    })
    .join("");
}

async function loadReEngagedCustomers() {
  const listEl = document.getElementById("reEngagedCustomersList");
  if (!listEl) return;
  listEl.innerHTML = `<p class="conv-empty" style="margin:0;">Inapakia...</p>`;

  const customers = await insightsFetch("/re-engaged");

  if (customers.length === 0) {
    listEl.innerHTML = `<p class="conv-empty" style="margin:0;">Hakuna mteja aliyetumwa nudge bado — mfumo unakagua na kutuma kiotomatiki kila saa.</p>`;
    return;
  }

  listEl.innerHTML = customers
    .map((c) => {
      const timeStr = new Date(c.reEngagedAt).toLocaleString("sw-TZ", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
      });
      return `
      <div class="lead-card" style="border-left: 4px solid var(--success);">
        <div>
          <div class="lead-name">${escapeHtml(c.customerName)}</div>
          <div class="lead-phone">${escapeHtml(c.customerPhone.replace("@s.whatsapp.net", ""))} · ${c.messageCount} ujumbe · ${c.orderCount} oda</div>
          <div class="lead-reason" style="color:var(--success); font-weight:500;">Imetumwa Nudge: ${timeStr}</div>
        </div>
        <span class="lead-badge juu" style="background:var(--success); color:white;">NUDGED</span>
      </div>`;
    })
    .join("");
}

document.getElementById("generateAdviceBtn").addEventListener("click", async () => {
  const btn = document.getElementById("generateAdviceBtn");
  const box = document.getElementById("adviceBox");
  btn.disabled = true;
  btn.textContent = "Inatengeneza ushauri...";
  box.classList.remove("hidden");
  box.innerHTML = `<p class="conv-empty" style="margin:0;">AI inachambua takwimu zako, subiri kidogo...</p>`;

  try {
    const { advice } = await insightsFetch("/advice");
    box.innerHTML = formatAiText(advice);
  } catch (e) {
    box.innerHTML = `<p style="color:#b84c3a; margin:0;">Imeshindwa kupata ushauri: ${escapeHtml(e.message)}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Pata Ushauri Sasa";
  }
});

document.getElementById("askQuestionBtn").addEventListener("click", askBusinessQuestion);
document.getElementById("askQuestionInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") askBusinessQuestion();
});

async function askBusinessQuestion() {
  const input = document.getElementById("askQuestionInput");
  const question = input.value.trim();
  if (!question) return;

  const historyEl = document.getElementById("askHistory");
  const qaId = "qa-" + Date.now();
  const qaBlock = document.createElement("div");
  qaBlock.className = "ask-qa";
  qaBlock.id = qaId;
  qaBlock.innerHTML = `
    <div class="ask-question">${escapeHtml(question)}</div>
    <div class="ask-answer conv-empty" style="margin:0;">AI inafikiria...</div>
  `;
  historyEl.prepend(qaBlock);
  input.value = "";

  try {
    const { answer } = await insightsFetch("/ask", {
      method: "POST",
      body: JSON.stringify({ question }),
    });
    document.querySelector(`#${qaId} .ask-answer`).innerHTML = formatAiText(answer);
    document.querySelector(`#${qaId} .ask-answer`).classList.remove("conv-empty");
  } catch (e) {
    document.querySelector(`#${qaId} .ask-answer`).textContent =
      "Imeshindwa kupata jibu: " + e.message;
  }
}

// ---- WHATSAPP CONNECTION STATUS MONITOR ----
let lastQrText = null;
let statusPollTimeout = null;

async function checkWhatsAppStatus() {
  if (statusPollTimeout) {
    clearTimeout(statusPollTimeout);
    statusPollTimeout = null;
  }

  const badge = document.getElementById("whatsappStatusBadge");
  const textEl = document.getElementById("whatsappStatusText");
  const qrContainer = document.getElementById("whatsappQrContainer");
  const qrCodeDiv = document.getElementById("qrcode");
  const restartBtn = document.getElementById("whatsappRestartBtn");

  if (!localStorage.getItem("merchant_token")) return;

  try {
    const data = await apiFetch("/whatsapp-status");
    badge.className = "badge " + data.status;

    // Sync bot toggle UI with server state on every poll
    if (typeof data.botActive === "boolean") updateBotToggleUI(data.botActive);

    if (data.status === "connected") {
      badge.textContent = "Imeunganishwa";
      textEl.textContent = "✅ WhatsApp imeunganishwa kikamilifu! Msaidizi wa AI anaweza kupokea na kujibu wateja sasa.";
      qrContainer.classList.add("hidden");
      qrCodeDiv.innerHTML = "";
      lastQrText = null;
      restartBtn.classList.add("hidden");
      statusPollTimeout = setTimeout(checkWhatsAppStatus, 15000);
    } else if (data.status === "connecting") {
      badge.textContent = "Inaunganisha";
      textEl.textContent = "⏳ Inajaribu kuunganisha na WhatsApp. Tafadhali subiri kidogo...";
      qrContainer.classList.add("hidden");
      qrCodeDiv.innerHTML = "";
      lastQrText = null;
      restartBtn.classList.add("hidden");
      statusPollTimeout = setTimeout(checkWhatsAppStatus, 4000);
    } else if (data.status === "qr") {
      badge.textContent = "Scan QR";
      textEl.textContent = "📱 QR code ipo tayari. Scan na simu yako ili kuunganisha kifaa.";
      restartBtn.classList.add("hidden");

      if (data.qr && data.qr !== lastQrText) {
        lastQrText = data.qr;
        qrCodeDiv.innerHTML = "";
        new QRCode(qrCodeDiv, {
          text: data.qr,
          width: 180,
          height: 180,
          colorDark: "#22304f",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      }
      qrContainer.classList.remove("hidden");
      statusPollTimeout = setTimeout(checkWhatsAppStatus, 4000);
    } else {
      badge.textContent = "Imekatika";
      textEl.textContent = "❌ Muunganiko wa WhatsApp umekatika au namba yako haijaunganishwa bado.";
      qrContainer.classList.add("hidden");
      qrCodeDiv.innerHTML = "";
      lastQrText = null;
      restartBtn.textContent = "Unganisha WhatsApp";
      restartBtn.classList.remove("hidden");
      statusPollTimeout = setTimeout(checkWhatsAppStatus, 10000);
    }
  } catch (err) {
    console.error("Kosa la kuangalia hali ya WhatsApp:", err);
    badge.className = "badge disconnected";
    badge.textContent = "Error";
    textEl.textContent = "⚠️ Imeshindwa kuwasiliana na server kuangalia hali ya WhatsApp.";
    restartBtn.textContent = "Jaribu Upya";
    restartBtn.classList.remove("hidden");
    statusPollTimeout = setTimeout(checkWhatsAppStatus, 10000);
  }
}

document.getElementById("whatsappRestartBtn").addEventListener("click", async () => {
  const btn = document.getElementById("whatsappRestartBtn");
  const textEl = document.getElementById("whatsappStatusText");
  btn.disabled = true;
  btn.textContent = "Inaunganisha...";
  textEl.textContent = "⏳ Kujaribu kuanzisha muunganiko wa WhatsApp...";

  try {
    await apiFetch("/whatsapp-connect", { method: "POST" });
    checkWhatsAppStatus();
  } catch (err) {
    textEl.textContent = "⚠️ Imeshindwa kuunganisha: " + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Unganisha WhatsApp";
  }
});



// ---- BOT TOGGLE (Washa / Zima AI Agent) ----
function updateBotToggleUI(isActive) {
  const btn = document.getElementById("botToggleBtn");
  const btnText = document.getElementById("botToggleBtnText");
  const sublabel = document.getElementById("botToggleSublabel");
  const icon = document.getElementById("botToggleIcon");

  if (isActive) {
    btn.className = "bot-toggle-btn bot-toggle-active";
    btnText.textContent = "Zima";
    sublabel.textContent = "Inajibu wateja kiotomatiki";
    sublabel.classList.remove("bot-sublabel-paused");
    icon.textContent = "🤖";
  } else {
    btn.className = "bot-toggle-btn bot-toggle-paused";
    btnText.textContent = "Washa";
    sublabel.textContent = "⏸️ Imesimamishwa — muuzaji anajibu mwenyewe";
    sublabel.classList.add("bot-sublabel-paused");
    icon.textContent = "💤";
  }
}

document.getElementById("botToggleBtn").addEventListener("click", async () => {
  const btn = document.getElementById("botToggleBtn");
  const isCurrentlyActive = btn.classList.contains("bot-toggle-active");
  const newState = !isCurrentlyActive;

  btn.disabled = true;
  try {
    const result = await apiFetch("/bot-toggle", {
      method: "POST",
      body: JSON.stringify({ active: newState }),
    });
    updateBotToggleUI(result.botActive);
  } catch (err) {
    console.error("Imeshindwa kubadilisha hali ya bot:", err);
    alert("Kosa: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---- 7. MERCHANT SETTINGS PANEL ----
async function loadSettings() {
  const form = document.getElementById("settingsForm");
  const statusEl = document.getElementById("settingsSaveStatus");

  statusEl.style.display = "block";
  statusEl.style.color = "var(--text-muted)";
  statusEl.textContent = "⏳ Inapakia mipangilio...";

  try {
    const settings = await apiFetch("/settings");

    document.getElementById("setBusinessName").value = settings.businessName || "";
    document.getElementById("setBusinessContext").value = settings.businessContext || "";
    document.getElementById("setNudgeMin").value = settings.reEngagementMinHours ?? 12;
    document.getElementById("setNudgeMax").value = settings.reEngagementMaxHours ?? 24;
    document.getElementById("setNudgeCooldown").value = settings.reEngagementCooldownHours ?? 48;
    document.getElementById("setNudgeStartHour").value = settings.reEngagementStartHour ?? 7;
    document.getElementById("setNudgeEndHour").value = settings.reEngagementEndHour ?? 21;

    // Load local settings
    const savedTheme = localStorage.getItem("merchant_theme") || "light";
    const savedLang = localStorage.getItem("merchant_lang") || "sw";
    document.getElementById("setTheme").value = savedTheme;
    document.getElementById("setLanguage").value = savedLang;
    document.getElementById("setNewPassword").value = "";

    statusEl.style.display = "none";
  } catch (err) {
    statusEl.style.color = "var(--danger)";
    statusEl.textContent = "⚠️ Kosa la kupakia: " + err.message;
  }
}

document.getElementById("settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const statusEl = document.getElementById("settingsSaveStatus");
  const submitBtn = e.target.querySelector("button[type='submit']");

  statusEl.style.display = "block";
  statusEl.style.color = "var(--text-muted)";
  statusEl.textContent = "⏳ Inahifadhi mipangilio...";
  submitBtn.disabled = true;

  const payload = {
    businessName: document.getElementById("setBusinessName").value.trim(),
    businessContext: document.getElementById("setBusinessContext").value.trim(),
    reEngagementMinHours: parseInt(document.getElementById("setNudgeMin").value, 10),
    reEngagementMaxHours: parseInt(document.getElementById("setNudgeMax").value, 10),
    reEngagementCooldownHours: parseInt(document.getElementById("setNudgeCooldown").value, 10),
    reEngagementStartHour: parseInt(document.getElementById("setNudgeStartHour").value, 10),
    reEngagementEndHour: parseInt(document.getElementById("setNudgeEndHour").value, 10),
    oldPassword: document.getElementById("setOldPassword").value,
    verifyPhone: document.getElementById("setVerifyPhone").value,
    newPassword: document.getElementById("setNewPassword").value,
  };

  const selectedTheme = document.getElementById("setTheme").value;
  const selectedLang = document.getElementById("setLanguage").value;

  // Validation
  if (payload.reEngagementMinHours >= payload.reEngagementMaxHours) {
    statusEl.style.color = "var(--danger)";
    statusEl.textContent = "⚠️ Muda wa chini lazima uwe mdogo kuliko muda wa juu!";
    submitBtn.disabled = false;
    return;
  }

  try {
    const res = await apiFetch("/settings", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (res.success) {
      // Sasisha jina la chapa kwenye UI
      document.getElementById("merchantBrandName").textContent = payload.businessName;

      // Sasisha pia localStorage
      const infoRaw = localStorage.getItem("merchant_info");
      if (infoRaw) {
        const info = JSON.parse(infoRaw);
        info.businessName = payload.businessName;
        localStorage.setItem("merchant_info", JSON.stringify(info));
      }

      // Save Theme and Language
      localStorage.setItem("merchant_theme", selectedTheme);
      localStorage.setItem("merchant_lang", selectedLang);

      if (selectedTheme === "dark") {
        document.body.classList.add("dark-theme");
      } else {
        document.body.classList.remove("dark-theme");
      }

      // Clear password fields
      document.getElementById("setOldPassword").value = "";
      document.getElementById("setVerifyPhone").value = "";
      document.getElementById("setNewPassword").value = "";

      statusEl.style.color = "var(--success)";
      statusEl.textContent = "✅ Mipangilio imehifadhiwa kwa mafanikio!";
      setTimeout(() => {
        if (statusEl.textContent.includes("✅")) {
          statusEl.style.display = "none";
        }
      }, 3000);
    } else {
      statusEl.style.color = "var(--danger)";
      statusEl.textContent = "⚠️ Imeshindwa kuhifadhi.";
    }
  } catch (err) {
    statusEl.style.color = "var(--danger)";
    statusEl.textContent = "⚠️ Hitilafu: " + err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

// ---- DELETE ACCOUNT LOGIC ----
const deleteModal = document.getElementById("deleteAccountModal");
const triggerDeleteBtn = document.getElementById("triggerDeleteAccountBtn");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
const deleteForm = document.getElementById("deleteAccountForm");
const deleteError = document.getElementById("deleteAccountError");

triggerDeleteBtn.addEventListener("click", () => {
  deleteError.textContent = "";
  document.getElementById("deleteAccountPassword").value = "";
  deleteModal.classList.remove("hidden");
});

cancelDeleteBtn.addEventListener("click", () => {
  deleteModal.classList.add("hidden");
});

deleteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  deleteError.textContent = "";

  const submitBtn = e.target.querySelector("button[type='submit']");
  const password = document.getElementById("deleteAccountPassword").value;

  submitBtn.disabled = true;
  submitBtn.textContent = "Inafuta...";

  try {
    const res = await apiFetch("/settings/account", {
      method: "DELETE",
      body: JSON.stringify({ password })
    });

    if (res.success) {
      alert("Akaunti yako imefutwa kikamilifu. Tunasikitika kukuona ukiondoka.");
      deleteModal.classList.add("hidden");

      handleLogout();
    }
  } catch (err) {
    deleteError.textContent = err.message || "Imeshindwa kufuta akaunti.";
    submitBtn.textContent = "Ndiyo, Futa Akaunti";
    submitBtn.disabled = false;
  }
});
