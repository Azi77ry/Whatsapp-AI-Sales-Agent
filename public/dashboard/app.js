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

document.getElementById("toRegisterLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  switchAuthView("register");
});

document.getElementById("toLoginLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  switchAuthView("login");
});

document.getElementById("toForgotLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  switchAuthView("forgot");
});

document.getElementById("forgotToLoginLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  switchAuthView("login");
});

document.getElementById("resetToLoginLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  switchAuthView("login");
});

document.getElementById("submitLoginBtn")?.addEventListener("click", handleLogin);
document.getElementById("loginPassword")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});

document.getElementById("submitRegisterBtn")?.addEventListener("click", handleRegister);
document.getElementById("regPassword")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleRegister();
});

document.getElementById("submitForgotBtn")?.addEventListener("click", handleForgot);
document.getElementById("forgotEmailOrPhone")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleForgot();
});

document.getElementById("submitResetBtn")?.addEventListener("click", handleReset);
document.getElementById("resetNewPassword")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleReset();
});

document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);

document.getElementById("obNextBtn")?.addEventListener("click", async () => {
  await completeOnboardingStep(1, { language: currentLang });
});

document.getElementById("obBackBtn")?.addEventListener("click", () => {
  switchOnboardingStep(1);
});

document.getElementById("obSkipBtn")?.addEventListener("click", async () => {
  await completeOnboardingStep(2, { skipped: true });
});

document.getElementById("addProductBtn")?.addEventListener("click", () => openProductModal(null));
document.getElementById("cancelProductBtn")?.addEventListener("click", closeProductModal);

document.getElementById("pCategory")?.addEventListener("change", function () {
  const manualDiv = document.getElementById("pCategoryManualDiv");
  if (this.value === "manual") {
    manualDiv.classList.remove("hidden");
  } else {
    manualDiv.classList.add("hidden");
  }
});

document.getElementById("productForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  await handleSaveProduct();
});

document.getElementById("srCancelBtn")?.addEventListener("click", () => {
  document.getElementById("specialRequestModal")?.classList.add("hidden");
});

document.getElementById("srSaveBtn")?.addEventListener("click", async () => {
  await saveSpecialRequest();
});

// document.getElementById("settingsForm")?.addEventListener("submit", async (e) => {
//   e.preventDefault();
//   await saveSettings();
// });

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
      // Superadmin Redirection
      if (data.merchant && data.merchant.role === "superadmin") {
        localStorage.setItem("sa_token", data.token);
        localStorage.setItem("sa_info", JSON.stringify(data.merchant));
        window.location.href = "/superadmin/";
        return;
      }

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
let hasReadTerms = false;

regTermsCheckbox.addEventListener("click", (e) => {
  if (!hasReadTerms) {
    e.preventDefault();
    alert(t('alertTerms'));
  }
});

openTermsModal.addEventListener("click", (e) => {
  e.preventDefault();
  termsModal.classList.remove("hidden");
});

closeTermsBtn.addEventListener("click", () => {
  termsModal.classList.add("hidden");
});

acceptTermsBtn.addEventListener("click", () => {
  hasReadTerms = true;
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
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const hamburgerBtn = document.getElementById("hamburgerBtn");

function toggleSidebar() {
  if (sidebar) sidebar.classList.toggle("open");
  if (sidebarOverlay) sidebarOverlay.classList.toggle("open");
}

hamburgerBtn?.addEventListener("click", toggleSidebar);
sidebarOverlay?.addEventListener("click", toggleSidebar);

document.querySelectorAll(".nav-item").forEach((btn) => {
  if (btn.id === "logoutBtn") return; // Usipendeze logout kama navigation tab
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("view-" + btn.dataset.view).classList.add("active");

    // Funga menyu kwenye simu kama ipo wazi
    if (sidebar && sidebar.classList.contains("open")) {
      toggleSidebar();
    }

    if (btn.dataset.view === "overview") loadOverview();
    if (btn.dataset.view === "products") loadProducts();
    if (btn.dataset.view === "orders") loadOrders();
    if (btn.dataset.view === "conversations") loadConversations();
    if (btn.dataset.view === "insights") loadInsights();
    if (btn.dataset.view === "settings") loadSettings();
    // support is static, no load function needed
  });
});

