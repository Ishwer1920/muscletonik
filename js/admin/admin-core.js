/* ===========================================================
   MUSCLE TONIK - Admin console shell + shared utilities.
   Served same-origin, so the API base is always this origin.
   =========================================================== */
const AdminShell = (() => {
  const API_PORT = "4000";

  function resolveApiBase() {
    if (typeof window === "undefined") return "/api";
    if (window.MT_API_BASE_OVERRIDE) return window.MT_API_BASE_OVERRIDE;
    if (window.MT_API_BASE) return window.MT_API_BASE;
    const loc = window.location || {};
    if (loc.protocol === "file:") return "http://localhost:" + API_PORT + "/api";
    const host = loc.hostname || "localhost";
    const port = loc.port || "";
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (isLocal && port && port !== API_PORT) return loc.protocol + "//" + host + ":" + API_PORT + "/api";
    return (loc.origin || "") + "/api";
  }

  const API = resolveApiBase();
  const WORKSPACE_KEY = "mt_admin_workspace";
  const MODE_KEY = "mt_admin_mode";
  const WORKSPACES = [
    { id: "production", label: "Production", tone: "green", note: "Live store" },
    { id: "preview", label: "Preview", tone: "blue", note: "Draft review" },
    { id: "development", label: "Development", tone: "amber", note: "Local testing" },
    { id: "draft", label: "Draft", tone: "gray", note: "Unpublished work" }
  ];

  const I = {
    dashboard: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
    orders: '<svg viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>',
    products: '<svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/></svg>',
    inventory: '<svg viewBox="0 0 24 24"><path d="M20 7 12 3 4 7v10l8 4 8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>',
    customers: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    coupons: '<svg viewBox="0 0 24 24"><path d="M20 12a2 2 0 0 1 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v4a2 2 0 0 1 0 4v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 1-2-2z"/><path d="M9 8v8"/></svg>',
    reviews: '<svg viewBox="0 0 24 24"><path d="m12 2 3 7 7 .5-5.5 4.5 2 7L12 17l-6.5 4 2-7L2 9.5 9 9z"/></svg>',
    content: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
    analytics: '<svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
    team: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    audit_logs: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.6 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 12H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 5 6.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 12 4V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 21 12h.1"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><path d="M3 12h18M3 6h18M3 18h18"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    chevron: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>',
    spark: '<svg viewBox="0 0 24 24"><path d="M12 2 9.2 9.2 2 12l7.2 2.8L12 22l2.8-7.2L22 12l-7.2-2.8z"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 1 0-7l1.5-1.5a5 5 0 0 1 7 7L17 13"/><path d="M14 11a5 5 0 0 1 0 7L12.5 19.5a5 5 0 0 1-7-7L7 11"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    logout: '<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  };

  const NAV = [
    { group: "Overview", items: [{ key: "dashboard", label: "Dashboard", href: "/admin/dashboard.html", icon: "dashboard", built: true }] },
    { group: "Commerce", items: [
      { key: "orders", label: "Orders", href: "/admin/orders.html", icon: "orders", built: true },
      { key: "products", label: "Products", href: "/admin/products.html", icon: "products", built: true },
      { key: "inventory", label: "Inventory", href: "/admin/inventory.html", icon: "inventory", built: true },
      // Crazy Deals / New Arrivals / Near Expiry flags for the storefront.
      // Both are gated on "products" - the permission their endpoints actually
      // require. Without an explicit perm the filter falls back to the key,
      // and "merchandising"/"crazy-deals" are not permissions, so the links
      // were silently dropped from the sidebar for every role.
      { key: "merchandising", perm: "products", label: "Merchandising", href: "/admin/merchandising.html", icon: "products", built: true },
      // Combo offers: 2-100 products bundled at one flat price.
      { key: "crazy-deals", perm: "products", label: "Crazy Deals", href: "/admin/crazy-deals.html", icon: "coupons", built: true },
      { key: "coupons", label: "Coupons", href: "/admin/coupons.html", icon: "coupons", built: true },
      { key: "customers", label: "Customers", href: "/admin/customers.html", icon: "customers", built: true }
    ]},
    { group: "Growth", items: [
      { key: "reports", perm: "analytics", label: "Reports", href: "/admin/reports.html", icon: "analytics", built: true },
      { key: "reviews", label: "Reviews", href: "/admin/reviews.html", icon: "reviews", built: true },
      { key: "content", label: "Content", href: "/admin/content.html", icon: "content", built: true },
      // Gated on "settings" because that is what /api/admin/content/homepage
      // (the endpoint this page reads and writes) actually requires.
      { key: "banners", perm: "settings", label: "Banners", href: "/admin/banners.html", icon: "content", built: true },
      // Banner collection with per-record ordering, scheduling and on/off.
      // The older Banners page still edits the legacy hero/brand-strip JSON.
      { key: "slideshow", perm: "settings", label: "Slideshow", href: "/admin/slideshow.html", icon: "content", built: true },
      // Website announcements shown in the storefront notification bell.
      { key: "alerts", perm: "settings", label: "Alerts", href: "/admin/alerts.html", icon: "bell", built: true }
    ]},
    { group: "Administration", items: [
      { key: "team", label: "Team & Roles", href: "/admin/team.html", icon: "team", built: true },
      { key: "audit_logs", label: "Audit Log", href: "/admin/audit.html", icon: "audit_logs", built: true },
      // Gated on "settings": the page writes SiteSetting "taxes" and product
      // GST overrides, both of which that permission already covers.
      { key: "tax", perm: "settings", label: "Tax & GST", href: "/admin/tax.html", icon: "settings", built: true },
      { key: "settings", label: "Settings", href: "/admin/settings.html", icon: "settings", built: true }
    ]}
  ];

  let current = null;

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function initials(name) {
    return (name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  }

  function roleLabel(r) {
    return (r || "").replace("_", " ");
  }

  function getWorkspace() {
    const stored = readJson(WORKSPACE_KEY, null);
    return WORKSPACES.find(w => w.id === stored) || WORKSPACES[0];
  }

  function getMode() {
    const stored = readJson(MODE_KEY, null);
    return ["admin", "preview", "live"].includes(stored) ? stored : "admin";
  }

  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    writeJson("mt_admin_theme", t);
  }

  function setWorkspace(id) {
    const next = WORKSPACES.find(w => w.id === id) || WORKSPACES[0];
    writeJson(WORKSPACE_KEY, next.id);
    syncWorkspaceUI();
    toast(`Workspace set to ${next.label}`);
  }

  function setMode(mode) {
    const next = ["admin", "preview", "live"].includes(mode) ? mode : "admin";
    writeJson(MODE_KEY, next);
    syncModeUI();
  }

  function previewUrl() {
    return "/index.html?mt_preview=1";
  }

  function liveUrl() {
    return "/index.html";
  }

  function openAdminHome() {
    setMode("admin");
    window.location.href = "/admin/dashboard.html";
  }

  function openPreviewWebsite() {
    setMode("preview");
    window.open(previewUrl(), "_blank", "noopener");
  }

  function openLiveWebsite() {
    setMode("live");
    window.open(liveUrl(), "_blank", "noopener");
  }

  function navActions() {
    const items = [];
    NAV.forEach(group => {
      group.items.forEach(item => {
        items.push({
          label: item.label,
          hint: group.group,
          icon: item.icon,
          action: () => { window.location.href = item.href; }
        });
      });
    });
    return items;
  }

  function staticActions() {
    return [
      { label: "Open admin dashboard", hint: "Admin", icon: "dashboard", action: openAdminHome },
      { label: "Preview website", hint: "Storefront", icon: "spark", action: openPreviewWebsite },
      { label: "Open live website", hint: "Storefront", icon: "link", action: openLiveWebsite },
      { label: "Toggle theme", hint: "Appearance", icon: "sun", action: toggleTheme },
      { label: "Sign out", hint: "Session", icon: "logout", action: logout }
    ];
  }

  // One shared in-flight refresh. Every admin page fires several api() calls
  // at once; letting each of them POST /auth/refresh separately made the tabs
  // race for the same rotating cookie and knocked the session out.
  let refreshInFlight = null;
  function refreshSession() {
    if (!refreshInFlight) {
      refreshInFlight = fetch(API + "/auth/refresh", { method: "POST", credentials: "include" })
        .then(res => res.ok)
        .catch(() => false)
        .finally(() => { refreshInFlight = null; });
    }
    return refreshInFlight;
  }

  async function api(path, options = {}) {
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    if (!isFormData) headers["Content-Type"] = headers["Content-Type"] || "application/json";
    else {
      const lower = {};
      Object.keys(headers).forEach(key => { lower[key.toLowerCase()] = key; });
      if (lower["content-type"]) delete headers[lower["content-type"]];
    }
    const send = () => fetch(API + path, {
      ...options,
      headers,
      credentials: "include",
      // Admin data is always live; never serve a stale cached copy (e.g. a
      // product list that still shows a just-deleted product after refresh).
      cache: "no-store"
    });
    let res = await send();
    if (res.status === 401) {
      if (await refreshSession()) res = await send();
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errs = Array.isArray(data.errors) ? data.errors.map(e => e.msg || e.message).filter(Boolean) : [];
      const err = new Error(errs.length ? errs.join(" ") : (data.message || "Request failed"));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function renderSidebar(perms, active) {
    const can = k => perms.includes(k);
    const workspace = getWorkspace();
    const groups = NAV.map(g => {
      // `key` identifies the page (for highlighting); `perm` is the permission
      // that gates it. They differ where several pages share one permission —
      // e.g. Content and Banners both sit behind "content".
      const items = g.items.filter(it => can(it.perm || it.key));
      if (!items.length) return "";
      const links = items.map(it => `
        <a href="${it.href}" class="${it.key === active ? "active" : ""}">
          ${I[it.icon] || ""}
          <span class="label">${it.label}</span>
        </a>
      `).join("");
      return `<div class="group-label">${g.group}</div>${links}`;
    }).join("");

    return `
      <div class="a-sidebar-shell">
        <div class="a-brand">
          <span class="logo">${I.dashboard}</span>
          <span class="txt">MUSCLE <b>TONIK</b></span>
        </div>
        <div class="a-workspace">
          <div class="a-workspace-label">Workspace</div>
          <button class="a-workspace-trigger" id="aWorkspaceToggle" type="button" aria-haspopup="true" aria-expanded="false">
            <span>
              <strong>Muscle Tonik</strong>
              <small>${workspace.label}</small>
            </span>
            <span class="a-workspace-chevron">${I.chevron}</span>
          </button>
          <div class="a-workspace-menu" id="aWorkspaceMenu" role="menu">
            ${WORKSPACES.map(w => `
              <button type="button" class="a-workspace-option ${w.id === workspace.id ? "active" : ""}" data-workspace="${w.id}" role="menuitem">
                <span>
                  <strong>${w.label}</strong>
                  <small>${w.note}</small>
                </span>
                <span class="badge ${w.tone}">${w.id}</span>
              </button>
            `).join("")}
          </div>
        </div>
        <nav class="a-nav">${groups}</nav>
        <div class="a-sidebar-foot">
          <div class="a-mini-card">
            <div>
              <strong>Preview workflow</strong>
              <p>Draft, review and publish without touching backend routes.</p>
            </div>
            <button class="a-btn ghost" type="button" id="aSidebarPreviewBtn">${I.spark}Preview</button>
          </div>
          <div class="a-quick-actions">
            <button type="button" class="a-quick-link" data-action="review">Request Review</button>
            <button type="button" class="a-quick-link" data-action="share">Share Preview</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderTopbar(title, sub) {
    const theme = document.documentElement.dataset.theme === "dark" ? I.sun : I.moon;
    const mode = getMode();
    return `
      <button class="a-icon-btn" id="aMenuBtn" aria-label="Toggle menu">${I.menu}</button>
      <div class="a-crumb">${title}${sub ? `<small>${sub}</small>` : ""}</div>
      <div class="a-search">
        <span>${I.search}</span>
        <input id="aGlobalSearch" placeholder="Search sections, products, orders..." autocomplete="off">
      </div>
      <button class="a-chip-btn" id="aPaletteBtn" type="button">Ctrl K</button>
      <div class="a-mode-switcher" role="tablist" aria-label="Storefront mode">
        <button type="button" class="${mode === "admin" ? "active" : ""}" data-mode="admin">Admin</button>
        <button type="button" class="${mode === "preview" ? "active" : ""}" data-mode="preview">Preview Website</button>
        <button type="button" class="${mode === "live" ? "active" : ""}" data-mode="live">Live Website</button>
      </div>
      <div class="a-topbar-right">
        <button class="a-icon-btn" id="aNotifyBtn" aria-label="Notifications">${I.bell}</button>
        <button class="a-icon-btn" id="aThemeBtn" aria-label="Toggle theme">${theme}</button>
        <div class="a-user" id="aUserMenu">
          <div class="a-avatar">${initials(current?.name)}</div>
          <div class="who"><b>${current?.name || "Admin"}</b><span>${roleLabel(current?.role)}</span></div>
        </div>
        <button class="a-icon-btn" id="aLogoutBtn" aria-label="Log out">${I.logout}</button>
      </div>
    `;
  }

  function renderCommandPalette(filter = "") {
    const list = document.getElementById("aCommandList");
    if (!list) return;
    const query = filter.trim().toLowerCase();
    const items = [...navActions(), ...staticActions()].filter(item => {
      const text = `${item.label} ${item.hint || ""}`.toLowerCase();
      return !query || text.includes(query);
    });
    if (!items.length) {
      list.innerHTML = `<div class="a-command-empty">No matches. Try Products, Orders, Preview, or Theme.</div>`;
      return;
    }
    list.innerHTML = items.map((item, index) => `
      <button type="button" class="a-command-item" data-index="${index}">
        <span class="a-command-ic">${I[item.icon] || I.spark}</span>
        <span class="a-command-copy">
          <strong>${item.label}</strong>
          <small>${item.hint || ""}</small>
        </span>
        <span class="a-command-kbd">Enter</span>
      </button>
    `).join("");
    list.querySelectorAll(".a-command-item").forEach((btn, idx) => {
      btn.addEventListener("click", () => {
        const item = items[idx];
        closeCommandPalette();
        if (item && typeof item.action === "function") item.action();
      });
    });
  }

  function ensureChrome() {
    if (document.getElementById("aCommandBackdrop")) return;
    const shell = document.createElement("div");
    shell.innerHTML = `
      <div class="a-command-backdrop" id="aCommandBackdrop"></div>
      <div class="a-command" id="aCommandPalette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="a-command-head">
          <div>
            <strong>Command Palette</strong>
            <p>Search pages, launch workflows, and switch modes.</p>
          </div>
          <button class="a-icon-btn" type="button" id="aCommandClose" aria-label="Close command palette">${I.x}</button>
        </div>
        <div class="a-command-search">
          <span>${I.search}</span>
          <input id="aCommandInput" type="text" placeholder="Search products, orders, preview..." autocomplete="off">
        </div>
        <div class="a-command-list" id="aCommandList"></div>
      </div>
      <div class="a-notify-menu" id="aNotifyMenu" aria-label="Notifications">
        <strong>Notifications</strong>
        <div class="a-notify-item">
          <span class="dot"></span>
          <div>
            <b>Preview link ready</b>
            <small>Share the current draft with teammates.</small>
          </div>
        </div>
        <div class="a-notify-item">
          <span class="dot"></span>
          <div>
            <b>2 products need review</b>
            <small>Images and copy are ready for approval.</small>
          </div>
        </div>
        <button type="button" class="a-btn ghost a-notify-cta" id="aNotifyAudit">Open Audit Log</button>
      </div>
      <div class="a-profile-menu" id="aProfileMenu" aria-label="Profile menu">
        <div class="a-profile-head">
          <strong>${current?.name || "Admin"}</strong>
          <small>${roleLabel(current?.role)}</small>
        </div>
        <a href="/admin/team.html">Team & Roles</a>
        <a href="/admin/audit.html">Audit Log</a>
        <button type="button" id="aProfileSignOut">Sign out</button>
      </div>
    `;
    document.body.appendChild(shell);
  }

  function toggleTheme() {
    const dark = document.documentElement.dataset.theme === "dark";
    setTheme(dark ? "light" : "dark");
    document.getElementById("aThemeBtn").innerHTML = dark ? I.moon : I.sun;
  }

  function toggleWorkspaceMenu(force) {
    const menu = document.getElementById("aWorkspaceMenu");
    const btn = document.getElementById("aWorkspaceToggle");
    if (!menu || !btn) return;
    const open = typeof force === "boolean" ? force : !menu.classList.contains("open");
    menu.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
  }

  function toggleNotifyMenu(force) {
    const menu = document.getElementById("aNotifyMenu");
    if (!menu) return;
    const open = typeof force === "boolean" ? force : !menu.classList.contains("open");
    menu.classList.toggle("open", open);
  }

  function toggleProfileMenu(force) {
    const menu = document.getElementById("aProfileMenu");
    if (!menu) return;
    const open = typeof force === "boolean" ? force : !menu.classList.contains("open");
    menu.classList.toggle("open", open);
  }

  function syncWorkspaceUI() {
    const btn = document.getElementById("aWorkspaceToggle");
    const menu = document.getElementById("aWorkspaceMenu");
    const workspace = getWorkspace();
    if (btn) {
      const label = btn.querySelector("small");
      if (label) label.textContent = workspace.label;
      btn.setAttribute("aria-expanded", menu ? String(menu.classList.contains("open")) : "false");
    }
    if (menu) {
      menu.querySelectorAll(".a-workspace-option").forEach(opt => {
        opt.classList.toggle("active", opt.dataset.workspace === workspace.id);
      });
    }
  }

  function syncModeUI() {
    document.querySelectorAll(".a-mode-switcher [data-mode]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mode === getMode());
    });
  }

  function openCommandPalette() {
    const back = document.getElementById("aCommandBackdrop");
    const palette = document.getElementById("aCommandPalette");
    const input = document.getElementById("aCommandInput");
    if (!back || !palette || !input) return;
    back.classList.add("open");
    palette.classList.add("open");
    renderCommandPalette(input.value);
    requestAnimationFrame(() => input.focus());
    document.body.style.overflow = "hidden";
  }

  function closeCommandPalette() {
    const back = document.getElementById("aCommandBackdrop");
    const palette = document.getElementById("aCommandPalette");
    if (back) back.classList.remove("open");
    if (palette) palette.classList.remove("open");
    if (
      !document.querySelector(".a-modal-back.open") &&
      !document.querySelector(".a-notify-menu.open") &&
      !document.querySelector(".a-profile-menu.open") &&
      !document.querySelector(".a-workspace-menu.open")
    ) {
      document.body.style.overflow = "";
    }
  }

  function wireGlobalSearch() {
    const input = document.getElementById("aGlobalSearch");
    if (!input) return;
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      document.querySelectorAll(".a-nav a").forEach(a => {
        const t = a.querySelector(".label")?.textContent.toLowerCase() || "";
        a.style.display = !q || t.includes(q) ? "" : "none";
      });
    });
  }

  function wireChrome() {
    const layout = document.querySelector(".admin-layout");
    const isMobile = () => window.matchMedia("(max-width:860px)").matches;

    document.getElementById("aMenuBtn")?.addEventListener("click", () => {
      if (isMobile()) {
        layout.classList.toggle("mobile-open");
      } else {
        layout.classList.toggle("collapsed");
        writeJson("mt_admin_collapsed", layout.classList.contains("collapsed") ? "1" : "0");
      }
    });
    document.querySelector(".a-backdrop")?.addEventListener("click", () => layout.classList.remove("mobile-open"));

    document.getElementById("aThemeBtn")?.addEventListener("click", toggleTheme);
    document.getElementById("aPaletteBtn")?.addEventListener("click", openCommandPalette);
    document.getElementById("aCommandBackdrop")?.addEventListener("click", closeCommandPalette);
    document.getElementById("aCommandClose")?.addEventListener("click", closeCommandPalette);
    document.getElementById("aNotifyBtn")?.addEventListener("click", e => { e.stopPropagation(); toggleNotifyMenu(); });
    document.getElementById("aWorkspaceToggle")?.addEventListener("click", e => { e.stopPropagation(); toggleWorkspaceMenu(); });
    document.getElementById("aSidebarPreviewBtn")?.addEventListener("click", openPreviewWebsite);
    document.getElementById("aNotifyAudit")?.addEventListener("click", () => { toggleNotifyMenu(false); window.location.href = "/admin/audit.html"; });
    document.getElementById("aProfileSignOut")?.addEventListener("click", logout);
    document.getElementById("aUserMenu")?.addEventListener("click", e => { e.stopPropagation(); toggleProfileMenu(); });
    document.getElementById("aCommandInput")?.addEventListener("input", e => renderCommandPalette(e.target.value));
    document.getElementById("aCommandInput")?.addEventListener("keydown", e => {
      if (e.key === "Escape") closeCommandPalette();
      if (e.key === "Enter") {
        const first = document.querySelector("#aCommandList .a-command-item");
        if (first) first.click();
      }
    });

    document.querySelectorAll(".a-workspace-option").forEach(btn => {
      btn.addEventListener("click", () => setWorkspace(btn.dataset.workspace));
    });
    document.querySelectorAll(".a-mode-switcher [data-mode]").forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode;
        setMode(mode);
        if (mode === "admin") openAdminHome();
        else if (mode === "preview") openPreviewWebsite();
        else openLiveWebsite();
      });
    });
    document.querySelectorAll(".a-quick-link").forEach(btn => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        if (action === "review") {
          toast("Review request sent to your team");
        } else if (action === "share") {
          const url = window.location.origin + previewUrl();
          if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => toast("Preview link copied"));
          } else {
            toast("Preview link ready");
          }
        }
      });
    });

    document.addEventListener("click", e => {
      const inside = e.target.closest(".a-workspace") || e.target.closest(".a-profile-menu") || e.target.closest(".a-notify-menu") || e.target.closest(".a-mode-switcher") || e.target.closest("#aCommandPalette");
      if (!inside) {
        toggleWorkspaceMenu(false);
        toggleNotifyMenu(false);
        toggleProfileMenu(false);
      }
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        closeCommandPalette();
        toggleWorkspaceMenu(false);
        toggleNotifyMenu(false);
        toggleProfileMenu(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openCommandPalette();
      }
    });

    wireGlobalSearch();
    syncWorkspaceUI();
    syncModeUI();
  }

  function accessDenied(root, msg) {
    root.innerHTML = `<div class="a-empty"><h3>Access denied</h3><p>${msg || "You don't have permission to view this area."}</p><a class="a-btn primary" href="/login.html" style="margin-top:14px;">Sign in as admin</a></div>`;
  }

  // Keep the session warm for as long as an admin tab is open. There is no
  // idle timer in this panel by design — an admin is never signed out for
  // sitting still, only by clicking Sign out or by the refresh token expiring.
  const KEEPALIVE_MS = 10 * 60 * 1000;
  let keepAliveTimer = null;
  function startKeepAlive() {
    if (keepAliveTimer) return;
    keepAliveTimer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      refreshSession();
    }, KEEPALIVE_MS);
    // A laptop waking from sleep, or a tab pulled back to the front after
    // hours, gets an immediate top-up instead of one failed request first.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshSession();
    });
  }

  async function logout() {
    try { await fetch(API + "/auth/logout", { method: "POST", credentials: "include" }); } catch {}
    localStorage.removeItem("mt_user");
    window.location.href = "/login.html";
  }

  async function init({ active, title, sub, requires }) {
    setTheme(readJson("mt_admin_theme", null) || (window.matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light"));
    const layout = document.querySelector(".admin-layout");
    if (readJson("mt_admin_collapsed", null) === "1") layout.classList.add("collapsed");

    ensureChrome();

    const content = document.getElementById("aContent");
    try {
      const me = await api("/admin/me", { method: "GET" });
      current = me.user;
    } catch (err) {
      if (err.status === 403) {
        document.getElementById("aSidebar").innerHTML = "";
        accessDenied(content, "This account is not an admin.");
      } else {
        window.location.href = "/login.html?next=" + encodeURIComponent(window.location.pathname);
      }
      return null;
    }

    document.getElementById("aSidebar").innerHTML = renderSidebar(current.permissions, active);
    document.getElementById("aTopbar").innerHTML = renderTopbar(title, sub);
    wireChrome();
    renderCommandPalette("");

    if (requires && !current.permissions.includes(requires)) {
      accessDenied(content, `Your role (${roleLabel(current.role)}) cannot access ${title}.`);
      return null;
    }
    startKeepAlive();
    return current;
  }

  function toast(msg, type = "ok") {
    let wrap = document.querySelector(".a-toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "a-toast-wrap";
      document.body.appendChild(wrap);
    }
    const t = document.createElement("div");
    t.className = "a-toast " + (type === "err" ? "err" : "ok");
    t.textContent = msg;
    wrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 300);
    }, 3200);
  }

  const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = d => d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";

  return {
    init,
    api,
    refreshSession,
    toast,
    inr,
    esc,
    fmtDate,
    get current() { return current; },
    openPreviewWebsite,
    openLiveWebsite,
    openAdminHome,
    setWorkspace,
    setMode
  };
})();
