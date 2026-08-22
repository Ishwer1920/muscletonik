/* ===========================================================
   MUSCLE TONIK - Core behaviors, shared layout, cards, search
   Include data.js BEFORE this file on every page.
   =========================================================== */

const Store = {
  get(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value === null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
};

const PREVIEW_MODE_KEY = "mt_preview_mode";
const PREVIEW_SYNC_CHANNEL = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("mt-preview") : null;

if (PREVIEW_SYNC_CHANNEL) {
  PREVIEW_SYNC_CHANNEL.onmessage = event => {
    if (event?.data?.type === "cms-updated" || event?.data?.type === "catalog-updated") {
      window.location.reload();
    }
  };
}

function isPreviewMode() {
  try {
    if (new URLSearchParams(window.location.search).get("mt_preview") === "1") return true;
  } catch {}
  return !!Store.get(PREVIEW_MODE_KEY, false);
}

function setPreviewMode(active) {
  Store.set(PREVIEW_MODE_KEY, !!active);
}

const Cart = {
  items() { return Store.get("mt_cart", []); },
  save(items) { Store.set("mt_cart", items); updateHeaderCounts(); },
  add(id, qty) {
    qty = qty || 1;
    const items = this.items();
    const found = items.find(i => i.id === Number(id));
    if (found) found.qty += qty;
    else items.push({ id: Number(id), qty });
    this.save(items);
    showToast("Added to cart");
  },
  remove(id) {
    this.save(this.items().filter(i => i.id !== Number(id)));
    showToast("Removed from cart");
  },
  setQty(id, qty) {
    const items = this.items();
    const found = items.find(i => i.id === Number(id));
    if (found) {
      found.qty = Math.max(1, qty);
      this.save(items);
    }
  },
  count() {
    return this.items().reduce((sum, item) => sum + item.qty, 0);
  },
  clear() { this.save([]); },
  total() {
    return this.items().reduce((sum, item) => {
      const product = getProductById(item.id);
      return product ? sum + product.price * item.qty : sum;
    }, 0);
  }
};

const Wishlist = {
  items() { return Store.get("mt_wishlist", []); },
  has(id) { return this.items().includes(Number(id)); },
  toggle(id) {
    id = Number(id);
    let items = this.items();
    if (items.includes(id)) {
      items = items.filter(i => i !== id);
      showToast("Removed from wishlist");
    } else {
      items.push(id);
      showToast("Added to wishlist");
    }
    Store.set("mt_wishlist", items);
    updateHeaderCounts();
    document.querySelectorAll('[data-wish="' + id + '"]').forEach(el => {
      el.classList.toggle("active", Wishlist.has(id));
    });
  }
};

function updateHeaderCounts() {
  document.querySelectorAll(".cart-count").forEach(el => el.textContent = Cart.count());
  document.querySelectorAll(".wish-count").forEach(el => el.textContent = Wishlist.items().length);
  const drawer = document.getElementById("cartDrawer");
  if (drawer && drawer.classList.contains("open")) renderCartDrawer();
}

function updateAuthUI() {
  const user = Store.get("mt_user", null);
  const link = document.getElementById("headerAuthLink");
  const mobileLink = document.getElementById("mobileAuthLink");
  if (link) {
    link.href = user ? "dashboard.html" : "login.html";
    link.innerHTML = icon("user", 20) + (user && user.name ? user.name.split(" ")[0] : "Login");
  }
  if (mobileLink) {
    mobileLink.href = user ? "dashboard.html" : "login.html";
    mobileLink.textContent = user ? "My Account" : "Login / Sign Up";
  }
}

/* ===========================================================
   Shared authentication helpers (available on every page via core.js).
   The server is the source of truth: httpOnly cookies carry the tokens,
   these helpers just talk to the API and mirror the user into Store for
   the header UI. Tokens are never stored in JS/localStorage.
   =========================================================== */
function mtApiBase() {
  if (typeof window !== "undefined" && window.MT_API_BASE) return window.MT_API_BASE;
  if (typeof getApiBase === "function") return getApiBase();
  return (window.location && window.location.origin ? window.location.origin : "") + "/api";
}

// Authenticated API call with a single silent refresh-retry on 401. Used by
// protected customer pages (dashboard, profile). Throws with .status set.
async function mtAuthFetch(path, options) {
  const base = mtApiBase();
  const send = () => fetch(base + path, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    ...options
  });
  let res = await send();
  if (res.status === 401) {
    if (await mtRefreshSession()) res = await send();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const validation = Array.isArray(data.errors) ? data.errors.map(e => e.msg || e.message).filter(Boolean) : [];
    const err = new Error(validation.length ? validation.join(" ") : (data.message || "Request failed"));
    err.status = res.status;
    throw err;
  }
  return data;
}

// Fetch the live authenticated user from the backend (source of truth).
// Returns the user object, or null if not authenticated. Keeps Store in sync.
async function fetchCurrentUser() {
  try {
    const data = await mtAuthFetch("/auth/me", { method: "GET" });
    if (data && data.user) {
      Store.set("mt_user", data.user);
      updateAuthUI();
      return data.user;
    }
  } catch (err) {
    Store.set("mt_user", null);
    updateAuthUI();
  }
  return null;
}