// Auto-Login Verification on Page Load
document.addEventListener("DOMContentLoaded", async () => {
  if (window.location.search.includes("register=true")) {
    showAuthPanel("registerPanel");
  }

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

async function initDashboard() {
  try {
    await checkOnboardingStatus();
  } catch (e) {
    console.error("Onboarding check failed:", e);
  }
  
  try {
    await loadOverview();
  } catch (e) {
    console.error("Failed to load overview:", e);
  }
  
  try {
    await checkWhatsAppStatus();
  } catch (e) {
    console.error("Failed to check WA status:", e);
  }

  fetchPlatformBroadcast();
}

async function fetchPlatformBroadcast() {
  try {
    const res = await fetch("/api/platform/broadcast");
    if(res.ok) {
      const data = await res.json();
      if(data.active && data.message) {
        document.getElementById("sysBroadcastText").textContent = data.message;
        document.getElementById("sysBroadcastBanner").style.display = "flex";
      }
    }
  } catch(err) {
    // ignore
  }
}

// ---- ONBOARDING LOGIC ----
async function checkOnboardingStatus() {
  // Mteja (User) aliomba kuondoa hii welcome wizard inayojitokeza
  return;
}

let onboardingState = {
  step: 1,
  hasWhatsApp: false
};

function startOnboardingWizard(settings) {
  const wizard = document.getElementById("onboardingWizard");
  wizard.classList.remove("hidden");
  
  // Weka jina la mteja
  const merchantInfo = JSON.parse(localStorage.getItem("merchant_info") || "{}");
  document.getElementById("obMerchantName").textContent = merchantInfo.businessName || "Kiongozi";
  
  // Weka context kama ipo
  if (settings && settings.businessContext) {
    document.getElementById("obBusinessContext").value = settings.businessContext;
  }
  
  updateOnboardingUI();
}

function updateOnboardingUI() {
  document.getElementById("obStep1").classList.add("hidden");
  document.getElementById("obStep2").classList.add("hidden");
  document.getElementById("obStep3").classList.add("hidden");
  document.getElementById("obStep1").style.display = "none";
  document.getElementById("obStep2").style.display = "none";
  document.getElementById("obStep3").style.display = "none";
  
  const currentStep = document.getElementById(`obStep${onboardingState.step}`);
  currentStep.classList.remove("hidden");
  currentStep.style.display = "block";
  
  // Update Progress Bar
  const progressPercent = [33, 66, 100][onboardingState.step - 1];
  document.getElementById("obProgressBar").style.width = `${progressPercent}%`;
  
  // Back Button
  const backBtn = document.getElementById("obBackBtn");
  if (onboardingState.step > 1) {
    backBtn.classList.remove("hidden");
    backBtn.style.display = "block";
  } else {
    backBtn.classList.add("hidden");
    backBtn.style.display = "none";
  }
  
  // Next Button Text
  const nextBtn = document.getElementById("obNextBtn");
  if (onboardingState.step === 3) {
    nextBtn.innerHTML = `Kamilisha <span style="margin-left: 8px;">🚀</span>`;
  } else {
    nextBtn.innerHTML = `Endelea <span style="margin-left: 8px;">&rarr;</span>`;
  }
  
  if (onboardingState.step === 2) {
    loadOnboardingQR();
  }
}

document.getElementById("obNextBtn").addEventListener("click", async () => {
  const nextBtn = document.getElementById("obNextBtn");
  nextBtn.disabled = true;
  nextBtn.textContent = "⏳...";
  
  if (onboardingState.step === 1) {
    const ctx = document.getElementById("obBusinessContext").value.trim();
    if (!ctx) {
      document.getElementById("obStep1Error").classList.remove("hidden");
      nextBtn.disabled = false;
      nextBtn.innerHTML = `Endelea <span style="margin-left: 8px;">&rarr;</span>`;
      return;
    }
    document.getElementById("obStep1Error").classList.add("hidden");
    // Save Context
    try {
      await apiFetch("/settings/context", {
        method: "PUT",
        body: JSON.stringify({ context: ctx })
      });
      onboardingState.step = 2;
      updateOnboardingUI();
    } catch(err) {
      alert(t('alertErr') + err.message);
    }
  } 
  else if (onboardingState.step === 2) {
    // Endelea hata kama hajaunganisha WhatsApp (Optional skip per user choice inside step)
    onboardingState.step = 3;
    updateOnboardingUI();
  }
  else if (onboardingState.step === 3) {
    const name = document.getElementById("obProdName").value.trim();
    const price = document.getElementById("obProdPrice").value.trim();
    const desc = document.getElementById("obProdDesc").value.trim();
    
    if (!name || !price) {
      document.getElementById("obStep3Error").classList.remove("hidden");
      nextBtn.disabled = false;
      nextBtn.innerHTML = `Kamilisha <span style="margin-left: 8px;">🚀</span>`;
      return;
    }
    document.getElementById("obStep3Error").classList.add("hidden");
    
    try {
      await apiFetch("/products", {
        method: "POST",
        body: JSON.stringify({ name, price: Number(price), description: desc, isAvailable: true })
      });
      
      // Fire Confetti
      fireConfetti();
      document.getElementById("onboardingWizard").classList.add("hidden");
      loadProducts();
    } catch(err) {
      alert(t('alertErr') + err.message);
    }
  }
  
  nextBtn.disabled = false;
  if (onboardingState.step !== 3) {
    nextBtn.innerHTML = `Endelea <span style="margin-left: 8px;">&rarr;</span>`;
  }
});

document.getElementById("obBackBtn").addEventListener("click", () => {
  if (onboardingState.step > 1) {
    onboardingState.step--;
    updateOnboardingUI();
  }
});

document.getElementById("obSkipBtn").addEventListener("click", () => {
  document.getElementById("onboardingWizard").classList.add("hidden");
});

let obPollInterval;
async function loadOnboardingQR() {
  const qrDiv = document.getElementById("obQrcode");
  const successDiv = document.getElementById("obConnectedSuccess");
  
  qrDiv.innerHTML = t('fetchQr');
  successDiv.classList.add("hidden");
  
  try {
    const statusData = await apiFetch("/whatsapp-status");
    if (statusData.state === "connected") {
      qrDiv.style.display = "none";
      successDiv.classList.remove("hidden");
      onboardingState.hasWhatsApp = true;
      return;
    }
    
    qrDiv.style.display = "block";
    if (statusData.qr) {
      qrDiv.innerHTML = "";
      new QRCode(qrDiv, { text: statusData.qr, width: 200, height: 200 });
      
      // Poll every 3 seconds to check if connected
      clearInterval(obPollInterval);
      obPollInterval = setInterval(async () => {
        const checkData = await apiFetch("/whatsapp-status");
        if (checkData.state === "connected") {
          clearInterval(obPollInterval);
          qrDiv.style.display = "none";
          successDiv.classList.remove("hidden");
          onboardingState.hasWhatsApp = true;
          // Auto advance to step 3 after 2 seconds
          setTimeout(() => {
            onboardingState.step = 3;
            updateOnboardingUI();
          }, 2000);
        }
      }, 3000);
    } else {
      qrDiv.innerHTML = "Akaunti inaunganishwa au inaanza. Subiri kidogo kisha rudisha nyuma na uje mbele.";
    }
  } catch (err) {
    qrDiv.innerHTML = "Kosa: " + err.message;
  }
}

// ---- CONFETTI ANIMATION ----
function fireConfetti() {
  const canvas = document.getElementById("confettiCanvas");
  canvas.classList.remove("hidden");
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  const particles = [];
  const colors = ['#00DC82', '#6366f1', '#f59e0b', '#ef4444', '#ec4899'];
  
  for(let i=0; i<150; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 6 + 2,
      d: Math.random() * 150 + 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 10,
      tiltAngle: Math.random() * 0.05,
      tiltAngleIncr: (Math.random() * 0.07) + 0.05
    });
  }
  
  let angle = 0;
  let W = window.innerWidth;
  let H = window.innerHeight;
  let animationId;
  
  function draw() {
    ctx.clearRect(0, 0, W, H);
    for(let i=0; i<particles.length; i++) {
      let p = particles[i];
      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r);
      ctx.stroke();
    }
    update();
    animationId = requestAnimationFrame(draw);
  }
  
  function update() {
    angle += 0.01;
    for(let i=0; i<particles.length; i++) {
      let p = particles[i];
      p.y += Math.cos(angle + p.d) + 1 + p.r / 2;
      p.x += Math.sin(angle);
      p.tiltAngle += p.tiltAngleIncr;
      p.tilt = Math.sin(p.tiltAngle) * 15;
    }
  }
  
  draw();
  setTimeout(() => {
    cancelAnimationFrame(animationId);
    canvas.classList.add("hidden");
  }, 5000);
}


