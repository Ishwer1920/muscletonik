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
    .map((slide, index) => (isImageSlide(slide) ? imageSlideMarkup(slide, index) : richSlideMarkup(slide, index)))
    .join("");

  dots.innerHTML = slides.length > 1
    ? slides.map((_, i) => `<button type="button" class="${i === 0 ? "active" : ""}" aria-label="Go to slide ${i + 1}" onclick="goToHeroSlide(${i})"></button>`).join("")
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

function resolveHeroSlides(content) {
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
  dots.forEach((dot, i) => dot.classList.toggle("active", i === heroIndex));
  applyHeroOffset(0, true);
  restartHeroTimer();
}

function restartHeroTimer() {
  clearInterval(heroTimer);
  const slideCount = document.querySelectorAll(".hero-slide").length;
  if (slideCount < 2) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  heroTimer = setInterval(() => goToHeroSlide(heroIndex + 1), 6500);
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
  setupHeroControls();
  startCountdown("deal", 6 * 3600 + 12 * 60 + 45);
  initReveal();
});
