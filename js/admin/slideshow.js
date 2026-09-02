/* ===========================================================
   MUSCLE TONIK ADMIN — Banner builder

   Full CRUD over the Banner collection plus a live preview. Three layouts
   share one record type:

     slide   — artwork-only hero slide (the original behaviour)
     promo   — dark offer panel: copy + countdown + featured product
     festive — festival panel: copy + centre logo + two CTAs

   Every string, image, colour, CTA destination and timer is stored on the
   banner, so the storefront changes without a deploy. CTA destinations are
   resolved server-side against the real catalogue — see apps/cms/actions.py.
   =========================================================== */
(async () => {
  "use strict";

  const content = document.getElementById("aContent");
  content.innerHTML = `
    <h1 class="a-page-title">Banners</h1>
    <p class="a-page-sub">Hero slides and the composed promo / festive panels. Only live banners appear on the site.</p>
    <div class="a-card" style="margin-bottom:18px;">
      <div class="a-card-head"><h3>Playback</h3></div>
      <div class="a-card-body" id="bnPlayback"></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center;">
      <select class="a-input" id="bnNewLayout" style="max-width:190px;">
        <option value="slide">Hero slide (artwork)</option>
        <option value="promo">Promo panel (+ timer)</option>
        <option value="festive">Festive panel</option>
      </select>
      <button class="a-btn primary" type="button" id="bnAdd">Add banner</button>
      <button class="a-btn" type="button" id="bnSaveOrder">Save order</button>
      <span id="bnCount" style="font-size:12.5px;color:var(--a-muted);"></span>
    </div>
    <div id="bnList"></div>`;

  const me = await AdminShell.init({ active: "slideshow", title: "Banners", sub: "Growth", requires: "settings" });
  if (!me) return;

  const esc = AdminShell.esc;
  let banners = [];
  let options = { categories: [], brands: [], collections: [], pages: [], actionTypes: [] };
  let openId = null;                 // only one builder expanded at a time
  let loading = true;
  let playback = { intervalSeconds: 6.5, autoplay: true, pauseOnHover: true };

  /* ================= playback timing ================= */

  async function loadPlayback() {
    try {
      const res = await AdminShell.api("/admin/settings/slideshow");
      const v = (res && res.setting && res.setting.value) || {};
      const secs = Number(v.intervalSeconds);
      playback = {
        intervalSeconds: isFinite(secs) && secs >= 2 && secs <= 60 ? secs : 6.5,
        autoplay: v.autoplay !== false,
        pauseOnHover: v.pauseOnHover !== false
      };
    } catch { /* never saved — defaults stand */ }
    renderPlayback();
  }

  async function savePlayback() {
    const box = document.getElementById("bnPlayback");
    const secs = Number(box.querySelector("#bnInterval").value);
    if (!isFinite(secs) || secs < 2 || secs > 60) {
      AdminShell.toast("Slide duration must be between 2 and 60 seconds.", "err");
      return;
    }
    const value = {
      intervalSeconds: secs,
      autoplay: box.querySelector("#bnAutoplay").checked,
      pauseOnHover: box.querySelector("#bnPauseHover").checked
    };
    try {
      await AdminShell.api("/admin/settings/slideshow", {
        method: "PUT", body: JSON.stringify({ key: "slideshow", category: "store", value })
      });
      playback = value;
      AdminShell.toast(`Slides now change every ${secs}s`);
      renderPlayback();
    } catch (err) { AdminShell.toast(err.message, "err"); }
  }

  function renderPlayback() {
    const box = document.getElementById("bnPlayback");
    if (!box) return;
    box.innerHTML = `
      <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
        <div class="a-field" style="flex:0 0 200px;margin:0;">
          <label for="bnInterval">Seconds per slide</label>
          <input class="a-input" id="bnInterval" type="number" min="2" max="60" step="0.5" value="${esc(playback.intervalSeconds)}">
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;">
          <input type="checkbox" id="bnAutoplay"${playback.autoplay ? " checked" : ""}> Play automatically
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;">
          <input type="checkbox" id="bnPauseHover"${playback.pauseOnHover ? " checked" : ""}> Pause on hover
        </label>
        <button class="a-btn primary" type="button" id="bnPlaybackSave">Save timing</button>
      </div>
      <p style="margin-top:10px;font-size:12.5px;color:var(--a-muted);">
        Applies to the hero slideshow. 2–60 seconds; 5–8 suits most stores.
      </p>`;
    document.getElementById("bnPlaybackSave").addEventListener("click", savePlayback);
  }

  /* ================= data ================= */

  async function load() {
    loading = true; render();
    try {
      const [list, opts] = await Promise.all([
        AdminShell.api("/admin/banners"),
        AdminShell.api("/admin/banners/options")
      ]);
      banners = list.banners || [];
      options = opts || options;
    } catch (err) {
      banners = null;
      AdminShell.toast(err.message, "err");
    }
    loading = false; render();
  }

  async function createBanner() {
    const layout = document.getElementById("bnNewLayout").value;
    const seed = { slide: { image: "/uploads/banners/ad.jpeg", title: "New slide" },
                   promo: { heading: "New offer", subheading: "Deal of the day" },
                   festive: { heading: "New festive banner", offerText: "Special" } }[layout] || {};
    try {
      const res = await AdminShell.api("/admin/banners", {
        method: "POST",
        body: JSON.stringify(Object.assign({ layout, name: "New banner", isActive: false }, seed))
      });
      banners.push(res.banner);
      openId = res.banner.id;                 // open the builder straight away
      AdminShell.toast("Banner created — fill it in, then enable it");
      render();
    } catch (err) { AdminShell.toast(err.message, "err"); }
  }

  // Read every field in one card into a payload.
  function collect(id) {
    const card = document.querySelector(`[data-bn-card="${id}"]`);
    const out = {};
    if (!card) return out;
    card.querySelectorAll("[data-bn-field]").forEach(el => {
      const key = el.getAttribute("data-bn-field");
      out[key] = el.type === "checkbox" ? el.checked : el.value;
    });
    return out;
  }

  async function saveBanner(id) {
    try {
      const res = await AdminShell.api(`/admin/banners/${id}`, {
        method: "PUT", body: JSON.stringify(collect(id))
      });
      const row = banners.find(b => b.id === id);
      if (row) Object.assign(row, res.banner);
      AdminShell.toast("Banner saved");
      render();
    } catch (err) { AdminShell.toast(err.message, "err"); }
  }

  async function toggleBanner(id) {
    try {
      const res = await AdminShell.api(`/admin/banners/${id}/toggle`, { method: "PATCH" });
      const row = banners.find(b => b.id === id);
      if (row) Object.assign(row, res.banner);
      AdminShell.toast(res.message);
      render();
    } catch (err) { AdminShell.toast(err.message, "err"); }
  }

  async function deleteBanner(id) {
    const row = banners.find(b => b.id === id);
    if (!window.confirm(`Delete "${(row && (row.name || row.heading || row.title)) || "this banner"}"? This cannot be undone.`)) return;
    try {
      await AdminShell.api(`/admin/banners/${id}`, { method: "DELETE" });
      banners = banners.filter(b => b.id !== id);
      AdminShell.toast("Banner deleted");
      render();
    } catch (err) { AdminShell.toast(err.message, "err"); }
  }

  async function saveOrder() {
    try {
      const res = await AdminShell.api("/admin/banners/reorder", {
        method: "PATCH", body: JSON.stringify({ order: banners.map(b => b.id) })
      });
      banners = res.banners || banners;
      AdminShell.toast("Order saved");
      render();
    } catch (err) { AdminShell.toast(err.message, "err"); }
  }

  function move(id, delta) {
    const i = banners.findIndex(b => b.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= banners.length) return;
    [banners[i], banners[j]] = [banners[j], banners[i]];
    render();
    AdminShell.toast('Order changed — press "Save order" to keep it');
  }

  async function uploadInto(id, field, file) {
    if (file.size > 5 * 1024 * 1024) {
      AdminShell.toast("Image is larger than 5 MB — please compress it first.", "err");
      return;
    }
    const fd = new FormData();
    fd.append("images", file);
    try {
      const res = await AdminShell.api("/admin/uploads/banners", { method: "POST", body: fd });
      const url = res.files && res.files[0] && res.files[0].url;
      if (!url) throw new Error("Upload returned no file URL.");
      const card = document.querySelector(`[data-bn-card="${id}"]`);
      const input = card.querySelector(`[data-bn-field="${field}"]`);
      if (input) { input.value = url; input.dispatchEvent(new Event("input", { bubbles: true })); }
      AdminShell.toast("Uploaded — press Save to keep it");
    } catch (err) { AdminShell.toast(err.message, "err"); }
  }

  /* ================= form helpers ================= */

  const dateVal = iso => (iso ? String(iso).slice(0, 10) : "");
  const dtVal = iso => (iso ? String(iso).slice(0, 16) : "");   // for datetime-local

  function text(label, name, value, placeholder) {
    return `<div class="a-field"><label>${label}</label>
      <input class="a-input" data-bn-field="${name}" value="${esc(value || "")}" placeholder="${esc(placeholder || "")}"></div>`;
  }
  function area(label, name, value) {
    return `<div class="a-field"><label>${label}</label>
      <textarea class="a-input" rows="3" data-bn-field="${name}">${esc(value || "")}</textarea></div>`;
  }
  function num(label, name, value, min, max, step) {
    return `<div class="a-field"><label>${label}</label>
      <input class="a-input" type="number" data-bn-field="${name}" value="${esc(value)}"
             min="${min}" max="${max}" step="${step || 1}"></div>`;
  }
  function date(label, name, value, withTime) {
    return `<div class="a-field"><label>${label}</label>
      <input class="a-input" type="${withTime ? "datetime-local" : "date"}" data-bn-field="${name}"
             value="${esc(withTime ? dtVal(value) : dateVal(value))}"></div>`;
  }
  function check(label, name, checked) {
    return `<label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;margin:8px 0;">
      <input type="checkbox" data-bn-field="${name}"${checked ? " checked" : ""}> ${label}</label>`;
  }
  function select(label, name, value, list) {
    return `<div class="a-field"><label>${label}</label>
      <select class="a-input" data-bn-field="${name}">
        ${list.map(o => `<option value="${esc(o.id)}"${String(o.id) === String(value) ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
      </select></div>`;
  }
  function imageRow(label, name, value, hint) {
    return `<div class="a-field"><label>${label}${hint ? ` <span style="color:var(--a-text-soft);font-weight:400;">${hint}</span>` : ""}</label>
      <div style="display:flex;gap:8px;">
        <input class="a-input" data-bn-field="${name}" value="${esc(value || "")}" placeholder="https://… or /uploads/banners/…">
        <button class="a-btn" type="button" data-bn-upload="${name}">Upload</button>
        <button class="a-btn" type="button" data-bn-clear="${name}">Clear</button>
      </div></div>`;
  }

  // The CTA target input depends on the action type — that is the whole point
  // of the picker, so it is re-rendered whenever the type changes.
  function targetField(prefix, actionType, targetValue) {
    const name = prefix + "Target";
    switch (actionType) {
      case "product":
        return `<div class="a-field"><label>Product (catalog id)</label>
          <input class="a-input" type="number" data-bn-field="${name}" value="${esc(targetValue || "")}" placeholder="e.g. 14"></div>`;
      case "category": return select("Category", name, targetValue, options.categories);
      case "brand": return select("Brand", name, targetValue, options.brands);
      case "collection": return select("Collection", name, targetValue, options.collections);
      case "page": return select("Page", name, targetValue, options.pages);
      case "url":
        return `<div class="a-field"><label>Custom URL</label>
          <input class="a-input" data-bn-field="${name}" value="${esc(targetValue || "")}" placeholder="https://…"></div>`;
      default:
        return `<input type="hidden" data-bn-field="${name}" value="${esc(targetValue || "")}">`;
    }
  }

  function ctaBlock(b, prefix, label) {
    const textKey = prefix === "button" ? "ctaText" : "button2Text";
    const typeKey = prefix + "ActionType";
    const type = b[typeKey] || "none";
    const href = prefix === "button" ? b.buttonHref : b.button2Href;
    return `<div style="border:1px solid var(--a-border);border-radius:10px;padding:12px;margin-bottom:10px;">
      <b style="font-size:12.5px;">${label}</b>
      <div class="grid-2" style="margin-top:8px;">
        ${text("Button text", textKey, b[textKey], "Shop Now")}
        ${select("Action", typeKey, type, options.actionTypes)}
      </div>
      <div data-bn-target="${prefix}">${targetField(prefix, type, b[prefix + "Target"])}</div>
      <p style="font-size:12px;color:var(--a-muted);margin-top:4px;">
        Resolves to: <code>${esc(href || "— nothing (button hidden)")}</code>
      </p>
    </div>`;
  }

  /* ================= live preview ================= */
  // Self-contained inline styles: admin.css has none of the storefront
  // classes, so the preview paints itself rather than depending on them.

  function previewMarkup(v) {
    const bg = v.image
      ? `background-image:url('${encodeURI(v.image)}');background-size:cover;background-position:center;`
      : (v.backgroundColor ? `background:${v.backgroundColor};` : "background:#222;");
    const scrim = Number(v.overlay) > 0
      ? `<span style="position:absolute;inset:0;background:#000;opacity:${Number(v.overlay) / 100};border-radius:12px;"></span>` : "";
    const btn = (t, colour) => (t
      ? `<span style="display:inline-block;padding:8px 16px;border-radius:999px;background:${colour};color:#fff;font-weight:700;font-size:12px;margin-right:8px;">${esc(t)}</span>` : "");

    if (v.layout === "slide") {
      return `<div style="position:relative;border-radius:12px;overflow:hidden;${bg}min-height:150px;">${scrim}
        <div style="position:relative;padding:20px;color:#fff;">
          <div style="font-size:19px;font-weight:800;">${esc(v.title || "")}</div>
          <div style="font-size:13px;opacity:.9;">${esc(v.subtitle || "")}</div>
          ${btn(v.ctaText, "#ff7a00")}
        </div></div>`;
    }

    if (v.layout === "promo") {
      const timer = v.timerEnabled
        ? `<div style="display:flex;gap:8px;margin:12px 0;">${["HRS", "MIN", "SEC"].map(u =>
            `<span style="background:rgba(255,255,255,.12);border-radius:8px;padding:6px 10px;text-align:center;">
              <b style="display:block;font-size:15px;">00</b><span style="font-size:9px;opacity:.7;">${u}</span></span>`).join("")}</div>` : "";
      const prod = v.productImage
        ? `<div style="width:110px;background:#fff;border-radius:10px;padding:8px;flex:0 0 auto;">
             <img src="${esc(v.productImage)}" style="width:100%;height:90px;object-fit:contain;display:block;" onerror="this.style.display='none'"></div>` : "";
      return `<div style="position:relative;border-radius:12px;overflow:hidden;${bg}padding:20px;display:flex;gap:16px;align-items:center;color:#fff;">
        ${scrim}
        <div style="position:relative;flex:1;min-width:0;">
          <div style="color:#ff7a00;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">${esc(v.subheading || "")}</div>
          <div style="font-size:20px;font-weight:800;margin:4px 0;">${esc(v.heading || "")}</div>
          <div style="font-size:12.5px;opacity:.85;">${esc(v.paragraph || "")}</div>
          ${timer}${btn(v.ctaText, "#ff7a00")}${btn(v.button2Text, "rgba(255,255,255,.18)")}
        </div>
        <div style="position:relative;">${prod}</div></div>`;
    }

    const logoPos = ["left", "center", "right", "hidden"].includes(v.logoPosition) ? v.logoPosition : "right";
    const logo = v.logo && logoPos !== "hidden"
      ? `<img src="${esc(v.logo)}" style="width:${Number(v.logoSize) || 120}px;max-width:40%;height:auto;" onerror="this.style.display='none'">`
      : "";
    // Mirrors .promo-logo-* in style.css so the preview matches the site.
    const flow = logoPos === "center" ? "column-reverse" : logoPos === "left" ? "row-reverse" : "row";
    return `<div style="position:relative;border-radius:12px;overflow:hidden;${bg}padding:20px;display:flex;flex-direction:${flow};gap:16px;align-items:center;${logoPos === "center" ? "text-align:center;" : ""}color:#fff;">
      ${scrim}
      <div style="position:relative;flex:1;min-width:0;">
        ${v.offerText ? `<span style="display:inline-block;background:rgba(255,255,255,.18);border-radius:999px;padding:4px 10px;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">${esc(v.offerText)}</span>` : ""}
        <div style="font-size:20px;font-weight:800;margin:6px 0;">${esc(v.heading || "")}</div>
        ${v.subheading ? `<div style="font-size:13px;font-weight:600;">${esc(v.subheading)}</div>` : ""}
        <div style="font-size:12.5px;opacity:.85;">${esc(v.paragraph || "")}</div>
        <div style="margin-top:10px;">${btn(v.ctaText, "#e0972c")}${btn(v.button2Text, "rgba(255,255,255,.18)")}</div>
        ${v.note ? `<div style="font-size:11px;opacity:.8;margin-top:8px;">${esc(v.note)}</div>` : ""}
      </div>
      <div style="position:relative;">${logo}</div></div>`;
  }

  function refreshPreview(id) {
    const card = document.querySelector(`[data-bn-card="${id}"]`);
    if (!card) return;
    const host = card.querySelector("[data-bn-previewbox]");
    if (!host) return;
    const v = collect(id);
    v.layout = v.layout || (banners.find(b => b.id === id) || {}).layout;
    host.innerHTML = previewMarkup(v);
  }

  /* ================= render ================= */

  function statusBadge(b) {
    if (!b.isActive) return '<span class="badge gray">Disabled</span>';
    if (!b.isLive) return '<span class="badge amber">Scheduled / expired</span>';
    return '<span class="badge green">Live</span>';
  }

  function builderMarkup(b) {
    const L = b.layout || "slide";
    const isSlide = L === "slide";
    return `
      <div class="grid-2">
        ${text("Banner name (admin only)", "name", b.name, "Diwali sale")}
        ${select("Layout", "layout", L, [
          { id: "slide", label: "Hero slide (artwork)" },
          { id: "promo", label: "Promo panel (+ timer)" },
          { id: "festive", label: "Festive panel" }
        ])}
      </div>
      <div class="grid-2">
        ${select("Shows on", "placement", b.placement || "home", [
          { id: "home", label: "Home page" },
          { id: "crazy-deals", label: "Crazy Deals page" }
        ])}
      </div>
      <p style="font-size:12px;color:var(--a-muted);margin:-4px 0 10px;">
        Banners on the same page rotate in one slider, in display order.
      </p>

      <b style="font-size:12.5px;">Background</b>
      ${imageRow("Desktop image", "image", b.image, isSlide ? "(required for hero slides)" : "(optional)")}
      ${imageRow("Mobile image", "imageMobile", b.imageMobile, "(optional, below 640px)")}
      <div class="grid-2">
        ${text("Background colour / gradient", "backgroundColor", b.backgroundColor, "#a51f3f or linear-gradient(...)")}
        ${num("Overlay darkness %", "overlay", b.overlay || 0, 0, 100, 5)}
      </div>

      <b style="font-size:12.5px;">Content</b>
      ${isSlide ? `<div class="grid-2">${text("Title", "title", b.title)}${text("Subtitle", "subtitle", b.subtitle)}</div>`
                : `<div class="grid-2">${text("Heading", "heading", b.heading)}${text("Subheading", "subheading", b.subheading)}</div>
                   ${area("Paragraph", "paragraph", b.paragraph)}
                   <div class="grid-2">${text("Offer text", "offerText", b.offerText, "UP TO 40% OFF")}${text("Small note", "note", b.note)}</div>`}
      ${text("Alt text (accessibility)", "alt", b.alt, "Describes the artwork")}

      ${isSlide ? "" : `
        <b style="font-size:12.5px;">Images</b>
        ${imageRow("Centre logo", "logo", b.logo)}
        ${imageRow("Product / frame image", "productImage", b.productImage)}
        ${imageRow("Secondary image", "mainImage", b.mainImage)}
        <div class="grid-2">
          ${num("Logo width (px)", "logoSize", b.logoSize || 120, 24, 480, 4)}
          ${select("Logo position", "logoPosition", b.logoPosition || "right", [
            { id: "right", label: "Right of the text" },
            { id: "left", label: "Left of the text" },
            { id: "center", label: "Centred above the text" },
            { id: "hidden", label: "Hidden (no logo)" }
          ])}
        </div>
        <p style="font-size:12px;color:var(--a-muted);margin:-4px 0 10px;">
          "Hidden" keeps the artwork on the banner but leaves it off the site.
        </p>
        <div class="grid-2">
          ${num("Feature product (catalog id)", "productId", b.productId == null ? "" : b.productId, 0, 999999, 1)}
        </div>
        <p style="font-size:12px;color:var(--a-muted);margin:-4px 0 10px;">
          A product id pulls that product's live name, price and photo into the banner.
        </p>`}

      <b style="font-size:12.5px;">Call to action</b>
      ${ctaBlock(b, "button", "Primary button")}
      ${isSlide ? "" : ctaBlock(b, "button2", "Secondary button")}

      ${isSlide ? "" : `
        <b style="font-size:12.5px;">Countdown</b>
        ${check("Show a countdown timer", "timerEnabled", b.timerEnabled)}
        <div class="grid-2">
          ${date("Timer starts", "timerStart", b.timerStart, true)}
          ${date("Timer ends", "timerEnd", b.timerEnd, true)}
        </div>
        <div class="grid-2">
          ${text("Timer label", "timerLabel", b.timerLabel, "Offer ends in")}
          ${select("When it expires", "expiredBehavior", b.expiredBehavior || "keep", [
            { id: "keep", label: "Keep showing the banner" },
            { id: "expired", label: 'Show "offer has ended"' },
            { id: "hide", label: "Hide the banner" }
          ])}
        </div>`}

      <b style="font-size:12.5px;">Scheduling</b>
      <div class="grid-2">
        ${date("Start showing", "startDate", b.startDate)}
        ${date("Stop showing", "endDate", b.endDate)}
      </div>

      <button class="a-btn primary" type="button" data-bn-save="${esc(b.id)}">Save banner</button>`;
  }

  function render() {
    const list = document.getElementById("bnList");
    const count = document.getElementById("bnCount");

    if (loading) {
      list.innerHTML = `<div class="a-card"><div class="a-card-body"><div class="skel" style="height:90px;"></div></div></div>`;
      count.textContent = ""; return;
    }
    if (banners === null) {
      list.innerHTML = `<div class="a-card"><div class="a-card-body">
        <p style="font-size:13.5px;">Could not load banners.</p>
        <button class="a-btn" type="button" id="bnRetry">Retry</button></div></div>`;
      document.getElementById("bnRetry").addEventListener("click", load);
      return;
    }
    if (!banners.length) {
      list.innerHTML = `<div class="a-card"><div class="a-card-body">
        <p style="font-size:13.5px;margin-bottom:6px;">No banners yet. The homepage is using its original hero slides.</p>
        <p style="font-size:12.5px;color:var(--a-muted);">Pick a layout above and press "Add banner".</p>
      </div></div>`;
      count.textContent = "0 banners"; return;
    }

    const live = banners.filter(b => b.isLive).length;
    count.textContent = `${banners.length} banner${banners.length === 1 ? "" : "s"} · ${live} live`;

    list.innerHTML = banners.map((b, i) => {
      const open = b.id === openId;
      return `
      <div class="a-card" style="margin-bottom:14px;" data-bn-card="${esc(b.id)}">
        <div class="a-card-head" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <b style="font-size:14px;">${esc(b.name || b.heading || b.title || "Untitled banner")}</b>
          <span class="badge blue">${esc(b.layout || "slide")}</span>
          ${statusBadge(b)}
          <span style="font-size:12px;color:var(--a-muted);">#${i + 1}</span>
          <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;">
            <button class="a-btn" type="button" data-bn-up="${esc(b.id)}"${i === 0 ? " disabled" : ""}>↑</button>
            <button class="a-btn" type="button" data-bn-down="${esc(b.id)}"${i === banners.length - 1 ? " disabled" : ""}>↓</button>
            <button class="a-btn" type="button" data-bn-edit="${esc(b.id)}">${open ? "Close" : "Edit"}</button>
            <button class="a-btn" type="button" data-bn-toggle="${esc(b.id)}">${b.isActive ? "Disable" : "Enable"}</button>
            <button class="a-btn" type="button" data-bn-delete="${esc(b.id)}">Delete</button>
          </span>
        </div>
        ${open ? `<div class="a-card-body">
          <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,420px);gap:20px;align-items:start;">
            <div>${builderMarkup(b)}</div>
            <div style="position:sticky;top:80px;">
              <b style="font-size:12.5px;">Live preview</b>
              <div data-bn-previewbox style="margin-top:8px;"></div>
              <p style="font-size:11.5px;color:var(--a-muted);margin-top:8px;">
                Updates as you type. The real banner uses the storefront's fonts and spacing.
              </p>
            </div>
          </div>
        </div>` : ""}
      </div>`;
    }).join("");

    wire();
    if (openId) refreshPreview(openId);
  }

  function wire() {
    const list = document.getElementById("bnList");
    const on = (sel, fn) => list.querySelectorAll(sel).forEach(el =>
      el.addEventListener("click", () => fn(el.getAttribute(sel.slice(1, -1)))));

    on("[data-bn-save]", saveBanner);
    on("[data-bn-toggle]", toggleBanner);
    on("[data-bn-delete]", deleteBanner);
    list.querySelectorAll("[data-bn-up]").forEach(el =>
      el.addEventListener("click", () => move(el.getAttribute("data-bn-up"), -1)));
    list.querySelectorAll("[data-bn-down]").forEach(el =>
      el.addEventListener("click", () => move(el.getAttribute("data-bn-down"), 1)));
    list.querySelectorAll("[data-bn-edit]").forEach(el =>
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-bn-edit");
        openId = openId === id ? null : id;
        render();
      }));

    // Live preview + dependent CTA target field
    list.querySelectorAll("[data-bn-card]").forEach(card => {
      const id = card.getAttribute("data-bn-card");
      card.querySelectorAll("[data-bn-field]").forEach(el => {
        el.addEventListener("input", () => refreshPreview(id));
        el.addEventListener("change", () => {
          const key = el.getAttribute("data-bn-field");
          if (key === "buttonActionType" || key === "button2ActionType") {
            const prefix = key === "buttonActionType" ? "button" : "button2";
            const holder = card.querySelector(`[data-bn-target="${prefix}"]`);
            if (holder) {
              holder.innerHTML = targetField(prefix, el.value, "");
              holder.querySelectorAll("[data-bn-field]").forEach(x => {
                x.addEventListener("input", () => refreshPreview(id));
              });
            }
          }
          if (key === "layout") {                 // different layout, different form
            const row = banners.find(b => b.id === id);
            if (row) { row.layout = el.value; render(); return; }
          }
          refreshPreview(id);
        });
      });

      card.querySelectorAll("[data-bn-upload]").forEach(btn => {
        btn.addEventListener("click", () => {
          const input = document.createElement("input");
          input.type = "file"; input.accept = "image/*";
          input.addEventListener("change", () => {
            if (input.files && input.files[0]) uploadInto(id, btn.getAttribute("data-bn-upload"), input.files[0]);
          });
          input.click();
        });
      });
      card.querySelectorAll("[data-bn-clear]").forEach(btn => {
        btn.addEventListener("click", () => {
          const name = btn.getAttribute("data-bn-clear");
          const field = card.querySelector(`[data-bn-field="${name}"]`);
          if (field) { field.value = ""; refreshPreview(id); }
        });
      });
    });
  }

  document.getElementById("bnAdd").addEventListener("click", createBanner);
  document.getElementById("bnSaveOrder").addEventListener("click", saveOrder);

  await Promise.all([loadPlayback(), load()]);
})();
