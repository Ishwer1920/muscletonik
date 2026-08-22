/* ===========================================================
   MUSCLE TONIK - Homepage render logic
   =========================================================== */

let heroIndex = 0;
let heroTimer = null;
const HOME_SECTION_MAP = {
  hero: "[data-home-section='hero']",
  categories: "[data-home-section='categories']",
  "best-products": "[data-home-section='best-products']",
  featured: "[data-home-section='featured']",
  deals: "[data-home-section='deals']",
  brands: "[data-home-section='brands']",
  bmi: "[data-home-section='bmi']",
  collections: "[data-home-section='collections']",
  testimonials: "[data-home-section='testimonials']",
  newsletter: "[data-home-section='newsletter']"
};

function applyHomepageContent() {
  const content = (window.MT_SHARED_CATALOG && window.MT_SHARED_CATALOG.siteContent) || SITE_CONTENT || {};
  const sections = new Map((content.sections || []).map(section => [section.id, section]));
  const setText = (selector, value, root) => {
    const node = (root || document).querySelector(selector);
    if (node && value != null && value !== "") node.textContent = value;
  };
  const mappings = [
    { id: "hero", root: document, fields: { eyebrow: ".hero-tag", headline: ".hero-copy h1", subheadline: ".hero-copy p" } },
    { id: "categories", root: document, fields: { subheading: "[data-home-section='categories'] .sec-head .eyebrow", heading: "[data-home-section='categories'] .sec-head h2" } },
    { id: "brands", root: document, fields: { subheading: "[data-home-section='brands'] .sec-head .eyebrow", heading: "[data-home-section='brands'] .sec-head h2" } },
    { id: "best-products", root: document, fields: { subheading: "[data-home-section='best-products'] .sec-head .eyebrow", heading: "[data-home-section='best-products'] .sec-head h2" } },
    { id: "deals", root: document, fields: { subheading: "[data-home-section='deals'] .sec-head .eyebrow", heading: "[data-home-section='deals'] h2", copy: "[data-home-section='deals'] p" } },
    { id: "featured", root: document, fields: { subheading: "[data-home-section='featured'] .sec-head .eyebrow", heading: "[data-home-section='featured'] .sec-head h2" } },
    { id: "collections", root: document, fields: { subheading: "[data-home-section='collections'] .sec-head .eyebrow", heading: "[data-home-section='collections'] .sec-head h2" } },
    { id: "testimonials", root: document, fields: { subheading: "[data-home-section='testimonials'] .sec-head .eyebrow", heading: "[data-home-section='testimonials'] .sec-head h2" } },
    { id: "newsletter", root: document, fields: { heading: "[data-home-section='newsletter'] h3", copy: "[data-home-section='newsletter'] p" } }
  ];

  mappings.forEach(map => {
    const section = sections.get(map.id);
    if (!section || !section.data) return;
    Object.entries(map.fields).forEach(([key, selector]) => {
      setText(selector, section.data[key], map.root);
    });
  });

  if (content.footer?.note) {
    setText("footer.site .about", content.footer.note, document);
  }
}

// A slide is banner artwork when it carries an image and hasn't been explicitly
// marked as a rich (text + CTA) slide. Rich slides stay supported so the hero
// never renders empty while banner artwork is still being produced.
function isImageSlide(slide) {
  return Boolean(slide && (slide.image || slide.imageMobile) && slide.type !== "rich");
}

// A slideshow banner carrying its own copy needs the caption overlay; artwork
// with no text renders as a plain image slide.
function isBannerSlide(slide) {
  return Boolean(slide && slide.type === "banner" && (slide.title || slide.subtitle || slide.ctaText));
}