// Guard a protected page. If the visitor is not authenticated, redirect to
// login with a ?next= back-link and return null. Otherwise return the user.
async function requireClientAuth() {
  const user = await fetchCurrentUser();
  if (!user) {
    const here = window.location.pathname.replace(/^\//, "") + window.location.search;
    window.location.replace("login.html?next=" + encodeURIComponent(here));
    return null;
  }
  return user;
}

// Centralized logout: revoke the session server-side, clear local state,
// then return to login. Safe to wire to an <a onclick="return logoutUser(event)">.
async function logoutUser(event) {
  if (event) event.preventDefault();
  try {
    await fetch(mtApiBase() + "/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "include"
    });
  } catch (err) {
    /* even if the network call fails, clear the local session below */
  }
  Store.set("mt_user", null);
  updateAuthUI();
  window.location.href = "login.html";
  return false;
}

function previewRibbonHTML() {
  if (!isPreviewMode()) return "";
  return `
    <div class="preview-ribbon">
      <div class="preview-ribbon-copy">
        <strong>Preview mode</strong>
        <span>Changes stay private until the team approves and publishes them.</span>
      </div>
      <div class="preview-ribbon-actions">
        <button type="button" class="preview-ribbon-btn" id="previewExitBtn">Exit preview</button>
        <a href="/admin/dashboard.html" class="preview-ribbon-link">Open admin</a>
      </div>
    </div>
  `;
}

const DEFAULT_TOP_OFFERS = [
  "Free Shipping above Rs 999",
  "Flat 10% OFF on your First Order",
  "100% Authentic Products",
  "Fast Delivery across India",
  "New Launches every week"
];

function resolveTopOffers() {
  const content = (window.MT_SHARED_CATALOG && window.MT_SHARED_CATALOG.siteContent) || SITE_CONTENT || {};
  const announcement = content.announcement || {};
  const offers = [];
  if (announcement.visible !== false && announcement.text) offers.push(announcement.text);
  return [...offers, ...DEFAULT_TOP_OFFERS.filter(item => item !== announcement.text)];
}

function initTopOffers() {
  const track = document.getElementById("offerTrack");
  if (!track) return;
  // Clear any interval left over from a previous header render so it doesn't
  // keep firing against detached DOM nodes.
  clearInterval(window.__mtOffersTimer);
  const offers = resolveTopOffers();
  track.innerHTML = offers.map((t, i) =>
    '<span class="offer-item' + (i === 0 ? " active" : "") + '">' + escapeHtml(t) + "</span>"
  ).join("");
  const items = track.querySelectorAll(".offer-item");
  let idx = 0;
  let timer;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function show(n) {
    idx = (n + items.length) % items.length;
    items.forEach((item, i) => item.classList.toggle("active", i === idx));
  }
  function restart() {
    clearInterval(timer);
    if (!reduceMotion) timer = window.__mtOffersTimer = setInterval(() => show(idx + 1), 4500);
  }
  restart();

  const prev = document.getElementById("offerPrev");
  const next = document.getElementById("offerNext");
  if (prev) prev.addEventListener("click", () => { show(idx - 1); restart(); });
  if (next) next.addEventListener("click", () => { show(idx + 1); restart(); });

  const bar = document.querySelector(".topbar");
  if (bar) {
    bar.addEventListener("mouseenter", () => clearInterval(timer));
    bar.addEventListener("mouseleave", restart);
  }
}

function showToast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

const ICONS = {
  flask: '<path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>',
  trend: '<path d="M3 17l5-5 4 4 8-9"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 10-12h-7l1-8Z"/>',
  flame: '<path d="M12 2c2 3-2 5 0 8 3 3 4 6 0 10-5-1-9-5-9-10C3 6 8 4 12 2Z"/>',
  layers: '<path d="M12 3 2 9l10 6 10-6-10-6Z"/><path d="M2 14l10 6 10-6"/>',
  drop: '<path d="M12 2s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12Z"/>',
  shield: '<path d="M12 2 4 6v6c0 5 4 8 8 10 4-2 8-5 8-10V6l-8-4Z"/>',
  jar: '<rect x="6" y="8" width="12" height="13" rx="2"/><path d="M9 8V5h6v3"/>',
  bowl: '<path d="M3 12h18a9 6 0 0 1-18 0Z"/><path d="M5 12V8M19 12V8"/>',
  bar: '<rect x="3" y="9" width="18" height="6" rx="2"/>',
  star: '<path d="M12 2l3 6 6 .9-4.5 4.3 1 6.3L12 16.7 6.5 19.5l1-6.3L3 8.9 9 8l3-6Z"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>'
};

function icon(name, size) {
  size = size || 20;
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || "") + "</svg>";
}

function productImage(p) {
  const imageUrl = Array.isArray(p.images) && p.images.length ? p.images[0] : "";
  if (imageUrl) {
    return '<img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(p.name || "Product") + '" loading="lazy">';
  }
  const tone = p.color || "#ff7a00";
  return '<svg width="90" height="108" viewBox="0 0 90 108" aria-hidden="true">' +
    '<rect x="20" y="14" width="50" height="80" rx="14" fill="' + tone + '"/>' +
    '<rect x="30" y="4" width="30" height="16" rx="6" fill="#111111"/>' +
    '<rect x="25" y="42" width="40" height="22" rx="4" fill="rgba(255,255,255,.92)"/>' +
    '<rect x="29" y="48" width="32" height="4" rx="2" fill="' + tone + '"/>' +
    '<rect x="29" y="56" width="22" height="3" rx="1.5" fill="#111111"/>' +
    "</svg>";
}

// Merchandising badges on a product card. Ordered by how much they should
// pull the eye, and capped at the two that matter so a card never turns into
// a wall of pills.
function productFlagBadges(p) {
  const out = [];
  if (p.crazyDeal) out.push('<span class="badge badge-crazy">CRAZY DEAL</span>');
  if (p.newArrival) out.push('<span class="badge badge-new">NEW</span>');
  if (p.nearExpiry) {
    const days = Number(p.daysToExpiry);
    out.push('<span class="badge badge-expiry">' +
      (isFinite(days) && days > 0 ? "EXPIRES IN " + days + "D" : "NEAR EXPIRY") + "</span>");
  }
  return out.slice(0, 2).join("");
}

