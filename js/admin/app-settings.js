/* ===========================================================
   MUSCLE TONIK - Admin -> App Settings.
   Manage the mobile-app promotion (floating card + floating
   icon) shown across the public storefront. Persisted as the
   SiteSetting "appPromo" via PUT /api/admin/settings/appPromo;
   the server (apps.core.app_promo) is the source of truth for
   validation, and GET /api/catalog exposes only the safe
   display fields to the storefront. See js/core.js for the
   public renderer this form drives.
   =========================================================== */
(async () => {
  const esc = (s) => AdminShell.esc(s);
  const POSITIONS = ["bottom-right", "bottom-left", "top-right", "top-left"];
  const POSITION_LABELS = {
    "bottom-right": "Bottom right",
    "bottom-left": "Bottom left",
    "top-right": "Top right",
    "top-left": "Top left"
  };

  // Mirror of apps/core/app_promo.py DEFAULTS. "Reset to Default" restores
  // these in the form (nothing is saved until Save Changes).
  const DEFAULTS = {
    enabled: false,
    appName: "Muscle Tonik",
    icon: "/play-assets/app-icon-512.png",
    title: "Get the Muscle Tonik App",
    description: "Shop faster, track your orders and unlock app-only offers.",
    buttonText: "Download App",
    downloadUrl: "",
    comingSoonText: "App coming soon",
    secondaryEnabled: false,
    secondaryLabel: "Learn more",
    secondaryUrl: "",
    imageWidth: 56,
    imageHeight: 56,
    cardWidth: 340,
    cardHeight: 0,
    borderRadius: 18,
    position: "bottom-right",
    showOnDesktop: true,
    showOnMobile: true,
    iconEnabled: true,
    iconSize: 58,
    iconPosition: "bottom-right",
    iconDirectDownload: false,
    bgColor: "",
    textColor: ""
  };

  const NUM_BOUNDS = {
    imageWidth: [24, 160], imageHeight: [24, 160],
    cardWidth: [240, 480], cardHeight: [0, 600],
    borderRadius: [0, 40], iconSize: [40, 120]
  };

  const content = document.getElementById("aContent");
  content.innerHTML = `
    <style>
      .ap-switch{position:relative;width:52px;height:30px;flex:none;}
      .ap-switch input{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:pointer;}
      .ap-switch span{position:absolute;inset:0;border-radius:999px;background:#c9ccd2;transition:background .2s;pointer-events:none;}
      .ap-switch span::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .2s;}
      .ap-switch input:checked + span{background:var(--a-primary,#ff7a00);}
      .ap-switch input:checked + span::after{transform:translateX(22px);}
      .ap-toggle-row{display:flex;align-items:center;gap:12px;font-weight:600;font-size:13.5px;margin-bottom:14px;}
      .ap-toggle-row:last-child{margin-bottom:0;}
      .ap-toggle-row .ap-tt{display:flex;flex-direction:column;gap:2px;}
      .ap-toggle-row .ap-tt small{font-weight:400;color:var(--a-text-soft,#777);font-size:12px;}
      .ap-master{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;}
      .ap-master .ap-master-copy strong{display:block;font-size:16px;}
      .ap-master .ap-master-copy span{color:var(--a-text-soft,#777);font-size:13px;}
      .ap-pill{font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;letter-spacing:.03em;text-transform:uppercase;}
      .ap-pill.on{background:#e6f7ec;color:#157a3a;}
      .ap-pill.off{background:#f1f1f3;color:#777;}
      .ap-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
      .ap-img-row{display:flex;gap:8px;flex-wrap:wrap;}
      .ap-img-row .a-input{flex:1;min-width:160px;}
      .ap-hint{color:var(--a-text-soft,#777);font-size:12px;margin:-6px 0 12px;}
      .ap-stage{position:relative;height:300px;border-radius:14px;overflow:hidden;
        background:linear-gradient(135deg,#1b1d22,#0d0e11);border:1px solid var(--a-border,#e5e5e5);}
      .ap-stage-head{position:absolute;top:10px;left:14px;color:rgba(255,255,255,.55);font-size:11px;letter-spacing:.04em;text-transform:uppercase;z-index:1;}
      .ap-stage-nav{position:absolute;left:0;right:0;bottom:0;height:34px;background:rgba(20,22,26,.9);
        border-top:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;gap:22px;color:#8c929b;font-size:9px;z-index:1;}
      .ap-stage-nav i{width:16px;height:2px;background:#555;border-radius:2px;display:block;}
      .ap-pv-card{position:absolute;width:230px;max-width:calc(100% - 28px);background:#fff;color:#222;border-radius:18px;
        padding:14px;box-shadow:0 20px 50px -18px rgba(0,0,0,.6);font-size:13px;}
      .ap-pv-card.c-bottom-right{right:14px;bottom:44px;} .ap-pv-card.c-bottom-left{left:14px;bottom:44px;}
      .ap-pv-card.c-top-right{right:14px;top:30px;} .ap-pv-card.c-top-left{left:14px;top:30px;}
      .ap-pv-close{position:absolute;top:7px;right:7px;width:22px;height:22px;border:none;border-radius:50%;background:rgba(0,0,0,.06);color:#333;font-size:13px;line-height:1;cursor:default;}
      .ap-pv-body{display:flex;gap:11px;align-items:flex-start;padding-right:18px;}
      .ap-pv-media img{display:block;border-radius:12px;object-fit:cover;background:#eee;}
      .ap-pv-title{font-weight:700;font-size:14px;line-height:1.2;margin:0 0 3px;}
      .ap-pv-desc{font-size:11.5px;line-height:1.4;opacity:.75;margin:0 0 9px;}
      .ap-pv-actions{display:flex;gap:6px;flex-wrap:wrap;}
      .ap-pv-btn{font-size:11px;font-weight:600;padding:7px 12px;border-radius:999px;border:none;line-height:1;cursor:default;white-space:nowrap;}
      .ap-pv-btn.primary{background:#ff7a00;color:#fff;}
      .ap-pv-btn.ghost{background:transparent;color:#333;border:1.4px solid #e4e4e4;}
      .ap-pv-btn.soon{background:rgba(0,0,0,.06);color:#555;}
      .ap-pv-fab{position:absolute;width:46px;height:46px;border-radius:50%;background:#ff7a00;overflow:hidden;
        box-shadow:0 12px 26px -8px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;}
      .ap-pv-fab img{width:100%;height:100%;object-fit:cover;}
      .ap-pv-fab.c-bottom-right{right:16px;bottom:46px;} .ap-pv-fab.c-bottom-left{left:16px;bottom:46px;}
      .ap-pv-fab.c-top-right{right:16px;top:32px;} .ap-pv-fab.c-top-left{left:16px;top:32px;}
      .ap-actionbar{display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;}
      @media (max-width:560px){.ap-grid-2{grid-template-columns:1fr;}}
    </style>
    <div class="a-hero">
      <div class="a-hero-card">
        <span class="eyebrow">Mobile app</span>
        <h2>Promote the Muscle Tonik app across your storefront.</h2>
        <p>A floating promo card and an optional floating icon, shown to every visitor on every page. Add the real download link whenever it is ready — no redeploy needed.</p>
      </div>
      <div class="a-hero-aside">
        <div class="a-stat-card"><span>Where</span><strong>Whole storefront</strong><p>Rendered by the shared layout on every page.</p></div>
        <div class="a-stat-card"><span>Storage</span><strong>MongoDB</strong><p>Saved as the "appPromo" setting document.</p></div>
      </div>
    </div>

    <div class="a-card" style="margin-bottom:22px;">
      <div class="a-card-body">
        <div class="ap-master">
          <div class="ap-master-copy">
            <strong>App promotion</strong>
            <span>Master switch. When off, the card and floating icon disappear from the public website.</span>
          </div>
          <div style="display:flex;align-items:center;gap:14px;">
            <span class="ap-pill off" id="apMasterPill">Disabled</span>
            <label class="ap-switch"><input type="checkbox" data-ap="enabled" id="apEnabled"><span></span></label>
          </div>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div id="apLeft"></div>
      <div id="apRight"></div>
    </div>`;

  const me = await AdminShell.init({
    active: "app_settings", title: "App Settings",
    sub: "Mobile app promotion across the storefront", requires: "settings"
  });
  if (!me) return;

  let state = { ...DEFAULTS, ...(await loadAppPromo()) };

  buildForm();
  fillForm(state);
  wire();
  renderPreview();

  /* ---------------- data ---------------- */

  async function loadAppPromo() {
    try {
      const res = await AdminShell.api("/admin/settings", { method: "GET" });
      const row = (res.settings || []).find((s) => s.key === "appPromo");
      return row && row.value && typeof row.value === "object" ? row.value : {};
    } catch {
      return {};
    }
  }

  /* ---------------- form markup ---------------- */

  function field(label, name, value, type, attrs, hint) {
    return `<div class="a-field"><label>${label}</label>
      <input class="a-input" data-ap="${name}" type="${type || "text"}" value="${esc(value)}" ${attrs || ""}>
      ${hint ? `<p class="ap-hint">${hint}</p>` : ""}</div>`;
  }
  function textarea(label, name, value) {
    return `<div class="a-field"><label>${label}</label>
      <textarea class="a-input" data-ap="${name}" rows="3">${esc(value)}</textarea></div>`;
  }
  function selectField(label, name, value, options) {
    const opts = options.map((o) => `<option value="${o.v}" ${o.v === value ? "selected" : ""}>${o.l}</option>`).join("");
    return `<div class="a-field"><label>${label}</label><select class="a-select" data-ap="${name}">${opts}</select></div>`;
  }
  function toggleRow(label, name, sub) {
    return `<label class="ap-toggle-row">
      <span class="ap-switch"><input type="checkbox" data-ap="${name}"><span></span></span>
      <span class="ap-tt"><span>${label}</span>${sub ? `<small>${sub}</small>` : ""}</span>
    </label>`;
  }
  function card(title, bodyHtml, headExtra) {
    return `<div class="a-card" style="margin-bottom:22px;">
      <div class="a-card-head"><h3>${title}</h3>${headExtra || ""}</div>
      <div class="a-card-body">${bodyHtml}</div></div>`;
  }
  function positionOptions() {
    return POSITIONS.map((p) => ({ v: p, l: POSITION_LABELS[p] }));
  }

  function buildForm() {
    document.getElementById("apLeft").innerHTML = [
      card("Content", `
        ${field("App name", "appName", "", "text", "maxlength=60")}
        ${field("Promotion title", "title", "", "text", "maxlength=120")}
        ${textarea("Short description", "description")}
        ${field("Download button text", "buttonText", "", "text", "maxlength=40")}
        ${field("App download URL", "downloadUrl", "", "url", 'placeholder="https://play.google.com/..."',
          "Leave blank until the link is ready. While empty the button shows the message below instead of a broken link.")}
        ${field("“App coming soon” message", "comingSoonText", "", "text", "maxlength=60",
          "Shown on the button when no download URL is set. Clear it to disable the button instead.")}
      `),
      card("Secondary button", `
        ${toggleRow("Enable secondary button", "secondaryEnabled", "An optional extra button next to Download.")}
        ${field("Secondary label", "secondaryLabel", "", "text", "maxlength=40")}
        ${field("Secondary URL", "secondaryUrl", "", "url", 'placeholder="https://… or /page.html"')}
      `),
      card("App icon / image", `
        <div class="a-field"><label>Image</label>
          <div class="ap-img-row">
            <input class="a-input" data-ap="icon" type="text" placeholder="https://… or /uploads/…">
            <button class="a-btn ghost" type="button" id="apUpload">Upload</button>
            <button class="a-btn ghost" type="button" id="apUseDefault">Default</button>
            <button class="a-btn ghost" type="button" id="apClearIcon">Clear</button>
          </div>
          <p class="ap-hint">Upload a new image, or paste the path of one already in /uploads. JPEG, PNG, WEBP or GIF, up to 15&nbsp;MB.</p>
        </div>
        <div class="ap-grid-2">
          ${field("Image width (px)", "imageWidth", "", "number", "min=24 max=160")}
          ${field("Image height (px)", "imageHeight", "", "number", "min=24 max=160")}
        </div>
      `)
    ].join("");

    document.getElementById("apRight").innerHTML = [
      card("Preview", `
        <div class="ap-stage" id="apStage">
          <span class="ap-stage-head">Storefront preview</span>
          <div class="ap-stage-nav"><i></i><i></i><i></i><i></i></div>
        </div>
        <p class="ap-hint" style="margin-top:10px;margin-bottom:0;">A representation of how the card and icon sit on the page. The live website uses your exact colors, sizes and position.</p>
      `),
      card("Layout & position", `
        ${selectField("Card position", "position", "", positionOptions())}
        <div class="ap-grid-2">
          ${field("Card width (px)", "cardWidth", "", "number", "min=240 max=480")}
          ${field("Card height (px, 0 = auto)", "cardHeight", "", "number", "min=0 max=600")}
        </div>
        ${field("Border radius (px)", "borderRadius", "", "number", "min=0 max=40")}
      `),
      card("Styling", `
        <div class="ap-grid-2">
          ${field("Background color", "bgColor", "", "text", 'placeholder="#ffffff"', "Hex only. Blank = brand default.")}
          ${field("Text color", "textColor", "", "text", 'placeholder="#222222"', "Hex only. Blank = brand default.")}
        </div>
      `),
      card("Visibility", `
        ${toggleRow("Show on desktop", "showOnDesktop")}
        ${toggleRow("Show on mobile browsers", "showOnMobile")}
      `),
      card("Floating app icon", `
        ${toggleRow("Enable floating icon", "iconEnabled", "A round button that reopens the card after it is closed.")}
        ${selectField("Icon position", "iconPosition", "", positionOptions())}
        ${field("Icon size (px)", "iconSize", "", "number", "min=40 max=120")}
        ${toggleRow("Icon links straight to download", "iconDirectDownload", "When a valid URL is set, clicking the icon opens the download instead of the card.")}
      `),
      `<div class="ap-actionbar">
        <button class="a-btn primary" type="button" id="apSave">Save Changes</button>
        <button class="a-btn ghost" type="button" id="apPreview">Preview</button>
        <button class="a-btn ghost" type="button" id="apReset">Reset to Default</button>
      </div>`
    ].join("");
  }

  /* ---------------- read / write form ---------------- */

  function fillForm(data) {
    document.querySelectorAll("[data-ap]").forEach((el) => {
      const name = el.dataset.ap;
      if (!(name in data)) return;
      if (el.type === "checkbox") el.checked = !!data[name];
      else el.value = data[name] == null ? "" : data[name];
    });
    syncMasterPill();
  }

  function collect() {
    const out = { ...DEFAULTS };
    document.querySelectorAll("[data-ap]").forEach((el) => {
      const name = el.dataset.ap;
      if (el.type === "checkbox") out[name] = el.checked;
      else if (el.type === "number") out[name] = clampNum(name, el.value);
      else out[name] = (el.value || "").trim();
    });
    // Enum guards (match the server).
    if (POSITIONS.indexOf(out.position) === -1) out.position = "bottom-right";
    if (POSITIONS.indexOf(out.iconPosition) === -1) out.iconPosition = "bottom-right";
    out.bgColor = hexOrEmpty(out.bgColor);
    out.textColor = hexOrEmpty(out.textColor);
    return out;
  }

  function clampNum(name, raw) {
    const b = NUM_BOUNDS[name];
    let n = Number(raw);
    if (!isFinite(n)) n = DEFAULTS[name];
    n = Math.round(n);
    if (b) n = Math.max(b[0], Math.min(b[1], n));
    return n;
  }
  function hexOrEmpty(v) {
    v = (v || "").trim();
    return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : "";
  }
  function urlSafe(u) {
    u = (u || "").trim();
    if (!u) return "";
    return (u.charAt(0) === "/" || /^https?:\/\//i.test(u)) ? u : "";
  }

  /* ---------------- live preview ---------------- */

  function renderPreview() {
    const cfg = collect();
    const stage = document.getElementById("apStage");
    if (!stage) return;
    // Keep the stage chrome, drop any previously rendered card/icon.
    stage.querySelectorAll(".ap-pv-card, .ap-pv-fab").forEach((n) => n.remove());

    if (!cfg.enabled) {
      if (!stage.querySelector(".ap-pv-empty")) {
        const empty = document.createElement("div");
        empty.className = "ap-pv-empty";
        empty.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.5);font-size:13px;padding:0 20px;text-align:center;";
        empty.textContent = "App promotion is off — nothing shows on the storefront.";
        stage.appendChild(empty);
      }
      return;
    }
    const empty = stage.querySelector(".ap-pv-empty");
    if (empty) empty.remove();

    const iconUrl = urlSafe(cfg.icon);
    const iw = Math.max(20, Math.min(72, cfg.imageWidth));   // scaled for the small stage
    const ih = Math.max(20, Math.min(72, cfg.imageHeight));
    const media = iconUrl
      ? `<div class="ap-pv-media"><img src="${esc(iconUrl)}" alt="" style="width:${iw}px;height:${ih}px;" onerror="this.style.display='none'"></div>`
      : "";

    const dl = urlSafe(cfg.downloadUrl);
    const dlBtn = dl
      ? `<span class="ap-pv-btn primary">${esc(cfg.buttonText || "Download App")}</span>`
      : (cfg.comingSoonText
          ? `<span class="ap-pv-btn soon">${esc(cfg.comingSoonText)}</span>`
          : `<span class="ap-pv-btn primary" style="opacity:.5;">${esc(cfg.buttonText || "Download App")}</span>`);
    const secBtn = (cfg.secondaryEnabled && cfg.secondaryLabel)
      ? `<span class="ap-pv-btn ghost">${esc(cfg.secondaryLabel)}</span>` : "";

    const cardEl = document.createElement("div");
    cardEl.className = "ap-pv-card c-" + cfg.position;
    const cw = Math.max(170, Math.min(250, cfg.cardWidth));
    let style = `width:${cw}px;border-radius:${cfg.borderRadius}px;`;
    if (cfg.bgColor) style += `background:${cfg.bgColor};`;
    if (cfg.textColor) style += `color:${cfg.textColor};`;
    cardEl.setAttribute("style", style);
    cardEl.innerHTML =
      `<button class="ap-pv-close" type="button" tabindex="-1">×</button>` +
      `<div class="ap-pv-body">${media}<div>` +
        (cfg.title ? `<p class="ap-pv-title">${esc(cfg.title)}</p>` : "") +
        (cfg.description ? `<p class="ap-pv-desc">${esc(cfg.description)}</p>` : "") +
        `<div class="ap-pv-actions">${dlBtn}${secBtn}</div>` +
      `</div></div>`;
    stage.appendChild(cardEl);

    if (cfg.iconEnabled) {
      const fab = document.createElement("div");
      fab.className = "ap-pv-fab c-" + cfg.iconPosition;
      const size = Math.max(34, Math.min(56, cfg.iconSize));
      fab.style.width = fab.style.height = size + "px";
      fab.innerHTML = iconUrl ? `<img src="${esc(iconUrl)}" alt="" onerror="this.style.display='none'">` : "";
      stage.appendChild(fab);
    }
  }

  function syncMasterPill() {
    const on = document.getElementById("apEnabled").checked;
    const pill = document.getElementById("apMasterPill");
    pill.textContent = on ? "Enabled" : "Disabled";
    pill.className = "ap-pill " + (on ? "on" : "off");
  }

  /* ---------------- wiring ---------------- */

  function wire() {
    // Live preview + master pill on any change.
    document.querySelectorAll("[data-ap]").forEach((el) => {
      const ev = (el.tagName === "SELECT" || el.type === "checkbox") ? "change" : "input";
      el.addEventListener(ev, () => { syncMasterPill(); renderPreview(); });
    });

    document.getElementById("apUpload").addEventListener("click", pickAndUpload);
    document.getElementById("apUseDefault").addEventListener("click", () => setIcon(DEFAULTS.icon));
    document.getElementById("apClearIcon").addEventListener("click", () => setIcon(""));
    document.getElementById("apSave").addEventListener("click", save);
    document.getElementById("apPreview").addEventListener("click", () => {
      renderPreview();
      document.getElementById("apStage").scrollIntoView({ behavior: "smooth", block: "center" });
      AdminShell.toast("Preview updated");
    });
    document.getElementById("apReset").addEventListener("click", () => {
      fillForm(DEFAULTS);
      renderPreview();
      AdminShell.toast("Form reset to defaults — not saved yet");
    });
  }

  function setIcon(url) {
    const el = document.querySelector('[data-ap="icon"]');
    el.value = url;
    renderPreview();
  }

  function pickAndUpload() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 15 * 1024 * 1024) {
        AdminShell.toast("Image is larger than 15 MB — please compress it first.", "err");
        return;
      }
      const btn = document.getElementById("apUpload");
      btn.disabled = true;
      btn.textContent = "Uploading…";
      try {
        const fd = new FormData();
        fd.append("images", file);
        const res = await AdminShell.api("/admin/uploads/banners", { method: "POST", body: fd });
        const url = res.files && res.files[0] && res.files[0].url;
        if (!url) throw new Error("Upload returned no file URL.");
        setIcon(url);
        AdminShell.toast("Image uploaded");
      } catch (err) {
        AdminShell.toast(err.message || "Upload failed", "err");
      } finally {
        btn.disabled = false;
        btn.textContent = "Upload";
      }
    });
    input.click();
  }

  async function save() {
    const cfg = collect();
    // Friendly client-side guardrails (the server enforces these too).
    if (cfg.downloadUrl && !urlSafe(cfg.downloadUrl)) {
      AdminShell.toast("Download URL must start with http(s):// or /", "err");
      return;
    }
    if (cfg.secondaryEnabled && cfg.secondaryUrl && !urlSafe(cfg.secondaryUrl)) {
      AdminShell.toast("Secondary URL must start with http(s):// or /", "err");
      return;
    }
    const btn = document.getElementById("apSave");
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "Saving…";
    try {
      const res = await AdminShell.api("/admin/settings/appPromo", {
        method: "PUT",
        body: JSON.stringify({ key: "appPromo", category: "app", value: cfg })
      });
      // The server returns the sanitized value — adopt it so the form shows
      // exactly what was stored (clamped numbers, rejected URLs, etc.).
      if (res.setting && res.setting.value && typeof res.setting.value === "object") {
        state = { ...DEFAULTS, ...res.setting.value };
        fillForm(state);
        renderPreview();
      }
      AdminShell.toast("App settings saved — live on the storefront");
      try {
        if (typeof BroadcastChannel !== "undefined") new BroadcastChannel("mt-preview").postMessage({ type: "cms-updated" });
      } catch {}
    } catch (err) {
      AdminShell.toast(err.message || "Save failed", "err");
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  }
})();