// ---- CONVERSATIONS ----
async function loadConversations(page = 1) {
  const list = document.getElementById("conversationsList");
  list.innerHTML = `<p style="color:var(--text-muted);padding:16px;">${t('loading')}</p>`;

  try {
    const data = await apiFetch(`/conversations?page=${page}`);
    list.innerHTML = "";

    if (!data.conversations || data.conversations.length === 0) {
      list.innerHTML = `<p style="color:var(--text-muted);padding:16px;">${t('emptyConversations')}</p>`;
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

  thread.innerHTML = `<p style="color:var(--text-muted);padding:16px;text-align:center;">${t('loadingChats')}</p>`;
  header.classList.remove("hidden");
  headerName.textContent = `${name} (${phone})`;

  try {
    const data = await apiFetch(`/conversations/${convId}/messages`);
    thread.innerHTML = "";

    const toggleBtn = document.getElementById("toggleContactTypeBtn");
    if (data.conversation) {
      let isPersonal = data.conversation.contactType === "personal";
      toggleBtn.innerHTML = isPersonal ? t('botFriend') : t('botCustomer');
      
      // Mteja (AI Inajibu) = Kijani (Primary/Success)
      // Rafiki (AI Imezimwa) = Nyekundu (Danger)
      toggleBtn.style.color = isPersonal ? "white" : "white";
      toggleBtn.style.border = "none";
      toggleBtn.style.borderRadius = "20px";
      toggleBtn.style.background = isPersonal ? "var(--danger)" : "var(--primary)";
      toggleBtn.style.fontWeight = "600";
      
      toggleBtn.onclick = async () => {
        try {
          const newType = isPersonal ? "customer" : "personal";
          toggleBtn.innerHTML = "Inabadilisha...";
          
          await apiFetch(`/conversations/${convId}/contact-type`, {
            method: "PUT",
            body: JSON.stringify({ contactType: newType })
          });
          
          // Badilisha state inline bila kureload meseji
          data.conversation.contactType = newType;
          isPersonal = newType === "personal";
          
          toggleBtn.innerHTML = isPersonal ? t('botFriend') : t('botCustomer');
          toggleBtn.style.background = isPersonal ? "var(--danger)" : "var(--primary)";
          
        } catch (e) {
          alert(t('alertFailEdit') + e.message);
          toggleBtn.innerHTML = isPersonal ? t('botFriend') : t('botCustomer');
        }
      };
    }

    if (!data.messages || data.messages.length === 0) {
      thread.innerHTML = `<p style="color:var(--text-muted);padding:16px;text-align:center;">${t('emptyMessages')}</p>`;
      return;
    }

    data.messages.forEach(msg => {
      const bubble = document.createElement("div");
      bubble.className = `chat-bubble ${msg.sender === "customer" ? "customer" : "ai"}`;

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
  try {
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
  } catch (err) {
    console.error("Failed to load overview stats:", err);
  }
  
  // Sync the bot toggle state visually
  try {
    const settings = await apiFetch("/settings");
    updateBotToggleUI(settings.botActive);
  } catch (e) {
    console.error("Failed to load bot settings for toggle state", e);
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
      const imgCell = p.imageUrl 
        ? `<img src="${p.imageUrl}" alt="picha" style="width:40px;height:40px;object-fit:cover;border-radius:4px;" />` 
        : `<div style="width:40px;height:40px;background:var(--line);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-muted);">Hakuna</div>`;
      tr.innerHTML = `
        <td>${imgCell}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.category)}</td>
        <td class="mono">${Number(p.price).toLocaleString()}</td>
        <td class="mono">${p.stock}</td>
        <td>${p.colors ? escapeHtml(p.colors) : "—"}</td>
        <td>${p.sizes ? escapeHtml(p.sizes) : "—"}</td>
        <td>
          <button class="btn-icon" onclick="editProduct(${p.id})">${t('btnEdit')}</button>
          <button class="btn-icon danger" onclick="deleteProduct(${p.id})">${t('btnDelete')}</button>
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
  document.getElementById("productModalTitle").textContent = product ? t('editProduct') : t('addProduct');
  document.getElementById("productId").value = product ? product.id : "";
  document.getElementById("pName").value = product ? product.name : "";
  document.getElementById("pPrice").value = product ? product.price : "";
  document.getElementById("pStock").value = product ? product.stock : "";
  document.getElementById("pColors").value = product ? product.colors || "" : "";
  document.getElementById("pSizes").value = product ? product.sizes || "" : "";
  document.getElementById("pDescription").value = product ? product.description || "" : "";
  document.getElementById("pImage").value = ""; // Reset file input

  // Jaza categories kwa nguvu kutoka kwa bidhaa zilizopo + za kawaida
  const defaultCategories = ["Jezi", "Simu", "Laptop", "Smartwatch", "Calculator", "Accessories"];
  const existingCategories = allProductsCache.map((p) => p.category).filter(Boolean);
  const allCategories = [...new Set([...defaultCategories, ...existingCategories])].sort();

  const catSelect = document.getElementById("pCategory");
  catSelect.innerHTML = allCategories
    .map((c) => `<option value="${escapeHtml(c)}" ${product && product.category === c ? "selected" : ""}>${escapeHtml(c)}</option>`)
    .join("");
  // Ongeza uwezekano wa kuandika category yoyote mpya
  catSelect.innerHTML += `<option value="__custom__">${t('addCategory')}</option>`;

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
    const custom = prompt(t('promptCategory'));
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
    alert(t('alertNoCategory'));
    return;
  }
  
  let imageUrl = undefined;
  const imageFile = document.getElementById("pImage").files[0];
  if (imageFile) {
    const formData = new FormData();
    formData.append("image", imageFile);
    try {
      const uploadRes = await fetch(API_BASE + "/products/upload", {
        method: "POST",
        headers: { "Authorization": `Bearer ${localStorage.getItem("merchant_token")}` },
        body: formData
      });
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        imageUrl = uploadData.imageUrl;
      }
    } catch(err) {
      console.error("Upload error:", err);
    }
  }

  const payload = {
    name: document.getElementById("pName").value,
    category: categoryVal,
    price: document.getElementById("pPrice").value,
    stock: document.getElementById("pStock").value,
    colors: document.getElementById("pColors").value,
    sizes: document.getElementById("pSizes").value,
    description: document.getElementById("pDescription").value,
    ...(imageUrl && { imageUrl })
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
          <option value="pending" ${o.status === "pending" ? "selected" : ""}>${t('optPending')}</option>
          <option value="paid" ${o.status === "paid" ? "selected" : ""}>${t('optPaid')}</option>
          <option value="confirmed" ${o.status === "confirmed" ? "selected" : ""}>${t('optConfirmed')}</option>
          <option value="delivered" ${o.status === "delivered" ? "selected" : ""}>${t('optDelivered')}</option>
          <option value="cancelled" ${o.status === "cancelled" ? "selected" : ""}>${t('optCancelled')}</option>
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
      showToast(`${t('toastOrderNotified')}${id} ni "${status}" ✅`);
    } else {
      showToast(t('toastOrderNotNotified'));
    }
  }
}

function showToast(message) {
  const containerId = "modern-toast-container";
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    container.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none;";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  const isError = message.includes("⚠️") || message.toLowerCase().includes("kosa") || message.toLowerCase().includes("error");
  
  const iconColor = isError ? "#ff3366" : "#00dc82";
  const iconBg = isError ? "rgba(255,51,102,0.15)" : "rgba(0,220,130,0.15)";
  const iconSvg = isError 
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

  toast.style.cssText = `
    background: rgba(26, 35, 50, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #fff;
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 13.5px;
    font-weight: 500;
    box-shadow: 0 10px 30px -5px rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 320px;
    transform: translateX(120%);
    opacity: 0;
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  `;
  
  toast.innerHTML = `<div style="background: ${iconBg}; color: ${iconColor}; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${iconSvg}</div><span style="line-height:1.4;">${message}</span>`;
  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.style.transform = "translateX(0)";
    toast.style.opacity = "1";
  });

  // Remove after 4 seconds
  setTimeout(() => {
    toast.style.transform = "translateX(120%)";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 400);
  }, 4000);
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
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--ink-soft);padding:20px;">${t('emptySpecialRequests')}</td></tr>`;
    return;
  }

  const statusLabels = { new: t('srNew'), sourcing: t('srSourcing'), found: t('srFound'), fulfilled: t('srFulfilled'), cancelled: t('srCancelled') };
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
    showToast(`${t('toastSrNotified')}${currentSrId} ✅`);
  } else {
    showToast(t('toastSrUpdated'));
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
  listEl.innerHTML = `<p class="conv-empty" style="margin:0;">${t('loading')}</p>`;

  const customers = await insightsFetch("/potential-customers");

  if (customers.length === 0) {
    listEl.innerHTML = `<p class="conv-empty" style="margin:0;">${t('emptyIntent')}</p>`;
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
  listEl.innerHTML = `<p class="conv-empty" style="margin:0;">${t('loading')}</p>`;

  const customers = await insightsFetch("/re-engaged");

  if (customers.length === 0) {
    listEl.innerHTML = `<p class="conv-empty" style="margin:0;">${t('emptyNudges')}</p>`;
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

document.getElementById("generateAdviceBtn")?.addEventListener("click", async () => {
  const btn = document.getElementById("generateAdviceBtn");
  const box = document.getElementById("adviceBox");
  if (!box) return;
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

document.getElementById("askQuestionBtn")?.addEventListener("click", askBusinessQuestion);
document.getElementById("askQuestionInput")?.addEventListener("keydown", (e) => {
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
let wsConnectionStartTime = null;

let activeConnectMode = null; // null | "qr" | "pairing"

async function checkWhatsAppStatus() {
  if (statusPollTimeout) {
    clearTimeout(statusPollTimeout);
    statusPollTimeout = null;
  }

  const badge = document.getElementById("whatsappStatusBadge");
  const textEl = document.getElementById("whatsappStatusText");
  const qrContainer = document.getElementById("whatsappQrContainer");
  const qrOption1Box = document.getElementById("qrOption1Box");
  const pairSection = document.getElementById("pairingCodeSection");
  const modeSelector = document.getElementById("whatsappConnectModeSelector");
  const qrCodeDiv = document.getElementById("qrcode");
  const restartBtn = document.getElementById("whatsappRestartBtn");

  if (!localStorage.getItem("merchant_token")) return;

  try {
    const data = await apiFetch("/whatsapp-status");
    badge.className = "badge " + data.status;

    // Track disconnects for push notifications
    if (typeof currentWsState !== 'undefined' && currentWsState === "connected" && data.status === "disconnected") {
      if (typeof showPushNotification === "function") {
        showPushNotification("⚠️ WhatsApp Imekatika!", "Muunganiko wako wa WhatsApp umekatika. Tafadhali fungua mfumo kuunganisha upya ili AI iendelee kujibu wateja.");
      }
    }
    window.currentWsState = data.status;

    // Sync bot toggle UI with server state on every poll
    if (typeof data.botActive === "boolean") updateBotToggleUI(data.botActive);

    // Timeout logic (2 minutes = 120000 ms) for QR / Connecting
    if (data.status === "connecting" || data.status === "qr") {
      if (!wsConnectionStartTime) {
        wsConnectionStartTime = Date.now();
      } else if (Date.now() - wsConnectionStartTime > 120000) {
        // Abort the connection session on the backend
        await apiFetch("/whatsapp-disconnect", { method: "POST" });
        wsConnectionStartTime = null;
        activeConnectMode = null;
        
        badge.className = "badge disconnected";
        badge.textContent = t('statusTimeoutBadge');
        textEl.textContent = t('statusTimeoutDesc');
        qrContainer.classList.add("hidden");
        if (qrOption1Box) qrOption1Box.classList.add("hidden");
        if (pairSection) pairSection.classList.add("hidden");
        if (modeSelector) modeSelector.classList.remove("hidden");
        qrCodeDiv.innerHTML = "";
        lastQrText = null;
        const pairDisplay = document.getElementById("pairCodeDisplay");
        if (pairDisplay) pairDisplay.classList.add("hidden");
        
        restartBtn.textContent = t('btnConnectWa');
        restartBtn.classList.remove("hidden");
        statusPollTimeout = setTimeout(checkWhatsAppStatus, 10000);
        return; // Stop further processing this poll
      }
    } else {
      wsConnectionStartTime = null; // Reset if connected or disconnected
    }

    if (data.status === "connected") {
      activeConnectMode = null;
      badge.className = "badge connected";
      badge.textContent = t('statusConnectedBadge');
      textEl.textContent = t('statusConnectedDesc');
      if (modeSelector) modeSelector.classList.add("hidden");
      qrContainer.classList.add("hidden");
      if (qrOption1Box) qrOption1Box.classList.add("hidden");
      if (pairSection) pairSection.classList.add("hidden");
      qrCodeDiv.innerHTML = "";
      lastQrText = null;
      restartBtn.classList.add("hidden");
      statusPollTimeout = setTimeout(checkWhatsAppStatus, 15000);
    } else if (data.status === "connecting") {
      badge.className = "badge connecting";
      badge.textContent = t('statusConnectingBadge');
      textEl.textContent = t('statusConnectingDesc');
      if (modeSelector) modeSelector.classList.add("hidden");
      qrContainer.classList.remove("hidden");
      if (activeConnectMode === "pairing") {
        if (pairSection) pairSection.classList.remove("hidden");
        if (qrOption1Box) qrOption1Box.classList.add("hidden");
      } else {
        if (qrOption1Box) qrOption1Box.classList.remove("hidden");
        if (pairSection) pairSection.classList.add("hidden");
      }
      restartBtn.classList.add("hidden");
      statusPollTimeout = setTimeout(checkWhatsAppStatus, 3000);
    } else if (data.status === "qr") {
      if (activeConnectMode === "pairing") {
        if (modeSelector) modeSelector.classList.add("hidden");
        qrContainer.classList.remove("hidden");
        if (pairSection) pairSection.classList.remove("hidden");
        if (qrOption1Box) qrOption1Box.classList.add("hidden");
      } else {
        activeConnectMode = "qr";
        badge.className = "badge connecting";
        badge.textContent = t('statusQrBadge');
        textEl.textContent = t('statusQrDesc');
        if (modeSelector) modeSelector.classList.add("hidden");
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
        if (qrOption1Box) qrOption1Box.classList.remove("hidden");
        if (pairSection) pairSection.classList.add("hidden");
      }
      statusPollTimeout = setTimeout(checkWhatsAppStatus, 3000);
    } else {
      badge.className = "badge disconnected";
      badge.textContent = t('statusDiscBadge');
      textEl.textContent = t('statusDiscDesc');
      
      // Enforce activeConnectMode UI retention during disconnected state
      if (activeConnectMode === "pairing") {
        if (modeSelector) modeSelector.classList.add("hidden");
        qrContainer.classList.remove("hidden");
        if (pairSection) pairSection.classList.remove("hidden");
        if (qrOption1Box) qrOption1Box.classList.add("hidden");
      } else if (activeConnectMode === "qr") {
        if (modeSelector) modeSelector.classList.add("hidden");
        qrContainer.classList.remove("hidden");
        if (qrOption1Box) qrOption1Box.classList.remove("hidden");
        if (pairSection) pairSection.classList.add("hidden");
      } else {
        if (modeSelector) modeSelector.classList.remove("hidden");
        qrContainer.classList.add("hidden");
        if (qrOption1Box) qrOption1Box.classList.add("hidden");
        if (pairSection) pairSection.classList.add("hidden");
      }

      qrCodeDiv.innerHTML = "";
      lastQrText = null;
      restartBtn.classList.add("hidden");
      statusPollTimeout = setTimeout(checkWhatsAppStatus, 5000);
    }
  } catch (err) {
    console.error("Kosa la kuangalia hali ya WhatsApp:", err);
    badge.className = "badge disconnected";
    badge.textContent = "Error";
    textEl.textContent = t('statusErrorDesc');
    restartBtn.textContent = t('btnRetry');
    restartBtn.classList.remove("hidden");
    statusPollTimeout = setTimeout(checkWhatsAppStatus, 10000);
  }
}

// Mode Selection Event Listeners
document.getElementById("selectQrModeBtn")?.addEventListener("click", async () => {
  activeConnectMode = "qr";
  const qrOption1Box = document.getElementById("qrOption1Box");
  const pairSection = document.getElementById("pairingCodeSection");
  const qrContainer = document.getElementById("whatsappQrContainer");
  const modeSelector = document.getElementById("whatsappConnectModeSelector");
  const qrCodeDiv = document.getElementById("qrcode");
  
  if (pairSection) pairSection.classList.add("hidden");
  if (qrOption1Box) qrOption1Box.classList.remove("hidden");
  if (qrContainer) qrContainer.classList.remove("hidden");
  if (modeSelector) modeSelector.classList.add("hidden");

  if (qrCodeDiv && (!lastQrText || qrCodeDiv.children.length === 0)) {
    qrCodeDiv.innerHTML = `<p style="font-size: 13px; color: var(--indigo); font-weight: 500; padding: 20px; text-align: center;">⏳ Inatengeneza QR Code mpya, tafadhali subiri sekunde chache...</p>`;
  }

  try {
    await apiFetch("/whatsapp-connect", { method: "POST" });
    checkWhatsAppStatus();
  } catch (e) {}
});

document.getElementById("selectPairModeBtn")?.addEventListener("click", () => {
  activeConnectMode = "pairing";
  const qrOption1Box = document.getElementById("qrOption1Box");
  const pairSection = document.getElementById("pairingCodeSection");
  const qrContainer = document.getElementById("whatsappQrContainer");
  const modeSelector = document.getElementById("whatsappConnectModeSelector");
  
  if (qrOption1Box) qrOption1Box.classList.add("hidden");
  if (pairSection) pairSection.classList.remove("hidden");
  if (qrContainer) qrContainer.classList.remove("hidden");
  if (modeSelector) modeSelector.classList.add("hidden");
});

document.querySelectorAll(".changeConnectModeBtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeConnectMode = null;
    const qrOption1Box = document.getElementById("qrOption1Box");
    const pairSection = document.getElementById("pairingCodeSection");
    const qrContainer = document.getElementById("whatsappQrContainer");
    const modeSelector = document.getElementById("whatsappConnectModeSelector");
    
    if (qrOption1Box) qrOption1Box.classList.add("hidden");
    if (pairSection) pairSection.classList.add("hidden");
    if (qrContainer) qrContainer.classList.add("hidden");
    if (modeSelector) modeSelector.classList.remove("hidden");
  });
});

document.getElementById("whatsappRestartBtn")?.addEventListener("click", async () => {
  const btn = document.getElementById("whatsappRestartBtn");
  const textEl = document.getElementById("whatsappStatusText");
  btn.disabled = true;
  btn.textContent = t('btnConnecting');
  textEl.textContent = t('statusStartingWa');
  wsConnectionStartTime = null; // Reset on manual click

  try {
    await apiFetch("/whatsapp-connect", { method: "POST" });
    checkWhatsAppStatus();
  } catch (err) {
    textEl.textContent = t('statusFailConnect') + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = t('btnConnectWa');
  }
});

// ---- PAIRING CODE LOGIC ----
document.getElementById("getPairCodeBtn")?.addEventListener("click", async () => {
  const btn = document.getElementById("getPairCodeBtn");
  const codeDisplay = document.getElementById("pairCodeDisplay");
  const copyBtn = document.getElementById("copyPairCodeBtn");

  btn.disabled = true;
  btn.textContent = t('fetching');
  codeDisplay.classList.add("hidden");
  if (copyBtn) copyBtn.classList.add("hidden");
  codeDisplay.textContent = "";

  try {
    wsConnectionStartTime = Date.now(); // Reset timer when requesting new code
    const res = await apiFetch("/whatsapp-pair-code", {
      method: "POST",
      body: JSON.stringify({})
    });

    if (res.success && res.code) {
      // Format code slightly if it's 8 chars long (e.g., ABCD-EFGH)
      let formattedCode = res.code;
      if (formattedCode.length === 8 && !formattedCode.includes("-")) {
        formattedCode = formattedCode.slice(0, 4) + "-" + formattedCode.slice(4);
      }
      codeDisplay.textContent = formattedCode;
      codeDisplay.setAttribute("data-raw-code", formattedCode);
      codeDisplay.classList.remove("hidden");
      if (copyBtn) copyBtn.classList.remove("hidden");
    }
  } catch (err) {
    alert("Kosa: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "🔢 Tengeneza Pairing Code";
  }
});

// Copy Pairing Code Button Event Listener
document.getElementById("copyPairCodeBtn")?.addEventListener("click", () => {
  const codeDisplay = document.getElementById("pairCodeDisplay");
  const codeText = codeDisplay.getAttribute("data-raw-code") || codeDisplay.textContent.trim();
  if (!codeText) return;

  const btnText = document.getElementById("copyPairCodeBtnText");

  const showSuccess = () => {
    if (btnText) {
      const orig = btnText.textContent;
      btnText.textContent = "✅ Imenakiliwa!";
      setTimeout(() => { btnText.textContent = orig; }, 2500);
    }
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(codeText).then(showSuccess).catch(() => {
      fallbackCopyTextToClipboard(codeText, showSuccess);
    });
  } else {
    fallbackCopyTextToClipboard(codeText, showSuccess);
  }
});

function fallbackCopyTextToClipboard(text, callback) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    if (callback) callback();
  } catch (err) {
    alert("Code imeonekana: " + text);
  }
  document.body.removeChild(textArea);
}



// ---- BOT TOGGLE (Washa / Zima AI Agent) ----
function updateBotToggleUI(isActive) {
  const btn = document.getElementById("botToggleBtn");
  const btnText = document.getElementById("botToggleBtnText");
  const sublabel = document.getElementById("botToggleSublabel");
  const icon = document.getElementById("botToggleIcon");

  if (isActive) {
    btn.className = "bot-toggle-btn bot-toggle-active";
    btnText.textContent = t('botOff');
    sublabel.textContent = t('botSub');
    sublabel.classList.remove("bot-sublabel-paused");
    icon.textContent = "🤖";
  } else {
    btn.className = "bot-toggle-btn bot-toggle-paused";
    btnText.textContent = t('botOn');
    sublabel.textContent = t('botSubPaused') || "⏸️ Imesimamishwa — muuzaji anajibu mwenyewe";
    sublabel.classList.add("bot-sublabel-paused");
    icon.textContent = "💤";
  }
}

document.getElementById("botToggleBtn")?.addEventListener("click", async () => {
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
  const billingPlanEl = document.getElementById("currentPlanDisplay");
  const billingExpiryEl = document.getElementById("planExpiryDisplay");

  if (billingPlanEl) billingPlanEl.textContent = "Inapakia...";

  try {
    const settings = await apiFetch("/settings");

    // Business details
    const bizNameEl = document.getElementById("setBusinessName");
    const bizContextEl = document.getElementById("setBusinessContext");
    const bizPaymentEl = document.getElementById("setPaymentInstructions");
    if (bizNameEl) bizNameEl.value = settings.businessName || "";
    if (bizContextEl) bizContextEl.value = settings.businessContext || "";
    if (bizPaymentEl) bizPaymentEl.value = settings.paymentInstructions || "";

    // Nudge settings
    const nudgeMin = document.getElementById("setNudgeMin");
    const nudgeMax = document.getElementById("setNudgeMax");
    const nudgeCooldown = document.getElementById("setNudgeCooldown");
    const nudgeStart = document.getElementById("setNudgeStartHour");
    const nudgeEnd = document.getElementById("setNudgeEndHour");
    if (nudgeMin) nudgeMin.value = settings.reEngagementMinHours ?? 12;
    if (nudgeMax) nudgeMax.value = settings.reEngagementMaxHours ?? 24;
    if (nudgeCooldown) nudgeCooldown.value = settings.reEngagementCooldownHours ?? 48;
    if (nudgeStart) nudgeStart.value = settings.reEngagementStartHour ?? 7;
    if (nudgeEnd) nudgeEnd.value = settings.reEngagementEndHour ?? 21;

    // Reset password section
    const togglePwBtn = document.getElementById("togglePasswordChangeBtn");
    const pwSection = document.getElementById("passwordChangeSection");
    if (togglePwBtn) togglePwBtn.checked = false;
    if (pwSection) pwSection.classList.add("hidden");
    const verifyPhoneEl = document.getElementById("setVerifyPhone");
    const oldPwEl = document.getElementById("setOldPassword");
    const newPwEl = document.getElementById("setNewPassword");
    if (verifyPhoneEl) verifyPhoneEl.value = "";
    if (oldPwEl) oldPwEl.value = "";
    if (newPwEl) newPwEl.value = "";

    // Load Billing Info
    const planMap = {
      "free_trial": "🆓 Majaribio Bure (Siku 7)",
      "monthly": "📆 Kila Mwezi",
      "yearly": "🗓️ Kila Mwaka"
    };
    const currentPlanStr = settings.subscriptionPlan
      ? (planMap[settings.subscriptionPlan] || settings.subscriptionPlan)
      : "🆓 Majaribio Bure";
    if (billingPlanEl) billingPlanEl.textContent = currentPlanStr;

    // Join date
    const joinDateEl = document.getElementById("planJoinDateDisplay");
    if (joinDateEl && settings.createdAt) {
      const joinDate = new Date(settings.createdAt);
      joinDateEl.textContent = joinDate.toLocaleDateString('sw-TZ', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    // Expiry date
    if (settings.subscriptionEndDate) {
      const expiryDate = new Date(settings.subscriptionEndDate);
      const isExpired = expiryDate < new Date();
      const dateStr = expiryDate.toLocaleDateString('sw-TZ', { year: 'numeric', month: 'long', day: 'numeric' });
      if (billingExpiryEl) {
        billingExpiryEl.textContent = isExpired ? `${dateStr} ⚠️ Imeisha!` : dateStr;
        billingExpiryEl.style.color = isExpired ? "var(--danger)" : "var(--primary)";
      }
    } else {
      if (billingExpiryEl) {
        billingExpiryEl.textContent = "Majaribio — Haijawekwa";
        billingExpiryEl.style.color = "var(--text-muted)";
      }
    }

  } catch (err) {
    console.error("loadSettings error:", err);
    if (billingPlanEl) billingPlanEl.textContent = "Kosa la kupakia";
  }
}

document.getElementById("togglePasswordChangeBtn")?.addEventListener("change", (e) => {
  const section = document.getElementById("passwordChangeSection");
  if (e.target.checked) {
    section.classList.remove("hidden");
  } else {
    section.classList.add("hidden");
    document.getElementById("setVerifyPhone").value = "";
    document.getElementById("setOldPassword").value = "";
    document.getElementById("setNewPassword").value = "";
  }
});

document.getElementById("bizSettingsForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("bizSaveStatus");
  const submitBtn = e.target.querySelector("button[type='submit']");
  statusEl.style.display = "block";
  statusEl.style.color = "var(--text-muted)";
  statusEl.textContent = "⏳ Inahifadhi maelezo...";
  submitBtn.disabled = true;

  const payload = {
    businessName: document.getElementById("setBusinessName").value.trim(),
    businessContext: document.getElementById("setBusinessContext").value.trim(),
    paymentInstructions: document.getElementById("setPaymentInstructions").value.trim(),
  };

  try {
    const res = await apiFetch("/settings", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (res.success) {
      document.getElementById("merchantBrandName").textContent = payload.businessName;
      const infoRaw = localStorage.getItem("merchant_info");
      if (infoRaw) {
        const info = JSON.parse(infoRaw);
        info.businessName = payload.businessName;
        localStorage.setItem("merchant_info", JSON.stringify(info));
      }
      statusEl.style.color = "var(--success)";
      statusEl.textContent = "✅ Maelezo yamehifadhiwa!";
      setTimeout(() => { if (statusEl.textContent.includes("✅")) statusEl.style.display = "none"; }, 3000);
    }
  } catch (err) {
    statusEl.style.color = "var(--danger)";
    statusEl.textContent = "❌ Imetokea hitilafu.";
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById("securitySettingsForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("securitySaveStatus");
  const submitBtn = e.target.querySelector("button[type='submit']");
  statusEl.style.display = "block";
  statusEl.style.color = "var(--text-muted)";
  statusEl.textContent = "⏳ Inabadili password...";
  submitBtn.disabled = true;

  const payload = {
    oldPassword: document.getElementById("setOldPassword").value,
    verifyPhone: document.getElementById("setVerifyPhone").value,
    newPassword: document.getElementById("setNewPassword").value,
  };

  if (!payload.oldPassword || !payload.verifyPhone || !payload.newPassword) {
    statusEl.style.color = "var(--danger)";
    statusEl.textContent = "⚠️ Jaza taarifa zote za usalama.";
    submitBtn.disabled = false;
    return;
  }

  try {
    const res = await apiFetch("/settings", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (res.success) {
      document.getElementById("setOldPassword").value = "";
      document.getElementById("setVerifyPhone").value = "";
      document.getElementById("setNewPassword").value = "";
      statusEl.style.color = "var(--success)";
      statusEl.textContent = "✅ Password imebadilishwa!";
      setTimeout(() => { if (statusEl.textContent.includes("✅")) statusEl.style.display = "none"; }, 3000);
    }
  } catch (err) {
    statusEl.style.color = "var(--danger)";
    statusEl.textContent = "❌ " + (err.message || "Imetokea hitilafu.");
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById("nudgeSettingsForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById("nudgeSaveStatus");
  const submitBtn = e.target.querySelector("button[type='submit']");
  statusEl.style.display = "block";
  statusEl.style.color = "var(--text-muted)";
  statusEl.textContent = "⏳ Inahifadhi ratiba...";
  submitBtn.disabled = true;

  const payload = {
    reEngagementMinHours: parseInt(document.getElementById("setNudgeMin").value, 10),
    reEngagementMaxHours: parseInt(document.getElementById("setNudgeMax").value, 10),
    reEngagementCooldownHours: parseInt(document.getElementById("setNudgeCooldown").value, 10),
    reEngagementStartHour: parseInt(document.getElementById("setNudgeStartHour").value, 10),
    reEngagementEndHour: parseInt(document.getElementById("setNudgeEndHour").value, 10),
  };

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
      statusEl.style.color = "var(--success)";
      statusEl.textContent = "✅ Ratiba imehifadhiwa!";
      setTimeout(() => { if (statusEl.textContent.includes("✅")) statusEl.style.display = "none"; }, 3000);
    }
  } catch (err) {
    statusEl.style.color = "var(--danger)";
    statusEl.textContent = "❌ Imetokea hitilafu.";
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
  submitBtn.textContent = t('deleting');

  try {
    const res = await apiFetch("/settings/account", {
      method: "DELETE",
      body: JSON.stringify({ password })
    });

    if (res.success) {
      alert(t('alertAccountDeleted'));
      deleteModal.classList.add("hidden");

      handleLogout();
    }
  } catch (err) {
    deleteError.textContent = err.message || t('failDelete');
    submitBtn.textContent = t('btnDeleteAccount');
    submitBtn.disabled = false;
  }
});

// ---- BROWSER PUSH NOTIFICATIONS ----
let lastNotificationCheck = new Date();
let notificationPollInterval = null;
let currentWsState = "disconnected"; // to track disconnects

const enableNotificationsBtn = document.getElementById("enableNotificationsBtn");

if (enableNotificationsBtn) {
  enableNotificationsBtn.addEventListener("click", async () => {
    if (!("Notification" in window)) {
      alert(t('alertPushNotSupported'));
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      alert(t('alertPushEnabled'));
      enableNotificationsBtn.textContent = "Imewashwa ✓";
      enableNotificationsBtn.disabled = true;
      enableNotificationsBtn.style.background = "var(--success)";
      startNotificationPolling();
    } else {
      alert(t('alertPushDenied'));
    }
  });

  // Check initial permission state
  if ("Notification" in window && Notification.permission === "granted") {
    enableNotificationsBtn.textContent = "Imewashwa ✓";
    enableNotificationsBtn.disabled = true;
    enableNotificationsBtn.style.background = "var(--success)";
    startNotificationPolling();
  }
}

function showPushNotification(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, {
      body: body,
      icon: "/dashboard/images/icon.png"
    });
  }
}

async function pollNotifications() {
  if (!localStorage.getItem("merchant_token")) return;
  try {
    const res = await apiFetch(`/notifications/poll?since=${lastNotificationCheck.toISOString()}`);
    lastNotificationCheck = new Date(); // update time

    if (res.newOrders > 0) {
      showPushNotification(t('pushNewOrderTitle'), t('pushNewOrderDesc').replace('{n}', res.newOrders));
      // Optional: if currently viewing overview, we might want to refresh, but user can refresh manually.
    }
  } catch (err) {
    console.error("Push Poll Error:", err);
  }
}

function startNotificationPolling() {
  if (notificationPollInterval) clearInterval(notificationPollInterval);
  lastNotificationCheck = new Date(); // reset time to now
  notificationPollInterval = setInterval(pollNotifications, 15000); // Check every 15s
}


