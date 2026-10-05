/* ===========================================================
   MUSCLE TONIK - Forgot password (OTP)

   Four steps on one page:
     1. identify the account by email OR mobile
     2. choose where the code goes (only channels the account actually has)
     3. type the 6-digit code
     4. set the new password

   Every step is a server call; nothing about the reset is decided here.
   apiRequest() comes from js/auth.js.
   =========================================================== */
(function () {
  var state = {
    identifier: "",
    channels: [],
    channel: "",
    resetToken: "",
    resendTimer: null,
    expiryTimer: null,
    autoSubmitted: false
  };

  var steps = {
    1: document.getElementById("stepIdentify"),
    2: document.getElementById("stepChannel"),
    3: document.getElementById("stepVerify"),
    4: document.getElementById("stepPassword")
  };

  var COPY = {
    1: ["Reset your password", "Enter the email address you signed up with."],
    2: ["Where should we send it?", "Pick how you want to receive your one-time verification code."],
    3: ["Enter your code", "It is valid for a few minutes only."],
    4: ["Choose a new password", "Pick something you have not used here before."]
  };

  function showStep(n) {
    Object.keys(steps).forEach(function (key) {
      steps[key].hidden = String(key) !== String(n);
    });
    document.querySelectorAll("#otpSteps li").forEach(function (li) {
      var step = Number(li.dataset.step);
      li.classList.toggle("active", step === n);
      li.classList.toggle("done", step < n);
    });
    document.getElementById("otpTitle").textContent = COPY[n][0];
    document.getElementById("otpSub").textContent = COPY[n][1];
    var focusable = steps[n].querySelector("input:not([type=hidden]), input[type=radio]");
    if (focusable) focusable.focus();
  }

  function setError(form, message) {
    var box = form.querySelector(".form-error");
    if (box) box.textContent = message || "";
  }

  // Wrap a submit so the button can never be double-fired and the error line
  // is always cleared before the next attempt.
  function onSubmit(form, handler) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var button = form.querySelector('button[type="submit"]');
      var label = button ? button.textContent : "";
      if (button) { button.disabled = true; button.textContent = "Please wait..."; }
      setError(form, "");

      Promise.resolve()
        .then(function () { return handler(new FormData(form)); })
        .catch(function (err) {
          setError(form, err.message || "Something went wrong. Please try again.");
          showToast(err.message || "Something went wrong.");
        })
        .then(function () {
          if (button) { button.disabled = false; button.textContent = label; }
        });
    });
  }

  /* --- step 1: find the account ------------------------------------------ */
  onSubmit(steps[1], function (fd) {
    var identifier = String(fd.get("identifier") || "").trim();
    return apiRequest("/auth/forgot-password/lookup", {
      method: "POST",
      body: JSON.stringify({ identifier: identifier })
    }).then(function (data) {
      state.identifier = identifier;
      state.channels = data.channels || [];
      state.channel = state.channels.length ? state.channels[0].id : "email";
      // Email is the only channel now, so skip the "where should we send it?"
      // step and mail the code straight away.
      if (state.channels.length <= 1) {
        return sendCode();
      }
      renderChannels();
      showStep(2);
    });
  });

  function renderChannels() {
    var host = document.getElementById("channelChoices");
    host.innerHTML = state.channels.map(function (ch, index) {
      var isEmail = ch.id === "email";
      return '<label class="otp-channel">' +
        '<input type="radio" name="channel" value="' + ch.id + '"' + (index === 0 ? " checked" : "") + ">" +
        '<span class="otp-channel-body">' +
        '<strong>' + (isEmail ? "Email" : "SMS to mobile") + "</strong>" +
        '<em>' + ch.destination + "</em>" +
        "</span></label>";
    }).join("");
  }

  /* --- step 2: send the code --------------------------------------------- */
  onSubmit(steps[2], function (fd) {
    state.channel = String(fd.get("channel") || state.channel);
    return sendCode();
  });

  function sendCode() {
    return apiRequest("/auth/forgot-password/otp", {
      method: "POST",
      body: JSON.stringify({ identifier: state.identifier, channel: state.channel })
    }).then(function (data) {
      var where = state.channel === "sms"
        ? "mobile number " + data.destination
        : data.destination;
      document.getElementById("otpSentTo").textContent = "Sent to " + where + ".";
      startExpiryCountdown(Number(data.expiresInMinutes || 10) * 60);
      // Only shown when the server is not running in production mode, so the
      // flow is testable before SMTP/SMS credentials are live.
      if (data.devCode) {
        document.getElementById("otpSentTo").textContent += " (test code: " + data.devCode + ")";
      }
      showToast(data.message || "Code sent.");
      startResendCountdown(data.resendAfterSeconds || 60);
      showStep(3);
    });
  }

  // Live "expires in 9:58" clock. A static "expires in 10 minutes" leaves the
  // customer guessing how long they have left, which is when they give up.
  function startExpiryCountdown(seconds) {
    var label = document.getElementById("otpExpiry");
    if (!label) return;
    var left = seconds;
    clearInterval(state.expiryTimer);
    var tick = function () {
      if (left <= 0) {
        clearInterval(state.expiryTimer);
        label.textContent = "This code has expired — request a new one.";
        label.classList.add("is-expired");
        return;
      }
      var m = Math.floor(left / 60);
      var sec = left % 60;
      label.textContent = "Code expires in " + m + ":" + (sec < 10 ? "0" : "") + sec;
      label.classList.remove("is-expired");
      left -= 1;
    };
    tick();
    state.expiryTimer = setInterval(tick, 1000);
  }

  function startResendCountdown(seconds) {
    var button = document.getElementById("otpResend");
    var left = seconds;
    clearInterval(state.resendTimer);
    var tick = function () {
      if (left <= 0) {
        clearInterval(state.resendTimer);
        button.disabled = false;
        button.textContent = "Resend code";
        return;
      }
      button.disabled = true;
      button.textContent = "Resend code in " + left + "s";
      left -= 1;
    };
    tick();
    state.resendTimer = setInterval(tick, 1000);
  }

  // Auto-submit as soon as a full code is present — typed, pasted, or filled
  // in by the OS from an SMS. Guarded so it fires once per completed code.
  (function wireOtpAutoSubmit() {
    var input = steps[3] && steps[3].querySelector('input[name="code"]');
    if (!input) return;
    input.addEventListener("input", function () {
      var digits = input.value.replace(/\D/g, "");
      if (digits !== input.value) input.value = digits;   // strip stray characters
      if (digits.length === 6 && !state.autoSubmitted) {
        state.autoSubmitted = true;
        if (typeof steps[3].requestSubmit === "function") steps[3].requestSubmit();
        else steps[3].dispatchEvent(new Event("submit", { cancelable: true }));
      }
      if (digits.length < 6) state.autoSubmitted = false;
    });
  })();

  document.getElementById("otpResend").addEventListener("click", function () {
    var button = this;
    button.disabled = true;
    sendCode().catch(function (err) {
      setError(steps[3], err.message);
      showToast(err.message);
      button.disabled = false;
    });
  });

  /* --- step 3: verify ----------------------------------------------------- */
  onSubmit(steps[3], function (fd) {
    var code = String(fd.get("code") || "").replace(/\D/g, "");
    return apiRequest("/auth/forgot-password/verify", {
      method: "POST",
      body: JSON.stringify({ identifier: state.identifier, code: code })
    }).then(function (data) {
      state.resetToken = data.resetToken;
      clearInterval(state.resendTimer);
      showStep(4);
    });
  });

  /* --- step 4: new password ----------------------------------------------- */
  onSubmit(steps[4], function (fd) {
    var password = String(fd.get("password") || "");
    var confirm = String(fd.get("confirmPassword") || "");
    if (password !== confirm) return Promise.reject(new Error("Passwords do not match."));

    var strength = scorePassword(password);
    if (!strength.meetsPolicy) {
      return Promise.reject(new Error("Password must be at least 8 characters and include both letters and numbers."));
    }

    return apiRequest("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: state.resetToken, password: password })
    }).then(function (data) {
      showToast(data.message || "Password updated. Please log in.");
      window.location.href = "login.html";
    });
  });

  /* --- back links ---------------------------------------------------------- */
  document.querySelectorAll("[data-back]").forEach(function (button) {
    button.addEventListener("click", function () {
      clearInterval(state.resendTimer);
      showStep(Number(button.dataset.back));
    });
  });

  document.addEventListener("DOMContentLoaded", function () {
    showStep(1);
  });
})();
