# Muscle Tonik — Mobile App Build Prompt (Full-Stack Spec)

> Paste this whole document into your AI coding tool (Cursor / Claude Code / etc.) as the
> master brief for building the **mobile app version** of the existing Muscle Tonik web store.
> It describes the existing backend exactly as built, the design system, every screen, and the
> business rules the app must honour. The backend already exists — **reuse it**; do not rebuild it.

---

## 1. What we're building

A native mobile shopping app (**Muscle Tonik**) for a fitness-supplement e-commerce store
(whey protein, creatine, mass gainers, pre-workout, vitamins). It is the mobile counterpart of
an existing responsive website that is backed by a Node/Express + MongoDB REST API. The app must
consume the **same backend API** and reproduce the same customer-facing shopping journey.

**Scope:** Customer storefront only (browse → cart → checkout → pay → track orders → account).
The web **admin panel is out of scope** for the app.

### Recommended stack
- **React Native + Expo** (TypeScript), or **Flutter** if the team prefers. This spec is framework-neutral.
- State/data: React Query (TanStack Query) for server state, a light store (Zustand/Context) for cart & auth.
- Navigation: bottom tab bar (Home, Shop, Cart, Wishlist, Account) + stack navigators.
- Payments: **Razorpay mobile SDK** (`react-native-razorpay` / Flutter `razorpay_flutter`).
- Secure storage: `expo-secure-store` / Keychain for the auth token.

---

## 2. Backend API (already built — consume as-is)

- **Base URL:** `{API_BASE}/api` (make it a build-time env var, e.g. `EXPO_PUBLIC_API_BASE`).
  Dev default is `http://localhost:4000/api`. There's a health check at `GET /healthz`.
- **Format:** JSON. Errors return `{ "message": string, "errors"?: [...] }` with a proper HTTP status.
- **Rate limit:** 300 requests / 15 min per IP on `/api/*`.
- **Currency:** INR (₹). All money values are whole rupees (integers).

### 2.1 Auth model — IMPORTANT for mobile
The web app uses **httpOnly cookies** (`accessToken` 15 min, `refreshToken` 30 days, `sameSite=lax`).
The auth middleware **also accepts `Authorization: Bearer <accessToken>`**, so the app can use header
auth. **However, `POST /auth/login` and `POST /auth/refresh` currently return only `{ user }` and set
the tokens as httpOnly cookies — they do NOT return the tokens in the JSON body.** For a native app you
have two options:

- **Option A (recommended, tiny backend change):** modify `login`, `register`, and `refresh` controllers
  to also include `accessToken` and `refreshToken` in the JSON response body. Then the app stores them in
  secure storage and sends `Authorization: Bearer <accessToken>`, refreshing via `POST /auth/refresh`
  (send the refresh token in the body) on 401.
- **Option B (no backend change):** use a native cookie jar (both RN and Flutter HTTP clients can persist
  cookies). The httpOnly cookies then flow automatically. Works, but token lifecycle is less explicit.

Assume **Option A** unless told otherwise, and implement a silent-refresh interceptor: on any `401
Invalid or expired session`, call `/auth/refresh`, retry once, else route to Login.

### 2.2 Endpoints

**Catalog (public, no auth)**
| Method | Path | Purpose |
|---|---|---|
| GET | `/catalog` | One payload powering the whole storefront (see §4.1). |
| GET | `/catalog/lookups` | Brand/category/goal reference lists. |
| GET | `/catalog/products` | Product search/filter (query params). |
| GET | `/catalog/products/:id` | Single product by public `catalogId`. |

