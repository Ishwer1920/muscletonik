/* ===========================================================
   MUSCLE TONIK - Core behaviors, shared layout, cards, search
   Include data.js BEFORE this file on every page.
   =========================================================== */

/* ===========================================================
   PRELOADER

   The overlay is in the page markup so it paints immediately, and comes down
   once the catalogue has hydrated (window.MT_CATALOG_READY, set in data.js).

   The bar tracks the real download: data.js streams the catalogue response and
   calls window.MT_LOAD_PROGRESS with the fraction received. That hook has to
   exist before data.js starts fetching, which is why this block is defined
   here rather than inside a DOMContentLoaded handler.

   It is deliberately dismissed on a failed hydration too: falling back to the
   seed catalogue is still a usable page, and a stuck splash screen is worse
   than a thin one.
   =========================================================== */

/* index.html ships the overlay in its own markup so it paints instantly there.
   Every OTHER storefront page gets the SAME overlay injected here — before the
   controller below reads it — so the premium loader (gym backdrop + running
   figure + progress bar) shows site-wide. When the markup is already present
   (index.html, or a re-run) injection is skipped, so ids never duplicate. */
var MT_PRELOADER_HTML = `
<div class="mt-preload" id="mtPreload" role="status" aria-label="Loading Muscle Tonik">
  <svg class="mt-preload-gym" viewBox="0 0 1600 900" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">
    <defs>
      <radialGradient id="mtPlate" cx="34%" cy="28%" r="78%">
        <stop offset="0" stop-color="#5a5a5e"/><stop offset="42%" stop-color="#2a2a2d"/><stop offset="100%" stop-color="#141416"/>
      </radialGradient>
      <radialGradient id="mtPlateIn" cx="36%" cy="30%" r="72%">
        <stop offset="0" stop-color="#3d3d41"/><stop offset="100%" stop-color="#0f1010"/>
      </radialGradient>
      <linearGradient id="mtChrome" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3b3d42"/><stop offset="28%" stop-color="#9aa0a8"/>
        <stop offset="52%" stop-color="#cfd4da"/><stop offset="76%" stop-color="#7d838b"/>
        <stop offset="100%" stop-color="#2e3034"/>
      </linearGradient>
      <linearGradient id="mtChromeV" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#34363a"/><stop offset="30%" stop-color="#9aa0a8"/>
        <stop offset="55%" stop-color="#c8cdd3"/><stop offset="80%" stop-color="#71767d"/>
        <stop offset="100%" stop-color="#2b2d31"/>
      </linearGradient>
      <linearGradient id="mtBottle" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#2f3135"/><stop offset="26%" stop-color="#8f959c"/>
        <stop offset="54%" stop-color="#c2c7cd"/><stop offset="82%" stop-color="#6b7077"/>
        <stop offset="100%" stop-color="#26282b"/>
      </linearGradient>
      <filter id="mtShadow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="14"/></filter>
      <filter id="mtSoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
    </defs>
    <g fill="#000" opacity=".55" filter="url(#mtShadow)">
      <ellipse cx="250" cy="700" rx="150" ry="120"/>
      <ellipse cx="430" cy="820" rx="120" ry="90"/>
      <ellipse cx="1290" cy="250" rx="215" ry="70"/>
      <ellipse cx="1345" cy="690" rx="150" ry="115"/>
      <ellipse cx="905" cy="835" rx="130" ry="70"/>
      <ellipse cx="120" cy="205" rx="150" ry="60"/>
    </g>
    <g transform="translate(-40 150) rotate(-16)">
      <rect x="60" y="34" width="150" height="26" rx="13" fill="url(#mtChrome)"/>
      <rect x="44" y="12" width="26" height="70" rx="10" fill="url(#mtChrome)"/>
      <circle cx="212" cy="47" r="52" fill="url(#mtPlate)"/>
      <circle cx="212" cy="47" r="34" fill="url(#mtPlateIn)"/>
      <circle cx="212" cy="47" r="13" fill="#0d0d0f"/>
      <path d="M172 20a52 52 0 0 1 44-20" stroke="#8b9099" stroke-width="3" fill="none" opacity=".5"/>
    </g>
    <g transform="translate(250 690)">
      <circle r="152" fill="url(#mtPlate)"/>
      <circle r="150" fill="none" stroke="#6e737b" stroke-width="2" opacity=".35"/>
      <circle r="104" fill="url(#mtPlateIn)"/>
      <circle r="103" fill="none" stroke="#000" stroke-width="6" opacity=".45"/>
      <circle r="44" fill="#0c0c0e"/>
      <circle r="44" fill="none" stroke="#7f858d" stroke-width="4" opacity=".45"/>
      <path d="M-108 -108A152 152 0 0 1 40 -147" stroke="#c9ced5" stroke-width="6" fill="none" opacity=".28" filter="url(#mtSoft)"/>
    </g>
    <g transform="translate(432 812)">
      <circle r="112" fill="url(#mtPlate)"/>
      <circle r="76" fill="url(#mtPlateIn)"/>
      <circle r="32" fill="#0c0c0e"/>
      <circle r="32" fill="none" stroke="#7f858d" stroke-width="3" opacity=".4"/>
      <path d="M-80 -78A112 112 0 0 1 26 -109" stroke="#c9ced5" stroke-width="5" fill="none" opacity=".26" filter="url(#mtSoft)"/>
    </g>
    <g transform="translate(1080 240) rotate(-8)">
      <rect x="86" y="-14" width="248" height="28" rx="14" fill="url(#mtChrome)"/>
      <rect x="96" y="-9" width="228" height="6" rx="3" fill="#e6eaee" opacity=".22"/>
      <g>
        <circle cx="60" cy="0" r="62" fill="url(#mtPlate)"/>
        <circle cx="60" cy="0" r="41" fill="url(#mtPlateIn)"/>
        <circle cx="60" cy="0" r="16" fill="#0d0d0f"/>
        <path d="M16 -44A62 62 0 0 1 76 -60" stroke="#c9ced5" stroke-width="5" fill="none" opacity=".28" filter="url(#mtSoft)"/>
      </g>
      <g>
        <circle cx="360" cy="0" r="62" fill="url(#mtPlate)"/>
        <circle cx="360" cy="0" r="41" fill="url(#mtPlateIn)"/>
        <circle cx="360" cy="0" r="16" fill="#0d0d0f"/>
        <path d="M316 -44A62 62 0 0 1 376 -60" stroke="#c9ced5" stroke-width="5" fill="none" opacity=".28" filter="url(#mtSoft)"/>
      </g>
    </g>
    <g transform="translate(1340 660)">
      <path d="M-46 -58c0-46 92-46 92 0" stroke="url(#mtChromeV)" stroke-width="26" fill="none" stroke-linecap="round"/>
      <path d="M-72 6a72 78 0 0 1 144 0 74 74 0 0 1-144 0z" fill="url(#mtPlate)"/>
      <ellipse cx="-24" cy="-14" rx="26" ry="17" fill="#6f747c" opacity=".22" filter="url(#mtSoft)"/>
      <ellipse cx="0" cy="34" rx="34" ry="20" fill="#0d0d0f" opacity=".7"/>
    </g>
    <g transform="translate(880 800) rotate(-12)">
      <rect x="-34" y="-96" width="68" height="176" rx="26" fill="url(#mtBottle)"/>
      <rect x="-20" y="-118" width="40" height="30" rx="10" fill="#3a3d42"/>
      <rect x="-24" y="-84" width="12" height="140" rx="6" fill="#eef1f4" opacity=".16"/>
      <rect x="-34" y="-16" width="68" height="4" fill="#0d0d0f" opacity=".5"/>
    </g>
    <g transform="translate(1470 380)" fill="none" stroke="url(#mtChromeV)" stroke-width="11" opacity=".85">
      <ellipse rx="96" ry="70"/>
      <ellipse rx="72" ry="50" opacity=".8"/>
      <path d="M-96 8c-40 34-70 30-96 6" stroke-linecap="round"/>
    </g>
  </svg>
  <div class="mt-preload-fx" aria-hidden="true"></div>
  <div class="mt-preload-inner">
    <div class="mt-preload-brand">MUSCLE <em>TONIK</em></div>
    <div class="mt-preload-runner-track" aria-hidden="true">
      <div class="mt-preload-runner">
        <svg class="mt-preload-runner-svg" viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="mtRbody" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#4a4e57"/><stop offset=".5" stop-color="#262a31"/><stop offset="1" stop-color="#14161a"/>
            </linearGradient>
            <linearGradient id="mtRacc" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#ffb061"/><stop offset="1" stop-color="#ff7a00"/>
            </linearGradient>
            <radialGradient id="mtRsheen" cx="36%" cy="30%" r="68%">
              <stop offset="0" stop-color="#ffffff" stop-opacity=".5"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <ellipse class="mt-runner-shadow" cx="60" cy="140" rx="30" ry="6" fill="#000" opacity=".3"/>
          <g class="mt-preload-runner-fig">
            <g class="mt-run-leg mt-run-leg-b">
              <path d="M58 86 L47 108 L52 126" stroke="url(#mtRbody)" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
              <ellipse cx="52" cy="127" rx="10" ry="4.5" fill="url(#mtRacc)" opacity=".85"/>
            </g>
            <path class="mt-run-arm mt-run-arm-b" d="M60 53 L48 63 L44 55" stroke="url(#mtRbody)" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <path class="mt-run-torso" d="M50 46 q10 -7 20 0 q6 20 -1 40 q-9 5 -18 0 q-6 -22 -1 -40 Z" fill="url(#mtRbody)"/>
            <path d="M52 48 q8 -5 16 0 q3 12 -1 22 q-7 4 -14 0 q-3 -12 -1 -22 Z" fill="url(#mtRsheen)"/>
            <circle cx="62" cy="30" r="12" fill="url(#mtRbody)"/>
            <circle cx="58" cy="27" r="4" fill="url(#mtRsheen)"/>
            <path d="M50 25 h24" stroke="url(#mtRacc)" stroke-width="5" stroke-linecap="round"/>
            <path class="mt-run-arm mt-run-arm-a" d="M62 51 L76 58 L84 50" stroke="url(#mtRbody)" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            <g class="mt-run-leg mt-run-leg-a">
              <path d="M62 86 L72 108 L68 126" stroke="url(#mtRbody)" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
              <ellipse cx="68" cy="128" rx="11" ry="5" fill="url(#mtRacc)"/>
            </g>
          </g>
        </svg>
      </div>
    </div>
    <div class="mt-preload-bar"><span class="mt-preload-fill" id="mtPreloadFill"></span></div>
    <div class="mt-preload-meta">
      <span class="mt-preload-pct" id="mtPreloadPct">0%</span>
      <span class="mt-preload-hint">GETTING READY</span>
    </div>
  </div>
</div>`;
(function ensurePreloader() {
  try {
    if (typeof document === "undefined" || !document.body) return;
    if (document.getElementById("mtPreload")) return;     // index.html already has it
    document.body.classList.add("mt-preloading");
    document.body.insertAdjacentHTML("afterbegin", MT_PRELOADER_HTML);
  } catch (e) {}
})();

