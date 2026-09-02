/* ===========================================================
   MUSCLE TONIK - Product Details page logic
   =========================================================== */

let currentQty = 1;
let currentProduct = null;
let currentFlavor = "";
let galleryHtml = "";
let galleryImages = [];

// Render the flavour swatches for a product. Each product's `flavors` array is
// a list of { name, image } captured from the source store, so picking a flavour
// can swap the main product photo to that flavour's image.
function renderFlavors(p) {
  const field = document.getElementById("flavorField");
  const wrap = document.getElementById("flavorOptions");
  const flavors = Array.isArray(p.flavors) ? p.flavors.filter(f => f && f.name) : [];
  if (!field || !wrap) return;
  if (flavors.length < 2) {
    field.hidden = true;
    wrap.innerHTML = "";
    currentFlavor = "";
    return;
  }
  field.hidden = false;
  wrap.innerHTML = flavors.map((f, i) => `
    <button type="button" class="flavor-chip${i === 0 ? " active" : ""}" onclick="selectFlavor(${i})" title="${f.name}">
      ${f.image ? `<span class="flavor-swatch"><img src="${f.image}" alt="${f.name}" loading="lazy"></span>` : ""}
      <span class="flavor-name">${f.name}</span>
    </button>`).join("");
  currentFlavor = flavors[0].name;
  document.getElementById("flavorPicked").textContent = ": " + flavors[0].name;
}

// Pick a flavour: highlight it and swap the main photo to that flavour's image.
function selectFlavor(index) {
  if (!currentProduct || !Array.isArray(currentProduct.flavors)) return;
  const f = currentProduct.flavors[index];
  if (!f) return;
  currentFlavor = f.name;
  document.querySelectorAll("#flavorOptions .flavor-chip").forEach((el, i) => el.classList.toggle("active", i === index));
  document.getElementById("flavorPicked").textContent = ": " + f.name;
  if (f.image) {
    const mainImg = document.getElementById("mainImg");
    mainImg.style.background = "#ffffff";
    mainImg.innerHTML = `<img src="${f.image}" alt="${currentProduct.name} - ${f.name}" class="pd-main-photo">`;
    // Sync the thumbnail highlight if this flavour's image is one of the thumbs.
    const idx = galleryImages.indexOf(f.image);
    document.querySelectorAll(".thumbs div").forEach((d, i) => d.classList.toggle("active", i === idx));
  }
}

function renderBenefitList(p) {
  const benefits = [
    `Designed for ${p.category.replace("-", " ")}`,
    `Rated ${p.rating} by ${p.reviews.toLocaleString("en-IN")} buyers`,
    `Premium packaging and fast dispatch`,
    `Best used as part of a consistent routine`
  ];
  return `<ul class="pd-offers" style="list-style:none;padding:0;margin:0;">${benefits.map(item => `<li>✓ ${item}</li>`).join("")}</ul>`;
}

function renderReviewList(p) {
  const related = REVIEWS.slice(0, 3).map(review => `
    <div class="review-list-item">
      <div class="stars">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</div>
      <div class="rtext">${review.text}</div>
      <div class="rmeta"><span>${review.name}</span><span>${review.tag}</span></div>
    </div>
  `).join("");
  return related;
}

