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
  renderRgb();

  /* ---- RGB Light (stored as SiteSetting "rgbLight") ---- */
  function defaultRgb() {
    return {
      enabled: true, mode: "rgb",
      color1: "#ff7a00", color2: "#9b5cff", color3: "#2bb8ff",
      speed: "medium", intensity: 50,
      targets: { search: true, nav: true, top: false, text: false },
      desktop: true, mobile: true,
      schedule: { enabled: false, start: "", end: "", dateFrom: "", dateTo: "" }
    };
  }

  function rgbStored() {
    if (settings.rgbLight && Object.keys(settings.rgbLight).length) return settings.rgbLight;
    const sg = settings.searchGlow || {};   // migrate the old search-glow config
    if (Object.keys(sg).length) {
      return { enabled: sg.enabled, mode: sg.style === "single" ? "single" : "rgb",
        color1: sg.color1, color2: sg.color2, color3: sg.color3, speed: sg.speed,
        intensity: sg.glowIntensity, targets: { search: true, nav: false, top: false, text: false },
        desktop: sg.desktop, mobile: sg.mobile };
    }
    return {};
  }

  function renderRgb() {
    const g = Object.assign(defaultRgb(), rgbStored());
    g.targets = Object.assign(defaultRgb().targets, g.targets || {});
    g.schedule = Object.assign(defaultRgb().schedule, g.schedule || {});
    const host = document.getElementById("settingsGlow");
    const sel = (name, value, opts) => `<select class="a-input" name="${name}">${opts.map(o =>
      `<option value="${o[0]}" ${o[0] === value ? "selected" : ""}>${o[1]}</option>`).join("")}</select>`;
    const chk = (name, on, label) => `<label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;"><input type="checkbox" name="${name}" ${on ? "checked" : ""}> ${label}</label>`;
    const searchSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
    host.innerHTML = `
      <style>
        .rgb-prev{--gp-c1:#ff7a00;--gp-c2:#9b5cff;--gp-c3:#2bb8ff;--gp-speed:6s;--gp-amb:.4;--gp-border:.85;
          border-radius:14px;overflow:hidden;background:radial-gradient(120% 120% at 50% 0%, #15171c, #0c0d10);}
        .rgb-prev-strip{height:3px;background:#20232a;}
        .rgb-prev.on.t-top .rgb-prev-strip{background:linear-gradient(90deg,var(--gp-c1),var(--gp-c2),var(--gp-c3),var(--gp-c1));background-size:300% 100%;animation:gpShift var(--gp-speed) linear infinite;}
        .rgb-prev.on.t-top[data-mode="festival"] .rgb-prev-strip{height:30px;background-color:transparent;
          background-image:linear-gradient(rgba(255,255,255,.22),rgba(255,255,255,.22)),radial-gradient(circle,var(--gp-c1) 2.7px,transparent 3.4px),radial-gradient(circle,var(--gp-c2) 2.7px,transparent 3.4px),radial-gradient(circle,var(--gp-c3) 2.7px,transparent 3.4px);
          background-repeat:repeat-x;background-size:100% 1.5px,66px 30px,66px 30px,66px 30px;background-position:0 3px,0 22px,22px 27px,44px 18px;
          filter:drop-shadow(0 0 5px var(--gp-c1));animation:gpTwinkle 1.7s ease-in-out infinite;}
        @keyframes gpTwinkle{0%,100%{filter:brightness(1);}50%{filter:brightness(1.35);}}
        .rgb-prev-row{display:flex;align-items:center;gap:16px;padding:22px 18px;flex-wrap:wrap;}
        .rgb-prev-icons{display:flex;gap:16px;}
        /* White "icon" dot on a dark chip, RGB glow spinning behind it. */
        .rgb-prev-icons span{position:relative;width:26px;height:26px;border-radius:50%;isolation:isolate;
          background:linear-gradient(180deg,#262a31,#14161a);display:flex;align-items:center;justify-content:center;}
        .rgb-prev-icons span::before{content:"";width:11px;height:11px;border-radius:50%;background:#fff;position:relative;z-index:2;}
        .rgb-prev-icons span::after{content:"";position:absolute;inset:-4px;border-radius:50%;z-index:-1;pointer-events:none;
          background:conic-gradient(from 0deg,var(--gp-c1),var(--gp-c2),var(--gp-c3),var(--gp-c1));filter:blur(4px);opacity:0;}
        .rgb-prev.on.t-nav .rgb-prev-icons span::after{opacity:calc(.3 + var(--gp-amb,.5) * .6);animation:gpSpin var(--gp-speed) linear infinite;}
        @keyframes gpSpin{to{transform:rotate(360deg);}}
        .rgb-prev.on[data-mode="single"].t-nav .rgb-prev-icons span::after{animation:none;background:radial-gradient(circle,var(--gp-c1),transparent 72%);}
        .gp-field{position:relative;display:flex;align-items:center;gap:10px;flex:1;min-width:190px;background:#1d2026;border-radius:999px;padding:9px 6px 9px 18px;}
        .rgb-prev.on.t-search .gp-field::before,.rgb-prev.on.t-search .gp-field::after{content:"";position:absolute;inset:-2px;border-radius:999px;pointer-events:none;background:linear-gradient(90deg,var(--gp-c1),var(--gp-c2),var(--gp-c3),var(--gp-c1));background-size:300% 100%;animation:gpShift var(--gp-speed) linear infinite;}
        .rgb-prev.on.t-search .gp-field::after{z-index:1;opacity:var(--gp-border);padding:1.6px;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;}
        .rgb-prev.on.t-search .gp-field::before{z-index:0;inset:-6px;filter:blur(12px);opacity:var(--gp-amb);}
        .gp-field input{flex:1;border:none;background:transparent;color:#e8eaee;font:inherit;font-size:13px;outline:none;min-width:0;position:relative;z-index:2;}
        .gp-field button{position:relative;z-index:2;width:34px;height:34px;border:none;border-radius:999px;background:#ff7a00;display:flex;align-items:center;justify-content:center;flex:none;cursor:default;}
        @keyframes gpShift{from{background-position:0% 50%;}to{background-position:300% 50%;}}
        .glow-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px;}
        .glow-colors{display:flex;gap:12px;flex-wrap:wrap;}
        .glow-colors .a-field{flex:1;min-width:90px;}
        .glow-colors input[type=color]{width:100%;height:38px;padding:2px;border:1px solid var(--a-border,#e3e3e3);border-radius:8px;background:#fff;}
        @media (max-width:640px){.glow-grid{grid-template-columns:1fr;}}
      </style>
      <div class="a-card">
        <div class="a-card-head"><h3>RGB Light</h3><button class="a-btn ghost" type="button" id="glowSave">Save</button></div>
        <div class="a-card-body">
          <div class="rgb-prev" id="glowPreview" data-mode="${g.mode}">
            <div class="rgb-prev-strip"></div>
            <div class="rgb-prev-row">
              <div class="rgb-prev-icons"><span></span><span></span><span></span><span></span></div>
              <div class="gp-field"><input value="Search whey, creatine…" readonly aria-label="Preview"><button type="button" aria-hidden="true">${searchSvg}</button></div>
            </div>
          </div>
          <div class="glow-grid" id="glowControls">
            ${chk("enabled", g.enabled, "Enable RGB light")}
            <div class="a-field"><label>Mode</label>${sel("mode", g.mode, [["rgb", "RGB (multi-colour)"], ["single", "Single colour"], ["festival", "Festival lights"], ["off", "Off"]])}</div>
            <div class="glow-colors" style="grid-column:1 / -1;">
              <div class="a-field"><label>Colour 1</label><input type="color" name="color1" value="${g.color1}"></div>
              <div class="a-field"><label>Colour 2</label><input type="color" name="color2" value="${g.color2}"></div>
              <div class="a-field"><label>Colour 3</label><input type="color" name="color3" value="${g.color3}"></div>
            </div>
            <div class="a-field"><label>Animation speed</label>${sel("speed", g.speed, [["slow", "Slow"], ["medium", "Medium"], ["fast", "Fast"]])}</div>
            <div class="a-field"><label>Intensity · <b id="glowIntVal">${g.intensity}</b></label><input type="range" name="intensity" min="0" max="100" value="${g.intensity}"></div>
            <div class="a-field" style="grid-column:1 / -1;"><label>Apply to</label>
              <div style="display:flex;gap:18px;flex-wrap:wrap;">
                ${chk("t_search", g.targets.search, "Search bar")}
                ${chk("t_nav", g.targets.nav, "Nav icons")}
                ${chk("t_top", g.targets.top, "Top strip")}
                ${chk("t_text", g.targets.text, "Brand text")}
              </div>
            </div>
            ${chk("desktop", g.desktop, "Show on desktop")}
            ${chk("mobile", g.mobile, "Show on mobile")}
            <div class="a-field" style="grid-column:1 / -1;border-top:1px solid var(--a-border,#eee);padding-top:12px;">
              ${chk("sch_enabled", g.schedule.enabled, "Schedule — only show the light inside a time window and/or festival dates")}
            </div>
            <div class="a-field"><label>Daily from (time)</label><input class="a-input" type="time" name="sch_start" value="${g.schedule.start || ""}"></div>
            <div class="a-field"><label>Daily to (time)</label><input class="a-input" type="time" name="sch_end" value="${g.schedule.end || ""}"></div>
            <div class="a-field"><label>Festival from (date)</label><input class="a-input" type="date" name="sch_dateFrom" value="${g.schedule.dateFrom || ""}"></div>
            <div class="a-field"><label>Festival to (date)</label><input class="a-input" type="date" name="sch_dateTo" value="${g.schedule.dateTo || ""}"></div>
          </div>
        </div>
      </div>`;
    document.getElementById("glowControls").addEventListener("input", syncGlowPreview);
    document.getElementById("glowSave").addEventListener("click", saveGlow);
    syncGlowPreview();
  }

  function readGlow() {
    const root = document.getElementById("glowControls");
    const val = n => root.querySelector(`[name="${n}"]`);
    const bool = n => { const el = val(n); return el ? el.checked : false; };
    const str = n => { const el = val(n); return el ? el.value : ""; };
    return {
      enabled: bool("enabled"),
      mode: str("mode"),
      color1: str("color1"), color2: str("color2"), color3: str("color3"),
      speed: str("speed"),
      intensity: Number(str("intensity")) || 0,
      targets: { search: bool("t_search"), nav: bool("t_nav"), top: bool("t_top"), text: bool("t_text") },
      desktop: bool("desktop"), mobile: bool("mobile"),
      schedule: { enabled: bool("sch_enabled"), start: str("sch_start"), end: str("sch_end"), dateFrom: str("sch_dateFrom"), dateTo: str("sch_dateTo") }
    };
  }

  function syncGlowPreview() {
    const g = readGlow();
    const p = document.getElementById("glowPreview");
    const single = g.mode === "single";
    const c2 = single ? g.color1 : g.color2;
    const c3 = single ? g.color1 : g.color3;
    const speed = ({ slow: "9s", medium: "6s", fast: "3.5s" })[g.speed] || "6s";
    p.style.setProperty("--gp-c1", g.color1);
    p.style.setProperty("--gp-c2", c2);
    p.style.setProperty("--gp-c3", c3);
    p.style.setProperty("--gp-speed", speed);
    p.style.setProperty("--gp-amb", (g.intensity / 100 * 0.6).toFixed(3));
    p.style.setProperty("--gp-border", Math.max(0.3, g.intensity / 100).toFixed(3));
    const active = g.enabled && g.mode !== "off";
    p.setAttribute("data-mode", g.mode);
    p.classList.toggle("on", active);
    p.classList.toggle("t-search", active && g.targets.search);
    p.classList.toggle("t-nav", active && g.targets.nav);
    p.classList.toggle("t-top", active && g.targets.top);
    const gi = document.getElementById("glowIntVal"); if (gi) gi.textContent = g.intensity;
  }

  async function saveGlow() {
    try {
      await AdminShell.api("/admin/settings/rgbLight", {
        method: "PUT",
        body: JSON.stringify({ key: "rgbLight", category: "appearance", value: readGlow() })
      });
      AdminShell.toast("RGB Light saved");
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