(function () {
  var MAX_WAIT_MS = 12000;  // never hold the page hostage to a slow API
  var MIN_SHOW_MS = 400;    // avoid a one-frame flash on a warm cache
  var startedAt = Date.now();
  var dismissed = false;
  // `shown` is the TARGET (real progress + creep); `displayed` is the smoothed
  // value that actually drives the DOM each frame, so the number counts up
  // smoothly and the bar + runner glide together without stepping/teleporting.
  var shown = 0;
  var displayed = 0;

  var fill = document.getElementById("mtPreloadFill");
  var pct = document.getElementById("mtPreloadPct");
  var root = document.getElementById("mtPreload");
  var hint = root ? root.querySelector(".mt-preload-hint") : null;

  function phaseFor(p) {
    if (p >= 100) return "LET'S GO";
    if (p >= 75) return "ALMOST READY";
    if (p >= 50) return "BUILDING YOUR EXPERIENCE";
    if (p >= 25) return "LOADING PRODUCTS";
    return "GETTING READY";
  }

  // One animation loop drives everything from `displayed`, which eases toward
  // the target every frame. The percentage, the orange fill and the running
  // figure therefore move in lock-step and never jump.
  var rafId = null, lastPhase = "";
  function frame() {
    var diff = shown - displayed;
    displayed += diff * 0.1;
    if (diff < 0.25) displayed = shown;     // snap the final sliver
    var r = Math.round(displayed);
    if (fill) fill.style.width = displayed.toFixed(2) + "%";
    if (root) root.style.setProperty("--mt-progress", displayed.toFixed(2));
    if (pct) pct.textContent = r + "%";
    if (hint) { var t = phaseFor(r); if (t !== lastPhase) { hint.textContent = t; lastPhase = t; } }
    rafId = requestAnimationFrame(frame);
  }

  // data.js calls this as the catalogue streams in; it only moves the TARGET
  // (never backwards). The frame loop animates the display up to it.
  function paint(fraction) {
    var percent = Math.max(0, Math.min(1, Number(fraction) || 0)) * 100;
    if (percent > shown) shown = percent;
  }
  window.MT_LOAD_PROGRESS = paint;

  // A steadily easing creep, so the bar is always moving even when the
  // download reports nothing useful. On a fast local connection the browser
  // often hands over the whole body in one buffered chunk, which would
  // otherwise leave the bar frozen until the very end; real progress simply
  // overtakes the creep whenever it is ahead (paint never goes backwards).
  // It eases toward 90% and stops there - the last stretch belongs to the
  // parse, and finishing early would be a lie.
  var CREEP_CEILING = 90;
  var creep = setInterval(function () {
    if (shown >= CREEP_CEILING) return;
    // Bigger steps early, smaller as it approaches the ceiling.
    var step = Math.max(0.4, (CREEP_CEILING - shown) / 14);
    paint((shown + step) / 100);
  }, 180);

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    clearInterval(creep);
    paint(1);                       // move the TARGET to 100%
    // Hold until the counter + figure have eased all the way to 100% (~0.7s)
    // plus a short completion beat, so the character always finishes its run
    // and the number lands on 100 before the store is revealed.
    var FINISH_MS = 1050;
    var wait = Math.max(MIN_SHOW_MS - (Date.now() - startedAt), FINISH_MS);
    setTimeout(function () {
      var el = document.getElementById("mtPreload");
      if (document.body) document.body.classList.remove("mt-preloading");
      if (!el) { if (rafId) cancelAnimationFrame(rafId); return; }
      el.classList.add("is-done");   // CSS scales + blurs + fades it away
      // Match the CSS fade, then take it out of the tree entirely so it can
      // never trap a click, and stop the animation loop.
      setTimeout(function () {
        if (rafId) cancelAnimationFrame(rafId);
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 620);
    }, wait);
  }

  // Page without the overlay markup: just make sure scrolling is not locked.
  if (!document.getElementById("mtPreload")) {
    clearInterval(creep);
    if (document.body) document.body.classList.remove("mt-preloading");
    return;
  }

  frame();   // start the smooth display loop (number + bar + runner together)
  setTimeout(dismiss, MAX_WAIT_MS);
  if (window.MT_CATALOG_READY && typeof window.MT_CATALOG_READY.then === "function") {
    window.MT_CATALOG_READY.then(dismiss, dismiss);
  } else {
    // No catalogue on this page (or data.js changed shape): the DOM being
    // ready is the best signal available.
    if (document.readyState === "complete") dismiss();
    else window.addEventListener("load", dismiss);
  }
})();

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
  // A cart line is identified by product AND combo AND pack/weight: the same
  // product bought on its own and as part of a bundle are two separate lines
  // (only the tagged one is combo-priced), and the same product in two
  // different packs (1 KG vs 2 KG) are two separate lines priced from each
  // pack's own figure.
  key(id, comboId, weight) { return Number(id) + "|" + (comboId || "") + "|" + (weight || ""); },
  find(items, id, comboId, weight) {
    return items.find(i => this.key(i.id, i.comboId, i.weight) === this.key(id, comboId, weight));
  },
  // weight is the chosen pack label ("2 KG"); "" for a single-price product.
  add(id, qty, weight, comboId) {
    qty = qty || 1;
    weight = weight || "";
    const items = this.items();
    const found = this.find(items, id, comboId, weight);
    if (found) found.qty += qty;
    else {
      const row = { id: Number(id), qty };
      if (comboId) row.comboId = comboId;
      if (weight) row.weight = weight;
      items.push(row);
    }
    this.save(items);
    showToast("Added to cart");
  },
  // Adds every product in a bundle in one go, each tagged with the combo so
  // the server prices the set at its flat price.
  addCombo(combo) {
    if (!combo || !Array.isArray(combo.items) || !combo.items.length) return;
    const items = this.items();
    combo.items.forEach(entry => {
      const qty = Math.max(1, Number(entry.quantity) || 1);
      const found = this.find(items, entry.id, combo.id);
      if (found) found.qty += qty;
      else items.push({ id: Number(entry.id), qty: qty, comboId: combo.id });
    });
    this.save(items);
    showToast("Combo added to cart");
  },
  remove(id, comboId, weight) {
    const key = this.key(id, comboId, weight);
    this.save(this.items().filter(i => this.key(i.id, i.comboId, i.weight) !== key));
    showToast("Removed from cart");
  },
  // Drop a whole bundle at once, from the cart's combo header.
  removeCombo(comboId) {
    if (!comboId) return;
    this.save(this.items().filter(i => (i.comboId || "") !== comboId));
    showToast("Combo removed");
  },
  setQty(id, qty, comboId, weight) {
    const items = this.items();
    const found = this.find(items, id, comboId, weight);
    if (found) {
      found.qty = Math.max(1, qty);
      this.save(items);
    }
  },
  count() {
    return this.items().reduce((sum, item) => sum + item.qty, 0);
  },
  clear() { this.save([]); },
  // Cart lines with combo pricing already applied, in the same shape the cart
  // page and the tax helper want. A line that belongs to a bundle which no
  // longer holds comes back at its normal price with comboBroken set.
  pricedLines() {
    const lines = this.items().map(item => {
      const product = getProductById(item.id);
      if (!product) return null;
      // Price the line from the chosen pack when the product has options,
      // exactly as the server does; single-price products keep product.price.
      const weight = item.weight || "";
      const unitPrice = variantUnitPrice(product, weight);
      return {
        id: Number(item.id),
        qty: item.qty,
        comboId: item.comboId || null,
        weight: weight,
        weightLabel: resolveWeightLabel(product, weight),
        unitPrice: unitPrice,
        oldUnitPrice: variantOldPrice(product, weight),
        product: product,
        lineTotal: Math.round(unitPrice * item.qty),
        combo: null,
        comboBroken: false
      };
    }).filter(Boolean);
    if (typeof mtApplyComboPricing === "function") mtApplyComboPricing(lines);
    return lines;
  },
  total() {
    return this.pricedLines().reduce((sum, line) => sum + line.lineTotal, 0);
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
  const cartN = Cart.count();
  const wishN = Wishlist.items().length;
  // Only show the badge when there's something to count — an empty "0" bubble
  // on every icon reads as broken. hidden is honoured by the CSS below.
  document.querySelectorAll(".cart-count").forEach(el => { el.textContent = cartN > 99 ? "99+" : String(cartN); el.hidden = cartN === 0; });
  document.querySelectorAll(".wish-count").forEach(el => { el.textContent = wishN > 99 ? "99+" : String(wishN); el.hidden = wishN === 0; });
  const drawer = document.getElementById("cartDrawer");
  if (drawer && drawer.classList.contains("open")) renderCartDrawer();
}

