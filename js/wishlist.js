function renderWishlistPage() {
  const root = document.getElementById("wishlistGrid");
  const empty = document.getElementById("wishlistEmpty");
  if (!root || !empty) return;
  const items = Wishlist.items().map(id => getProductById(id)).filter(Boolean);
  if (!items.length) {
    root.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  root.innerHTML = items.map(renderProductCard).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.resolve(window.MT_CATALOG_READY);
  renderWishlistPage();
});
