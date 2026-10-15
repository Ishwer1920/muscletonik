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
    </div>
    <div id="settingsGlow" style="margin-top:18px;"></div>`;

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
  renderFestival();

  /* ---- Festival Lights (stored as SiteSetting "rgbLight", mode "festival") ----
     A single on/off toggle. When on, the storefront draws the draped golden
     garland across the navbar. Replaced the old RGB Light / Navbar Neon /
     Search Glow lighting options. */
  function festivalEnabled() {
    const v = settings.rgbLight;
    return !!(v && typeof v === "object" && (v.enabled === true || v.enabled === "true"));
  }

  function renderFestival() {
    const on = festivalEnabled();
    const host = document.getElementById("settingsGlow");
    host.innerHTML = `
      <style>
        .fl-prev{position:relative;height:66px;border-radius:14px;overflow:hidden;background:radial-gradient(120% 120% at 50% 0%, #15171c, #0c0d10);}
        .fl-prev::before{content:"";position:absolute;left:0;right:0;top:0;height:30px;pointer-events:none;background:url("/css/fl-garland.svg") repeat-x top center;background-size:150px 30px;filter:drop-shadow(0 0 3px rgba(255,190,70,.85));opacity:0;transition:opacity .2s;animation:flTw 2.4s ease-in-out infinite;}
        .fl-prev.on::before{opacity:1;}
        @keyframes flTw{0%,100%{opacity:1;}50%{opacity:.82;}}
        .fl-toggle{display:flex;align-items:center;gap:12px;margin-top:16px;font-weight:600;}
        .fl-switch{position:relative;width:52px;height:30px;flex:none;}
        .fl-switch input{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:pointer;}
        .fl-switch span{position:absolute;inset:0;border-radius:999px;background:#c9ccd2;transition:background .2s;pointer-events:none;}
        .fl-switch span::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .2s;}
        .fl-switch input:checked + span{background:#ff7a00;}
        .fl-switch input:checked + span::after{transform:translateX(22px);}
      </style>
      <div class="a-card">
        <div class="a-card-head"><h3>Festival Lights</h3><button class="a-btn ghost" type="button" id="festSave">Save</button></div>
        <div class="a-card-body">
          <div class="fl-prev${on ? " on" : ""}" id="festPreview"></div>
          <label class="fl-toggle">
            <span class="fl-switch"><input type="checkbox" id="festEnabled" ${on ? "checked" : ""}><span></span></span>
            <span id="festLabel">${on ? "Festival lights are ON" : "Festival lights are OFF"}</span>
          </label>
          <p style="color:var(--a-muted,#777);font-size:13px;margin-top:10px;">Draped golden lights across the navbar. Switch off to remove them from the storefront.</p>
        </div>
      </div>`;
    const cb = document.getElementById("festEnabled");
    cb.addEventListener("change", () => {
      const now = cb.checked;
      document.getElementById("festPreview").classList.toggle("on", now);
      document.getElementById("festLabel").textContent = now ? "Festival lights are ON" : "Festival lights are OFF";
    });
    document.getElementById("festSave").addEventListener("click", saveFestival);
  }

  async function saveFestival() {
    try {
      const value = { enabled: document.getElementById("festEnabled").checked, mode: "festival" };
      await AdminShell.api("/admin/settings/rgbLight", {
        method: "PUT",
        body: JSON.stringify({ key: "rgbLight", category: "appearance", value })
      });
      settings.rgbLight = value;
      AdminShell.toast("Festival Lights saved");
      notifyPreview();
    } catch (err) {
      AdminShell.toast(err.message, "err");
    }
  }

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