function renderProductDetails() {
  const id = new URLSearchParams(window.location.search).get("id") || PRODUCTS[0].id;
  const p = getProductById(id);
  if (!p) {
    document.getElementById("pdRoot").innerHTML = "<p>Product not found.</p>";
    return;
  }
  currentProduct = p;
  // Fall back to the raw id if a product points at a brand/category that no
  // longer exists in the list, so the page still renders instead of crashing.
  const brand = getBrandById(p.brand) || { id: p.brand || "", name: p.brand || "" };
  const category = getCategoryById(p.category);
  const off = discountPct(p.price, p.oldPrice);
  document.title = p.name + " - Muscle Tonik";
  document.getElementById("breadcrumbCat").textContent = category ? category.name : (p.category || "Category");
  document.getElementById("breadcrumbCat").href = "marketplace.html?category=" + p.category;

  const mainImg = document.getElementById("mainImg");
  galleryImages = Array.isArray(p.images) && p.images.length ? p.images : [];
  const hasPhoto = galleryImages.length > 0;
  galleryHtml = renderGalleryImage(p, 0);
  mainImg.innerHTML = galleryHtml;
  // White stage for real product photos (shot on white); coloured tint only for
  // the generated SVG placeholder.
  mainImg.style.background = hasPhoto ? "#ffffff" : p.color + "15";
  mainImg.style.display = "flex";
  mainImg.style.alignItems = "center";
  mainImg.style.justifyContent = "center";

  const thumbs = galleryImages.length ? galleryImages : [null, null, null, null];
  document.getElementById("thumbs").innerHTML = thumbs.map((src, i) => `
    <div class="${i === 0 ? "active" : ""}" style="background:${src ? "#fff" : p.color + (i === 0 ? "33" : "15")}" onclick="setGalleryView(${i})">
      ${src ? `<img src="${src}" alt="${p.name} ${i + 1}">` : ""}
    </div>
  `).join("");

  document.getElementById("pdBrand").textContent = brand.name;
  document.getElementById("pdBrand").href = "marketplace.html?brand=" + brand.id;
  document.getElementById("pdTitle").textContent = p.name;
  const pdSize = document.getElementById("pdSize");
  if (pdSize) {
    // Only surface the weight/size when the admin has actually set one.
    const size = (p.weight || "").trim();
    pdSize.textContent = size ? "Net quantity: " + size : "";
    pdSize.hidden = !size;
  }
  document.getElementById("pdStars").innerHTML = starString(p.rating) + " " + p.rating + " • " + p.reviews.toLocaleString("en-IN") + " reviews";
  document.getElementById("pdNow").textContent = formatINR(p.price);
  document.getElementById("pdWas").textContent = formatINR(p.oldPrice);
  document.getElementById("pdOff").textContent = off + "% off";

  renderFlavors(p);
  document.getElementById("pdDesc").textContent = p.desc;
  document.getElementById("pdBenefits").innerHTML = renderBenefitList(p);
  document.getElementById("pdIngredients").textContent = p.ingredients;
  // Real reviews for THIS product, loaded from the API (the old list showed
  // the same three site-wide testimonials on every product).
  if (window.MTReviews) MTReviews.mountProduct(p.id);
  else document.getElementById("pdReviews").innerHTML = renderReviewList(p);
  document.getElementById("pdFaq").innerHTML = `
    <div class="accordion-item"><div class="q" onclick="this.parentElement.classList.toggle('open')">Is this safe to take daily? <span class="plus">+</span></div><div class="a">Yes, when used as directed on the label. If you have an existing medical condition, check with a healthcare provider first.</div></div>
    <div class="accordion-item"><div class="q" onclick="this.parentElement.classList.toggle('open')">How should I store it? <span class="plus">+</span></div><div class="a">Store in a cool, dry place away from direct sunlight, and reseal tightly after each use.</div></div>
    <div class="accordion-item"><div class="q" onclick="this.parentElement.classList.toggle('open')">What is the shelf life after opening? <span class="plus">+</span></div><div class="a">Best used within 3 months of opening for peak freshness.</div></div>
  `;

  const wished = Wishlist.has(p.id);
  const wishBtn = document.getElementById("pdWishBtn");
  wishBtn.classList.toggle("active", wished);
  wishBtn.setAttribute("data-wish", p.id);

  document.getElementById("stickyName").textContent = p.name.split(",")[0];
  document.getElementById("stickyPrice").textContent = formatINR(p.price);

  renderRelated(p);
}

function changeQty(delta) {
  currentQty = Math.max(1, currentQty + delta);
  document.getElementById("qtyVal").textContent = currentQty;
}

function setGalleryView(index) {
  document.querySelectorAll('.thumbs div').forEach(d => d.classList.remove('active'));
  const thumbs = document.querySelectorAll('.thumbs div');
  if (thumbs[index]) thumbs[index].classList.add('active');
  const mainImg = document.getElementById("mainImg");
  if (!mainImg || !currentProduct) return;
  // Real product photos are shot on white, so keep the stage white for them and
  // reserve the coloured tint for the generated SVG placeholder only.
  const hasPhoto = Array.isArray(currentProduct.images) && currentProduct.images.length;
  mainImg.style.background = hasPhoto ? "#ffffff" : currentProduct.color + "18";
  mainImg.innerHTML = renderGalleryImage(currentProduct, index);
}

function renderGalleryImage(p, index) {
  const src = Array.isArray(p.images) && p.images.length ? p.images[index] || p.images[0] : "";
  if (src) return `<img src="${src}" alt="${p.name}" class="pd-main-photo">`;
  return productImage(p).replace('width="90" height="108"', 'width="230" height="276"');
}

function addCurrentToCart() { Cart.add(currentProduct.id, currentQty); }
function buyNow() { Cart.add(currentProduct.id, currentQty); window.location.href = "cart.html"; }
function toggleCurrentWishlist() { Wishlist.toggle(currentProduct.id); }

function switchTab(name) {
  document.querySelectorAll(".pd-tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".pd-tab-panel").forEach(p => p.classList.toggle("active", p.id === "tab-" + name));
}

function renderRelated(p) {
  const list = PRODUCTS.filter(x => x.category === p.category && x.id !== p.id).slice(0, 4);
  const fallback = list.length ? list : PRODUCTS.filter(x => x.id !== p.id).slice(0, 4);
  document.getElementById("relatedGrid").innerHTML = fallback.map(renderProductCard).join("");
}

document.addEventListener("DOMContentLoaded", async function () {
  await Promise.resolve(window.MT_CATALOG_READY);
  renderProductDetails();
  initReveal();
});