// Only same-origin relative paths and http(s) URLs may drive a banner link, so
// CMS content can never smuggle in a javascript: URL.
function safeSlideHref(href) {
  const value = String(href || "").trim();
  if (!value) return "";
  if (/^(https?:)?\/\//i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "";
  return value;
}

function imageSlideMarkup(slide, index) {
  const desktop = escapeHtml(slide.image || slide.imageMobile);
  const mobile = slide.imageMobile ? escapeHtml(slide.imageMobile) : "";
  const alt = escapeHtml(slide.alt || slide.title || "Promotional banner");
  const href = safeSlideHref(slide.href);
  // The first banner is the LCP element — it must not be lazy.
  const loading = index === 0 ? "eager" : "lazy";
  const picture = `
    <picture>
      ${mobile ? `<source media="(max-width:640px)" srcset="${mobile}">` : ""}
      <img src="${desktop}" alt="${alt}" loading="${loading}" decoding="async" draggable="false">
    </picture>`;
  const inner = href
    ? `<a class="hero-banner" href="${escapeHtml(href)}">${picture}</a>`
    : `<div class="hero-banner">${picture}</div>`;
  return `<article class="hero-slide is-image" data-slide="${index}">${inner}</article>`;
}

// Artwork + overlaid title/subtitle/CTA. The copy sits in a scrim so it stays
// readable over any image, and collapses to full width on small screens.
function bannerSlideMarkup(slide, index) {
  const desktop = escapeHtml(slide.image || slide.imageMobile);
  const mobile = slide.imageMobile ? escapeHtml(slide.imageMobile) : "";
  const alt = escapeHtml(slide.alt || slide.title || "Promotional banner");
  const href = safeSlideHref(slide.href);
  const loading = index === 0 ? "eager" : "lazy";
  const picture = `
    <picture>
      ${mobile ? `<source media="(max-width:640px)" srcset="${mobile}">` : ""}
      <img src="${desktop}" alt="${alt}" loading="${loading}" decoding="async" draggable="false">
    </picture>`;
  const cta = slide.ctaText && href
    ? `<a class="btn btn-primary hero-banner-cta" href="${escapeHtml(href)}">${escapeHtml(slide.ctaText)}</a>`
    : "";
  const caption = `
    <div class="hero-banner-caption">
      ${slide.title ? `<h2>${escapeHtml(slide.title)}</h2>` : ""}
      ${slide.subtitle ? `<p>${escapeHtml(slide.subtitle)}</p>` : ""}
      ${cta}
    </div>`;
  // The whole banner is only a link when there is no separate CTA button, so
  // a nested <a> can never end up inside another <a>.
  const inner = href && !cta
    ? `<a class="hero-banner" href="${escapeHtml(href)}">${picture}${caption}</a>`
    : `<div class="hero-banner">${picture}${caption}</div>`;
  return `<article class="hero-slide is-image is-banner" data-slide="${index}">${inner}</article>`;
}

function richSlideMarkup(slide, index) {
  const accentClass = slide.accent === "orange" ? "hero-orange" : "hero-dark";
  return `
    <article class="hero-slide" data-slide="${index}">
      <div class="container">
        <div class="hero-copy">
          <div class="hero-tag">${slide.eyebrow}</div>
          <h1>${slide.title}</h1>
          <p>${slide.copy}</p>
          <div class="hero-btns">
            <a class="btn btn-primary" href="${slide.cta1.href}">${slide.cta1.label}</a>
            <a class="btn btn-outline-light" href="${slide.cta2.href}">${slide.cta2.label}</a>
          </div>
          <div class="hero-metrics">
            <div class="hero-metric"><b>100%</b><span>Authentic stock</span></div>
            <div class="hero-metric"><b>24 hr</b><span>Dispatch in metro zones</span></div>
            <div class="hero-metric"><b>4.8/5</b><span>Average customer rating</span></div>
          </div>
        </div>
        <div class="hero-visual">
          <div class="hero-orb"></div>
          ${offerCardMarkup(slide, accentClass)}
        </div>
      </div>
    </article>`;
}

// The square card beside the hero copy. Given an artwork URL it becomes a
// plain clickable banner; with none set it falls back to the designed
// "10% extra off" panel. Both come from Admin -> Banners -> Designed hero.
function offerCardMarkup(slide, accentClass) {
  if (slide.cardImage) {
    const src = escapeHtml(slide.cardImage);
    const alt = escapeHtml(slide.cardAlt || "Current offer");
    const img = `<img src="${src}" alt="${alt}" loading="lazy">`;
    return slide.cardHref
      ? `<a class="glass-card hero-offer-card" href="${escapeHtml(slide.cardHref)}">${img}</a>`
      : `<div class="glass-card hero-offer-card">${img}</div>`;
  }
  return `
          <div class="glass-card ${accentClass}">
            <div class="pct">10%</div>
            <div class="lbl">extra off on first order</div>
            <div style="margin-top:18px;display:flex;align-items:center;gap:14px;">
              <div style="width:88px;height:108px;">${productImage(PRODUCTS[0])}</div>
              <div style="text-align:left;">
                <div style="font-size:12px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em;">Deal spotlight</div>
                <div style="font-family:'Poppins',sans-serif;font-size:18px;font-weight:700;line-height:1.2;margin-top:5px;">Best sellers and daily deals in one clean view.</div>
              </div>
            </div>
            <div class="product-badges">
              <span>Orange CTA</span>
              <span>Fast checkout</span>
              <span>Mobile ready</span>
            </div>
          </div>`;
}

/* ===========================================================
   COMPOSED BANNERS — Admin -> Slideshow (layout "promo" / "festive")

   These replace what used to be hardcoded HTML sections. Every string,
   image, colour, CTA and the countdown come from the API, so the banner
   changes without a deploy.
   =========================================================== */

// Absolute deadline from the server (ISO-8601 carrying a UTC offset), so the
// countdown reads the same in every timezone and survives a refresh. The
// remaining time is recomputed from Date.now() on each tick rather than
// decremented, so a throttled background tab or a sleeping laptop cannot make
// it drift.
function startBannerCountdown(root, isoEnd, onExpire) {
  var box = root.querySelector("[data-countdown]");
  if (!box || !isoEnd) return;
  var deadline = Date.parse(isoEnd);
  if (isNaN(deadline)) return;

  var pad = function (n) { return String(n).padStart(2, "0"); };
  var cells = {
    h: box.querySelector("[data-cd-h]"),
    m: box.querySelector("[data-cd-m]"),
    s: box.querySelector("[data-cd-s]")
  };
  var timer = null;
  function tick() {
    var diff = deadline - Date.now();
    if (diff <= 0) {
      if (cells.h) cells.h.textContent = "00";
      if (cells.m) cells.m.textContent = "00";
      if (cells.s) cells.s.textContent = "00";
      clearInterval(timer);
      if (typeof onExpire === "function") onExpire();
      return;
    }
    var total = Math.floor(diff / 1000);
    // Days roll up into hours, so a three-day sale reads "72" instead of
    // silently restarting at 24.
    if (cells.h) cells.h.textContent = pad(Math.floor(total / 3600));
    if (cells.m) cells.m.textContent = pad(Math.floor((total % 3600) / 60));
    if (cells.s) cells.s.textContent = pad(total % 60);
  }
  tick();
  timer = setInterval(tick, 1000);
}

function bannerCta(text, href, cls) {
  if (!text || !href) return "";
  return '<a class="' + cls + '" href="' + escapeHtml(href) + '">' + escapeHtml(text) + "</a>";
}

// Background: an uploaded image wins, otherwise the configured colour or
// gradient. Both are optional.
function bannerBackgroundStyle(b) {
  var out = [];
  if (b.backgroundColor) out.push("background:" + b.backgroundColor);
  if (b.image) {
    out.push("background-image:url('" + encodeURI(b.image) + "')");
    out.push("background-size:cover");
    out.push("background-position:center");
  }
  return out.join(";");
}

function promoBannerMarkup(b) {
  var expired = b.timerEnabled && b.timerEnd && Date.parse(b.timerEnd) <= Date.now();
  var product = b.product;
  var showTimer = b.timerEnabled && b.timerEnd && !(expired && b.expiredBehavior === "expired");
  var timer = showTimer
    ? '<div class="countdown" data-countdown>' +
        "<div><b data-cd-h>00</b><span>HRS</span></div>" +
        "<div><b data-cd-m>00</b><span>MIN</span></div>" +
        "<div><b data-cd-s>00</b><span>SEC</span></div>" +
      "</div>"
    : "";
  var expiredNote = (expired && b.expiredBehavior === "expired")
    ? '<p class="promo-expired">This offer has ended.</p>'
    : "";

  // The featured product is read live from the catalogue, so its price and
  // photo can never drift out of step with the marketplace.
  var card = "";
  if (product) {
    card = '<a class="deal-spotlight" href="' + escapeHtml(product.href) + '">' +
      '<span class="deal-shot">' +
        (product.image ? '<img src="' + escapeHtml(product.image) + '" alt="' + escapeHtml(product.name) + '" loading="lazy">' : "") +
      "</span>" +
      '<span class="deal-brand">' + escapeHtml(product.brand || "") + "</span>" +
      '<span class="deal-name">' + escapeHtml(product.name) + "</span>" +
      '<span class="deal-price">' + formatINR(product.price) +
        (product.oldPrice && product.oldPrice > product.price ? " <s>" + formatINR(product.oldPrice) + "</s>" : "") +
      "</span>" +
      (b.ctaText ? '<span class="btn btn-outline-light deal-cta">' + escapeHtml(b.ctaText) + "</span>" : "") +
    "</a>";
  } else if (b.productImage) {
    card = '<div class="deal-spotlight"><span class="deal-shot"><img src="' +
      escapeHtml(b.productImage) + '" alt="" loading="lazy"></span></div>';
  }

  return '<div class="deal-banner" style="' + bannerBackgroundStyle(b) + '">' +
      (b.overlay ? '<span class="banner-scrim" style="opacity:' + (b.overlay / 100) + '"></span>' : "") +
      '<div class="deal-copy">' +
        (b.subheading ? '<span class="eyebrow">' + escapeHtml(b.subheading) + "</span>" : "") +
        (b.heading ? "<h2>" + escapeHtml(b.heading) + "</h2>" : "") +
        (b.paragraph ? "<p>" + escapeHtml(b.paragraph) + "</p>" : "") +
        (b.timerLabel && showTimer ? '<span class="promo-timer-label">' + escapeHtml(b.timerLabel) + "</span>" : "") +
        timer + expiredNote +
        '<div class="promo-actions">' +
          bannerCta(b.ctaText, b.ctaUrl, "btn btn-primary") +
          bannerCta(b.cta2Text, b.cta2Url, "btn btn-outline-light") +
        "</div>" +
      "</div>" +
      '<div class="deal-visual">' + card + "</div>" +
    "</div>";
}

function festiveBannerMarkup(b) {
  var visual;
  if (b.logo) {
    visual = '<div class="promo-visual"><img src="' + escapeHtml(b.logo) + '" alt="" loading="lazy" style="width:' +
      (Number(b.logoSize) || 120) + 'px;height:auto;"></div>';
  } else if (b.mainImage) {
    visual = '<div class="promo-visual"><img src="' + escapeHtml(b.mainImage) + '" alt="" loading="lazy"></div>';
  } else {
    visual = '<div class="promo-visual" aria-hidden="true">' + festiveRakhiSvg() + "</div>";
  }

  return '<div class="promo-banner promo-festive" style="' + bannerBackgroundStyle(b) + '">' +
      (b.overlay ? '<span class="banner-scrim" style="opacity:' + (b.overlay / 100) + '"></span>' : "") +
      '<div class="promo-text">' +
        (b.offerText ? '<span class="promo-eyebrow">' + escapeHtml(b.offerText) + "</span>" : "") +
        (b.heading ? "<h2>" + escapeHtml(b.heading) + "</h2>" : "") +
        (b.subheadingText ? '<p class="promo-sub">' + escapeHtml(b.subheadingText) + "</p>" : "") +
        (b.paragraph ? '<p class="promo-copy">' + escapeHtml(b.paragraph) + "</p>" : "") +
        '<div class="promo-actions">' +
          bannerCta(b.ctaText, b.ctaUrl, "btn btn-festive") +
          bannerCta(b.cta2Text, b.cta2Url, "btn btn-outline-light") +
        "</div>" +
        (b.note ? '<p class="promo-note">' + escapeHtml(b.note) + "</p>" : "") +
      "</div>" + visual +
    "</div>";
}

// Fallback artwork when no logo or image is configured, so the festive layout
// never renders as a bare colour block.
function festiveRakhiSvg() {
  return '<svg viewBox="0 0 220 220" role="presentation" focusable="false">' +
    '<defs><linearGradient id="rkGold" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#ffe6a6"/><stop offset="1" stop-color="#e0972c"/></linearGradient>' +
    '<linearGradient id="rkThread" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#ff9db4"/><stop offset="1" stop-color="#f2647f"/></linearGradient></defs>' +
    '<path d="M18 128c34-26 52 22 84 4" stroke="url(#rkThread)" stroke-width="11" fill="none" stroke-linecap="round"/>' +
    '<path d="M202 128c-34-26-52 22-84 4" stroke="url(#rkThread)" stroke-width="11" fill="none" stroke-linecap="round"/>' +
    '<circle cx="110" cy="104" r="46" fill="url(#rkGold)"/>' +
    '<circle cx="110" cy="104" r="33" fill="#a51f3f" opacity=".92"/>' +
    '<circle cx="110" cy="104" r="15" fill="url(#rkGold)"/>' +
    '<g fill="#ffd98a"><circle cx="110" cy="47" r="7"/><circle cx="110" cy="161" r="7"/>' +
    '<circle cx="53" cy="104" r="7"/><circle cx="167" cy="104" r="7"/></g></svg>';
}

// Mount the first live banner of each composed layout. A section stays hidden
// when nothing is configured, so the homepage simply skips it.
function renderComposedBanners() {
  var all = (window.MT_SHARED_CATALOG && window.MT_SHARED_CATALOG.banners) || [];
  var mounts = [
    { layout: "promo", mount: "promoBannerMount", host: "promoBanner", render: promoBannerMarkup },
    { layout: "festive", mount: "festiveBannerMount", host: "festiveBanner", render: festiveBannerMarkup }
  ];
  mounts.forEach(function (cfg) {
    var section = document.getElementById(cfg.mount);
    var host = document.getElementById(cfg.host);
    if (!section || !host) return;
    var banner = all.filter(function (b) { return b.layout === cfg.layout; })[0];
    if (!banner) { section.hidden = true; return; }

    host.innerHTML = cfg.render(banner);
    section.hidden = false;

    if (banner.timerEnabled && banner.timerEnd) {
      startBannerCountdown(host, banner.timerEnd, function () {
        // The server's is_live() already drops a "hide" banner on the next
        // load; this covers the tab that was open when the clock ran out.
        if (banner.expiredBehavior === "hide") section.hidden = true;
        else if (banner.expiredBehavior === "expired") host.innerHTML = cfg.render(banner);
      });
    }
  });
}

function renderHeroSlides() {
  const root = document.getElementById("heroSlides");
  const dots = document.getElementById("heroDots");
  const slider = document.querySelector(".hero-slider");
  if (!root || !dots) return;
  const content = (window.MT_SHARED_CATALOG && window.MT_SHARED_CATALOG.siteContent) || SITE_CONTENT || {};
  const slides = resolveHeroSlides(content).map(slide => withOfferCard(slide, content.hero || {}));

  // An all-artwork hero drops the dark gradient chrome and hugs the banner,
  // the way HealthKart's does. A mixed/rich hero keeps the designed backdrop.
  const allImages = slides.length > 0 && slides.every(isImageSlide);
  if (slider) slider.classList.toggle("is-banner-mode", allImages);

  root.className = "hero-track";
  root.innerHTML = slides
    .map((slide, index) => {
      if (isBannerSlide(slide)) return bannerSlideMarkup(slide, index);
      return isImageSlide(slide) ? imageSlideMarkup(slide, index) : richSlideMarkup(slide, index);
    })
    .join("");

  dots.innerHTML = slides.length > 1
    ? slides.map((_, i) => `<button type="button" class="${i === 0 ? "active" : ""}" aria-label="Go to slide ${i + 1}" onclick="goToHeroSlide(${i})"><span class="dot-fill"></span></button>`).join("")
    : "";

  heroIndex = 0;
  applyHeroOffset(0);
}

// Promo artwork shown in the hero offer card when nothing is configured in
// Admin -> Banners yet. The file lives in public_html/uploads/banners/; set
// `image` to "" to go back to the designed "10% extra off" panel. Anything
// saved in the admin panel overrides this.
const HERO_OFFER_FALLBACK = {
  image: "/uploads/banners/ad.jpeg",
  href: "offers.html",
  alt: "Launching offer: buy 3 GNC products for Rs.2499, free T-shirt with bill"
};

// The offer artwork is one setting for the whole hero, not per slide, so it
// is copied onto every slide here. A slide may still override it.
function withOfferCard(slide, hero) {
  return {
    ...slide,
    cardImage: slide.cardImage || hero.cardImage || HERO_OFFER_FALLBACK.image || "",
    cardAlt: slide.cardAlt || hero.cardAlt || HERO_OFFER_FALLBACK.alt || "",
    cardHref: slide.cardHref || hero.cardHref || HERO_OFFER_FALLBACK.href || ""
  };
}

// Banners configured in Admin -> Slideshow win over anything legacy. They are
// already ordered and schedule-filtered by the API, so they are used as-is.
function resolveBannerSlides() {
  const banners = (window.MT_SHARED_CATALOG && window.MT_SHARED_CATALOG.banners) || [];
  if (!Array.isArray(banners) || !banners.length) return null;
  return banners
    .filter(b => b && b.image)
    .map(b => ({
      type: "banner",
      image: b.image,
      imageMobile: b.imageMobile || "",
      alt: b.alt || b.title || "Promotional banner",
      title: b.title || "",
      subtitle: b.subtitle || "",
      ctaText: b.ctaText || "",
      href: b.ctaUrl || b.href || ""
    }));
}

function resolveHeroSlides(content) {
  const banners = resolveBannerSlides();
  if (banners && banners.length) return banners;
  // The API resolves the slide list (hero.slides -> legacy heroSlides -> seed)
  // and js/data.js mirrors it here, so this is the authoritative list. Reading
  // content.hero directly would collapse a multi-slide hero down to one slide.
  const shared = window.MT_SHARED_CATALOG && window.MT_SHARED_CATALOG.heroSlides;
  if (Array.isArray(shared) && shared.length) return shared;
  if (content.heroSlides && Array.isArray(content.heroSlides) && content.heroSlides.length) return content.heroSlides;
  if (content.hero && typeof content.hero === "object") {
    return [{
      eyebrow: content.hero.eyebrow || "Premium supplements for real routines",
      title: content.hero.headline || "Fuel Your Strength\nBuild Your Legacy",
      copy: content.hero.subheadline || "Buy authentic Whey Protein, Creatine, Mass Gainers, Vitamins and Fitness Supplements.",
      cta1: { label: content.hero.buttonText || "Shop Now", href: content.hero.buttonLink || "marketplace.html" },
      cta2: { label: "Explore Categories", href: "category.html" },
      accent: content.hero.alignment === "center" ? "dark" : "orange"
    }];
  }
  return HERO_SLIDES;
}

// Slide the track horizontally. `extraPx` is the live finger/mouse offset while
// dragging; it is zero for a settled slide.
function applyHeroOffset(extraPx, animate) {
  const track = document.getElementById("heroSlides");
  if (!track) return;
  track.style.transition = animate ? "transform .5s var(--ease, ease)" : "none";
  track.style.transform = `translate3d(calc(${-heroIndex * 100}% + ${extraPx}px), 0, 0)`;
}

function goToHeroSlide(index) {
  const slides = document.querySelectorAll(".hero-slide");
  const dots = document.querySelectorAll("#heroDots button");
  if (!slides.length) return;
  heroIndex = (index + slides.length) % slides.length;
  slides.forEach((slide, i) => slide.classList.toggle("active", i === heroIndex));
  dots.forEach((dot, i) => {
    dot.classList.toggle("active", i === heroIndex);
    const fill = dot.querySelector(".dot-fill");
    if (fill && i !== heroIndex) {
      fill.style.transition = "none";
      fill.style.transform = "scaleX(0)";
    }
  });
  applyHeroOffset(0, true);
  restartHeroTimer();
}

// Autoplay cadence comes from Admin -> Slideshow (SiteSetting "slideshow").
// The server already clamps it to 2-60s; this is just the client-side default
// for the moment before the catalogue lands.
function heroSettings() {
  const s = (window.MT_SHARED_CATALOG && window.MT_SHARED_CATALOG.slideshowSettings) || {};
  const seconds = Number(s.intervalSeconds);
  return {
    intervalMs: (isFinite(seconds) && seconds >= 2 && seconds <= 60 ? seconds : 6.5) * 1000,
    autoplay: s.autoplay !== false,
    pauseOnHover: s.pauseOnHover !== false
  };
}

function heroReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function restartHeroTimer() {
  clearInterval(heroTimer);
  const slideCount = document.querySelectorAll(".hero-slide").length;
  if (slideCount < 2) return;
  if (heroReducedMotion()) return;

  const cfg = heroSettings();
  if (!cfg.autoplay) return;

  // Drive the dot's progress fill off the same duration, so the indicator is
  // an honest countdown to the next slide rather than decoration.
  const active = document.querySelector("#heroDots button.active .dot-fill");
  if (active) {
    active.style.transition = "none";
    active.style.transform = "scaleX(0)";
    // Force a reflow so the reset is committed before the animation starts.
    void active.offsetWidth;
    active.style.transition = "transform " + cfg.intervalMs + "ms linear";
    active.style.transform = "scaleX(1)";
  }

  heroTimer = setInterval(() => goToHeroSlide(heroIndex + 1), cfg.intervalMs);
}

// Hovering the hero holds the current slide, so a customer reading a banner is
// never yanked to the next one mid-sentence.
function wireHeroHoverPause() {
  const slider = document.querySelector(".hero-slider");
  if (!slider || slider.dataset.hoverWired === "1") return;
  slider.dataset.hoverWired = "1";
  slider.addEventListener("mouseenter", () => {
    if (!heroSettings().pauseOnHover) return;
    clearInterval(heroTimer);
    const fill = document.querySelector("#heroDots button.active .dot-fill");
    if (fill) {
      // Freeze the bar where it is rather than snapping it back.
      const width = getComputedStyle(fill).transform;
      fill.style.transition = "none";
      fill.style.transform = width;
    }
  });
  slider.addEventListener("mouseleave", () => {
    if (!heroSettings().pauseOnHover) return;
    restartHeroTimer();
  });
}

// Drag/swipe with snap. Pointer events cover touch, mouse and pen in one path.
function setupHeroDrag() {
  const track = document.getElementById("heroSlides");
  if (!track) return;
  let startX = 0;
  let delta = 0;
  let dragging = false;
  // Survives past onUp so the click handler (which fires after pointerup) can
  // tell a drag from a genuine tap. Cleared on the next press, not on release.
  let lastDragDistance = 0;

  const onDown = event => {
    if (document.querySelectorAll(".hero-slide").length < 2) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragging = true;
    startX = event.clientX;
    delta = 0;
    lastDragDistance = 0;
    clearInterval(heroTimer);
    track.classList.add("dragging");
  };

  const onMove = event => {
    if (!dragging) return;
    delta = event.clientX - startX;
    applyHeroOffset(delta);
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    track.classList.remove("dragging");
    // A swipe past 18% of the viewport advances; anything less snaps back.
    const threshold = track.clientWidth * 0.18;
    if (delta <= -threshold) goToHeroSlide(heroIndex + 1);
    else if (delta >= threshold) goToHeroSlide(heroIndex - 1);
    else { applyHeroOffset(0, true); restartHeroTimer(); }
    lastDragDistance = Math.abs(delta);
    delta = 0;
  };

  track.addEventListener("pointerdown", onDown);
  track.addEventListener("pointermove", onMove);
  track.addEventListener("pointerup", onUp);
  track.addEventListener("pointercancel", onUp);
  track.addEventListener("pointerleave", onUp);
  // A drag that ends on a banner must not also follow its link.
  track.addEventListener("click", event => {
    if (lastDragDistance > 6) event.preventDefault();
  }, true);
}

function renderGoals() {
  const root = document.getElementById("goalGrid");
  if (!root) return;
  const descriptions = {
    "build-muscle": "Protein, creatine and recovery essentials.",
    "gain-weight": "Calorie-dense formulas for hard gainers.",
    "lose-fat": "Lean support, satiety and workout energy.",
    "strength": "Performance-focused products that fit training blocks.",
    "wellness": "Daily nutrition that keeps the routine consistent."
  };
  root.innerHTML = GOALS.map(goal => `
    <a class="goal-card reveal" href="marketplace.html?search=${encodeURIComponent(goal.name)}">
      <div class="icon">${icon(goal.icon, 24)}</div>
      <div>
        <h3>${goal.name}</h3>
        <p>${descriptions[goal.id]}</p>
      </div>
    </a>
  `).join("");
}

function renderCategories() {
  const root = document.getElementById("categoryGrid");
  if (!root) return;
  root.innerHTML = CATEGORIES.map(category => {
    const count = PRODUCTS.filter(product => product.category === category.id).length;
    return `
      <a class="cat-card reveal" href="marketplace.html?category=${category.id}">
        <div class="icon">${icon(category.icon, 26)}</div>
        <span>${category.name}</span>
        <div style="font-size:11.5px;color:var(--text-light);margin-top:4px;">${count} products</div>
      </a>
    `;
  }).join("");
}

function renderBrands() {
  const root = document.getElementById("brandTrack");
  if (!root) return;
  const strip = root.closest(".brand-strip");
  const section = root.closest("[data-home-section]");
  const content = (window.MT_SHARED_CATALOG && window.MT_SHARED_CATALOG.siteContent) || SITE_CONTENT || {};
  const images = Array.isArray(content.brandStrip)
    ? content.brandStrip.filter(s => s && (s.image || s.imageMobile))
    : [];

  // Image mode: a short, auto-scrolling banner strip built from admin-uploaded
  // artwork (like a channel cover). Falls back to the brand text cards when no
  // images have been added yet, so the homepage is never blank.
  if (images.length) {
    if (strip) strip.classList.add("is-images");
    if (section) section.classList.add("brand-strip-images");
    // Duplicate the list so the marquee loops seamlessly (the CSS animates a
    // -50% translate, which only lines up when the track is two identical halves).
    const repeated = [...images, ...images];
    root.innerHTML = repeated.map((slide, i) => {
      const src = escapeHtml(slide.image || slide.imageMobile);
      const alt = escapeHtml(slide.alt || "Brand banner");
      const href = safeSlideHref(slide.href);
      const img = `<img src="${src}" alt="${alt}" loading="lazy" draggable="false">`;
      // aria-hidden on the duplicated half so screen readers announce each once.
      const dup = i >= images.length ? ' aria-hidden="true" tabindex="-1"' : "";
      return href
        ? `<a class="brand-slide" href="${escapeHtml(href)}"${dup}>${img}</a>`
        : `<span class="brand-slide"${dup}>${img}</span>`;
    }).join("");
    return;
  }

  if (strip) strip.classList.remove("is-images");
  if (section) section.classList.remove("brand-strip-images");
  const repeated = [...BRANDS, ...BRANDS];
  root.innerHTML = repeated.map(brand => {
    const count = PRODUCTS.filter(product => product.brand === brand.id).length;
    return `
      <a class="brand-card" href="marketplace.html?brand=${brand.id}">
        <div class="brand-mark${brand.logo ? " has-logo" : ""}" style="background:${brand.logo ? "#fff" : brand.color}">${brandMarkInner(brand)}</div>
        <h4>${brand.name}</h4>
        <span>${brand.desc} · ${count} products</span>
      </a>
    `;
  }).join("");
}

function renderProductsByType() {
  const bestSellerRoot = document.getElementById("bestSellerGrid");
  const featuredRoot = document.getElementById("featuredGrid");
  const dealRoot = document.getElementById("dealSpotlight");
  const reviewsRoot = document.getElementById("reviewTrack");
  const storyRoot = document.getElementById("storyGrid");

  if (bestSellerRoot) {
    // 5 columns × 4 rows = a full, even 20-card grid.
    bestSellerRoot.innerHTML = bestSellingProducts().slice(0, 20).map(renderProductCard).join("");
  }

  if (featuredRoot) {
    featuredRoot.innerHTML = featuredProducts().slice(0, 10).map(renderProductCard).join("");
  }

  if (dealRoot) {
    const deal = dealProducts().sort((a, b) => discountPct(b.price, b.oldPrice) - discountPct(a.price, a.oldPrice))[0] || PRODUCTS[0];
    const brand = getBrandById(deal.brand);
    dealRoot.innerHTML = `
      <div style="max-width:260px;margin:0 auto;">
        <div style="background:rgba(255,255,255,.06);border-radius:24px;padding:18px;border:1px solid rgba(255,255,255,.12);">
          <div style="background:${deal.color}18;border-radius:18px;padding:18px;display:flex;justify-content:center;">${productImage(deal)}</div>
          <div style="margin-top:14px;">
            <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#ffb36c;font-weight:800;">${brand.name}</div>
            <h3 style="font-size:20px;line-height:1.2;margin-top:6px;color:#fff;">${deal.name}</h3>
            <div style="margin-top:8px;color:#fff;font-family:'Poppins',sans-serif;font-weight:800;font-size:23px;">${formatINR(deal.price)}</div>
            <a href="product.html?id=${deal.id}" class="btn btn-outline-light btn-block" style="margin-top:14px;">Claim Now</a>
          </div>
        </div>
      </div>
    `;
  }

  if (reviewsRoot) {
    const loop = [...REVIEWS, ...REVIEWS];
    reviewsRoot.innerHTML = loop.map(review => `
      <article class="review-card">
        <div class="stars">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</div>
        <p class="txt">${review.text}</p>
        <div class="review-who">
          <div class="av">${review.name.charAt(0)}</div>
          <div>
            <b>${review.name}</b>
            <span>${review.tag}</span>
          </div>
        </div>
      </article>
    `).join("");
  }

  if (storyRoot) {
    storyRoot.innerHTML = TRANSFORMATIONS.map(story => `
      <article class="story-card reveal">
        <div class="story-media" style="background:linear-gradient(135deg, ${story.imageTone}, #111111);">
          <div style="position:relative;z-index:1;">
            <b style="display:block;font-family:'Poppins',sans-serif;font-size:24px;">${story.change}</b>
            <span style="display:block;font-size:12px;margin-top:4px;opacity:.9;">${story.name}</span>
          </div>
        </div>
        <div class="story-body">
          <h3>${story.name}</h3>
          <p>${story.story}</p>
          <div class="story-meta">
            <span>Before / After story</span>
            <a href="marketplace.html" class="viewall">Shop products used</a>
          </div>
        </div>
      </article>
    `).join("");
  }
}

function applyHomepageOrder(order) {
  const main = document.querySelector("main");
  if (!main) return;
  const sections = Array.from(main.children).filter(node => node.matches("section"));
  const orderMap = new Map((order || []).map((key, index) => [key, index]));
  main.style.display = "flex";
  main.style.flexDirection = "column";
  sections.forEach((node, index) => {
    const key = node.dataset.homeSection;
    const weight = orderMap.has(key) ? orderMap.get(key) : (order || []).length + index;
    node.style.order = String(weight);
  });
}

function setupHeroControls() {
  const prev = document.getElementById("heroPrev");
  const next = document.getElementById("heroNext");
  if (prev) prev.addEventListener("click", () => goToHeroSlide(heroIndex - 1));
  if (next) next.addEventListener("click", () => goToHeroSlide(heroIndex + 1));
  // A single slide has nothing to page through.
  const single = document.querySelectorAll(".hero-slide").length < 2;
  [prev, next].forEach(btn => { if (btn) btn.hidden = single; });
  setupHeroDrag();
  window.addEventListener("resize", () => applyHeroOffset(0));
  restartHeroTimer();
}

document.addEventListener("DOMContentLoaded", async function () {
  await Promise.resolve(window.MT_CATALOG_READY);
  renderHeroSlides();
  renderGoals();
  renderCategories();
  renderBrands();
  renderProductsByType();
  applyHomepageContent();
  const order = (window.MT_SHARED_CATALOG && window.MT_SHARED_CATALOG.homepageOrder) || (SITE_CONTENT && SITE_CONTENT.order) || [];
  applyHomepageOrder(order);
  renderComposedBanners();
  setupHeroControls();
  wireHeroHoverPause();
  restartHeroTimer();   // kicks off autoplay + the first dot's progress fill
  initReveal();
});
