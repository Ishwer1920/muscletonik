(async () => {
  const previewSync = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("mt-preview") : null;
  function notifyPreview() {
    previewSync?.postMessage({ type: "cms-updated" });
  }

  const content = document.getElementById("aContent");
  content.innerHTML = `
    <div class="a-hero">
      <div class="a-hero-card">
        <span class="eyebrow">System settings</span>
        <h2>Configure the store without leaving the dashboard.</h2>
        <p>Store info, payments, shipping, taxes, SEO, email, theme and security all live in a single editable system.</p>
      </div>
      <div class="a-hero-aside">
        <div class="a-stat-card"><span>Scope</span><strong>8 groups</strong><p>Everything from business details to API keys.</p></div>
        <div class="a-stat-card"><span>Storage</span><strong>MongoDB</strong><p>Saved as settings documents so the storefront can consume them.</p></div>
      </div>
    </div>
    <div class="grid-2" style="grid-template-columns:1fr 1fr;">
      <div id="settingsLeft"></div>
      <div id="settingsRight"></div>
    </div>`;

  const me = await AdminShell.init({ active: "settings", title: "Settings", sub: "Store, payments, shipping and security", requires: "settings" });
  if (!me) return;

  const settings = await loadSettings();
  const left = document.getElementById("settingsLeft");
  const right = document.getElementById("settingsRight");
  left.innerHTML = [
    section("Store Information", "store", settings.store || defaultStore()),
    section("Shipping", "shipping", settings.shipping || defaultShipping()),
    section("Payments", "payments", settings.payments || defaultPayments()),
    section("Taxes", "taxes", settings.taxes || defaultTaxes())
  ].join("");
  right.innerHTML = [
    section("SEO", "seo", settings.seo || defaultSeo()),
    section("Email", "email", settings.email || defaultEmail()),
    section("Theme", "theme", settings.theme || defaultTheme()),
    section("Security", "security", settings.security || defaultSecurity()),
    section("API Keys", "api", settings.api || defaultApi())
  ].join("");
  wireForms();

  function defaultStore() {
    return { storeName: "Muscle Tonik", legalName: "Muscle Tonik Pvt Ltd", gstin: "", supportEmail: "", supportPhone: "" };
  }
  function defaultShipping() {
    return { freeShippingThreshold: 599, deliveryEta: "2-4 days", codEnabled: true, zones: "India" };
  }
  function defaultPayments() {
    return { razorpayKeyId: "", upiId: "", codEnabled: true, currency: "INR" };
  }
  function defaultTaxes() {
    return { gstRate: 5, taxInclusive: false, invoicePrefix: "MT" };
  }
  function defaultSeo() {
    return { title: "Muscle Tonik", description: "Premium supplements for strength and recovery.", keywords: "whey, creatine, gainer, supplements" };
  }
  function defaultEmail() {
    return { orderConfirmation: "", shippingUpdate: "", supportReply: "", newsletterSubject: "" };
  }
  function defaultTheme() {
    return { primary: "#ff7a00", dark: "#111111", accent: "#0f766e", radius: 16 };
  }
  function defaultSecurity() {
    return { passwordMinLength: 8, twoFactor: false, sessionHours: 12, adminLockoutMinutes: 15 };
  }
  function defaultApi() {
    return { razorpayKeyId: "", razorpayWebhookSecret: "", smtpUser: "", smtpPassword: "" };
  }

  async function loadSettings() {
    try {
      const res = await AdminShell.api("/admin/settings", { method: "GET" });
      return (res.settings || []).reduce((acc, item) => {
        acc[item.key] = item.value;
        return acc;
      }, {});
    } catch {
      return {};
    }
  }

  function section(title, key, data) {
    return `
      <div class="a-card settings-section" data-section="${key}">
        <div class="a-card-head">
          <h3>${title}</h3>
          <button class="a-btn ghost save-section" type="button">Save</button>
        </div>
        <div class="a-card-body">${fieldsFor(key, data)}</div>
      </div>`;
  }

  function field(label, name, value = "", type = "text", attrs = "") {
    return `<div class="a-field"><label>${label}</label><input class="a-input" name="${name}" type="${type}" value="${AdminShell.esc(value)}" ${attrs}></div>`;
  }
  function textarea(label, name, value = "") {
    return `<div class="a-field"><label>${label}</label><textarea class="a-input" name="${name}" rows="3">${AdminShell.esc(value)}</textarea></div>`;
  }
  function toggle(label, name, checked) {
    return `<label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}> ${label}</label>`;
  }

  function fieldsFor(key, data) {
    switch (key) {
      case "store":
        return `
          ${field("Store name", "storeName", data.storeName || "")}
          ${field("Legal name", "legalName", data.legalName || "")}
          ${field("GSTIN", "gstin", data.gstin || "")}
          ${field("Support email", "supportEmail", data.supportEmail || "", "email")}
          ${field("Support phone", "supportPhone", data.supportPhone || "")}`;
      case "shipping":
        return `
          ${field("Free shipping threshold", "freeShippingThreshold", data.freeShippingThreshold ?? 599, "number", "min=0")}
          ${field("Delivery ETA", "deliveryEta", data.deliveryEta || "")}
          ${toggle("Cash on delivery enabled", "codEnabled", data.codEnabled !== false)}
          ${textarea("Shipping zones", "zones", data.zones || "")}`;
      case "payments":
        return `
          ${field("Razorpay key ID", "razorpayKeyId", data.razorpayKeyId || "")}
          ${field("UPI ID", "upiId", data.upiId || "")}
          ${toggle("Cash on delivery enabled", "codEnabled", data.codEnabled !== false)}
          ${field("Currency", "currency", data.currency || "INR")}`;
      case "taxes":
        return `
          ${field("GST rate", "gstRate", data.gstRate ?? 5, "number", "min=0 max=100")}
          ${toggle("Prices are tax inclusive", "taxInclusive", data.taxInclusive === true)}
          ${field("Invoice prefix", "invoicePrefix", data.invoicePrefix || "MT")}`;
      case "seo":
        return `
          ${field("Homepage title", "title", data.title || "")}
          ${textarea("Homepage description", "description", data.description || "")}
          ${field("Keywords", "keywords", data.keywords || "")}`;
      case "email":
        return `
          ${textarea("Order confirmation", "orderConfirmation", data.orderConfirmation || "")}
          ${textarea("Shipping update", "shippingUpdate", data.shippingUpdate || "")}
          ${textarea("Support reply", "supportReply", data.supportReply || "")}
          ${field("Newsletter subject", "newsletterSubject", data.newsletterSubject || "")}`;
      case "theme":
        return `
          ${field("Primary color", "primary", data.primary || "#ff7a00", "text")}
          ${field("Dark color", "dark", data.dark || "#111111", "text")}
          ${field("Accent color", "accent", data.accent || "#0f766e", "text")}
          ${field("Radius", "radius", data.radius ?? 16, "number", "min=0 max=40")}`;
      case "security":
        return `
          ${field("Minimum password length", "passwordMinLength", data.passwordMinLength ?? 8, "number", "min=8")}
          ${toggle("Two-factor auth required", "twoFactor", data.twoFactor === true)}
          ${field("Session lifetime (hours)", "sessionHours", data.sessionHours ?? 12, "number", "min=1")}
          ${field("Admin lockout (minutes)", "adminLockoutMinutes", data.adminLockoutMinutes ?? 15, "number", "min=1")}`;
      case "api":
        return `
          ${field("Razorpay key ID", "razorpayKeyId", data.razorpayKeyId || "")}
          ${field("Razorpay webhook secret", "razorpayWebhookSecret", data.razorpayWebhookSecret || "")}
          ${field("SMTP user", "smtpUser", data.smtpUser || "")}
          ${field("SMTP password", "smtpPassword", data.smtpPassword || "")}`;
      default:
        return "";
    }
  }

  function wireForms() {
    document.querySelectorAll(".settings-section").forEach(sectionEl => {
      const key = sectionEl.dataset.section;
      sectionEl.querySelector(".save-section").addEventListener("click", () => saveSection(sectionEl, key));
    });
  }

  async function saveSection(sectionEl, key) {
    const fd = new FormData();
    sectionEl.querySelectorAll("input, textarea").forEach(input => {
      if (input.type === "checkbox") fd.set(input.name, input.checked ? "true" : "false");
      else fd.set(input.name, input.value);
    });
    const obj = {};
    for (const [k, v] of fd.entries()) obj[k] = v;
    const normalized = normalize(key, obj);
    try {
      await AdminShell.api(`/admin/settings/${key}`, { method: "PUT", body: JSON.stringify({ key, category: "store", value: normalized }) });
      AdminShell.toast(`${key} settings saved`);
      notifyPreview();
      if (key === "theme" || key === "seo" || key === "store" || key === "shipping" || key === "payments") {
        AdminShell.toast("Storefront data updated");
      }
    } catch (err) {
      AdminShell.toast(err.message, "err");
    }
  }

  function normalize(key, obj) {
    const out = { ...obj };
    ["freeShippingThreshold", "gstRate", "radius", "passwordMinLength", "sessionHours", "adminLockoutMinutes"].forEach(n => {
      if (out[n] !== undefined && out[n] !== "") out[n] = Number(out[n]);
    });
    ["codEnabled", "taxInclusive", "twoFactor"].forEach(n => {
      if (out[n] !== undefined) out[n] = out[n] === "true";
    });
    return out;
  }
})();