function updateAuthUI() {
  const user = Store.get("mt_user", null);
  const link = document.getElementById("headerAuthLink");
  const mobileLink = document.getElementById("mobileAuthLink");
  if (link) {
    link.href = user ? "dashboard.html" : "login.html";
    if (user) {
      // Play the ?->verified animation only once per page load, so a second
      // renderLayout (after the catalogue arrives) doesn't replay it.
      var animate = !window.__authVerifyPlayed;
      window.__authVerifyPlayed = true;
      link.innerHTML = verifiedBadgeHTML(animate) + (user.name ? user.name.split(" ")[0] : "Account");
    } else {
      link.innerHTML = icon("adduser", 20) + "Login";
    }
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
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  // Nav-bar icons (match the reference set): add-user (logged-out), a wishlist
  // document with a heart, a cart with a price tag, and an ornate alert bell.
  adduser: '<path d="M15 20v-1.6a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20"/><circle cx="8.5" cy="7.5" r="4"/><path d="M19 7.5v6M22 10.5h-6"/>',
  wishlistdoc: '<path d="M13.8 3H6.6A1.6 1.6 0 0 0 5 4.6v14.8A1.6 1.6 0 0 0 6.6 21h10.8a1.6 1.6 0 0 0 1.6-1.6V8z"/><path d="M13.8 3v5h5"/><path d="M12 10.5c-.9-1.3-3-.9-3 .8 0 1.2 1.7 2 3 3 1.3-1 3-1.8 3-3 0-1.7-2.1-2.1-3-.8Z"/><path d="M8.6 16.4h6.8M8.6 18.7h4.4"/>',
  carttag: '<circle cx="9" cy="20.3" r="1.4"/><circle cx="17.6" cy="20.3" r="1.4"/><path d="M2.5 4h2.3l2.3 10.9a1.6 1.6 0 0 0 1.6 1.3h8.2a1.6 1.6 0 0 0 1.6-1.3l.55-2.8H7.4"/><path d="M14.3 3.2h3.3a1 1 0 0 1 .7.3l2.2 2.2a1 1 0 0 1 0 1.4l-2.6 2.6a1 1 0 0 1-1.4 0l-2.2-2.2a1 1 0 0 1-.3-.7V4.2a1 1 0 0 1 1-1z"/><circle cx="16.3" cy="5.3" r=".7"/>',
  alertbell: '<path d="M12 2.6a1.7 1.7 0 0 0-1.6 2.2A6 6 0 0 0 6 10.6V14l-1.8 2.8a.6.6 0 0 0 .5.9h14.6a.6.6 0 0 0 .5-.9L18 14v-3.4a6 6 0 0 0-4.4-5.8A1.7 1.7 0 0 0 12 2.6Z"/><path d="M9.8 18.8a2.2 2.2 0 0 0 4.4 0"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>'
};

/* The signed-in profile shows a blue "verified" badge. verifiedBadgeHTML(true)
   plays a one-shot ? -> check draw-in; (false) renders the settled badge. */
function verifiedBadgeHTML(animate) {
  return '<span class="auth-badge-wrap' + (animate ? " animate" : "") + '">' +
    '<svg class="auth-badge" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
      '<g fill="#1d9bf0"><rect x="5" y="5" width="14" height="14" rx="4.5"/>' +
      '<rect x="5" y="5" width="14" height="14" rx="4.5" transform="rotate(45 12 12)"/></g>' +
      '<text class="auth-q" x="12" y="16.3" text-anchor="middle" fill="#fff" font-size="12" font-weight="800">?</text>' +
      '<path class="auth-check" pathLength="24" d="M7.8 12.4l2.7 2.7L16.4 9.3" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg></span>";
}

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

/* -----------------------------------------------------------------
   Pack / weight pricing helpers.

   A product can carry several pack sizes (1 KG, 2 KG, 5 KG...) in
   p.weightOptions, each with its own price. These mirror the server's
   pricing.variant_unit_price / find_weight_option so the price the
   shopper sees on the card, detail page and cart is exactly the price
   checkout charges. A product with no options behaves as before and is
   priced off p.price, so every existing single-price product is
   untouched.
   ----------------------------------------------------------------- */
function productWeightOptions(p) {
  return p && Array.isArray(p.weightOptions) ? p.weightOptions.filter(o => o && o.label) : [];
}
// Case/space-insensitive match so "2kg" from an old cart row lines up with "2 KG".
function normWeight(label) {
  return String(label == null ? "" : label).trim().toLowerCase().replace(/\s+/g, "");
}
function findWeightOption(p, label) {
  const opts = productWeightOptions(p);
  if (!opts.length) return null;
  const wanted = normWeight(label);
  if (!wanted) return null;
  return opts.find(o => normWeight(o.label) === wanted) || null;
}
// The resolved pack label for a line: the chosen one, else the first option,
// else "" for a single-price product (so nothing is shown).
function resolveWeightLabel(p, label) {
  const opts = productWeightOptions(p);
  if (!opts.length) return "";
  return (findWeightOption(p, label) || opts[0]).label;
}
// Unit price honouring the chosen pack; falls back to p.price with no options.
function variantUnitPrice(p, label) {
  const opts = productWeightOptions(p);
  if (!opts.length) return Number(p && p.price) || 0;
  const chosen = findWeightOption(p, label) || opts[0];
  const price = Number(chosen && chosen.price);
  return isFinite(price) ? price : (Number(p && p.price) || 0);
}
// The struck-through "was" price for a pack: the option's own mrp when it is
// higher than the selling price, else 0 (no strike). Single-price products
// keep using p.oldPrice.
function variantOldPrice(p, label) {
  const opts = productWeightOptions(p);
  if (!opts.length) return Number(p && p.oldPrice) || 0;
  const chosen = findWeightOption(p, label) || opts[0];
  const unit = variantUnitPrice(p, label);
  const mrp = Number(chosen && chosen.mrp);
  return isFinite(mrp) && mrp > unit ? mrp : 0;
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
  const wished = Wishlist.has(p.id);
  const stockLabel = getProductAvailabilityLabel(p);
  const delivery = getProductDeliveryEstimate(p);
  const flavorLine = [p.flavor, p.weight, p.protein ? p.protein + " protein" : "", p.servings ? p.servings + " servings" : ""].filter(Boolean).join(" · ");
  const weightTag = p.weight ? '<span class="prod-weight">' + escapeHtml(p.weight) + "</span>" : "";
  // Pack-aware pricing: a product with weight options shows the default (first)
  // pack's price on the card and adds that same pack to the cart, so the figure
  // on the card is the figure charged. Single-price products are unchanged.
  const packOpts = productWeightOptions(p);
  const defLabel = packOpts.length ? packOpts[0].label : "";
  const now = variantUnitPrice(p, defLabel);
  const was = packOpts.length ? variantOldPrice(p, defLabel) : (Number(p.oldPrice) || 0);
  const off = was > now ? discountPct(now, was) : 0;
  const addArg = p.id + ",1,'" + escapeHtml(defLabel) + "'";
  const packHint = packOpts.length > 1
    ? '<div class="prod-packs">' + packOpts.map(o => escapeHtml(o.label)).join(" · ") + "</div>"
    : "";
  return (
    '<div class="prod-card reveal">' +
      '<a class="prod-media" style="background:' + p.color + '18" href="product.html?id=' + p.id + '">' +
        '<div class="badges">' + productFlagBadges(p) + (off > 0 ? '<span class="badge badge-orange">' + off + '% OFF</span>' : "") + (p.badge ? '<span class="badge badge-dark">' + p.badge + "</span>" : "") + "</div>" +
        '<button class="prod-wish' + (wished ? " active" : "") + '" data-wish="' + p.id + '" onclick="event.preventDefault();Wishlist.toggle(' + p.id + ')" aria-label="Toggle wishlist">' + icon("heart", 17) + "</button>" +
        '<div class="prod-media-art">' + productImage(p) + "</div>" +
      "</a>" +
      '<div class="prod-body">' +
        '<div class="prod-brand-row"><span class="brand">' + (brand ? brand.name : "") + "</span>" + weightTag + "</div>" +
        '<h4><a href="product.html?id=' + p.id + '">' + p.name + "</a></h4>" +
        '<div class="prod-stars">' + starString(p.rating) + " " + p.rating + " (" + p.reviews.toLocaleString("en-IN") + ")</div>" +
        '<div class="prod-price"><span class="now">' + formatINR(now) + "</span>" + (was > now ? '<span class="was">' + formatINR(was) + '</span><span class="off">' + off + "% off</span>" : "") + "</div>" +
        packHint +
        '<button class="add-cart-btn" onclick="Cart.add(' + addArg + ')">Add to Cart</button>' +
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
        // Three rows rather than one: six controls on a single nowrap row
        // squeezed the two CTAs down to a few pixels on a narrow card and
        // spilled their labels outside it.
        '<div class="prod-hover-actions">' +
          '<div class="prod-hover-icons">' +
            '<button type="button" class="btn-icon ' + (wished ? "active" : "") + '" data-wish="' + p.id + '" onclick="event.preventDefault();event.stopPropagation();Wishlist.toggle(' + p.id + ')" aria-label="Add to wishlist">' + icon("heart", 17) + "</button>" +
            '<button type="button" class="btn-icon' + (Compare.has(p.id) ? " active" : "") + '" data-compare="' + p.id + '" onclick="event.preventDefault();event.stopPropagation();Compare.toggle(' + p.id + ')" aria-label="Compare">⇄</button>' +
            '<button type="button" class="btn-icon" onclick="event.preventDefault();event.stopPropagation();shareProduct(PRODUCTS.find(function(item){return item.id===' + p.id + ';}))" aria-label="Share">' + icon("bolt", 17) + "</button>" +
          "</div>" +
          '<div class="prod-hover-cta">' +
            '<button type="button" class="btn btn-dark btn-sm" onclick="event.preventDefault();event.stopPropagation();Cart.add(' + addArg + ');">Add to Cart</button>' +
            '<button type="button" class="btn btn-primary btn-sm" onclick="event.preventDefault();event.stopPropagation();Cart.add(' + addArg + ');window.location.href=\'cart.html\';">Buy Now</button>' +
          "</div>" +
          '<a class="btn btn-outline btn-sm prod-hover-view" href="product.html?id=' + p.id + '">View Details</a>' +
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
            <a href="my-plans.html">My Plans</a>
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
  <div class="rgb-topstrip" aria-hidden="true"></div>
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
        <a class="nav-link nav-plans" href="my-plans.html">My Plans</a>
      </nav>
      <div class="header-search-wrap">
        <form class="header-search" onsubmit="doSearch(event)" autocomplete="off">
          <input type="text" id="searchInput" placeholder="Search whey, creatine, gainers..." oninput="handleSearchInput()" onkeydown="handleSearchKeydown(event)">
          <button type="submit" aria-label="Search">${icon("search", 16)}</button>
        </form>
        <div class="search-suggest" id="searchSuggest"></div>
      </div>
      <div class="header-actions">
        <a class="act" href="login.html" id="headerAuthLink">${icon("adduser", 20)}Login</a>
        <a class="act" href="wishlist.html">${icon("wishlistdoc", 20)}<span class="count wish-count" hidden>0</span><span class="act-label">Wishlist</span></a>
        <a class="act" href="cart.html" id="cartTriggerBtn" onclick="event.preventDefault();openCartDrawer();">${icon("carttag", 20)}<span class="count cart-count" hidden>0</span><span class="act-label">Cart</span></a>
        <div class="act act-notif" id="notifWrap">
          <button type="button" class="act-notif-btn" id="notifBtn" aria-haspopup="true" aria-expanded="false" aria-label="Notifications" onclick="toggleNotifMenu(event)">${icon("alertbell", 20)}<span class="count notif-count" id="notifCount" hidden>0</span><span class="act-label">Alerts</span></button>
          <div class="notif-menu" id="notifMenu" role="menu" aria-label="Notifications"></div>
        </div>
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
      <a href="my-plans.html">My Plans</a>
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
      <div id="drawerFreeShip"></div>
      <div class="summary-row total"><span>Subtotal</span><span id="drawerSubtotal">Rs 0</span></div>
      <a href="cart.html" class="btn btn-outline btn-block">View Cart</a>
      <a href="checkout.html" class="btn btn-primary btn-block">Checkout</a>
    </div>
  </aside>

  `;
}

/* ===========================================================
   Header notifications (bell) + website alerts.
   Alerts are admin-created announcements served in the public
   catalogue payload (MT_SHARED_CATALOG.alerts). Read/unread is
   tracked per browser in localStorage, so it works for guests
   too without touching the auth/user model. Nothing is faked —
   an empty admin list means an empty bell.
   =========================================================== */
var MT_ALERT_READ_KEY = "mt_alerts_read";
var MT_ALERT_TYPE = {
  new_product: { icon: "cart",   label: "New product" },
  new_brand:   { icon: "star",   label: "New brand" },
  new_deal:    { icon: "bolt",   label: "New deal" },
  new_banner:  { icon: "flame",  label: "New offer" },
  sale:        { icon: "flame",  label: "Sale" },
  update:      { icon: "shield", label: "Update" },
  general:     { icon: "bell",   label: "Announcement" }
};

function mtAlerts() {
  var c = window.MT_SHARED_CATALOG;
  return (c && Array.isArray(c.alerts)) ? c.alerts : [];
}
function mtReadAlertIds() {
  try { var v = JSON.parse(localStorage.getItem(MT_ALERT_READ_KEY)); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
function mtSetReadAlertIds(ids) {
  try { localStorage.setItem(MT_ALERT_READ_KEY, JSON.stringify(ids.slice(0, 500))); } catch (e) {}
}
function mtUnreadAlertCount() {
  var read = mtReadAlertIds();
  return mtAlerts().filter(function (a) { return read.indexOf(a.id) === -1; }).length;
}
function updateNotifBadge() {
  var badge = document.getElementById("notifCount");
  if (!badge) return;
  var n = mtUnreadAlertCount();
  if (n > 0) { badge.textContent = n > 9 ? "9+" : String(n); badge.hidden = false; }
  else badge.hidden = true;
}
function mtTimeAgo(iso) {
  if (!iso) return "";
  var then = Date.parse(iso); if (isNaN(then)) return "";
  var secs = Math.max(0, (Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  var mins = Math.floor(secs / 60); if (mins < 60) return mins + " min ago";
  var hrs = Math.floor(mins / 60); if (hrs < 24) return hrs + " hour" + (hrs === 1 ? "" : "s") + " ago";
  var days = Math.floor(hrs / 24); if (days === 1) return "Yesterday";
  if (days < 7) return days + " days ago";
  try { return new Date(then).toLocaleDateString("en-IN", { dateStyle: "medium" }); } catch (e) { return ""; }
}

function notifMenuShell(inner, showClear) {
  return '<div class="notif-menu-head"><strong>Notifications</strong>' +
    (showClear ? '<button type="button" class="notif-clear" onclick="markAllAlertsRead(event)">Mark all read</button>' : "") +
    "</div><div class=\"notif-menu-body\">" + inner + "</div>";
}

function renderNotifMenu() {
  var menu = document.getElementById("notifMenu");
  if (!menu) return;
  var alerts = mtAlerts();
  if (!alerts.length) {
    menu.innerHTML = notifMenuShell('<div class="notif-empty">' + icon("bell", 24) +
      "<p>No notifications yet. We'll let you know when something new drops.</p></div>", false);
    return;
  }
  var read = mtReadAlertIds();
  var rows = alerts.map(function (a) {
    var meta = MT_ALERT_TYPE[a.type] || MT_ALERT_TYPE.general;
    var unread = read.indexOf(a.id) === -1;
    var glyph = a.icon ? escapeHtml(a.icon) : icon(meta.icon, 16);
    var inner =
      '<span class="notif-ic">' + glyph + "</span>" +
      '<span class="notif-text">' +
        "<b>" + escapeHtml(a.title || meta.label) + (unread ? '<i class="notif-dot" aria-label="unread"></i>' : "") + "</b>" +
        (a.description ? "<span>" + escapeHtml(a.description) + "</span>" : "") +
        "<em>" + escapeHtml(meta.label) + (a.createdAt ? " · " + escapeHtml(mtTimeAgo(a.createdAt)) : "") + "</em>" +
      "</span>";
    var cls = "notif-item" + (unread ? " is-unread" : "");
    if (a.link) {
      return '<a class="' + cls + '" href="' + escapeHtml(a.link) + '" onclick="markAlertRead(\'' + a.id + '\')">' + inner + "</a>";
    }
    return '<div class="' + cls + '">' + inner + "</div>";
  }).join("");
  menu.innerHTML = notifMenuShell(rows, true);
}

function markAlertRead(id) {
  var read = mtReadAlertIds();
  if (read.indexOf(id) === -1) { read.push(id); mtSetReadAlertIds(read); updateNotifBadge(); }
}
function markAllAlertsRead(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  mtSetReadAlertIds(mtAlerts().map(function (a) { return a.id; }));
  updateNotifBadge();
  renderNotifMenu();
}

function closeNotifMenu() {
  var menu = document.getElementById("notifMenu");
  var btn = document.getElementById("notifBtn");
  if (menu) menu.classList.remove("open");
  if (btn) btn.setAttribute("aria-expanded", "false");
}

function toggleNotifMenu(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  var menu = document.getElementById("notifMenu");
  var btn = document.getElementById("notifBtn");
  if (!menu) return;
  var willOpen = !menu.classList.contains("open");
  closeNotifMenu();
  if (willOpen) {
    renderNotifMenu();                 // renders with the current unread dots
    menu.classList.add("open");
    if (btn) btn.setAttribute("aria-expanded", "true");
    // Opening the panel counts as seeing the alerts: clear the badge now
    // (the just-rendered unread dots stay visible until the next open).
    mtSetReadAlertIds(mtAlerts().map(function (a) { return a.id; }));
    updateNotifBadge();
  }
}

/* ===========================================================
   Search-bar glow (Admin -> Settings -> Search Bar Glow).
   Pure CSS animation driven by custom properties; this only
   writes the admin's chosen colours/speed/intensity into those
   properties and toggles the enable/desktop/mobile classes.
   =========================================================== */
/* ===========================================================
   RGB Light (Admin -> Settings -> RGB Light). One config drives
   the animated gradient light on the search bar, the nav icons,
   a top strip and the brand text. Modes: rgb / single / festival
   / off. Optional schedule: a daily time window and/or a festival
   date range. All CSS-driven; this only writes custom properties
   and toggles classes. Falls back to the legacy searchGlow shape.
   =========================================================== */
function mtRgbConfig() {
  var c = window.MT_SHARED_CATALOG || {};
  var cfg = c.rgbLight;
  if (cfg && typeof cfg === "object" && Object.keys(cfg).length) return cfg;
  var sg = c.searchGlow || {};   // back-compat: map the old search-glow shape
  return {
    enabled: sg.enabled,
    mode: sg.style === "single" ? "single" : "rgb",
    color1: sg.color1, color2: sg.color2, color3: sg.color3,
    speed: sg.speed, intensity: sg.glowIntensity,
    targets: { search: true, nav: true, top: false, text: false },
    desktop: sg.desktop, mobile: sg.mobile, schedule: {}
  };
}
function mtPad2(n) { return (n < 10 ? "0" : "") + n; }
function mtLocalDate(d) { return d.getFullYear() + "-" + mtPad2(d.getMonth() + 1) + "-" + mtPad2(d.getDate()); }
function mtToMin(hhmm) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
function rgbScheduleActive(sch) {
  if (!sch || !sch.enabled) return true;
  var now = new Date();
  if (sch.dateFrom || sch.dateTo) {
    var today = mtLocalDate(now);
    if (sch.dateFrom && today < sch.dateFrom) return false;
    if (sch.dateTo && today > sch.dateTo) return false;
  }
  var s = mtToMin(sch.start), e = mtToMin(sch.end);
  if (s != null && e != null && s !== e) {
    var cur = now.getHours() * 60 + now.getMinutes();
    if (s < e) { if (cur < s || cur >= e) return false; }
    else { if (cur < s && cur >= e) return false; }   // overnight window
  }
  return true;
}

function applyRgbLight() {
  var body = document.body; if (!body) return;
  var root = document.documentElement;
  var cfg = mtRgbConfig() || {};
  var mode = cfg.mode || "rgb";
  var enabled = cfg.enabled !== false && cfg.enabled !== "false";
  var active = enabled && mode !== "off" && rgbScheduleActive(cfg.schedule);
  var wraps = document.querySelectorAll(".header-search-wrap");

  ["rgb-on", "rgb-mode-rgb", "rgb-mode-single", "rgb-mode-festival",
   "rgb-search", "rgb-nav", "rgb-top", "rgb-text", "rgb-desktop", "rgb-mobile",
   "mt-glow-desktop", "mt-glow-mobile"].forEach(function (k) { body.classList.remove(k); });
  wraps.forEach(function (w) { w.classList.remove("mt-glow"); });
  if (!active) return;

  var c1 = cfg.color1 || "#ff7a00";
  var c2 = mode === "single" ? c1 : (cfg.color2 || "#9b5cff");
  var c3 = mode === "single" ? c1 : (cfg.color3 || "#2bb8ff");
  var speed = ({ slow: "9s", medium: "6s", fast: "3.5s" })[cfg.speed] || "6s";
  var intensity = Math.max(0, Math.min(100, Number(cfg.intensity != null ? cfg.intensity : 50)));
  root.style.setProperty("--glow-c1", c1);
  root.style.setProperty("--glow-c2", c2);
  root.style.setProperty("--glow-c3", c3);
  root.style.setProperty("--glow-speed", speed);
  root.style.setProperty("--rgb-speed", speed);
  root.style.setProperty("--glow-amb", (intensity / 100 * 0.6).toFixed(3));
  root.style.setProperty("--glow-border", Math.max(0.3, intensity / 100).toFixed(3));
  root.style.setProperty("--rgb-amb", (intensity / 100).toFixed(3));

  body.classList.add("rgb-on");
  body.classList.add(mode === "festival" ? "rgb-mode-festival" : (mode === "single" ? "rgb-mode-single" : "rgb-mode-rgb"));
  var t = cfg.targets || { search: true, nav: true };
  var desk = cfg.desktop !== false && cfg.desktop !== "false";
  var mob = cfg.mobile !== false && cfg.mobile !== "false";
  if (desk) body.classList.add("rgb-desktop");
  if (mob) body.classList.add("rgb-mobile");
  if (t.search !== false) {
    body.classList.add("rgb-search");
    if (desk) body.classList.add("mt-glow-desktop");
    if (mob) body.classList.add("mt-glow-mobile");
    wraps.forEach(function (w) { w.classList.add("mt-glow"); });
  }
  if (t.nav) body.classList.add("rgb-nav");
  if (t.top) body.classList.add("rgb-top");
  if (t.text) body.classList.add("rgb-text");
}
// Kept so any older caller still works.
function applySearchGlow() { applyRgbLight(); }

/* ===========================================================
   Important Alert popup. A published alert with important=true
   ALSO slides in once from the right (it still shows in the bell
   too). Shown at most once per browser per alert id, so it never
   spams across page changes. A new important alert (new id) can
   show again. The orange bar is synced to the admin's duration.
   =========================================================== */
var MT_IMPORTANT_SHOWN_KEY = "mt_important_shown";
var MT_IMPORTANT_DONE = false;
function mtImportantShownIds() {
  try { var v = JSON.parse(localStorage.getItem(MT_IMPORTANT_SHOWN_KEY)); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
function mtMarkImportantShown(id) {
  var s = mtImportantShownIds();
  if (s.indexOf(id) === -1) { s.push(id); try { localStorage.setItem(MT_IMPORTANT_SHOWN_KEY, JSON.stringify(s.slice(-200))); } catch (e) {} }
}
function initImportantAlert() {
  if (MT_IMPORTANT_DONE) return;
  if (document.querySelector(".mt-important-pop")) return;   // one popup at a time
  var shown = mtImportantShownIds();
  var pick = mtAlerts().filter(function (a) { return a && a.important && shown.indexOf(a.id) === -1; })[0];
  if (!pick) return;
  MT_IMPORTANT_DONE = true;
  mtMarkImportantShown(pick.id);
  showImportantPopup(pick);
}
function showImportantPopup(a) {
  var meta = MT_ALERT_TYPE[a.type] || MT_ALERT_TYPE.general;
  var dur = Math.max(1, Math.min(60, Number(a.duration) || 5));
  var pop = document.createElement(a.link ? "a" : "div");
  pop.className = "mt-important-pop";
  if (a.link) pop.href = a.link;
  pop.setAttribute("role", "alert");
  pop.innerHTML =
    '<button class="mt-ip-close" type="button" aria-label="Dismiss">' + icon("x", 15) + "</button>" +
    '<div class="mt-ip-head"><span class="mt-ip-ic">' + (a.icon ? escapeHtml(a.icon) : icon(meta.icon, 15)) + '</span><span class="mt-ip-tag">Important</span></div>' +
    '<div class="mt-ip-title">' + escapeHtml(a.title || meta.label) + "</div>" +
    (a.description ? '<div class="mt-ip-desc">' + escapeHtml(a.description) + "</div>" : "") +
    '<div class="mt-ip-bar"><i style="animation-duration:' + dur + 's"></i></div>';
  document.body.appendChild(pop);
  var timer = null;
  function close() {
    if (timer) { clearTimeout(timer); timer = null; }
    pop.classList.remove("show");
    pop.classList.add("hide");
    setTimeout(function () { if (pop.parentNode) pop.parentNode.removeChild(pop); }, 420);
  }
  pop.querySelector(".mt-ip-close").addEventListener("click", function (e) {
    e.preventDefault(); e.stopPropagation(); close();
  });
  // A linked popup navigates on click; just clean up the timer first.
  if (a.link) pop.addEventListener("click", function () { if (timer) { clearTimeout(timer); timer = null; } });
  // Slide in next frame, then start the countdown + auto-close in sync with it.
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      pop.classList.add("show");
      timer = setTimeout(close, dur * 1000);
    });
  });
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
      <li><a href="index.html#finder">Supplement Finder</a></li>
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

// Minimal top bar for the login / register pages: a back button, the centred
// wordmark, and a link to the opposite action (Sign up on login, Login on
// register). Replaces the full store nav so the auth screens stay focused.
function authHeaderHTML() {
  var isRegister = document.body.classList.contains("auth-register");
  var backArrow = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  var alt = isRegister
    ? '<a class="auth-alt" href="login.html">' + icon("user", 18) + "<span>Login</span></a>"
    : '<a class="auth-alt" href="register.html">' + icon("adduser", 18) + "<span>Sign up</span></a>";
  return '<header class="auth-header">' +
    '<button type="button" class="auth-back" onclick="authGoBack()" aria-label="Go back">' + backArrow + "<span>Back</span></button>" +
    '<a class="auth-brand" href="index.html">MUSCLE <span>TONIK</span></a>' +
    alt +
    "</header>";
}

function authGoBack() {
  if (window.history.length > 1) window.history.back();
  else window.location.href = "index.html";
}

function renderLayout() {
  const h = document.getElementById("site-header");
  const f = document.getElementById("site-footer");
  // Login / register use a stripped-down header (no store nav) and no footer,
  // so the screen stays focused on the form.
  if (document.body.classList.contains("auth-page")) {
    if (h) h.innerHTML = authHeaderHTML();
    if (f) f.innerHTML = "";
    initReveal();
    return;
  }
  if (new URLSearchParams(window.location.search).get("mt_preview") === "1") setPreviewMode(true);
  document.body.classList.toggle("preview-mode", isPreviewMode());
  if (h) h.innerHTML = previewRibbonHTML() + headerHTML();
  if (f) f.innerHTML = footerHTML();
  updateHeaderCounts();
  updateAuthUI();
  updateNotifBadge();
  applyRgbLight();
  // Re-evaluate the schedule every minute so the light turns on/off at its
  // configured time window without needing a reload.
  if (!window.__rgbTimer) window.__rgbTimer = setInterval(applyRgbLight, 60000);
  initTopOffers();
  initNavDropdowns();
  initScrollShadow();
  // Close the notifications dropdown on an outside click or Escape. Bound once.
  if (!window.__mtNotifBound) {
    window.__mtNotifBound = true;
    document.addEventListener("click", function (e) {
      const wrap = document.getElementById("notifWrap");
      if (wrap && !wrap.contains(e.target)) closeNotifMenu();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeNotifMenu(); });
  }
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

// Free-delivery threshold mirrors FREE_SHIPPING_OVER in js/checkout/cart.js
// (checkout remains the source of truth for the actual charge). This only
// drives the progress hint shown in the cart drawer + cart page.
var MT_FREE_SHIP_OVER = 599;
function freeShipBarHTML(amount, forceUnlocked) {
  var t = MT_FREE_SHIP_OVER;
  amount = Math.max(0, Math.round(Number(amount) || 0));
  var unlocked = forceUnlocked === true || amount > t;
  var remaining = unlocked ? 0 : (t + 1 - amount);
  var pct = Math.max(4, Math.min(100, Math.round(amount / (t + 1) * 100)));
  return '<div class="free-ship' + (unlocked ? " is-unlocked" : "") + '">' +
    '<div class="free-ship-msg">' +
      (unlocked
        ? icon("check", 14) + " <b>FREE delivery unlocked!</b>"
        : "Add <b>" + formatINR(remaining) + "</b> more for <b>FREE delivery</b>") +
    "</div>" +
    '<div class="free-ship-track"><span style="width:' + pct + '%"></span></div>' +
  "</div>";
}

function renderCartDrawer() {
  const items = Cart.items();
  const body = document.getElementById("cartDrawerBody");
  const countEl = document.getElementById("drawerCount");
  const subEl = document.getElementById("drawerSubtotal");
  const fsEl = document.getElementById("drawerFreeShip");
  if (!body) return;
  if (countEl) countEl.textContent = Cart.count();
  if (items.length === 0) {
    body.innerHTML = '<div class="empty-state" style="padding:60px 16px;">' +
      '<div class="icon">' + icon("cart", 28) + "</div>" +
      '<h4 style="font-size:15px;">Your cart is empty</h4>' +
      '<p style="color:var(--text-light);font-size:13px;margin-top:8px;">Add products to see them here.</p>' +
      "</div>";
    if (subEl) subEl.textContent = formatINR(0);
    if (fsEl) fsEl.innerHTML = "";
    return;
  }
  if (fsEl) fsEl.innerHTML = freeShipBarHTML(Cart.total());
  body.innerHTML = items.map(i => {
    const p = getProductById(i.id);
    if (!p) return "";
    const weight = i.weight || "";
    const unit = variantUnitPrice(p, weight);
    const label = resolveWeightLabel(p, weight);
    const cArg = i.comboId ? "'" + escapeHtml(i.comboId) + "'" : "null";
    const wArg = "'" + escapeHtml(weight) + "'";
    return '<div class="drawer-item">' +
      '<div class="drawer-thumb" style="background:' + p.color + '18">' + productImage(p) + "</div>" +
      '<div class="drawer-info">' +
        "<h5>" + p.name + "</h5>" +
        (label ? '<span class="drawer-variant">' + escapeHtml(label) + "</span>" : "") +
        '<span class="drawer-price">' + formatINR(unit) + "</span>" +
        '<div class="qty-box sm">' +
          '<button onclick="drawerChangeQty(' + p.id + ",-1," + cArg + "," + wArg + ')" aria-label="Decrease quantity">-</button>' +
          "<span>" + i.qty + "</span>" +
          '<button onclick="drawerChangeQty(' + p.id + ",1," + cArg + "," + wArg + ')" aria-label="Increase quantity">+</button>' +
        "</div>" +
      "</div>" +
      '<button class="drawer-remove" onclick="Cart.remove(' + p.id + "," + cArg + "," + wArg + ');renderCartDrawer();" aria-label="Remove">' + icon("x", 15) + "</button>" +
    "</div>";
  }).join("");
  if (subEl) subEl.textContent = formatINR(Cart.total());
}

function drawerChangeQty(id, delta, comboId, weight) {
  const items = Cart.items();
  const found = Cart.find(items, id, comboId, weight);
  if (found) Cart.setQty(id, found.qty + delta <= 0 ? 1 : found.qty + delta, comboId, weight);
  renderCartDrawer();
}

let qvProductId = null;
let qvQty = 1;
let qvWeight = "";
function openQuickView(id) {
  const p = getProductById(id);
  if (!p) return;
  qvProductId = p.id;
  qvQty = 1;
  const brand = getBrandById(p.brand);
  // The quick view has no pack selector, so it shows and adds the default
  // (first) pack; the full product page is where other packs are chosen.
  const packOpts = productWeightOptions(p);
  qvWeight = packOpts.length ? packOpts[0].label : "";
  const now = variantUnitPrice(p, qvWeight);
  const was = packOpts.length ? variantOldPrice(p, qvWeight) : (Number(p.oldPrice) || 0);
  const off = was > now ? discountPct(now, was) : 0;
  const packNote = packOpts.length > 1
    ? '<div class="qv-packs">Packs: ' + packOpts.map(o => escapeHtml(o.label)).join(" · ") + " — choose on the product page</div>"
    : "";
  const wished = Wishlist.has(p.id);
  document.getElementById("qvBody").innerHTML =
    '<div class="qv-media" style="background:' + p.color + '15">' + productImage(p).replace('width="90" height="108"', 'width="150" height="180"') + "</div>" +
    '<div class="qv-info">' +
      '<span class="brand">' + brand.name + "</span>" +
      "<h3>" + p.name + "</h3>" +
      '<div class="stars-row">' + starString(p.rating) + " " + p.rating + " • " + p.reviews.toLocaleString("en-IN") + " reviews</div>" +
      '<div class="price-row"><span class="now">' + formatINR(now) + "</span>" + (was > now ? '<span class="was">' + formatINR(was) + '</span><span class="badge badge-orange">' + off + "% off</span>" : "") + "</div>" +
      packNote +
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
  Cart.add(qvProductId, qvQty, qvWeight);
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
    // Reuse the product card's exact pricing so the suggest preview can never
    // drift from the catalogue. Guarded so a missing helper/field can't throw.
    let now = Number(p.price) || 0, was = 0, off = 0, defLabel = "";
    try {
      const packOpts = (typeof productWeightOptions === "function") ? (productWeightOptions(p) || []) : [];
      defLabel = packOpts.length ? packOpts[0].label : (p.weight || "");
      now = (packOpts.length && typeof variantUnitPrice === "function") ? variantUnitPrice(p, packOpts[0].label) : (Number(p.price) || 0);
      was = (packOpts.length && typeof variantOldPrice === "function") ? variantOldPrice(p, packOpts[0].label) : (Number(p.oldPrice) || 0);
      off = (was > now) ? (typeof discountPct === "function" ? discountPct(now, was) : Math.round((was - now) / was * 100)) : 0;
    } catch (e) {
      now = Number(p.price) || 0; was = Number(p.oldPrice) || 0;
      off = (was > now && was > 0) ? Math.round((was - now) / was * 100) : 0; defLabel = p.weight || "";
    }
    const ratingHtml = p.rating
      ? '<span class="sx-rating">' + starString(p.rating) + " " + p.rating + (p.reviews != null ? " (" + Number(p.reviews).toLocaleString("en-IN") + ")" : "") + "</span>"
      : "";
    const priceHtml = '<span class="sx-price"><b>' + formatINR(now) + "</b>" + (off > 0 ? " <s>" + formatINR(was) + "</s> <em>" + off + "% off</em>" : "") + "</span>";
    const weightHtml = defLabel ? '<span class="sx-weight">' + escapeHtml(defLabel) + "</span>" : "";
    return '<a class="suggest-item" data-idx="' + i + '" href="product.html?id=' + p.id + '">' +
      '<span class="suggest-thumb" style="background:' + p.color + '18">' + productImage(p) + "</span>" +
      '<span class="suggest-info">' +
        '<span class="suggest-name">' + highlightMatch(p.name, q) + "</span>" +
        '<span class="suggest-meta">' + brand.name + " · " + formatINR(now) + "</span>" +
        '<span class="suggest-extra">' + ratingHtml + priceHtml + weightHtml + "</span>" +
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
  // After the catalogue (and any preloader) has settled, surface an Important
  // Alert popup if one is published and hasn't been shown in this browser yet.
  setTimeout(initImportantAlert, 900);
});