function starString(rating) {
  const full = Math.round(rating);
  return '<span class="s">' + "★".repeat(full) + "☆".repeat(5 - full) + "</span>";
}

function getProductOff(p) {
  return discountPct(p.price, p.oldPrice);
}

function getProductAvailabilityLabel(p) {
  const stock = Number.isFinite(p.stock) ? p.stock : Math.max(0, 14 - (p.id % 9));
  if (stock <= 0) return "Out of Stock";
  if (stock <= 3) return "Almost Sold Out";
  if (stock <= 8) return "Only Few Left";
  return "In Stock";
}

function getProductDeliveryEstimate(p) {
  return p.id % 3 === 0 ? "Delivery by tomorrow" : "Delivery in 2-4 days";
}

function getTopProducts(limit) {
  return [...PRODUCTS].sort((a, b) => b.reviews - a.reviews).slice(0, limit || 4);
}

function getTrendingProducts(limit) {
  return [...PRODUCTS].sort((a, b) => getProductOff(b) - getProductOff(a)).slice(0, limit || 4);
}

function getLatestProducts(limit) {
  return [...PRODUCTS].slice().sort((a, b) => b.id - a.id).slice(0, limit || 4);
}

function shareProduct(p) {
  const url = window.location.origin + "/product.html?id=" + p.id;
  if (navigator.share) {
    navigator.share({ title: p.name, text: p.short || p.desc || p.name, url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => showToast("Product link copied"));
  } else {
    showToast("Share not supported in this browser");
  }
}

const Compare = {
  items() { return Store.get("mt_compare", []); },
  has(id) { return this.items().includes(Number(id)); },
  toggle(id) {
    id = Number(id);
    let items = this.items();
    if (items.includes(id)) {
      items = items.filter(i => i !== id);
      showToast("Removed from compare");
    } else {
      items = [...items, id].slice(-4);
      showToast("Added to compare");
    }
    Store.set("mt_compare", items);
    document.querySelectorAll('[data-compare="' + id + '"]').forEach(el => {
      el.classList.toggle("active", Compare.has(id));
    });
  }
};

function renderProductCard(p) {
  const brand = getBrandById(p.brand);
  const off = getProductOff(p);
  const wished = Wishlist.has(p.id);
  const stockLabel = getProductAvailabilityLabel(p);
  const delivery = getProductDeliveryEstimate(p);
  const flavorLine = [p.flavor, p.weight, p.protein ? p.protein + " protein" : "", p.servings ? p.servings + " servings" : ""].filter(Boolean).join(" · ");
  const weightTag = p.weight ? '<span class="prod-weight">' + escapeHtml(p.weight) + "</span>" : "";
  return (
    '<div class="prod-card reveal">' +
      '<a class="prod-media" style="background:' + p.color + '18" href="product.html?id=' + p.id + '">' +
        '<div class="badges">' + productFlagBadges(p) + '<span class="badge badge-orange">' + off + '% OFF</span>' + (p.badge ? '<span class="badge badge-dark">' + p.badge + "</span>" : "") + "</div>" +
        '<button class="prod-wish' + (wished ? " active" : "") + '" data-wish="' + p.id + '" onclick="event.preventDefault();Wishlist.toggle(' + p.id + ')" aria-label="Toggle wishlist">' + icon("heart", 17) + "</button>" +
        '<div class="prod-media-art">' + productImage(p) + "</div>" +
      "</a>" +
      '<div class="prod-body">' +
        '<div class="prod-brand-row"><span class="brand">' + (brand ? brand.name : "") + "</span>" + weightTag + "</div>" +
        '<h4><a href="product.html?id=' + p.id + '">' + p.name + "</a></h4>" +
        '<div class="prod-stars">' + starString(p.rating) + " " + p.rating + " (" + p.reviews.toLocaleString("en-IN") + ")</div>" +
        '<div class="prod-price"><span class="now">' + formatINR(p.price) + '</span><span class="was">' + formatINR(p.oldPrice) + '</span><span class="off">' + off + "% off</span></div>" +
        '<button class="add-cart-btn" onclick="Cart.add(' + p.id + ')">Add to Cart</button>' +
      "</div>" +
      '<div class="prod-hover">' +
        '<div class="prod-hover-top">' +
          '<div class="prod-hover-image" style="background:' + p.color + '18">' + productImage(p).replace('width="90" height="108"', 'width="120" height="144"') + "</div>" +
          '<div class="prod-hover-copy">' +
            '<div class="prod-hover-meta"><span class="badge badge-green">' + stockLabel + '</span><span class="prod-hover-delivery">' + delivery + "</span></div>" +
            '<h5>' + p.name + "</h5>" +
            '<p>' + escapeHtml(p.short || p.desc || "") + "</p>" +
            '<div class="prod-hover-spec">' + escapeHtml(flavorLine || (p.ingredients || "").slice(0, 90)) + "</div>" +
          "</div>" +
        "</div>" +
        '<div class="prod-hover-actions">' +
          '<button type="button" class="btn btn-dark btn-sm" onclick="event.preventDefault();event.stopPropagation();Cart.add(' + p.id + ');">Add to Cart</button>' +
          '<button type="button" class="btn btn-primary btn-sm" onclick="event.preventDefault();event.stopPropagation();Cart.add(' + p.id + ');window.location.href=\'cart.html\';">Buy Now</button>' +
          '<button type="button" class="btn-icon ' + (wished ? "active" : "") + '" data-wish="' + p.id + '" onclick="event.preventDefault();event.stopPropagation();Wishlist.toggle(' + p.id + ')">' + icon("heart", 17) + "</button>" +
          '<button type="button" class="btn-icon' + (Compare.has(p.id) ? " active" : "") + '" data-compare="' + p.id + '" onclick="event.preventDefault();event.stopPropagation();Compare.toggle(' + p.id + ')">⇄</button>' +
          '<button type="button" class="btn-icon" onclick="event.preventDefault();event.stopPropagation();shareProduct(PRODUCTS.find(function(item){return item.id===' + p.id + ';}))">' + icon("bolt", 17) + "</button>" +
          '<a class="btn btn-outline btn-sm" href="product.html?id=' + p.id + '">View Details</a>' +
        "</div>" +
      "</div>" +
    "</div>"
  );
}

function menuBrandCount(id) {
  return PRODUCTS.filter(p => p.brand === id).length;
}

function menuCategoryCount(id) {
  return PRODUCTS.filter(p => p.category === id).length;
}

function renderMegaCategoryMenu() {
  const focusCategories = [CATEGORIES[0], CATEGORIES[1], CATEGORIES[2], CATEGORIES[3], CATEGORIES[6]].filter(Boolean);
  const goalLinks = GOALS.map(goal => `<a href="marketplace.html?search=${encodeURIComponent(goal.name)}">${goal.name}</a>`).join("");
  const promoProducts = getTrendingProducts(3);
  return `
    <div class="mega-menu mega-categories">
      <div class="mega-grid">
        <div class="mega-column">
          <span class="mega-label">Featured Categories</span>
          <div class="mega-links">
            ${focusCategories.map(c => `<a href="marketplace.html?category=${c.id}"><span>${c.name}</span><small>${menuCategoryCount(c.id)} products</small></a>`).join("")}
          </div>
        </div>
        <div class="mega-column">
          <span class="mega-label">Fitness Goals</span>
          <div class="mega-links goal-links">${goalLinks}</div>
        </div>
        <div class="mega-column mega-column-wide">
          <span class="mega-label">Trending Supplements</span>
          <div class="mega-product-list">
            ${promoProducts.map(p => `
              <a class="mega-product-card" href="product.html?id=${p.id}">
                <span class="thumb" style="background:${p.color}18">${productImage(p)}</span>
                <span class="copy">
                  <b>${p.name}</b>
                  <small>${formatINR(p.price)} · ${getProductAvailabilityLabel(p)}</small>
                </span>
              </a>
            `).join("")}
          </div>
        </div>
        <div class="mega-banner">
          <span class="badge badge-orange">Seasonal offer</span>
          <h3>Shop goal-based bundles with premium value.</h3>
          <p>Discover protein, recovery and performance picks with fast dispatch and clean UI.</p>
          <a href="offers.html" class="btn btn-dark btn-sm">Explore deals</a>
        </div>
      </div>
    </div>
  `;
}

function renderMegaProductsMenu() {
  const best = getTopProducts(4);
  const latest = getLatestProducts(4);
  return `
    <div class="mega-menu mega-products">
      <div class="mega-grid">
        <div class="mega-column mega-column-wide">
          <span class="mega-label">Best Sellers</span>
          <div class="mega-product-list">
            ${best.map(p => `
              <a class="mega-product-card" href="product.html?id=${p.id}">
                <span class="thumb" style="background:${p.color}18">${productImage(p)}</span>
                <span class="copy">
                  <b>${p.name}</b>
                  <small>${formatINR(p.price)} · ${starString(p.rating)}</small>
                </span>
              </a>
            `).join("")}
          </div>
        </div>
        <div class="mega-column">
          <span class="mega-label">Latest Arrivals</span>
          <div class="mega-links">
            ${latest.map(p => `<a href="product.html?id=${p.id}"><span>${p.name}</span><small>${formatINR(p.price)}</small></a>`).join("")}
          </div>
        </div>
        <div class="mega-column">
          <span class="mega-label">Quick Actions</span>
          <div class="mega-links quick-links">
            <a href="marketplace.html">Browse all products</a>
            <a href="marketplace.html?collection=crazy-deals">Crazy Deals</a>
            <a href="marketplace.html?collection=new-arrivals">New Arrivals</a>
            <a href="marketplace.html?collection=near-expiry">Near Expiry</a>
            <a href="marketplace.html?sort=discount">Highest discounts</a>
            <a href="offers.html">Limited-time offers</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderMegaBrandsMenu() {
  const brandCards = BRANDS.slice(0, 6);
  const featured = brandCards.slice(0, 3);
  return `
    <div class="mega-menu mega-brands">
      <div class="mega-grid">
        <div class="mega-column">
          <span class="mega-label">Featured Brands</span>
          <div class="brand-tiles">
            ${featured.map(b => `
              <a class="brand-tile" href="marketplace.html?brand=${b.id}">
                <span class="brand-mark" style="background:${b.color}">${b.initials}</span>
                <span>
                  <b>${b.name}</b>
                  <small>${menuBrandCount(b.id)} products</small>
                </span>
              </a>
            `).join("")}
          </div>
        </div>
        <div class="mega-column">
          <span class="mega-label">All Brands</span>
          <div class="mega-links">
            ${brandCards.map(b => `<a href="marketplace.html?brand=${b.id}"><span>${b.name}</span><small>${menuBrandCount(b.id)} products</small></a>`).join("")}
          </div>
        </div>
        <div class="mega-column mega-column-wide">
          <span class="mega-label">Brand Spotlight</span>
          <div class="mega-product-list">
            ${getTrendingProducts(3).map(p => {
              const brand = getBrandById(p.brand);
              return `
                <a class="mega-product-card" href="product.html?id=${p.id}">
                  <span class="thumb" style="background:${p.color}18">${productImage(p)}</span>
                  <span class="copy">
                    <b>${p.name}</b>
                    <small>${brand ? brand.name : ""} · ${formatINR(p.price)}</small>
                  </span>
                </a>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

function headerHTML() {
  return `
  <div class="topbar">
    <div class="container">
      <div class="left">
        <span class="offer-icon">${icon("shield", 13)}</span>
        <button class="offer-nav" id="offerPrev" aria-label="Previous announcement" type="button">‹</button>
        <div class="offer-track" id="offerTrack"></div>
        <button class="offer-nav" id="offerNext" aria-label="Next announcement" type="button">›</button>
      </div>
      <div class="right"><a href="offers.html">Today's deals</a></div>
    </div>
  </div>
  <header class="site">
    <div class="header-main">
      <button class="burger" id="burgerBtn" aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button>
      <a class="logo" href="index.html">
        <span class="mark"><img src="/uploads/avatars/mt-logo.jpg.jpeg" alt="Muscle Tonik logo"></span>
        <span class="word">MUSCLE <span>TONIK</span></span>
      </a>
      <nav class="nav-main">
        <div class="nav-item has-mega">
          <a class="nav-link" href="category.html">Categories ${icon("trend", 12)}</a>
          ${renderMegaCategoryMenu()}
        </div>
        <div class="nav-item has-mega">
          <a class="nav-link" href="marketplace.html">Products ${icon("trend", 12)}</a>
          ${renderMegaProductsMenu()}
        </div>
        <div class="nav-item has-mega">
          <a class="nav-link" href="brands.html">Brands ${icon("trend", 12)}</a>
          ${renderMegaBrandsMenu()}
        </div>
        <a class="nav-link nav-collection" href="marketplace.html?collection=crazy-deals">Crazy Deals</a>
        <a class="nav-link nav-collection" href="marketplace.html?collection=new-arrivals">New Arrivals</a>
        <a class="nav-link nav-collection" href="marketplace.html?collection=near-expiry">Near Expiry</a>
        <a class="nav-link" href="offers.html">Deals</a>
      </nav>
      <div class="header-search-wrap">
        <form class="header-search" onsubmit="doSearch(event)" autocomplete="off">
          <input type="text" id="searchInput" placeholder="Search whey, creatine, gainers..." oninput="handleSearchInput()" onkeydown="handleSearchKeydown(event)">
          <button type="submit" aria-label="Search">${icon("search", 16)}</button>
        </form>
        <div class="search-suggest" id="searchSuggest"></div>
      </div>
      <div class="header-actions">
        <a class="act" href="login.html" id="headerAuthLink">${icon("user", 20)}Login</a>
        <a class="act" href="wishlist.html">${icon("heart", 20)}<span class="count wish-count">0</span>Wishlist</a>
        <a class="act" href="cart.html" id="cartTriggerBtn" onclick="event.preventDefault();openCartDrawer();">${icon("cart", 20)}<span class="count cart-count">0</span>Cart</a>
        <a class="act act-plans" href="my-plans.html">${icon("bolt", 20)}My Plans</a>
      </div>
    </div>
  </header>

  <div class="mobile-drawer" id="mobileDrawer">
    <div class="overlay" onclick="closeDrawer()"></div>
    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <span class="word" style="font-family:'Poppins',sans-serif;font-weight:800;">MUSCLE <span style="color:#ff7a00;">TONIK</span></span>
        <button onclick="closeDrawer()" aria-label="Close menu">${icon("x", 22)}</button>
      </div>
      <a href="index.html">Home</a>
      <a href="marketplace.html">All Products</a>
      <div class="mobile-accordion">
        <button class="acc-head" onclick="toggleAccordion(this)">Categories <span class="plus">+</span></button>
        <div class="acc-body"><div class="acc-body-inner">
          ${CATEGORIES.map(c => '<a href="marketplace.html?category=' + c.id + '">' + c.name + "</a>").join("")}
        </div></div>
      </div>
      <div class="mobile-accordion">
        <button class="acc-head" onclick="toggleAccordion(this)">Products <span class="plus">+</span></button>
        <div class="acc-body"><div class="acc-body-inner">
          <a href="marketplace.html">All Products</a>
          <a href="marketplace.html?sort=popularity">Best Sellers</a>
          <a href="marketplace.html?collection=new-arrivals">New Arrivals</a>
          <a href="marketplace.html?collection=crazy-deals">Crazy Deals</a>
          <a href="marketplace.html?collection=near-expiry">Near Expiry</a>
          <a href="offers.html">Deals</a>
          ${getTopProducts(4).map(p => '<a href="product.html?id=' + p.id + '">' + p.name + "</a>").join("")}
        </div></div>
      </div>
      <div class="mobile-accordion">
        <button class="acc-head" onclick="toggleAccordion(this)">Brands <span class="plus">+</span></button>
        <div class="acc-body"><div class="acc-body-inner">
          ${BRANDS.map(b => '<a href="marketplace.html?brand=' + b.id + '">' + b.name + "</a>").join("")}
        </div></div>
      </div>
      <a href="marketplace.html?collection=crazy-deals">Crazy Deals</a>
      <a href="marketplace.html?collection=new-arrivals">New Arrivals</a>
      <a href="marketplace.html?collection=near-expiry">Near Expiry</a>
      <a href="offers.html">Deals</a>
      <a href="cart.html">Cart</a>
      <a href="wishlist.html">Wishlist</a>
      <a href="login.html" id="mobileAuthLink">Login / Sign Up</a>
    </div>
  </div>

  <div class="cart-drawer-overlay" id="cartDrawerOverlay" onclick="closeCartDrawer()"></div>
  <aside class="cart-drawer" id="cartDrawer" aria-hidden="true">
    <div class="cart-drawer-head">
      <h3>Your Cart (<span id="drawerCount">0</span>)</h3>
      <button onclick="closeCartDrawer()" aria-label="Close cart">${icon("x", 18)}</button>
    </div>
    <div class="cart-drawer-body" id="cartDrawerBody"></div>
    <div class="cart-drawer-foot">
      <div class="summary-row total"><span>Subtotal</span><span id="drawerSubtotal">Rs 0</span></div>
      <a href="cart.html" class="btn btn-outline btn-block">View Cart</a>
      <a href="checkout.html" class="btn btn-primary btn-block">Checkout</a>
    </div>
  </aside>

  `;
}

function footerHTML() {
  const content = (window.MT_SHARED_CATALOG && window.MT_SHARED_CATALOG.siteContent) || SITE_CONTENT || {};
  const footerNote = content.footer?.note || "Premium supplements, direct to your routine, with a clean shopping experience built for fast buying decisions.";
  return `
  <div class="foot-top">
    <div>
      <a class="logo" href="index.html">
        <span class="mark"><img src="/uploads/avatars/mt-logo.jpg.jpeg" alt="Muscle Tonik logo"></span>
        <span class="word" style="color:#fff;">MUSCLE <span style="color:#ff7a00;">TONIK</span></span>
      </a>
      <p class="about" data-editor-field="footer.note">${escapeHtml(footerNote)}</p>
      <div class="social-row">
        <a href="#" aria-label="Instagram">${icon("heart", 16)}</a>
        <a href="#" aria-label="Facebook">${icon("user", 16)}</a>
        <a href="#" aria-label="Twitter">${icon("bolt", 16)}</a>
      </div>
    </div>
    <div class="foot-col"><h5>About</h5><ul>
      <li><a href="index.html">Home</a></li>
      <li><a href="marketplace.html">Products</a></li>
      <li><a href="offers.html">Deals</a></li>
      <li><a href="cart.html">Cart</a></li>
    </ul></div>
    <div class="foot-col"><h5>Quick Links</h5><ul>
      <li><a href="category.html">Categories</a></li>
      <li><a href="brands.html">Brands</a></li>
      <li><a href="marketplace.html">Best Sellers</a></li>
      <li><a href="offers.html">Top Deals</a></li>
    </ul></div>
    <div class="foot-col"><h5>Categories</h5><ul>
      <li><a href="marketplace.html?category=whey-protein">Whey Protein</a></li>
      <li><a href="marketplace.html?category=mass-gainer">Mass Gainer</a></li>
      <li><a href="marketplace.html?category=creatine">Creatine</a></li>
      <li><a href="marketplace.html?category=pre-workout">Pre Workout</a></li>
    </ul></div>
    <div class="foot-col"><h5>Support</h5><ul>
      <li><a href="cart.html">Cart Summary</a></li>
      <li><a href="marketplace.html">Browse Products</a></li>
      <li><a href="category.html">Explore Categories</a></li>
      <li><a href="brands.html">Explore Brands</a></li>
    </ul></div>
  </div>
  <div class="foot-bottom">
    <span>&copy; 2026 Muscle Tonik. All rights reserved.</span>
    <div class="pay-icons"><span>UPI</span><span>VISA</span><span>MC</span><span>COD</span></div>
  </div>`;
}

function renderLayout() {
  const h = document.getElementById("site-header");
  const f = document.getElementById("site-footer");
  if (new URLSearchParams(window.location.search).get("mt_preview") === "1") setPreviewMode(true);
  document.body.classList.toggle("preview-mode", isPreviewMode());
  if (h) h.innerHTML = previewRibbonHTML() + headerHTML();
  if (f) f.innerHTML = footerHTML();
  updateHeaderCounts();
  updateAuthUI();
  initTopOffers();
  initNavDropdowns();
  initScrollShadow();
  const burger = document.getElementById("burgerBtn");
  if (burger) burger.addEventListener("click", openDrawer);
  const exitPreviewBtn = document.getElementById("previewExitBtn");
  if (exitPreviewBtn) {
    exitPreviewBtn.addEventListener("click", () => {
      setPreviewMode(false);
      window.location.href = "/index.html";
    });
  }
  initReveal();
}

function openDrawer() {
  document.getElementById("mobileDrawer").classList.add("open");
  const b = document.getElementById("burgerBtn");
  if (b) {
    b.classList.add("open");
    b.setAttribute("aria-expanded", "true");
  }
  document.body.style.overflow = "hidden";
}

function closeDrawer() {
  const d = document.getElementById("mobileDrawer");
  if (d) d.classList.remove("open");
  const b = document.getElementById("burgerBtn");
  if (b) {
    b.classList.remove("open");
    b.setAttribute("aria-expanded", "false");
  }
  const cd = document.getElementById("cartDrawer");
  if (!cd || !cd.classList.contains("open")) document.body.style.overflow = "";
}

function toggleAccordion(btn) {
  const wrap = btn.parentElement;
  const body = wrap.querySelector(".acc-body");
  if (wrap.classList.contains("open")) {
    body.style.maxHeight = "0px";
    wrap.classList.remove("open");
  } else {
    wrap.classList.add("open");
    body.style.maxHeight = body.scrollHeight + "px";
  }
}

function initNavDropdowns() {
  document.querySelectorAll(".nav-item.has-mega").forEach(item => {
    const panel = item.querySelector(".mega-menu");
    if (!panel) return;
    let hideTimer;
    const open = () => {
      clearTimeout(hideTimer);
      item.classList.add("open");
    };
    const close = () => {
      hideTimer = setTimeout(() => item.classList.remove("open"), 170);
    };
    item.addEventListener("mouseenter", open);
    item.addEventListener("mouseleave", close);
    item.addEventListener("focusin", open);
    item.addEventListener("focusout", close);
  });
}

function initScrollShadow() {
  const header = document.querySelector("header.site");
  if (!header) return;
  function onScroll() {
    header.classList.toggle("scrolled", window.scrollY > 10);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function openCartDrawer() {
  renderCartDrawer();
  const cd = document.getElementById("cartDrawer");
  const ov = document.getElementById("cartDrawerOverlay");
  if (cd) cd.classList.add("open");
  if (ov) ov.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeCartDrawer() {
  const cd = document.getElementById("cartDrawer");
  const ov = document.getElementById("cartDrawerOverlay");
  if (cd) cd.classList.remove("open");
  if (ov) ov.classList.remove("open");
  const md = document.getElementById("mobileDrawer");
  if (!md || !md.classList.contains("open")) document.body.style.overflow = "";
}

function renderCartDrawer() {
  const items = Cart.items();
  const body = document.getElementById("cartDrawerBody");
  const countEl = document.getElementById("drawerCount");
  const subEl = document.getElementById("drawerSubtotal");
  if (!body) return;
  if (countEl) countEl.textContent = Cart.count();
  if (items.length === 0) {
    body.innerHTML = '<div class="empty-state" style="padding:60px 16px;">' +
      '<div class="icon">' + icon("cart", 28) + "</div>" +
      '<h4 style="font-size:15px;">Your cart is empty</h4>' +
      '<p style="color:var(--text-light);font-size:13px;margin-top:8px;">Add products to see them here.</p>' +
      "</div>";
    if (subEl) subEl.textContent = formatINR(0);
    return;
  }
  body.innerHTML = items.map(i => {
    const p = getProductById(i.id);
    if (!p) return "";
    return '<div class="drawer-item">' +
      '<div class="drawer-thumb" style="background:' + p.color + '18">' + productImage(p) + "</div>" +
      '<div class="drawer-info">' +
        "<h5>" + p.name + "</h5>" +
        '<span class="drawer-price">' + formatINR(p.price) + "</span>" +
        '<div class="qty-box sm">' +
          '<button onclick="drawerChangeQty(' + p.id + ',-1)" aria-label="Decrease quantity">-</button>' +
          "<span>" + i.qty + "</span>" +
          '<button onclick="drawerChangeQty(' + p.id + ',1)" aria-label="Increase quantity">+</button>' +
        "</div>" +
      "</div>" +
      '<button class="drawer-remove" onclick="Cart.remove(' + p.id + ');renderCartDrawer();" aria-label="Remove">' + icon("x", 15) + "</button>" +
    "</div>";
  }).join("");
  if (subEl) subEl.textContent = formatINR(Cart.total());
}

function drawerChangeQty(id, delta) {
  const items = Cart.items();
  const found = items.find(i => i.id === id);
  if (found) Cart.setQty(id, found.qty + delta <= 0 ? 1 : found.qty + delta);
  renderCartDrawer();
}

let qvProductId = null;
let qvQty = 1;
function openQuickView(id) {
  const p = getProductById(id);
  if (!p) return;
  qvProductId = p.id;
  qvQty = 1;
  const brand = getBrandById(p.brand);
  const off = discountPct(p.price, p.oldPrice);
  const wished = Wishlist.has(p.id);
  document.getElementById("qvBody").innerHTML =
    '<div class="qv-media" style="background:' + p.color + '15">' + productImage(p).replace('width="90" height="108"', 'width="150" height="180"') + "</div>" +
    '<div class="qv-info">' +
      '<span class="brand">' + brand.name + "</span>" +
      "<h3>" + p.name + "</h3>" +
      '<div class="stars-row">' + starString(p.rating) + " " + p.rating + " • " + p.reviews.toLocaleString("en-IN") + " reviews</div>" +
      '<div class="price-row"><span class="now">' + formatINR(p.price) + '</span><span class="was">' + formatINR(p.oldPrice) + '</span><span class="badge badge-orange">' + off + "% off</span></div>" +
      '<p class="short">' + p.short + "</p>" +
      '<div class="qv-actions">' +
        '<div class="qty-box"><button onclick="qvChangeQty(-1)" aria-label="Decrease quantity">-</button><span id="qvQtyVal">1</span><button onclick="qvChangeQty(1)" aria-label="Increase quantity">+</button></div>' +
        '<button class="btn btn-dark" onclick="qvAddToCart()">Add to Cart</button>' +
        '<button class="btn-icon' + (wished ? " active" : "") + '" id="qvWishBtn" onclick="qvToggleWishlist()" aria-label="Toggle wishlist">' + icon("heart", 18) + "</button>" +
      "</div>" +
      '<a class="qv-fulllink" href="product.html?id=' + p.id + '">View Full Details →</a>' +
    "</div>";
  document.getElementById("quickViewModal").classList.add("open");
  document.getElementById("quickViewOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeQuickView() {
  const m = document.getElementById("quickViewModal");
  const ov = document.getElementById("quickViewOverlay");
  if (m) m.classList.remove("open");
  if (ov) ov.classList.remove("open");
  const cd = document.getElementById("cartDrawer");
  const md = document.getElementById("mobileDrawer");
  if ((!cd || !cd.classList.contains("open")) && (!md || !md.classList.contains("open"))) document.body.style.overflow = "";
}

function qvChangeQty(delta) {
  qvQty = Math.max(1, qvQty + delta);
  const el = document.getElementById("qvQtyVal");
  if (el) el.textContent = qvQty;
}

function qvAddToCart() {
  if (qvProductId == null) return;
  Cart.add(qvProductId, qvQty);
  closeQuickView();
}

function qvToggleWishlist() {
  if (qvProductId == null) return;
  Wishlist.toggle(qvProductId);
  const btn = document.getElementById("qvWishBtn");
  if (btn) btn.classList.toggle("active", Wishlist.has(qvProductId));
}

let suggestIndex = -1;
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function highlightMatch(text, q) {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return escapeHtml(text);
  return escapeHtml(text.slice(0, idx)) + "<mark>" + escapeHtml(text.slice(idx, idx + q.length)) + "</mark>" + escapeHtml(text.slice(idx + q.length));
}
function handleSearchInput() {
  const input = document.getElementById("searchInput");
  const panel = document.getElementById("searchSuggest");
  if (!input || !panel) return;
  const q = input.value.trim();
  suggestIndex = -1;
  if (!q) {
    panel.classList.remove("show");
    panel.innerHTML = "";
    return;
  }
  const matches = PRODUCTS.filter(p => {
    const brandName = getBrandById(p.brand).name;
    return p.name.toLowerCase().includes(q.toLowerCase()) || brandName.toLowerCase().includes(q.toLowerCase());
  }).slice(0, 6);
  if (matches.length === 0) {
    panel.innerHTML = '<div class="suggest-empty">No products found for "' + escapeHtml(q) + '"</div>';
    panel.classList.add("show");
    return;
  }
  panel.innerHTML = matches.map((p, i) => {
    const brand = getBrandById(p.brand);
    return '<a class="suggest-item" data-idx="' + i + '" href="product.html?id=' + p.id + '">' +
      '<span class="suggest-thumb" style="background:' + p.color + '18">' + productImage(p) + "</span>" +
      '<span class="suggest-info">' +
        '<span class="suggest-name">' + highlightMatch(p.name, q) + "</span>" +
        '<span class="suggest-meta">' + brand.name + " · " + formatINR(p.price) + "</span>" +
      "</span>" +
    "</a>";
  }).join("");
  panel.classList.add("show");
}
function handleSearchKeydown(e) {
  const panel = document.getElementById("searchSuggest");
  if (!panel || !panel.classList.contains("show")) return;
  const items = panel.querySelectorAll(".suggest-item");
  if (items.length === 0) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    suggestIndex = Math.min(suggestIndex + 1, items.length - 1);
    updateSuggestHighlight(items);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    suggestIndex = Math.max(suggestIndex - 1, 0);
    updateSuggestHighlight(items);
  } else if (e.key === "Enter") {
    if (suggestIndex >= 0) {
      e.preventDefault();
      items[suggestIndex].click();
    }
  } else if (e.key === "Escape") {
    panel.classList.remove("show");
    suggestIndex = -1;
  }
}
function updateSuggestHighlight(items) {
  items.forEach((it, i) => it.classList.toggle("active", i === suggestIndex));
  if (suggestIndex >= 0) items[suggestIndex].scrollIntoView({ block: "nearest" });
}
document.addEventListener("click", function (e) {
  const panel = document.getElementById("searchSuggest");
  if (panel && !e.target.closest(".header-search-wrap")) panel.classList.remove("show");
});
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    closeDrawer();
    closeCartDrawer();
    closeQuickView();
    const panel = document.getElementById("searchSuggest");
    if (panel) panel.classList.remove("show");
  }
});

function doSearch(e) {
  e.preventDefault();
  const q = document.getElementById("searchInput").value.trim();
  window.location.href = "marketplace.html" + (q ? "?search=" + encodeURIComponent(q) : "");
}

function startCountdown(elPrefix, seconds) {
  const deadline = Date.now() + seconds * 1000;
  const h = document.getElementById(elPrefix + "-h"), m = document.getElementById(elPrefix + "-m"), s = document.getElementById(elPrefix + "-s");
  function pad(n) { return n.toString().padStart(2, "0"); }
  function tick() {
    const diff = Math.max(0, deadline - Date.now());
    if (h) h.textContent = pad(Math.floor(diff / 3600000));
    if (m) m.textContent = pad(Math.floor((diff % 3600000) / 60000));
    if (s) s.textContent = pad(Math.floor((diff % 60000) / 1000));
    if (diff > 0) setTimeout(tick, 1000);
  }
  tick();
}

function initReveal() {
  const els = document.querySelectorAll(".reveal");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    els.forEach(el => el.style.opacity = 1);
    return;
  }
  const obs = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add("in");
        obs.unobserve(en.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(el => obs.observe(el));
}

document.addEventListener("DOMContentLoaded", async () => {
  // Render the header/nav immediately using the built-in default catalog so the
  // nav bar never blocks on the /api/catalog network request.
  renderLayout();
  // Once fresh catalog data arrives, re-render so the nav menus reflect it.
  const payload = await Promise.resolve(window.MT_CATALOG_READY);
  if (payload) renderLayout();
});
