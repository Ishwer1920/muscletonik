(function () {
  const PREVIEW_URL = "/index.html?mt_preview=1";
  const BROADCAST = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("mt-preview") : null;
  const AUTOSAVE_MS = 1000;
  const PREVIEW_BINDINGS = {
    announcement: {
      root: "#offerTrack",
      fields: {
        text: ".offer-item"
      }
    },
    hero: {
      root: "[data-home-section='hero']",
      fields: {
        eyebrow: ".hero-tag",
        headline: ".hero-copy h1",
        subheadline: ".hero-copy p",
        buttonText: ".hero-btns .btn-primary",
        buttonLink: ".hero-btns .btn-primary"
      }
    },
    categories: {
      root: "[data-home-section='categories']",
      fields: {
        subheading: ".sec-head .eyebrow",
        heading: ".sec-head h2"
      }
    },
    brands: {
      root: "[data-home-section='brands']",
      fields: {
        subheading: ".sec-head .eyebrow",
        heading: ".sec-head h2"
      }
    },
    "best-products": {
      root: "[data-home-section='best-products']",
      fields: {
        subheading: ".sec-head .eyebrow",
        heading: ".sec-head h2"
      }
    },
    deals: {
      root: "[data-home-section='deals']",
      fields: {
        subheading: ".sec-head .eyebrow",
        heading: ".deal-banner h2",
        copy: ".deal-banner p"
      }
    },
    featured: {
      root: "[data-home-section='featured']",
      fields: {
        subheading: ".sec-head .eyebrow",
        heading: ".sec-head h2"
      }
    },
    collections: {
      root: "[data-home-section='collections']",
      fields: {
        subheading: ".sec-head .eyebrow",
        heading: ".sec-head h2"
      }
    },
    testimonials: {
      root: "[data-home-section='testimonials']",
      fields: {
        subheading: ".sec-head .eyebrow",
        heading: ".sec-head h2"
      }
    },
    newsletter: {
      root: "[data-home-section='newsletter']",
      fields: {
        heading: "h3",
        copy: "p"
      }
    },
    footer: {
      root: "footer.site",
      fields: {
        note: ".about"
      }
    }
  };

  const FIELD_META = {
    announcement: [
      { key: "text", label: "Announcement text", type: "textarea", rows: 3, placeholder: "Free shipping above Rs 999" },
      { key: "background", label: "Background", type: "color" },
      { key: "color", label: "Text color", type: "color" },
      { key: "visible", label: "Visible", type: "switch" }
    ],
    header: [
      { key: "note", label: "Header note", type: "textarea", rows: 3, placeholder: "Global storefront header note" }
    ],
    hero: [
      { key: "eyebrow", label: "Eyebrow", type: "text", placeholder: "Premium supplements for real routines" },
      { key: "headline", label: "Headline", type: "textarea", rows: 3, placeholder: "Fuel Your Strength" },
      { key: "subheadline", label: "Subheadline", type: "textarea", rows: 3, placeholder: "Build your legacy with premium supplements." },
      { key: "buttonText", label: "Primary button", type: "text", placeholder: "Shop now" },
      { key: "buttonLink", label: "Primary link", type: "text", placeholder: "/marketplace.html" },
      { key: "alignment", label: "Alignment", type: "select", options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" }
      ]},
      { key: "gradient", label: "Gradient", type: "text", placeholder: "linear-gradient(135deg,#111111,#2b2b2b)" },
      { key: "overlay", label: "Overlay opacity", type: "number", min: 0, max: 100, step: 1 }
    ],
    categories: [
      { key: "subheading", label: "Eyebrow", type: "text", placeholder: "Shop by goal" },
      { key: "heading", label: "Heading", type: "text", placeholder: "Choose the result you are chasing" }
    ],
    brands: [
      { key: "subheading", label: "Eyebrow", type: "text", placeholder: "Shop by category" },
      { key: "heading", label: "Heading", type: "text", placeholder: "Browse the core supplement ranges" }
    ],
    "best-products": [
      { key: "subheading", label: "Eyebrow", type: "text", placeholder: "Best sellers" },
      { key: "heading", label: "Heading", type: "text", placeholder: "Popular picks our customers reorder" }
    ],
    deals: [
      { key: "subheading", label: "Eyebrow", type: "text", placeholder: "Deal of the day" },
      { key: "heading", label: "Heading", type: "text", placeholder: "One sharp deal. One short timer." },
      { key: "copy", label: "Body copy", type: "textarea", rows: 3, placeholder: "A premium orange-black banner..." }
    ],
    featured: [
      { key: "subheading", label: "Eyebrow", type: "text", placeholder: "Featured products" },
      { key: "heading", label: "Heading", type: "text", placeholder: "Hand-picked for a premium browse" }
    ],
    collections: [
      { key: "subheading", label: "Eyebrow", type: "text", placeholder: "Transformation stories" },
      { key: "heading", label: "Heading", type: "text", placeholder: "Real routines, real results" }
    ],
    testimonials: [
      { key: "subheading", label: "Eyebrow", type: "text", placeholder: "Customer reviews" },
      { key: "heading", label: "Heading", type: "text", placeholder: "What people say after ordering" }
    ],
    newsletter: [
      { key: "heading", label: "Heading", type: "text", placeholder: "Get 10% Off Your First Order" },
      { key: "copy", label: "Copy", type: "textarea", rows: 3, placeholder: "Join for early access to new launches..." }
    ],
    footer: [
      { key: "note", label: "Footer note", type: "textarea", rows: 3, placeholder: "Premium supplements, direct to your routine." }
    ]
  };

  const state = {
    homepage: null,
    sections: [],
    order: [],
    selectedId: null,
    versions: [],
    device: "desktop",
    search: "",
    dirty: false,
    saving: false,
    status: "Loading",
    lastSavedKey: "",
    history: [],
    future: [],
    autosaveTimer: null,
    previewDoc: null
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function snapshotFromState() {
    return {
      sections: clone(state.sections),
      order: [...state.order],
      announcement: clone(state.homepage?.announcement || {}),
      hero: clone(state.homepage?.hero || {}),
      footer: clone(state.homepage?.footer || {})
    };
  }

  function snapshotKey(snapshot) {
    return JSON.stringify(snapshot || {});
  }

  function selectedSection() {
    return state.sections.find(section => section.id === state.selectedId) || state.sections[0] || null;
  }

  function sectionLabel(section) {
    return section?.title || section?.type || section?.id || "Section";
  }

  function sectionMeta(section) {
    return FIELD_META[section?.id] || FIELD_META[section?.type] || [];
  }

  function ensureSectionDefaults(section) {
    if (!section) return section;
    section.enabled = section.enabled !== false;
    section.data = section.data || {};
    return section;
  }

  function normalizeHomepage(homepage) {
    const sections = Array.isArray(homepage?.sections) ? homepage.sections.map(ensureSectionDefaults) : [];
    if (!sections.some(section => section.id === "best-products")) {
      sections.splice(Math.min(sections.length, 5), 0, ensureSectionDefaults({
        id: "best-products",
        type: "best-products",
        title: "Best sellers",
        enabled: true,
        data: {
          subheading: "Best sellers",
          heading: "Popular picks our customers reorder"
        }
      }));
    }
    const preferredOrder = [
      "announcement",
      "header",
      "hero",
      "categories",
      "brands",
      "best-products",
      "deals",
      "featured",
      "collections",
      "testimonials",
      "newsletter",
      "footer"
    ];
    const order = Array.isArray(homepage?.order) && homepage.order.length
      ? homepage.order
      : preferredOrder.filter(id => sections.some(section => section.id === id));
    if (!order.includes("best-products")) {
      const nextOrder = [...order];
      const insertAt = Math.max(0, nextOrder.indexOf("brands") + 1) || Math.min(nextOrder.length, 5);
      nextOrder.splice(insertAt, 0, "best-products");
      return {
        slug: homepage?.slug || "homepage",
        name: homepage?.name || "Homepage CMS",
        version: homepage?.version || 1,
        publishedAt: homepage?.publishedAt || null,
        announcement: clone(homepage?.announcement || { text: "Free shipping above Rs 999", background: "#111111", color: "#ffffff", visible: true }),
        hero: clone(homepage?.hero || {}),
        footer: clone(homepage?.footer || { note: "Premium supplements, direct to your routine." }),
        sections,
        order: nextOrder
      };
    }
    return {
      slug: homepage?.slug || "homepage",
      name: homepage?.name || "Homepage CMS",
      version: homepage?.version || 1,
      publishedAt: homepage?.publishedAt || null,
      announcement: clone(homepage?.announcement || { text: "Free shipping above Rs 999", background: "#111111", color: "#ffffff", visible: true }),
      hero: clone(homepage?.hero || {}),
      footer: clone(homepage?.footer || { note: "Premium supplements, direct to your routine." }),
      sections,
      order
    };
  }

  function orderedSections() {
    const byId = new Map(state.sections.map(section => [section.id, section]));
    const ordered = [];
    state.order.forEach(id => {
      const section = byId.get(id);
      if (section) ordered.push(section);
    });
    state.sections.forEach(section => {
      if (!state.order.includes(section.id)) ordered.push(section);
    });
    return ordered;
  }

  function updateDerivedHomepageFields() {
    state.homepage = state.homepage || {};
    const heroSection = state.sections.find(section => section.id === "hero");
    if (heroSection) state.homepage.hero = { ...(state.homepage.hero || {}), ...(heroSection.data || {}) };
    const announcementSection = state.sections.find(section => section.id === "announcement");
    if (announcementSection) {
      state.homepage.announcement = {
        ...(state.homepage.announcement || {}),
        ...(announcementSection.data || {})
      };
    }
    const footerSection = state.sections.find(section => section.id === "footer");
    if (footerSection) state.homepage.footer = { ...(state.homepage.footer || {}), ...(footerSection.data || {}) };
    state.homepage.sections = clone(state.sections);
    state.homepage.order = [...state.order];
  }

  function setFieldByPath(path, value) {
    const [sectionId, field] = String(path || "").split(".");
    state.homepage = state.homepage || {};
    const section = state.sections.find(item => item.id === sectionId);
    if (!section) return;
    section.data = section.data || {};
    if (field === "enabled") {
      section.enabled = !!value;
    } else if (field === "title") {
      section.title = value;
    } else {
      section.data[field] = value;
    }
    if (sectionId === "hero") state.homepage.hero = { ...(state.homepage.hero || {}), ...(section.data || {}) };
    if (sectionId === "announcement") state.homepage.announcement = { ...(state.homepage.announcement || {}), ...(section.data || {}) };
    if (sectionId === "footer") state.homepage.footer = { ...(state.homepage.footer || {}), ...(section.data || {}) };
  }

  function getFieldValue(section, field) {
    if (!section) return "";
    if (field === "enabled") return !!section.enabled;
    if (field === "title") return section.title || "";
    return section.data?.[field] ?? "";
  }

  function renderShell() {
    const root = document.getElementById("aContent");
    root.innerHTML = `
      <div class="content-editor-shell">
        <div class="content-editor-hero a-card">
          <div class="content-editor-hero-copy">
            <span class="eyebrow">Visual website editor</span>
            <h1>Drag sections, edit the live canvas, and publish the storefront with confidence.</h1>
            <p>Inline edits update the preview on the right, the section rail stays synchronized, and autosave protects every change.</p>
            <div class="content-editor-actions">
              <button type="button" class="a-btn primary" id="publishBtn">Publish</button>
              <button type="button" class="a-btn ghost" id="saveDraftBtn">Save draft</button>
              <button type="button" class="a-btn ghost" id="openPreviewBtn">Open preview</button>
              <button type="button" class="a-btn ghost" id="resetDraftBtn">Reset layout</button>
            </div>
          </div>
          <div class="content-editor-metrics" id="contentMetrics"></div>
        </div>

        <div class="content-editor-grid">
          <aside class="content-panel a-card">
            <div class="a-card-head">
              <h3>Sections</h3>
              <span class="badge orange" id="contentDirtyBadge">Loading</span>
            </div>
            <div class="a-card-body">
              <div class="content-search">
                <input class="a-input" id="sectionSearch" placeholder="Search sections">
              </div>
              <div class="content-rail" id="sectionRail"></div>
            </div>
          </aside>

          <section class="content-canvas a-card">
            <div class="a-card-head content-canvas-head">
              <div>
                <h3>Live preview</h3>
                <p>Click text in the canvas to edit it directly.</p>
              </div>
              <div class="content-device-toggle" id="deviceToggle">
                <button type="button" data-device="desktop" class="active">Desktop</button>
                <button type="button" data-device="tablet">Tablet</button>
                <button type="button" data-device="mobile">Mobile</button>
              </div>
            </div>
            <div class="a-card-body">
              <div class="content-preview-shell device-desktop" id="previewShell">
                <div class="content-preview-frame">
                  <iframe id="contentPreviewFrame" title="Homepage preview" loading="lazy"></iframe>
                </div>
              </div>
            </div>
          </section>

          <aside class="content-panel a-card">
            <div class="a-card-head">
              <h3>Inspector</h3>
              <span class="badge gray" id="selectedSectionBadge">No section</span>
            </div>
            <div class="a-card-body" id="inspectorRoot"></div>
          </aside>
        </div>

        <section class="content-versions a-card">
          <div class="a-card-head">
            <h3>Version history</h3>
            <span class="badge gray" id="versionCountBadge">0 versions</span>
          </div>
          <div class="a-card-body">
            <div id="versionList" class="content-version-list"></div>
          </div>
        </section>
      </div>
    `;
  }

  function renderMetrics() {
    const root = document.getElementById("contentMetrics");
    if (!root) return;
    const selected = selectedSection();
    const visibleCount = state.sections.filter(section => section.enabled !== false).length;
    root.innerHTML = `
      <div class="content-stat">
        <span>Sections</span>
        <strong>${state.sections.length}</strong>
      </div>
      <div class="content-stat">
        <span>Visible</span>
        <strong>${visibleCount}</strong>
      </div>
      <div class="content-stat">
        <span>Selected</span>
        <strong>${AdminShell.esc(sectionLabel(selected))}</strong>
      </div>
      <div class="content-stat">
        <span>Status</span>
        <strong>${AdminShell.esc(state.status)}</strong>
      </div>
    `;
  }

  function renderRail() {
    const root = document.getElementById("sectionRail");
    const query = state.search.trim().toLowerCase();
    const sections = orderedSections().filter(section => {
      if (!query) return true;
      const text = `${section.id} ${sectionLabel(section)} ${section.type}`.toLowerCase();
      return text.includes(query);
    });
    root.innerHTML = sections.map(section => `
      <article class="content-rail-item ${section.id === state.selectedId ? "active" : ""} ${section.enabled === false ? "disabled" : ""}" draggable="true" data-section-id="${section.id}">
        <div class="content-rail-handle" title="Drag to reorder">⋮⋮</div>
        <button type="button" class="content-rail-main" data-select="${section.id}">
          <span class="content-rail-title">${AdminShell.esc(sectionLabel(section))}</span>
          <span class="content-rail-sub">${AdminShell.esc(section.type || section.id)}</span>
        </button>
        <div class="content-rail-actions">
          <button type="button" class="content-mini-btn" data-move="up" data-section-id="${section.id}">↑</button>
          <button type="button" class="content-mini-btn" data-move="down" data-section-id="${section.id}">↓</button>
          <button type="button" class="content-mini-btn ${section.enabled === false ? "off" : ""}" data-toggle="${section.id}">${section.enabled === false ? "Off" : "On"}</button>
        </div>
      </article>
    `).join("");
    requestAnimationFrame(bindRailEvents);
  }

  function renderInspector() {
    const root = document.getElementById("inspectorRoot");
    const section = selectedSection();
    const fields = sectionMeta(section);
    if (!section) {
      root.innerHTML = `<div class="a-empty"><h3>No section selected</h3><p>Choose a section from the rail or click content in the preview.</p></div>`;
      document.getElementById("selectedSectionBadge").textContent = "No section";
      return;
    }
    document.getElementById("selectedSectionBadge").textContent = sectionLabel(section);
    const fieldMarkup = fields.map(field => {
      const value = getFieldValue(section, field.key);
      if (field.type === "switch") {
        return `
          <label class="content-switch">
            <input type="checkbox" data-field="${field.key}" ${value ? "checked" : ""}>
            <span>${AdminShell.esc(field.label)}</span>
          </label>
        `;
      }
      if (field.type === "select") {
        return `
          <div class="a-field">
            <label>${AdminShell.esc(field.label)}</label>
            <select class="a-select" data-field="${field.key}">
              ${(field.options || []).map(opt => `<option value="${AdminShell.esc(opt.value)}" ${String(opt.value) === String(value) ? "selected" : ""}>${AdminShell.esc(opt.label)}</option>`).join("")}
            </select>
          </div>
        `;
      }
      if (field.type === "textarea") {
        return `
          <div class="a-field">
            <label>${AdminShell.esc(field.label)}</label>
            <textarea class="a-input content-textarea" rows="${field.rows || 3}" data-field="${field.key}" placeholder="${AdminShell.esc(field.placeholder || "")}">${AdminShell.esc(value)}</textarea>
          </div>
        `;
      }
      if (field.type === "color") {
        return `
          <div class="a-field">
            <label>${AdminShell.esc(field.label)}</label>
            <div class="content-color-row">
              <input class="a-input" type="color" data-field="${field.key}" value="${AdminShell.esc(value || "#000000")}">
              <input class="a-input" type="text" data-field-text="${field.key}" value="${AdminShell.esc(value || "")}" placeholder="#111111">
            </div>
          </div>
        `;
      }
      return `
        <div class="a-field">
          <label>${AdminShell.esc(field.label)}</label>
          <input class="a-input" type="${field.type === "number" ? "number" : "text"}" data-field="${field.key}" value="${AdminShell.esc(value)}" placeholder="${AdminShell.esc(field.placeholder || "")}" ${field.min != null ? `min="${field.min}"` : ""} ${field.max != null ? `max="${field.max}"` : ""} ${field.step != null ? `step="${field.step}"` : ""}>
        </div>
      `;
    }).join("");
    root.innerHTML = `
      <div class="content-inspector-summary">
        <div>
          <span class="badge orange">${AdminShell.esc(section.type || section.id)}</span>
          <h4>${AdminShell.esc(sectionLabel(section))}</h4>
          <p>Section ID: <code>${AdminShell.esc(section.id)}</code></p>
        </div>
        <div class="content-inspector-actions">
          <button type="button" class="a-btn ghost" id="sectionUpBtn">Move up</button>
          <button type="button" class="a-btn ghost" id="sectionDownBtn">Move down</button>
          <button type="button" class="a-btn primary" id="sectionFocusBtn">Focus preview</button>
        </div>
      </div>
      <div class="content-inspector-fields">${fieldMarkup}</div>
    `;
    requestAnimationFrame(bindInspectorEvents);
  }

  function renderVersions() {
    const list = document.getElementById("versionList");
    const countBadge = document.getElementById("versionCountBadge");
    if (countBadge) countBadge.textContent = `${state.versions.length} version${state.versions.length === 1 ? "" : "s"}`;
    if (!list) return;
    if (!state.versions.length) {
      list.innerHTML = `<div class="a-empty" style="padding:24px 12px;"><h3>No versions yet</h3><p>Publish or save a draft to create a timeline entry.</p></div>`;
      return;
    }
    list.innerHTML = state.versions.map(version => `
      <article class="content-version">
        <div>
          <strong>${AdminShell.esc(version.note || "Saved draft")}</strong>
          <span>${AdminShell.esc(AdminShell.fmtDate(version.createdAt))}</span>
        </div>
        <div class="content-version-actions">
          <span class="badge ${version.published ? "green" : "gray"}">${version.published ? "Published" : "Draft"}</span>
          <button type="button" class="a-btn ghost" data-rollback="${version._id}">Rollback</button>
        </div>
      </article>
    `).join("");
    requestAnimationFrame(bindVersionEvents);
  }

  function setStatus(text, dirty = state.dirty, saving = state.saving) {
    state.status = text;
    state.dirty = dirty;
    state.saving = saving;
    const badge = document.getElementById("contentDirtyBadge");
    if (badge) {
      const tone = saving ? "blue" : (dirty ? "orange" : "green");
      badge.className = `badge ${tone}`;
      badge.textContent = saving ? "Saving..." : (dirty ? "Unsaved changes" : text);
    }
    renderMetrics();
  }

  function setSelection(id, scrollIntoView = false) {
    state.selectedId = id || state.selectedId || state.sections[0]?.id || null;
    renderRail();
    renderInspector();
    highlightPreviewSelection();
    if (scrollIntoView) focusSelectedPreviewSection();
  }

  function pushHistory() {
    const key = snapshotKey(snapshotFromState());
    if (state.history.length && state.history[state.history.length - 1] === key) return;
    state.history.push(key);
    if (state.history.length > 30) state.history.shift();
    state.future = [];
  }

  function restoreSnapshot(key) {
    if (!key) return;
    const snapshot = JSON.parse(key);
    state.sections = clone(snapshot.sections || []);
    state.order = [...(snapshot.order || [])];
    state.homepage.announcement = clone(snapshot.announcement || {});
    state.homepage.hero = clone(snapshot.hero || {});
    state.homepage.footer = clone(snapshot.footer || {});
    updateDerivedHomepageFields();
    renderRail();
    renderInspector();
    syncPreviewState();
    setStatus("Snapshot restored", true, false);
    scheduleAutosave();
  }

  function undo() {
    if (state.history.length < 2) return;
    const current = state.history.pop();
    state.future.push(current);
    restoreSnapshot(state.history[state.history.length - 1]);
  }

  function redo() {
    const next = state.future.pop();
    if (!next) return;
    state.history.push(next);
    restoreSnapshot(next);
  }

  function scheduleAutosave() {
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = setTimeout(() => {
      if (state.dirty) save(false);
    }, AUTOSAVE_MS);
  }

  function applySectionToPreview(doc, section) {
    const binding = PREVIEW_BINDINGS[section.id] || PREVIEW_BINDINGS[section.type];
    if (!binding) return;
    const root = doc.querySelector(binding.root);
    if (!root) return;
    root.style.display = section.enabled === false ? "none" : "";
    Object.entries(binding.fields || {}).forEach(([key, selector]) => {
      const value = getFieldValue(section, key);
      const el = root.querySelector(selector);
      if (!el || value == null) return;
      if (section.id === "hero" && key === "buttonLink" && el.tagName === "A") {
        el.setAttribute("href", String(value));
      } else if (section.id === "hero" && key === "buttonText") {
        el.textContent = String(value);
      } else if (section.id === "announcement" && key === "text") {
        const item = root.querySelector(".offer-item");
        if (item) item.textContent = String(value);
      } else {
        el.textContent = String(value);
      }
    });
  }

  function syncPreviewState() {
    const doc = state.previewDoc;
    if (!doc) return;
    const body = doc.body;
    if (body) {
      body.classList.toggle("mt-editor-preview", true);
      body.classList.toggle("preview-mode", true);
    }
    const main = doc.querySelector("main");
    if (main) {
      const nodes = Array.from(main.children).filter(node => node.matches("section"));
      const orderMap = new Map(state.order.map((id, index) => [id, index]));
      main.style.display = "flex";
      main.style.flexDirection = "column";
      nodes.forEach((node, index) => {
        const key = node.dataset.homeSection;
        const weight = orderMap.has(key) ? orderMap.get(key) : state.order.length + index;
        node.style.order = String(weight);
        if (key) {
          const section = state.sections.find(item => item.id === key);
          if (section) node.style.display = section.enabled === false ? "none" : "";
        }
      });
    }
    state.sections.forEach(section => applySectionToPreview(doc, section));
    const announcementTrack = doc.getElementById("offerTrack");
    if (announcementTrack && state.homepage.announcement?.text) {
      const item = announcementTrack.querySelector(".offer-item");
      if (item) item.textContent = state.homepage.announcement.text;
    }
    const footer = doc.querySelector("footer.site");
    if (footer && state.homepage.footer?.note) {
      const note = footer.querySelector(".about");
      if (note) note.textContent = state.homepage.footer.note;
    }
    const activeSection = selectedSection();
    if (activeSection) highlightPreviewSelection(activeSection.id);
  }

  function highlightPreviewSelection(sectionId = state.selectedId) {
    const doc = state.previewDoc;
    if (!doc) return;
    doc.querySelectorAll(".mt-selected").forEach(node => node.classList.remove("mt-selected"));
    const selector = PREVIEW_BINDINGS[sectionId]?.root || `[data-home-section='${sectionId}']`;
    const node = doc.querySelector(selector);
    if (node) node.classList.add("mt-selected");
  }

  function focusSelectedPreviewSection() {
    const doc = state.previewDoc;
    const section = selectedSection();
    if (!doc || !section) return;
    const selector = PREVIEW_BINDINGS[section.id]?.root || `[data-home-section='${section.id}']`;
    const node = doc.querySelector(selector);
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  function attachPreviewEditing() {
    const frame = document.getElementById("contentPreviewFrame");
    if (!frame || !frame.contentDocument) return;
    state.previewDoc = frame.contentDocument;
    const doc = state.previewDoc;
    if (!doc.getElementById("mtEditorPreviewStyle")) {
      const style = doc.createElement("style");
      style.id = "mtEditorPreviewStyle";
      style.textContent = `
        .mt-selected{outline:2px solid #ff7a00 !important;outline-offset:8px !important;border-radius:10px;}
        [data-editor-field]{cursor:text;transition:box-shadow .15s ease;}
        [data-editor-field]:focus{outline:2px solid #ff7a00;outline-offset:4px;border-radius:6px;}
        .mt-editor-preview .hero-copy h1,
        .mt-editor-preview .hero-copy p,
        .mt-editor-preview .sec-head h2,
        .mt-editor-preview .sec-head .eyebrow,
        .mt-editor-preview .deal-banner h2,
        .mt-editor-preview .deal-banner p,
        .mt-editor-preview .newsletter h3,
        .mt-editor-preview .newsletter p,
        .mt-editor-preview footer .about{user-select:text;}
      `;
      doc.head.appendChild(style);
    }
    doc.querySelectorAll("[data-editor-field]").forEach(node => {
      node.setAttribute("contenteditable", "true");
      node.setAttribute("spellcheck", "false");
      node.addEventListener("focus", () => {
        const path = node.dataset.editorField || "";
        const [sectionId] = path.split(".");
        if (sectionId) setSelection(sectionId, false);
      });
      node.addEventListener("blur", () => {
        const path = node.dataset.editorField || "";
        if (!path) return;
        const value = node.innerText.trim();
        setFieldByPath(path, value);
        updateDerivedHomepageFields();
        renderRail();
        setStatus("Editing", true, false);
        scheduleAutosave();
      });
      node.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          event.preventDefault();
          node.blur();
        }
      });
      node.addEventListener("input", () => {
        const path = node.dataset.editorField || "";
        if (!path) return;
        setFieldByPath(path, node.innerText.trim());
        updateDerivedHomepageFields();
        setStatus("Editing", true, false);
        scheduleAutosave();
      });
    });
    doc.querySelectorAll("section[data-home-section], footer.site").forEach(node => {
      node.addEventListener("click", event => {
        const path = node.dataset.homeSection || "footer";
        if (event.target.closest("[data-editor-field]")) return;
        setSelection(path, false);
      });
    });
    highlightPreviewSelection();
  }

  function loadPreview() {
    const frame = document.getElementById("contentPreviewFrame");
    frame.src = PREVIEW_URL;
    frame.addEventListener("load", () => {
      attachPreviewEditing();
      syncPreviewState();
    });
  }

  function bindRailEvents() {
    const search = document.getElementById("sectionSearch");
    search.addEventListener("input", () => {
      state.search = search.value;
      renderRail();
    });
    document.querySelectorAll("[data-select]").forEach(button => {
      button.addEventListener("click", () => setSelection(button.dataset.select, false));
    });
    document.querySelectorAll("[data-toggle]").forEach(button => {
      button.addEventListener("click", () => {
        const section = state.sections.find(item => item.id === button.dataset.toggle);
        if (!section) return;
        section.enabled = section.enabled === false;
        updateDerivedHomepageFields();
        renderRail();
        syncPreviewState();
        pushHistory();
        setStatus("Updated", true, false);
        scheduleAutosave();
      });
    });
    document.querySelectorAll("[data-move]").forEach(button => {
      button.addEventListener("click", () => {
        const id = button.dataset.sectionId;
        const index = state.order.indexOf(id);
        if (index === -1) return;
        const nextIndex = button.dataset.move === "up" ? Math.max(0, index - 1) : Math.min(state.order.length - 1, index + 1);
        if (nextIndex === index) return;
        const copy = [...state.order];
        copy.splice(index, 1);
        copy.splice(nextIndex, 0, id);
        state.order = copy;
        updateDerivedHomepageFields();
        renderRail();
        syncPreviewState();
        pushHistory();
        setStatus("Reordered", true, false);
        scheduleAutosave();
      });
    });
    let dragId = null;
    document.querySelectorAll(".content-rail-item").forEach(item => {
      item.addEventListener("dragstart", () => { dragId = item.dataset.sectionId; });
      item.addEventListener("dragover", event => { event.preventDefault(); });
      item.addEventListener("drop", event => {
        event.preventDefault();
        const targetId = item.dataset.sectionId;
        if (!dragId || dragId === targetId) return;
        const next = [...state.order];
        const from = next.indexOf(dragId);
        const to = next.indexOf(targetId);
        if (from === -1 || to === -1) return;
        next.splice(from, 1);
        next.splice(to, 0, dragId);
        state.order = next;
        updateDerivedHomepageFields();
        renderRail();
        syncPreviewState();
        pushHistory();
        setStatus("Reordered", true, false);
        scheduleAutosave();
      });
    });
  }

  function bindInspectorEvents() {
    const root = document.getElementById("inspectorRoot");
    const section = selectedSection();
    if (!root || !section) return;
    root.querySelectorAll("[data-field]").forEach(input => {
      input.addEventListener("input", () => {
        const field = input.dataset.field;
        const value = input.type === "checkbox" ? input.checked : input.value;
        if (field === "enabled") section.enabled = !!value;
        else if (field === "title") section.title = value;
        else section.data[field] = value;
        updateDerivedHomepageFields();
        syncPreviewState();
        setStatus("Editing", true, false);
        scheduleAutosave();
      });
      input.addEventListener("change", () => {
        const field = input.dataset.field;
        const value = input.type === "checkbox" ? input.checked : input.value;
        if (field === "enabled") section.enabled = !!value;
        else if (field === "title") section.title = value;
        else section.data[field] = value;
        updateDerivedHomepageFields();
        renderRail();
        syncPreviewState();
        pushHistory();
        setStatus("Updated", true, false);
        scheduleAutosave();
      });
    });
    root.querySelectorAll("[data-field-text]").forEach(input => {
      input.addEventListener("input", () => {
        const field = input.dataset.fieldText;
        section.data[field] = input.value;
        updateDerivedHomepageFields();
        syncPreviewState();
        setStatus("Editing", true, false);
        scheduleAutosave();
      });
      input.addEventListener("change", () => {
        const field = input.dataset.fieldText;
        section.data[field] = input.value;
        updateDerivedHomepageFields();
        renderRail();
        syncPreviewState();
        pushHistory();
        setStatus("Updated", true, false);
        scheduleAutosave();
      });
    });
    document.getElementById("sectionUpBtn")?.addEventListener("click", () => {
      const index = state.order.indexOf(section.id);
      if (index <= 0) return;
      const next = [...state.order];
      next.splice(index, 1);
      next.splice(index - 1, 0, section.id);
      state.order = next;
      updateDerivedHomepageFields();
      renderRail();
      renderInspector();
      syncPreviewState();
      pushHistory();
      setStatus("Reordered", true, false);
      scheduleAutosave();
    });
    document.getElementById("sectionDownBtn")?.addEventListener("click", () => {
      const index = state.order.indexOf(section.id);
      if (index === -1 || index >= state.order.length - 1) return;
      const next = [...state.order];
      next.splice(index, 1);
      next.splice(index + 1, 0, section.id);
      state.order = next;
      updateDerivedHomepageFields();
      renderRail();
      renderInspector();
      syncPreviewState();
      pushHistory();
      setStatus("Reordered", true, false);
      scheduleAutosave();
    });
    document.getElementById("sectionFocusBtn")?.addEventListener("click", () => {
      focusSelectedPreviewSection();
    });
  }

  async function save(publish) {
    if (!state.homepage) return;
    updateDerivedHomepageFields();
    setStatus("Saving", state.dirty, true);
    try {
      const payload = {
        sections: orderedSections().map(section => clone(section)),
        order: [...state.order],
        announcement: clone(state.homepage.announcement || {}),
        hero: clone(state.homepage.hero || {}),
        footer: clone(state.homepage.footer || {}),
        publish: !!publish
      };
      const result = await AdminShell.api("/admin/content/homepage", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      state.homepage = normalizeHomepage(result.homepage || state.homepage);
      state.sections = clone(state.homepage.sections || []);
      state.order = [...state.homepage.order];
      state.lastSavedKey = snapshotKey(snapshotFromState());
      state.dirty = false;
      state.saving = false;
      state.status = publish ? "Published" : "Saved";
      try {
        const versions = await AdminShell.api("/admin/content/versions", { method: "GET" });
        state.versions = Array.isArray(versions.versions) ? versions.versions : [];
      } catch {}
      renderRail();
      renderInspector();
      renderVersions();
      renderMetrics();
      syncPreviewState();
      BROADCAST?.postMessage({ type: "cms-updated" });
      AdminShell.toast(publish ? "Homepage published" : "Homepage saved");
    } catch (err) {
      state.saving = false;
      setStatus("Save failed", true, false);
      AdminShell.toast(err.message || "Failed to save homepage", "err");
    }
  }

  async function rollbackVersion(id) {
    try {
      const result = await AdminShell.api(`/admin/content/versions/${id}/rollback`, { method: "POST" });
      state.homepage = normalizeHomepage(result.homepage || state.homepage);
      state.sections = clone(state.homepage.sections || []);
      state.order = [...state.homepage.order];
      state.lastSavedKey = snapshotKey(snapshotFromState());
      state.dirty = false;
      state.status = "Rolled back";
      try {
        const versions = await AdminShell.api("/admin/content/versions", { method: "GET" });
        state.versions = Array.isArray(versions.versions) ? versions.versions : [];
      } catch {}
      renderRail();
      renderInspector();
      renderVersions();
      renderMetrics();
      syncPreviewState();
      BROADCAST?.postMessage({ type: "cms-updated" });
      AdminShell.toast("Rolled back to selected version");
    } catch (err) {
      AdminShell.toast(err.message || "Rollback failed", "err");
    }
  }

  function wireToolbar() {
    document.getElementById("publishBtn")?.addEventListener("click", () => save(true));
    document.getElementById("saveDraftBtn")?.addEventListener("click", () => save(false));
    document.getElementById("openPreviewBtn")?.addEventListener("click", () => AdminShell.openPreviewWebsite());
    document.getElementById("resetDraftBtn")?.addEventListener("click", async () => {
      const confirmReset = window.confirm("Reset the homepage draft back to the current saved content?");
      if (!confirmReset) return;
      await loadData(true);
      renderMetrics();
      renderRail();
      renderInspector();
      renderVersions();
      setStatus(state.homepage.publishedAt ? "Published" : "Saved", false, false);
      syncPreviewState();
      AdminShell.toast("Draft reloaded");
    });
    document.querySelectorAll("#deviceToggle [data-device]").forEach(button => {
      button.addEventListener("click", () => {
        state.device = button.dataset.device;
        document.querySelectorAll("#deviceToggle [data-device]").forEach(item => item.classList.toggle("active", item.dataset.device === state.device));
        document.getElementById("previewShell").className = `content-preview-shell device-${state.device}`;
      });
    });
    document.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    });
  }

  function bindVersionEvents() {
    document.querySelectorAll("[data-rollback]").forEach(button => {
      button.addEventListener("click", () => rollbackVersion(button.dataset.rollback));
    });
  }

  async function loadData(resetSelection) {
    const payload = await AdminShell.api("/admin/content/homepage", { method: "GET" });
    state.homepage = normalizeHomepage(payload.homepage || {});
    state.sections = clone(state.homepage.sections || []);
    state.order = [...state.homepage.order];
    state.versions = Array.isArray(payload.versions) ? payload.versions : [];
    if (!state.selectedId || resetSelection) state.selectedId = state.sections[0]?.id || "hero";
    state.lastSavedKey = snapshotKey(snapshotFromState());
    state.history = [state.lastSavedKey];
    state.future = [];
    state.dirty = false;
    state.saving = false;
    state.status = state.homepage.publishedAt ? "Published" : "Saved";
  }

  async function boot() {
    const user = await AdminShell.init({
      active: "content",
      title: "Content",
      sub: "Visual website editor",
      requires: "settings"
    });
    if (!user) return;
    renderShell();
    await loadData(true);
    renderMetrics();
    renderRail();
    renderInspector();
    renderVersions();
    setStatus(state.homepage.publishedAt ? "Published" : "Saved", false, false);
    bindRailEvents();
    bindInspectorEvents();
    bindVersionEvents();
    wireToolbar();
    loadPreview();
    pushHistory();
    syncPreviewState();
  }

  boot().catch(err => {
    const root = document.getElementById("aContent");
    if (root) {
      root.innerHTML = `<div class="a-empty"><h3>Failed to load content editor</h3><p>${AdminShell.esc(err.message || "Unexpected error")}</p></div>`;
    }
  });
})();
