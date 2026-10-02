/* =============================================================================
 * BCare — Page Defaults (injected script)
 * -----------------------------------------------------------------------------
 * 1. Insurance Details (Offers) page (/insurance-details):
 *    - Default active tab to "ضد الغير" (third-party) instead of "شامل"
 *    - Hide the vehicle summary card
 *
 * 2. Booking (Data Entry) page (/book-appointment):
 *    - Default insurance type dropdown to "ضد الغير" (third_party)
 *    - Start date already defaults to today (handled by the SPA natively)
 * ===========================================================================*/
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Offers page: click the "ضد الغير" tab on load
  // ---------------------------------------------------------------------------
  function clickThirdPartyTab() {
    // The SPA uses tab-btn class with "ضد الغير" text
    var tabs = document.querySelectorAll(".tab-btn");
    for (var i = 0; i < tabs.length; i++) {
      var text = tabs[i].textContent || "";
      if (text.indexOf("ضد الغير") !== -1) {
        // Only click if it's not already active
        if (!tabs[i].classList.contains("tab-active")) {
          tabs[i].click();
        }
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Booking page: set insuranceCoverType to "third_party"
  // ---------------------------------------------------------------------------
  function setInsuranceTypeDefault() {
    var selects = document.querySelectorAll("select");
    for (var i = 0; i < selects.length; i++) {
      var sel = selects[i];
      // Find the select that has "comprehensive" and "third_party" options
      var hasComprehensive = false;
      var hasThirdParty = false;
      for (var j = 0; j < sel.options.length; j++) {
        if (sel.options[j].value === "comprehensive") hasComprehensive = true;
        if (sel.options[j].value === "third_party") hasThirdParty = true;
      }
      if (hasComprehensive && hasThirdParty && sel.value !== "third_party") {
        // Set value and trigger Vue reactivity
        var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype, "value"
        ).set;
        nativeInputValueSetter.call(sel, "third_party");
        sel.dispatchEvent(new Event("input", { bubbles: true }));
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Use localStorage override to force the tab on the offers page.
  // The SPA reads query.tab to set the initial activeTab value.
  // We also use a MutationObserver to click the tab once it renders.
  // ---------------------------------------------------------------------------
  var observer = null;
  var appliedOffers = false;
  var appliedBooking = false;

  function applyDefaults() {
    var path = window.location.pathname || "";
    var hash = window.location.hash || "";
    var fullPath = path + hash;

    // Offers page
    if (fullPath.indexOf("insurance-details") !== -1) {
      if (!appliedOffers) {
        if (clickThirdPartyTab()) {
          appliedOffers = true;
        }
      }
    }

    // Booking page
    if (fullPath.indexOf("book-appointment") !== -1) {
      if (!appliedBooking) {
        if (setInsuranceTypeDefault()) {
          appliedBooking = true;
        }
      }
    }
  }

  // Reset flags on navigation
  function onNavigation() {
    appliedOffers = false;
    appliedBooking = false;
    // Small delay to let the SPA render
    setTimeout(applyDefaults, 300);
    setTimeout(applyDefaults, 800);
    setTimeout(applyDefaults, 1500);
  }

  // Watch for SPA route changes
  var realPushState = window.history.pushState;
  window.history.pushState = function () {
    var result = realPushState.apply(this, arguments);
    onNavigation();
    return result;
  };
  window.addEventListener("popstate", onNavigation);

  // MutationObserver for dynamic content
  observer = new MutationObserver(function () {
    applyDefaults();
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Initial run
  setTimeout(applyDefaults, 500);
  setTimeout(applyDefaults, 1000);
  setTimeout(applyDefaults, 2000);
})();
