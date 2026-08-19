/* ===========================================================
   MUSCLE TONIK - Account / Profile page
   Backend-driven: loads the live user, edits name/phone, uploads
   an avatar, and changes the password — all through the API.
   Redirects to login when there is no valid session.
   =========================================================== */

const PROFILE_ADMIN_ROLES = ["staff", "manager", "admin", "super_admin"];

function pfInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "MT";
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

function pfAvatar(user) {
  if (user.avatarUrl) {
    return `<img src="${escapeHtml(user.avatarUrl)}" alt="Profile photo">`;
  }
  return `<span class="avatar-initials-text">${pfInitials(user.name)}</span>`;
}

// Small helper to show inline status text under a form (success or error).
function setStatus(el, message, ok) {
  if (!el) return;
  el.textContent = message || "";
  el.className = "form-status" + (message ? (ok ? " ok" : " err") : "");
}

function renderProfile(user) {
  const root = document.getElementById("profileRoot");
  const verified = user.emailVerified
    ? `<span class="badge-verified">${icon("check", 14)} Verified</span>`
    : `<span class="badge-unverified">Unverified</span>`;

  root.innerHTML = `
    <div class="profile-grid">
      <section class="card-box profile-photo-card">
        <div class="profile-avatar" id="avatarPreview">${pfAvatar(user)}</div>
        <h3>${escapeHtml(user.name || "Customer")} ${verified}</h3>
        <p class="profile-email">${escapeHtml(user.email || "")}</p>
        <form id="avatarForm">
          <input type="file" id="avatarInput" name="avatar" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
          <button type="button" class="btn btn-dark btn-block" id="avatarPickBtn">Change Photo</button>
          <p class="field-hint">JPG, PNG, WEBP or GIF · up to 5MB</p>
          <p class="form-status" id="avatarStatus"></p>
        </form>
        <div class="account-links" style="margin-top:8px;">
          <a href="dashboard.html" class="account-link">Back to Dashboard</a>
          <a href="orders.html" class="account-link">My Orders</a>
          ${PROFILE_ADMIN_ROLES.includes(user.role) ? '<a href="/admin/dashboard.html" class="account-link">Admin Dashboard</a>' : ""}
          <a href="login.html" class="account-link account-link-danger" onclick="return logoutUser(event)">Logout</a>
        </div>
      </section>

      <div class="profile-forms">
        <section class="card-box">
          <h3>Personal Details</h3>
          <form id="profileForm">
            <div class="field"><label>Full Name</label><input name="name" value="${escapeHtml(user.name || "")}" required></div>
            <div class="field"><label>Email</label><input value="${escapeHtml(user.email || "")}" disabled></div>
            <div class="field"><label>Phone</label><input name="phone" value="${escapeHtml(user.phone || "")}" placeholder="Add a phone number"></div>
            <p class="form-status" id="profileStatus"></p>
            <button class="btn btn-primary" type="submit">Save Changes</button>
          </form>
        </section>

        <section class="card-box">
          <h3>Change Password</h3>
          <form id="passwordForm" data-strength-check>
            <div class="field">
              <label>Current Password</label>
              <div class="password-field">
                <input name="currentPassword" type="password" autocomplete="current-password" required>
                <button type="button" class="pw-toggle" data-pw-toggle aria-label="Show password">Show</button>
              </div>
            </div>
            <div class="field">
              <label>New Password</label>
              <div class="password-field">
                <input name="newPassword" type="password" autocomplete="new-password" minlength="8" data-strength="pfPwStrength" required>
                <button type="button" class="pw-toggle" data-pw-toggle aria-label="Show password">Show</button>
              </div>
              <div class="pw-strength" id="pfPwStrength">
                <div class="pw-strength-bar"><span></span></div>
                <div class="pw-strength-label"></div>
              </div>
              <p class="field-hint">At least 8 characters with letters and numbers.</p>
            </div>
            <p class="form-status" id="passwordStatus"></p>
            <button class="btn btn-primary" type="submit">Update Password</button>
          </form>
        </section>
      </div>
    </div>`;

  wireProfileForm(user);
  wireAvatar(user);
  wirePasswordForm();
  if (typeof initPasswordToggles === "function") initPasswordToggles();
  if (typeof initStrengthMeters === "function") initStrengthMeters();
}

function wireProfileForm(user) {
  const form = document.getElementById("profileForm");
  const status = document.getElementById("profileStatus");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = "Saving…";
    setStatus(status, "", true);
    try {
      const fd = new FormData(form);
      const data = await mtAuthFetch("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: fd.get("name"), phone: fd.get("phone") })
      });
      if (data.user) { Store.set("mt_user", data.user); updateAuthUI(); }
      setStatus(status, "Profile updated.", true);
      showToast("Profile updated");
    } catch (err) {
      setStatus(status, err.message, false);
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  });
}

function wireAvatar(user) {
  const pickBtn = document.getElementById("avatarPickBtn");
  const input = document.getElementById("avatarInput");
  const preview = document.getElementById("avatarPreview");
  const status = document.getElementById("avatarStatus");

  pickBtn.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setStatus(status, "Image must be 5MB or smaller.", false);
      input.value = "";
      return;
    }
    pickBtn.disabled = true;
    const original = pickBtn.textContent;
    pickBtn.textContent = "Uploading…";
    setStatus(status, "", true);
    try {
      // multipart/form-data — do NOT set Content-Type manually (browser adds boundary).
      const body = new FormData();
      body.append("avatar", file);
      const base = mtApiBase();
      let res = await fetch(base + "/auth/avatar", { method: "POST", credentials: "include", body });
      if (res.status === 401) {
        if (await mtRefreshSession()) res = await fetch(base + "/auth/avatar", { method: "POST", credentials: "include", body });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Upload failed");
      preview.innerHTML = `<img src="${escapeHtml(data.avatarUrl)}" alt="Profile photo">`;
      if (data.user) { Store.set("mt_user", data.user); updateAuthUI(); }
      setStatus(status, "Photo updated.", true);
      showToast("Profile photo updated");
    } catch (err) {
      setStatus(status, err.message, false);
    } finally {
      pickBtn.disabled = false; pickBtn.textContent = original;
      input.value = "";
    }
  });
}

function wirePasswordForm() {
  const form = document.getElementById("passwordForm");
  const status = document.getElementById("passwordStatus");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const fd = new FormData(form);
    const newPassword = String(fd.get("newPassword") || "");
    const strength = typeof scorePassword === "function" ? scorePassword(newPassword) : { meetsPolicy: newPassword.length >= 8 };
    if (!strength.meetsPolicy) {
      setStatus(status, "Password must be at least 8 characters and include both letters and numbers.", false);
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = "Updating…";
    setStatus(status, "", true);
    try {
      await mtAuthFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: fd.get("currentPassword"), newPassword })
      });
      form.reset();
      const meter = document.getElementById("pfPwStrength");
      if (meter) meter.classList.remove("show");
      setStatus(status, "Password changed.", true);
      showToast("Password changed");
    } catch (err) {
      setStatus(status, err.message, false);
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.resolve(window.MT_CATALOG_READY);
  const user = await requireClientAuth();
  if (!user) return; // redirected to login
  renderProfile(user);
});
