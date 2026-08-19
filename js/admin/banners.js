/* ===========================================================
   MUSCLE TONIK ADMIN - Banners
   Edits the two storefront banner surfaces that live on the homepage CMS
   document: the top announcement bar and the hero banner. Both are stored
   under /api/admin/content/homepage alongside the section builder, so this
   page reads that document, patches only `announcement` / `hero`, and writes
   it back — leaving the section list untouched.
   =========================================================== */
(async () => {
  const content = document.getElementById("aContent");
  content.innerHTML = `
    <div class="a-hero">
      <div class="a-hero-card">
        <span class="eyebrow">Storefront</span>
        <h2>Control the announcement bar and hero banner.</h2>
        <p>Changes here publish to the live homepage. Use Preview Website in the topbar to check them before sharing.</p>
        <div class="a-hero-actions">
          <button class="a-btn primary" id="bannerSave">Save banners</button>
          <button class="a-btn" id="bannerReload">Discard changes</button>
        </div>
      </div>
      <div class="a-hero-aside">
        <div class="a-stat-card"><span>Version</span><strong id="bannerVersion">—</strong><p>Homepage document revision.</p></div>
        <div class="a-stat-card"><span>Last updated</span><strong id="bannerUpdated" style="font-size:15px;">—</strong><p>Most recent save.</p></div>
      </div>
    </div>

    <div class="a-card">
      <div class="a-card-head"><h3>Announcement bar</h3></div>
      <div class="a-card-body" id="announcementForm"><p style="color:var(--a-text-soft);">Loading…</p></div>
    </div>

    <div class="a-card">
      <div class="a-card-head">
        <h3>Hero banner slides</h3>
        <button class="a-btn" id="slideAdd" type="button">Add slide</button>
      </div>
      <div class="a-card-body">
        <p style="color:var(--a-text-soft);margin-bottom:14px;">
          Wide artwork that scrolls horizontally on the homepage. Recommended size
          <strong>2160 × 530</strong>. Leave this list empty to show the designed hero below instead.
        </p>
        <div id="slideList"></div>
      </div>
    </div>

    <div class="a-card">
      <div class="a-card-head">
        <h3>Brand strip images</h3>
        <button class="a-btn" id="brandStripAdd" type="button">Add image</button>
      </div>
      <div class="a-card-body">
        <p style="color:var(--a-text-soft);margin-bottom:14px;">
          A short, auto-scrolling image strip on the homepage (replaces the old brand
          text row). Add <strong>at least 5</strong> wide banners — recommended size
          <strong>1200 × 300</strong>. Leave this empty to show the brand cards instead.
        </p>
        <div id="brandStripList"></div>
      </div>
    </div>

    <div class="a-card">
      <div class="a-card-head"><h3>Designed hero (fallback)</h3></div>
      <div class="a-card-body">
        <p style="color:var(--a-text-soft);margin-bottom:14px;" id="heroFallbackNote"></p>
        <div id="heroForm"></div>
      </div>
    </div>`;

  const me = await AdminShell.init({
    active: "banners",
    title: "Banners",
    sub: "Announcement bar and homepage hero",
    requires: "settings"
  });
  if (!me) return;

  const esc = AdminShell.esc;
  let homepage = null;
  // Working copy of hero.slides. Only written back to the server on Save.
  let slides = [];
  // Working copy of the homepage brand-strip images. Same lifecycle as `slides`.
  let brandStrip = [];

  function field(label, name, value = "", type = "text", hint = "") {
    return `
      <div class="a-field">
        <label>${label}</label>
        <input class="a-input" name="${name}" type="${type}" value="${esc(value ?? "")}">
        ${hint ? `<small style="color:var(--a-text-soft);">${esc(hint)}</small>` : ""}
      </div>`;
  }

  function textarea(label, name, value = "") {
    return `<div class="a-field"><label>${label}</label><textarea class="a-input" name="${name}" rows="2">${esc(value ?? "")}</textarea></div>`;
  }

  function checkbox(label, name, checked) {
    return `
      <div class="a-field">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" name="${name}" ${checked ? "checked" : ""}>
          <span>${label}</span>
        </label>
      </div>`;
  }

  function slideRow(slide, i, total) {
    const preview = slide.image || slide.imageMobile;
    return `
      <div class="a-slide-row" data-index="${i}">
        <div class="a-slide-preview">
          ${preview
            ? `<img src="${esc(preview)}" alt="">`
            : `<span>No image</span>`}
        </div>
        <div class="a-slide-fields">
          <div class="a-field">
            <label>Desktop image</label>
            <div style="display:flex;gap:8px;">
              <input class="a-input" data-slide-field="image" value="${esc(slide.image || "")}" placeholder="https://… or /uploads/banners/…">
              <button class="a-btn" type="button" data-slide-upload="image">Upload</button>
            </div>
          </div>
          <div class="a-field">
            <label>Mobile image <span style="color:var(--a-text-soft);font-weight:400;">(optional)</span></label>
            <div style="display:flex;gap:8px;">
              <input class="a-input" data-slide-field="imageMobile" value="${esc(slide.imageMobile || "")}" placeholder="Shown below 640px">
              <button class="a-btn" type="button" data-slide-upload="imageMobile">Upload</button>
            </div>
          </div>
          <div class="a-field">
            <label>Alt text</label>
            <input class="a-input" data-slide-field="alt" value="${esc(slide.alt || "")}" placeholder="Describe the banner for screen readers">
          </div>
          <div class="a-field">
            <label>Links to</label>
            <input class="a-input" data-slide-field="href" value="${esc(slide.href || "")}" placeholder="marketplace.html">
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="a-btn" type="button" data-slide-move="-1" ${i === 0 ? "disabled" : ""}>Move up</button>
            <button class="a-btn" type="button" data-slide-move="1" ${i === total - 1 ? "disabled" : ""}>Move down</button>
            <button class="a-btn danger" type="button" data-slide-remove>Remove</button>
          </div>
        </div>
      </div>`;
  }

  function brandStripRow(slide, i, total) {
    return `
      <div class="a-slide-row" data-bs-index="${i}">
        <div class="a-slide-preview">
          ${slide.image ? `<img src="${esc(slide.image)}" alt="">` : `<span>No image</span>`}
        </div>
        <div class="a-slide-fields">
          <div class="a-field">
            <label>Image</label>
            <div style="display:flex;gap:8px;">
              <input class="a-input" data-bs-field="image" value="${esc(slide.image || "")}" placeholder="https://… or /uploads/banners/…">
              <button class="a-btn" type="button" data-bs-upload>Upload</button>
            </div>
          </div>
          <div class="a-field">
            <label>Alt text</label>
            <input class="a-input" data-bs-field="alt" value="${esc(slide.alt || "")}" placeholder="Describe the banner for screen readers">
          </div>
          <div class="a-field">
            <label>Links to <span style="color:var(--a-text-soft);font-weight:400;">(optional)</span></label>
            <input class="a-input" data-bs-field="href" value="${esc(slide.href || "")}" placeholder="marketplace.html?brand=…">
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="a-btn" type="button" data-bs-move="-1" ${i === 0 ? "disabled" : ""}>Move up</button>
            <button class="a-btn" type="button" data-bs-move="1" ${i === total - 1 ? "disabled" : ""}>Move down</button>
            <button class="a-btn danger" type="button" data-bs-remove>Remove</button>
          </div>
        </div>
      </div>`;
  }

  function renderBrandStrip() {
    const list = document.getElementById("brandStripList");
    if (!list) return;
    list.innerHTML = brandStrip.length
      ? brandStrip.map((s, i) => brandStripRow(s, i, brandStrip.length)).join("")
      : `<p style="color:var(--a-text-soft);">No brand-strip images yet. The brand cards are being shown on the homepage.</p>`;
  }

  function renderSlides() {
    const list = document.getElementById("slideList");
    list.innerHTML = slides.length
      ? slides.map((s, i) => slideRow(s, i, slides.length)).join("")
      : `<p style="color:var(--a-text-soft);">No banner slides yet. The designed hero below is being shown on the homepage.</p>`;

    const note = document.getElementById("heroFallbackNote");
    note.textContent = slides.length
      ? "Not currently visible — banner slides above take over the homepage hero. These values are used if you remove every slide."
      : "Currently live on the homepage, because there are no banner slides.";
  }

  function render() {
    const a = homepage.announcement || {};
    const h = homepage.hero || {};

    document.getElementById("announcementForm").innerHTML = `
      <div class="grid-2" style="grid-template-columns:1fr 1fr;">
        ${field("Message", "text", a.text, "text", "Shown in the rotating strip above the header.")}
        ${checkbox("Visible on the storefront", "visible", a.visible !== false)}
        ${field("Background colour", "background", a.background || "#111111", "color")}
        ${field("Text colour", "color", a.color || "#ffffff", "color")}
      </div>`;

    document.getElementById("heroForm").innerHTML = `
      <div class="grid-2" style="grid-template-columns:1fr 1fr;">
        ${field("Headline", "headline", h.headline)}
        ${textarea("Subheadline", "subheadline", h.subheadline)}
        ${field("Button text", "buttonText", h.buttonText)}
        ${field("Button link", "buttonLink", h.buttonLink, "text", "Relative path, e.g. /marketplace.html")}
        ${field("Background image URL", "backgroundImage", h.backgroundImage, "text", "Leave blank to use the gradient below.")}
        ${field("Gradient", "gradient", h.gradient, "text", "Any valid CSS background value.")}
        ${field("Overlay opacity", "overlay", h.overlay ?? 55, "number", "0–100. Darkens the image for text contrast.")}
      </div>
      <div class="a-field" style="margin-top:14px;">
        <label>Offer card image <span style="color:var(--a-text-soft);font-weight:400;">(the square box beside the hero text)</span></label>
        <div style="display:flex;gap:8px;">
          <input class="a-input" name="cardImage" value="${esc(h.cardImage || "")}" placeholder="https://… or /uploads/banners/…">
          <button class="a-btn" type="button" id="heroCardUpload">Upload</button>
        </div>
        <small style="color:var(--a-text-soft);">Best around 1000 × 1000 (square). Leave blank to show the designed "10% extra off" panel instead.</small>
      </div>
      <div class="grid-2" style="grid-template-columns:1fr 1fr;">
        ${field("Offer card link", "cardHref", h.cardHref, "text", "Where clicking the artwork goes, e.g. offers.html")}
        ${field("Offer card alt text", "cardAlt", h.cardAlt, "text", "Describes the artwork for screen readers.")}
      </div>
      ${h.cardImage ? `<div style="margin-top:12px;max-width:240px;"><img src="${esc(h.cardImage)}" alt="" style="width:100%;border-radius:12px;display:block;"></div>` : ""}`;

    document.getElementById("heroCardUpload").addEventListener("click", pickHeroCardImage);

    renderSlides();
    renderBrandStrip();
    document.getElementById("bannerVersion").textContent = homepage.version ?? "—";
    document.getElementById("bannerUpdated").textContent = homepage.updatedAt
      ? AdminShell.fmtDate(homepage.updatedAt)
      : "Not saved yet";
  }

  function readForm(rootId) {
    const out = {};
    document.querySelectorAll(`#${rootId} [name]`).forEach(el => {
      out[el.name] = el.type === "checkbox" ? el.checked : el.value;
    });
    return out;
  }

  // Upload one image and write the resulting URL into the given slide field.
  async function uploadInto(index, field, file) {
    const fd = new FormData();
    fd.append("images", file);
    const res = await AdminShell.api("/admin/uploads/banners", { method: "POST", body: fd });
    const url = res.files && res.files[0] && res.files[0].url;
    if (!url) throw new Error("Upload returned no file URL.");
    slides[index][field] = url;
    renderSlides();
    AdminShell.toast("Banner uploaded");
  }

  // Same upload endpoint as the banner slides, but the URL lands on the hero
  // object rather than a slide, so it needs its own picker.
  function pickHeroCardImage() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const fd = new FormData();
        fd.append("images", file);
        const res = await AdminShell.api("/admin/uploads/banners", { method: "POST", body: fd });
        const url = res.files && res.files[0] && res.files[0].url;
        if (!url) throw new Error("Upload returned no file URL.");
        const box = document.querySelector('#heroForm [name="cardImage"]');
        if (box) box.value = url;
        AdminShell.toast("Image uploaded — press Save to publish it");
      } catch (err) {
        AdminShell.toast(err.message || "Upload failed", "err");
      }
    });
    input.click();
  }

  function pickFile(index, field) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        await uploadInto(index, field, file);
      } catch (err) {
        AdminShell.toast(err.message || "Upload failed", "err");
      }
    });
    input.click();
  }

  function slideIndexOf(el) {
    const row = el.closest("[data-index]");
    return row ? Number(row.dataset.index) : -1;
  }

  function brandStripIndexOf(el) {
    const row = el.closest("[data-bs-index]");
    return row ? Number(row.dataset.bsIndex) : -1;
  }

  // Upload one brand-strip image (reuses the banner uploader) and store its URL.
  function pickBrandStripFile(index) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const fd = new FormData();
        fd.append("images", file);
        const res = await AdminShell.api("/admin/uploads/banners", { method: "POST", body: fd });
        const url = res.files && res.files[0] && res.files[0].url;
        if (!url) throw new Error("Upload returned no file URL.");
        brandStrip[index].image = url;
        renderBrandStrip();
        AdminShell.toast("Image uploaded");
      } catch (err) {
        AdminShell.toast(err.message || "Upload failed", "err");
      }
    });
    input.click();
  }

  function bindBrandStripEvents() {
    const list = document.getElementById("brandStripList");
    if (!list) return;

    list.addEventListener("input", event => {
      const field = event.target.dataset.bsField;
      if (!field) return;
      const i = brandStripIndexOf(event.target);
      if (i >= 0) brandStrip[i][field] = event.target.value;
    });

    list.addEventListener("click", event => {
      const btn = event.target.closest("button");
      if (!btn) return;
      const i = brandStripIndexOf(btn);
      if (i < 0) return;

      if (btn.hasAttribute("data-bs-upload")) return pickBrandStripFile(i);

      if (btn.hasAttribute("data-bs-remove")) {
        brandStrip.splice(i, 1);
        return renderBrandStrip();
      }

      if (btn.dataset.bsMove) {
        const to = i + Number(btn.dataset.bsMove);
        if (to < 0 || to >= brandStrip.length) return;
        [brandStrip[i], brandStrip[to]] = [brandStrip[to], brandStrip[i]];
        renderBrandStrip();
      }
    });

    document.getElementById("brandStripAdd").addEventListener("click", () => {
      brandStrip.push({ image: "", alt: "", href: "" });
      renderBrandStrip();
    });
  }

  function bindSlideEvents() {
    const list = document.getElementById("slideList");

    // Keep the model in step with typing so a re-render never drops input.
    list.addEventListener("input", event => {
      const field = event.target.dataset.slideField;
      if (!field) return;
      const i = slideIndexOf(event.target);
      if (i >= 0) slides[i][field] = event.target.value;
    });

    list.addEventListener("click", event => {
      const btn = event.target.closest("button");
      if (!btn) return;
      const i = slideIndexOf(btn);
      if (i < 0) return;

      if (btn.dataset.slideUpload) return pickFile(i, btn.dataset.slideUpload);

      if (btn.hasAttribute("data-slide-remove")) {
        slides.splice(i, 1);
        return renderSlides();
      }

      if (btn.dataset.slideMove) {
        const to = i + Number(btn.dataset.slideMove);
        if (to < 0 || to >= slides.length) return;
        [slides[i], slides[to]] = [slides[to], slides[i]];
        renderSlides();
      }
    });

    document.getElementById("slideAdd").addEventListener("click", () => {
      slides.push({ type: "image", image: "", imageMobile: "", alt: "", href: "" });
      renderSlides();
    });
  }

  async function load() {
    try {
      const data = await AdminShell.api("/admin/content/homepage");
      homepage = data.homepage || {};
      // Only genuine banner slides are editable here; a legacy rich-slide list
      // would have no image to manage and is left for the fallback hero fields.
      slides = Array.isArray(homepage.hero?.slides)
        ? homepage.hero.slides.filter(s => s && s.type !== "rich").map(s => ({ ...s }))
        : [];
      brandStrip = Array.isArray(homepage.brandStrip)
        ? homepage.brandStrip.map(s => ({ image: s.image || "", alt: s.alt || "", href: s.href || "" }))
        : [];
      // Start with 5 empty upload slots so a first-time admin has the recommended
      // number of banners ready to fill.
      if (!brandStrip.length) brandStrip = Array.from({ length: 5 }, () => ({ image: "", alt: "", href: "" }));
      render();
    } catch (err) {
      document.getElementById("announcementForm").innerHTML =
        `<p style="color:var(--a-red);">Could not load banners: ${esc(err.message)}</p>`;
    }
  }

  async function save() {
    const btn = document.getElementById("bannerSave");
    btn.disabled = true;
    try {
      const hero = readForm("heroForm");
      hero.overlay = Number(hero.overlay) || 0;
      // Drop blank rows so a half-filled slide can never render an empty banner.
      hero.slides = slides
        .filter(s => (s.image || "").trim() || (s.imageMobile || "").trim())
        .map(s => ({ type: "image", image: (s.image || "").trim(), imageMobile: (s.imageMobile || "").trim(), alt: (s.alt || "").trim(), href: (s.href || "").trim() }));
      // Send only the banner surfaces; sections/order are owned by the Content
      // page and the server merges what we omit.
      // Drop empty rows so half-filled slots never render a blank banner.
      const brandStripClean = brandStrip
        .filter(s => (s.image || "").trim())
        .map(s => ({ image: (s.image || "").trim(), alt: (s.alt || "").trim(), href: (s.href || "").trim() }));
      const payload = {
        announcement: { ...(homepage.announcement || {}), ...readForm("announcementForm") },
        hero: { ...(homepage.hero || {}), ...hero },
        brandStrip: brandStripClean,
        publish: true
      };
      const saved = await AdminShell.api("/admin/content/homepage", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      homepage = saved.homepage || homepage;
      render();
      AdminShell.toast("Banners published");
    } catch (err) {
      AdminShell.toast(err.message || "Could not save banners", "err");
    } finally {
      btn.disabled = false;
    }
  }

  document.getElementById("bannerSave").addEventListener("click", save);
  document.getElementById("bannerReload").addEventListener("click", load);
  bindSlideEvents();
  bindBrandStripEvents();

  await load();
})();
