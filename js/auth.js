// The single source of truth for the API base lives in js/data.js (loaded
// before this file on every page). We intentionally do NOT redefine
// getApiBase() here — a second top-level declaration would shadow the robust
// one in global scope and could reintroduce wrong-origin/ConnectionRefused
// bugs. Fall back to a same-origin default only if data.js somehow didn't run.
function resolveApiBase() {
  if (typeof window !== "undefined" && window.MT_API_BASE) return window.MT_API_BASE;
  if (typeof getApiBase === "function") return getApiBase();
  return (window.location && window.location.origin ? window.location.origin : "") + "/api";
}

async function apiRequest(path, options) {
  const base = resolveApiBase();
  // Login/register/refresh/reset endpoints must NOT trigger a refresh-retry:
  // a 401 there means bad credentials, not an expired session.
  const isAuthEndpoint = /\/auth\/(login|register|refresh|forgot-password|reset-password|verify-email)/.test(path);
  const send = () => fetch(base + path, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    credentials: "include",
    ...options
  });

  let res = await send();
  // Access token expired -> silently refresh using the refresh cookie, retry once.
  if (res.status === 401 && !isAuthEndpoint) {
    if (await mtRefreshSession()) res = await send();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const validation = Array.isArray(data.errors) ? data.errors.map(err => err.msg || err.message).filter(Boolean) : [];
    const message = validation.length ? validation.join(" ") : (data.message || "Unable to complete the request. Please try again.");
    throw new Error(message);
  }
  return data;
}

function setSession(user) {
  if (user) {
    Store.set("mt_user", user);
    updateAuthUI();
  }
}

// Resolve a safe post-login redirect from ?next=. Only same-origin relative
// paths are honored — never an absolute/external URL (open-redirect guard).
function safeNextTarget() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next) return "";
  if (/^https?:\/\//i.test(next) || next.startsWith("//")) return "";
  return next.replace(/^\//, "");
}

function fillTokenFromUrl(inputId) {
  const token = new URLSearchParams(window.location.search).get("token");
  const input = document.getElementById(inputId);
  if (token && input) input.value = token;
}

async function syncSession() {
  // Only validate the session when we believe one exists (a user was stored
  // after a previous login). This avoids a guaranteed 401 — and the console
  // noise it creates — for first-time/logged-out visitors.
  const stored = typeof Store !== "undefined" ? Store.get("mt_user", null) : null;
  if (!stored) return;
  try {
    const res = await apiRequest("/auth/me", { method: "GET" });
    if (res && res.user) setSession(res.user);
  } catch (err) {
    // Session expired or was revoked — clear the stale local copy.
    if (typeof Store !== "undefined") Store.set("mt_user", null);
    if (typeof updateAuthUI === "function") updateAuthUI();
  }
}

function handleAuthForm(form) {
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const originalLabel = button ? button.textContent : "";
    if (button) {
      button.disabled = true;
      button.textContent = "Please wait...";
    }
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    if (payload.rememberMe === "on") payload.rememberMe = true;

    const errorBox = form.querySelector(".form-error");
    const failClient = message => {
      if (errorBox) errorBox.textContent = message;
      showToast(message);
      if (button) { button.disabled = false; button.textContent = originalLabel; }
    };

    // Client-side confirm-password match before hitting the server.
    if (payload.confirmPassword !== undefined && payload.password !== payload.confirmPassword) {
      return failClient("Passwords do not match.");
    }

    // Enforce the password policy up front on forms that set a NEW password
    // (register/reset/change) so the user gets instant feedback matching the
    // server rule. Login is exempt — it must never re-judge an old password.
    if (form.dataset.strengthCheck !== undefined) {
      const candidate = payload.newPassword !== undefined ? payload.newPassword : payload.password;
      const strength = scorePassword(candidate);
      if (candidate && !strength.meetsPolicy) {
        return failClient("Password must be at least 8 characters and include both letters and numbers.");
      }
    }

    try {
      const endpoint = form.dataset.endpoint;
      const method = form.dataset.method || "POST";
      const data = await apiRequest(endpoint, {
        method,
        body: JSON.stringify(payload)
      });
      if (data.user) setSession(data.user);
      showToast(data.message || "Success");
      if (data.verificationUrl) {
        const hint = document.getElementById("verificationHint");
        if (hint) hint.textContent = "Development verification link: " + data.verificationUrl;
      }
      // Admin-panel accounts go straight to the admin dashboard on login.
      // Regular customers go to the page they were sent from (?next=), else
      // the form's normal success redirect.
      const ADMIN_ROLES = ["staff", "manager", "admin", "super_admin"];
      if (data.user && ADMIN_ROLES.includes(data.user.role)) {
        window.location.href = "/admin/dashboard.html";
      } else {
        const next = safeNextTarget();
        if (next) window.location.href = next;
        else if (form.dataset.successRedirect) window.location.href = form.dataset.successRedirect;
      }
    } catch (err) {
      showToast(err.message || "Unable to complete request");
      const errorBox = form.querySelector(".form-error");
      if (errorBox) errorBox.textContent = err.message || "Unable to complete request";
    }
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });
}

// Score a password 0..4 for the live strength meter. Mirrors the server
// policy (min 8 + letters + numbers) and rewards length/symbols on top.
function scorePassword(pw) {
  const value = String(pw || "");
  if (!value) return { score: 0, label: "", pct: 0, cls: "" };
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[A-Za-z]/.test(value) && /\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  const meetsPolicy = value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
  if (!meetsPolicy) score = Math.min(score, 1);
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong"];
  const classes = ["s0", "s1", "s2", "s3", "s4"];
  return { score, label: labels[score], pct: (score / 4) * 100, cls: classes[score], meetsPolicy };
}

// Wire any password input marked [data-strength] to a meter. The meter markup
// (a .pw-strength wrapper with a bar + label) is expected right after the field.
function initStrengthMeters() {
  document.querySelectorAll('input[data-strength]').forEach(input => {
    const meter = document.querySelector('#' + input.getAttribute("data-strength"));
    if (!meter) return;
    const bar = meter.querySelector(".pw-strength-bar span");
    const label = meter.querySelector(".pw-strength-label");
    const update = () => {
      const r = scorePassword(input.value);
      meter.classList.toggle("show", !!input.value);
      if (bar) { bar.style.width = r.pct + "%"; bar.className = r.cls; }
      if (label) label.textContent = r.label;
    };
    input.addEventListener("input", update);
    update();
  });
}

function initPasswordToggles() {
  document.querySelectorAll("[data-pw-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const wrap = btn.closest(".password-field") || btn.parentElement;
      const input = wrap ? wrap.querySelector('input[type="password"], input[type="text"]') : null;
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.resolve(window.MT_CATALOG_READY);
  // Declarative guard: any page with <body data-protected> forces login first.
  if (document.body.hasAttribute("data-protected") && typeof requireClientAuth === "function") {
    const user = await requireClientAuth();
    if (!user) return; // redirecting to login
  }
  syncSession();
  document.querySelectorAll("form[data-endpoint]").forEach(handleAuthForm);
  initPasswordToggles();
  initStrengthMeters();
  fillTokenFromUrl("tokenInput");
  const title = document.querySelector("[data-auth-title]");
  if (title && window.location.pathname.includes("register")) title.textContent = "Create your Muscle Tonik account";
});