**Auth & account**
| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/auth/register` | – | `{ name, email, password, phone? }` |
| POST | `/auth/login` | – | `{ identifier, password, rememberMe? }` — `identifier` = email **or** mobile |
| POST | `/auth/logout` | – | – |
| POST | `/auth/refresh` | – | (refresh token via cookie or body) |
| GET | `/auth/me` | ✔ | returns `{ user }` incl. addresses, wishlist, cart |
| POST | `/auth/forgot-password` | – | `{ email }` |
| POST | `/auth/reset-password` | – | `{ token, password }` |
| POST | `/auth/verify-email` | – | `{ token }` |
| POST | `/auth/change-password` | ✔ | `{ currentPassword, newPassword }` |
| PATCH | `/auth/profile` | ✔ | profile fields (name, phone, addresses) |
| POST | `/auth/avatar` | ✔ | multipart image upload |

**Checkout (all require auth)**
| Method | Path | Purpose |
|---|---|---|
| POST | `/checkout/session` | Price the cart → returns totals summary + session id (see §5). |
| POST | `/checkout/order` | Create a Razorpay order. Body `paymentMode`: `"online"` (charges the full total) or `"cod"` (charges a 20% advance only). |
| POST | `/checkout/verify` | Verify Razorpay signature → creates the order + payment. Pass the same `paymentMode`. |

> There is **no** zero-payment COD endpoint. COD goes through `/checkout/order` +
> `/checkout/verify` with `paymentMode:"cod"`, which collects a 20% advance online and
> records the remainder on the order as `balanceDue` (order `paymentStatus` becomes
> `partially_paid`). Amounts are always computed server-side — the client sends a mode,
> never an amount.

**Orders & payments (auth)**
| Method | Path | Purpose |
|---|---|---|
| GET | `/orders` | The signed-in user's own orders. |
| GET | `/payments/history` | The user's payment history. |
| POST | `/payments/failure` | Record a failed payment attempt. |

> Admin endpoints under `/api/admin/*` exist but are **not used by the app**.

**Password rules:** min 8 chars, must contain letters **and** numbers (enforced on register/reset).
Login is length-only (min 8) so legacy accounts aren't locked out.

---

## 3. Design system (match the website exactly)

**Brand:** bold, athletic, premium — orange on near-black with generous whitespace and pill buttons.

**Colors**
| Token | Hex | Use |
|---|---|---|
| primary | `#ff7a00` | brand orange, CTAs, accents |
| primary-dark | `#e66700` | pressed/hover |
| primary-light | `#fff3e8` | tinted backgrounds |
| dark | `#111111` | headings, top bar, dark buttons |
| dark-soft | `#1b1b1b` | secondary dark |
| text | `#222222` | body text |
| text-light | `#6f6f6f` | muted/secondary text |
| gray | `#f5f5f5` | surfaces |
| border | `#e9e9e9` | dividers |
| green | `#16a34a` | success / in-stock |
| red | `#e23b3b` | errors / out-of-stock |

**Typography**
- Headings: **Poppins** (500–800), tight letter-spacing (`-0.01em`).
- Body: **Inter** (400–700), line-height ~1.55.

**Shape & elevation**
- Radii: sm `10px`, base `16px`, lg `22px`, pills `999px` (buttons, badges, chips).
- Shadow: soft `0 10px 28px -12px rgba(17,17,17,.14)`; large `0 30px 70px -25px rgba(17,17,17,.30)`.
- Buttons: primary (orange, white text), dark, outline, outline-light; sizes base/sm; disabled = 50% opacity.
- Badges: orange, dark, green (`#e7f8ed` bg), outline.
- Respect **reduced-motion** (disable animations when the OS setting is on).

---

## 4. Data shapes

### 4.1 `GET /catalog` response
```jsonc
{
  "brands":        [{ "id", "name", ... }],
  "categories":    [{ "id", "name", ... }],
  "goals":         [{ "id", "name", ... }],       // "Shop by goal" chips
  "products":      [ Product ],                     // see 4.2 — active products only
  "reviews":       [{ "name", "tag", "rating", "text" }],
  "transformations": [ ... ],                        // before/after stories
  "heroSlides":    [{ "eyebrow", "title", "copy", "cta1": {label,href}, "cta2", "accent" }],
  "homepageSections": [...], "homepageOrder": [...], // CMS-driven section ordering
  "siteContent":   { ... }, "siteSettings": { ... }
}
```

### 4.2 Product (storefront shape)
```jsonc
{
  "id": 101,                 // public catalogId — used everywhere (URLs, cart, SKU)
  "name": "Whey Gold 1kg",
  "brand": "brand-id",
  "category": "whey-protein",
  "price": 1999,             // sellingPrice (₹, integer)
  "oldPrice": 2499,          // mrp — show as struck-through
  "rating": 4.6, "reviews": 320,
  "badge": "Bestseller", "color": "#111111",
  "featured": true, "deal": false,
  "short": "…", "desc": "…", "ingredients": "…",
  "protein": "24g", "servings": 30, "calories": 120, "flavor": "Chocolate",
  "flavors": [{ "name": "Mango Peach", "image": "https://…" }],  // see note below
  "images": ["…"], "galleryImages": ["…"],
  "stock": 42, "status": "active"
}
```
> **`flavors`** is a structured list (distinct from the legacy `flavor` string, which is just a
> comma-joined label). ~397 products have 2+ entries. Each carries its own image: the product
> screen shows tappable flavour chips that swap the main image. Products with 0 or 1 entry should
> hide the chip row entirely. Test product: `id=44` (6 flavours).
> Discount % = round((oldPrice − price) / oldPrice × 100). Show "Out of stock" when `stock <= 0`.
> **SKU rule:** a product's SKU is `MT-{id}`. The checkout API maps cart items to products by this.

### 4.3 Order (from `GET /orders`)
```jsonc
{
  "orderNumber": "MT-1699999999",
  "items": [{ "name", "sku", "price", "quantity" }],
  "subtotal", "discount", "gst", "shipping", "total",
  "advancePaid": 425,        // COD only — amount already paid online (else 0)
  "balanceDue": 1698,        // COD only — amount to collect on delivery (else 0)
  "paymentStatus": "pending|partially_paid|paid|failed|refunded",
  "fulfillmentStatus": "pending|confirmed|packed|ready_to_ship|shipped|out_for_delivery|delivered|cancelled|returned|refunded",
  "paymentProvider": "razorpay|cod",
  "trackingNumber", "shippingProvider",
  "shippingAddress", "createdAt"
}
```
> `partially_paid` is the COD state: the 20% advance cleared, `balanceDue` is owed in cash on
> delivery. Order-history rows and the order-detail screen must show both figures — a customer
> seeing only "total" will bring the wrong amount to the door.

### 4.4 Address (on the user)
`{ label, fullName, phone, line1, line2, city, state, postalCode, country="India", isDefault }`

---

## 5. Business rules (must match backend exactly)

Pricing is computed **server-side** by `POST /checkout/session` — always show the server's numbers, never
compute the final total client-side. For reference, the server logic is:

- **Subtotal** = Σ(sellingPrice × qty).
- **Coupon discount** applied to subtotal. Types: `percent`, `flat`, `free_shipping`. Coupons can carry
  `minOrder`, `maxUses`, `expiresAt`. Built-in codes: **`TONIK10`** (10% off), **`FIRST15`** (15% off).
- **Shipping** = **free if (subtotal − discount) > ₹599, else ₹79.**
  ⚠️ The website's top banner says "Free shipping above Rs 999" but the code threshold is **599** —
  confirm the intended number with the owner and keep banner + logic consistent.
- **GST** = **5%** of (subtotal − discount).
- **Total** = (subtotal − discount) + shipping + GST.
- **Stock** is reserved atomically at payment/COD time; oversell is rejected with `409`. Handle that error
  by refreshing the cart and telling the user an item just went out of stock.

---

## 6. Screens (map from the existing web pages)

Build a bottom-tab shell: **Home · Shop · Cart · Wishlist · Account.**

**Discovery**
- **Home** (`index.html`): hero slider (`heroSlides`), "Shop by goal" chips, category grid, top brands,
  best-sellers, deal-of-the-day with countdown, featured products, transformation stories, reviews carousel.
- **Shop / Marketplace** (`marketplace.html`): product grid with search, filters (category, brand, price,
  sort: popularity/newest/price), infinite scroll. Deep-links: `?category=`, `?brand=`, `?search=`, `?sort=`.
- **Category list** (`category.html`) and **Brands list** (`brands.html`).
- **Offers / Deals** (`offers.html`): discounted & deal products.
- **Product detail** (`product.html?id=`): gallery, price + struck MRP + discount %, rating, short/long
  description, protein/servings/calories, add-to-cart with qty, add-to-wishlist, share, stock state,
  and **flavour chips** (from `flavors[]`) that swap the hero image when tapped — hide the row when
  fewer than 2 flavours.
- **Search**: header search with live suggestions.

**Cart & checkout**
- **Cart** (`cart.html`): line items, qty steppers, remove, coupon field, live totals (via `/checkout/session`).
- **Checkout** (`checkout.html`): choose/enter shipping address, review summary, pick payment method:
  - **Pay Online** — charges the full total.
  - **Cash on Delivery** — charges a **20% advance online now**; the rest is cash on delivery.
    Show the split explicitly on the option itself ("Pay ₹425 now, ₹1,698 on delivery") and again in
    the confirm step, with the CTA reading *Pay Now · ₹425* — the amount charged is **not** the order
    total, and a customer who expects to pay ₹0 for COD will abandon or dispute.
  - Preview the split client-side for display only; `/checkout/order` returns the authoritative
    `cod: { advance, balance, ratePercent }` — render those once you have them.
- **Payment** (`payment.html`): result screen only. The Razorpay SDK is launched from `checkout.html`;
  on success the app calls `/checkout/verify` and only then treats the order as placed. On failure call
  `/payments/failure`. COD uses the same launch + verify path with `paymentMode:"cod"`.
- **Order success** (`order-success.html`): confirmation with order number.

**Account**
- **Login** (`login.html`): identifier (email **or** mobile) + password + "remember me".
- **Register** (`register.html`), **Forgot / Reset password**, **Verify email**, **Change password**.
- **Account dashboard / Profile** (`dashboard.html`, `profile.html`): name, avatar (upload), phone, addresses.
- **Orders** (`orders.html`): order history + status timeline (use `fulfillmentStatus`).
- **Wishlist** (`wishlist.html`).

**Mobile-native additions worth adding:** onboarding, biometric unlock, push notifications for order status,
pull-to-refresh, skeleton loaders, offline cache of the catalog.

---

## 7. BMI calculator & diet plan (client-side feature)

Lives on the **Home** screen, directly under the brands strip. There is **no backend for this** —
everything is computed on the device and nothing is transmitted. Do not add an API call for it.

**Inputs:** height (cm), weight (kg), and an optional goal (`auto` / `gain` / `lose` / `maintain`).
Validate 80–250 cm and 20–400 kg with inline errors.

**Output:** BMI = `kg / (m²)`, plus WHO bands (`max` exclusive):

| Band | Range | Colour |
|---|---|---|
| Underweight | < 18.5 | `#3b82f6` |
| Healthy weight | 18.5 – 24.9 | `#16a34a` |
| Overweight | 25 – 29.9 | `#f59e0b` |
| Obese | ≥ 30 | `#e23b3b` |

Render a **segmented meter** on a fixed 15–40 scale with a marker at
`clamp((bmi − 15) / 25, 0, 1)`, plus the healthy weight range for that height
(`18.5×m²` to `24.9×m²`, one decimal).

**Diet plan** per band: a headline, a calorie target, a protein target, 4–5 focus points, and a
7-slot day of eating (Breakfast → Before bed). Meals are written for Indian eating patterns
(roti/dal/paneer/curd), not generic Western plans — keep that.

**Product suggestions:** map the band to catalog categories and show a normal product row.
A stated goal overrides the band mapping (someone at a healthy BMI may still be cutting).

| Band / goal | Categories |
|---|---|
| Underweight | `mass-gainer`, `whey-protein`, `peanut-butter`, `oats`, `casein` |
| Healthy | `whey-protein`, `creatine`, `pre-workout`, `vitamins`, `bcaa` |
| Overweight | `fat-burner`, `whey-protein`, `greens`, `plant-protein`, `electrolytes` |
| Obese | `fat-burner`, `greens`, `wellness`, `fish-oil`, `plant-protein` |
| goal `gain` | `mass-gainer`, `whey-protein`, `creatine`, `casein`, `peanut-butter` |
| goal `lose` | `fat-burner`, `whey-protein`, `greens`, `electrolytes`, `plant-protein` |
| goal `maintain` | `whey-protein`, `vitamins`, `creatine`, `greens`, `fish-oil` |

Pick **round-robin across categories** (best-rated first within each) so the row isn't several
variants of one product, then top up with high-rated products if a category is thin.

**Export — "Save as Image" and "Download PDF".** On web these are hand-rolled (canvas + raw PDF)
because the site's CSP blocks third-party scripts. **In a native app, don't port that** — use the
platform libraries instead (`react-native-view-shot` for the image, `react-native-html-to-pdf` /
`pdf-lib`, or Flutter's `screenshot` + `pdf` packages). Requirements to preserve:

- A tiled **`MUSCLE TONIK ©` watermark** repeating horizontally in the background, light grey, with
  alternate rows offset. Panels sit slightly translucent over it so it shows through.
- A copyright footer: `© {year} Muscle Tonik. All rights reserved. For personal use only.`
  On multi-page PDFs the watermark **and** footer repeat on every page, with page numbering.
- Save via the **native share sheet** so the user can put it in their gallery/Photos. A web page
  can't write to the gallery directly; a native app can also request a media-library permission and
  save straight there — prefer that on mobile, with the share sheet as fallback.

> ⚠️ **Health-content compliance.** This is diet guidance in a store that then sells you
> supplements. Keep the disclaimer visible on the form, on the result, **and inside both exports**:
> BMI is a screening tool, not a diagnosis; it ignores muscle mass and body composition; consult a
> doctor or registered dietitian before changing diet or starting supplements, especially if
> pregnant, managing a condition, or on medication. The obese-band plan must lead with advice to
> involve a professional. Apple and Google both scrutinise health/fitness claims at review — do not
> present this as medical advice or promise outcomes.

---

## 8. Behaviour & edge cases
- **Cart persistence:** keep the cart locally for guests; the logged-in user also has a server-side `cart`
  array on their profile — decide on a merge strategy at login (recommend: merge local into server).
- **Wishlist** is stored on the user (`wishlist` array of product ids); mirror locally for guests.
- **Auth gating:** browsing/cart are open to guests; **checkout requires login** (all `/checkout/*` need auth).
  Gate *before* opening Razorpay, not after — a 401 on verify means the customer has already paid.
- **Token refresh:** silent refresh on 401, one retry, then Login screen.
- **Payment verification is the critical path.** The order does not exist until `/checkout/verify`
  succeeds; the charge happens before it. So:
  - **Retry verify** up to ~3× with backoff on network/5xx errors. It is **idempotent** — keyed on
    `razorpayPaymentId`, a repeat call returns the same order rather than duplicating it or
    double-decrementing stock.
  - Do **not** retry on 4xx (bad signature, stock gone) — those are real rejections.
  - If verify still fails, show the `razorpay_payment_id` and a support route. Never tell a
    customer the payment failed when it may have succeeded.
  - Never let the client decide payment success — the server sets it from the signature check.
  - Persist the pending payment id locally so a crash/backgrounding mid-verify can resume.
  > There is currently **no Razorpay webhook** on the backend, so verification is entirely
  > client-driven. If a user kills the app between paying and verifying, the charge exists with no
  > order. Adding a `payment.captured` webhook is the durable fix and is strongly recommended
  > before launch.
- **Empty/error states** for every list; **stock 409** handling at checkout; **rate-limit 429** backoff.
- **Money formatting:** `₹` prefix, integer rupees, thousands separators.
- **Accessibility:** honour reduced-motion, dynamic type, sufficient contrast (orange on white passes for
  large/bold text — use dark text for small body copy).

---

## 9. Deliverables
1. Running RN/Expo (or Flutter) app hitting the existing API via a configurable base URL.
2. Reusable design-system module (colors, typography, spacing, Button/Badge/Card/Input components).
3. Auth flow with secure token storage + refresh interceptor.
4. All screens in §6 wired to the endpoints in §2.
5. Razorpay checkout end-to-end for **both** modes (full online and COD 20% advance), using
   server-computed totals, with the idempotent verify-retry logic from §8.
6. BMI calculator + diet plan (§7) with image/PDF export, watermark, and disclaimers.
7. Product flavour chips driven by `flavors[]`.
8. The one small backend change from §2.1 Option A (return tokens in login/register/refresh bodies), if chosen.

**Do not** rebuild the backend, and **do not** port the admin panel. Match the web store's look, data, and
business rules precisely.
