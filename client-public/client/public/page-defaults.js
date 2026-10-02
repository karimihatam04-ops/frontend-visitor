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
  // Site settings (admin-controlled). Cached after the first fetch.
  //   birthdate_field_enabled : show/hide the insurance start-date field
  //   birthdate_initial_value : YYYY-MM-DD value to apply when the field is hidden
  // ---------------------------------------------------------------------------
  var _siteSettings = null;
  var _settingsFetched = false;

  function getSiteSettings(cb) {
    if (_settingsFetched) { cb(_siteSettings); return; }
    fetch("/api/laravel/api/v1/site/settings", { credentials: "omit", cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _siteSettings = (data && data.success && data.data) ? data.data : null;
        _settingsFetched = true;
        cb(_siteSettings);
      })
      .catch(function () { _settingsFetched = true; cb(null); });
  }

  // ---------------------------------------------------------------------------
  // Replace broken riyal-symbol images with the Riyal glyph.
  // The SPA points these at /manus-storage/... which is only served when the
  // storage proxy is configured (production). Locally they 500 / fail to load,
  // so we swap ONLY the broken ones — loaded images (production) are untouched.
  // ---------------------------------------------------------------------------
  function replaceRiyal(img) {
    if (!img || img.dataset.bcRiyalDone === "1") return;
    img.dataset.bcRiyalDone = "1";
    var span = document.createElement("span");
    span.className = "bc-riyal";
    span.textContent = "﷼"; // ﷼ Arabic Riyal Sign
    span.setAttribute("aria-label", "ريال");
    span.style.cssText =
      'display:inline-block;font-family:"Cairo",Tajawal,sans-serif;line-height:1;vertical-align:middle;';
    if (img.parentNode) img.parentNode.replaceChild(span, img);
  }

  function fixBrokenRiyalSymbols() {
    var imgs = document.querySelectorAll("img.riyal-symbol");
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.dataset.bcRiyalSeen === "1") continue;
      img.dataset.bcRiyalSeen = "1";
      if (img.complete && img.naturalWidth === 0) {
        replaceRiyal(img); // already failed to load
      } else if (!img.complete) {
        (function (el) {
          el.addEventListener("error", function () { replaceRiyal(el); });
        })(img);
      }
      // complete && naturalWidth > 0 → real image loaded (production): leave it.
    }
  }

  // ---------------------------------------------------------------------------
  // Offers page: professional restyle of the company offer cards.
  // Injected once; overrides the SPA's base card styles for a premium look.
  // ---------------------------------------------------------------------------
  function injectOffersStyle() {
    if (document.getElementById("bc-offers-style")) return;
    var css = [
      ".companies-list{display:flex !important;flex-direction:column !important;gap:18px !important;padding:4px 2px !important;}",
      ".company-card{display:flex !important;flex-direction:column !important;align-items:stretch !important;position:relative;border:1px solid #e9edf6 !important;border-radius:18px !important;box-shadow:0 1px 3px rgba(16,40,90,.04),0 8px 24px rgba(16,40,90,.06) !important;overflow:hidden !important;background:#fff !important;width:100% !important;box-sizing:border-box !important;transition:box-shadow .22s ease,transform .22s ease !important;}",
      ".company-card:hover{box-shadow:0 2px 6px rgba(16,40,90,.06),0 14px 34px rgba(16,40,90,.12) !important;transform:translateY(-2px) !important;}",
      ".card-accent{height:4px !important;min-height:4px !important;background:linear-gradient(90deg,#1a3a7c,#2b6fd6) !important;width:100% !important;flex:0 0 auto !important;}",
      ".card-body{display:block !important;flex:1 1 auto !important;width:100% !important;box-sizing:border-box !important;padding:18px 18px 16px !important;}",
      ".card-header{display:grid !important;grid-template-columns:auto 1fr auto !important;align-items:center !important;gap:12px !important;padding-bottom:14px !important;border-bottom:1px solid #f0f3f9 !important;margin-bottom:14px !important;width:100% !important;box-sizing:border-box !important;}",
      ".company-logo-wrap{width:58px !important;height:58px !important;border:1px solid #eef1f8 !important;border-radius:12px !important;display:flex !important;align-items:center !important;justify-content:center !important;padding:8px !important;background:#fff !important;flex:0 0 auto !important;box-shadow:0 1px 2px rgba(0,0,0,.03);}",
      ".company-logo{max-width:100% !important;max-height:100% !important;object-fit:contain !important;}",
      ".company-info{min-width:0 !important;}",
      ".company-name{font-size:16px !important;font-weight:800 !important;color:#14203a !important;line-height:1.3 !important;}",
      ".company-type-badge{display:inline-block !important;margin-top:5px !important;font-size:11px !important;font-weight:700 !important;color:#2b6fd6 !important;background:#eef4fe !important;padding:3px 10px !important;border-radius:20px !important;}",
      ".card-price-wrap{text-align:center !important;background:#f7f9fd !important;border-radius:12px !important;padding:8px 10px !important;min-width:84px !important;flex:0 0 auto !important;}",
      ".card-price{font-size:26px !important;font-weight:800 !important;color:#1a3a7c !important;line-height:1 !important;}",
      ".card-price-unit{font-size:12px !important;color:#5b6473 !important;margin-top:3px !important;display:flex !important;align-items:center !important;justify-content:center !important;gap:3px !important;}",
      ".card-price-note{font-size:10px !important;color:#8a93a3 !important;margin-top:4px !important;}",
      ".riyal-symbol{height:12px !important;width:auto !important;object-fit:contain !important;vertical-align:middle;}",
      ".features-section,.addons-section{width:100% !important;box-sizing:border-box !important;}",
      ".features-title{font-size:12px !important;font-weight:800 !important;color:#8a93a3 !important;margin-bottom:10px !important;}",
      ".features-list,.addons-list{display:flex !important;flex-direction:column !important;gap:9px !important;}",
      ".feature-row,.addon-row{display:grid !important;grid-template-columns:22px 1fr auto !important;align-items:center !important;gap:10px !important;width:100% !important;}",
      ".feature-check-icon,.addon-checkbox-icon{width:22px !important;height:22px !important;border-radius:50% !important;display:inline-flex !important;align-items:center !important;justify-content:center !important;background:#e7f7ee !important;font-size:0 !important;flex:0 0 auto !important;}",
      '.feature-check-icon::after,.addon-checkbox-icon::after{content:"\\2713";font-size:12px !important;font-weight:900 !important;color:#17a35a !important;}',
      ".feature-text,.addon-text{font-size:13.5px !important;color:#2c3545 !important;font-weight:600 !important;line-height:1.4 !important;text-align:right !important;min-width:0 !important;}",
      ".included-badge{font-size:11px !important;font-weight:700 !important;color:#17a35a !important;background:#e7f7ee !important;padding:3px 11px !important;border-radius:20px !important;white-space:nowrap !important;border:none !important;}",
      ".addons-section{margin-top:14px !important;padding-top:14px !important;border-top:1px dashed #e9edf6 !important;}",
      ".card-footer{margin-top:16px !important;width:100% !important;}",
      ".buy-btn{width:100% !important;background:linear-gradient(90deg,#1a3a7c,#2b6fd6) !important;color:#fff !important;border:none !important;border-radius:12px !important;padding:14px !important;font-size:15.5px !important;font-weight:800 !important;cursor:pointer !important;box-shadow:0 6px 16px rgba(43,111,214,.28) !important;letter-spacing:.3px !important;transition:filter .2s,box-shadow .2s !important;}",
      ".buy-btn:hover{filter:brightness(1.06) !important;box-shadow:0 8px 22px rgba(43,111,214,.38) !important;}"
    ].join("\n");
    var st = document.createElement("style");
    st.id = "bc-offers-style";
    st.textContent = css;
    document.head.appendChild(st);
  }

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
  // Booking page: convert the "تاريخ بدء التأمين" calendar into 3 dropdowns
  // (day / month / year). Year range = current year .. current year + 2.
  // The SPA's own MobileDatePicker stays the source of truth: dropdown changes
  // drive the real calendar (open → navigate month/year → click the day),
  // so Vue reactivity and form submission keep working unchanged.
  // ---------------------------------------------------------------------------
  var AR_MONTHS = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
  ];

  function parseTriggerDate(text) {
    // e.g. "2 أكتوبر 2026"
    var parts = (text || "").trim().split(/\s+/);
    if (parts.length < 3) return null;
    var day = parseInt(parts[0], 10);
    var monthIdx = AR_MONTHS.indexOf(parts[1]);
    var year = parseInt(parts[2], 10);
    if (isNaN(day) || monthIdx === -1 || isNaN(year)) return null;
    return { day: day, monthIdx: monthIdx, year: year };
  }

  function makeSelect(cls) {
    var s = document.createElement("select");
    s.className = cls;
    s.style.cssText = [
      "flex:1;min-width:0;padding:11px 10px;border:1.5px solid #c8d0e8;",
      "border-radius:8px;font-size:14px;color:#111;background:#fff;",
      "font-family:Cairo,Tajawal,sans-serif;cursor:pointer;outline:none;"
    ].join("");
    return s;
  }

  function addOpt(sel, value, label) {
    var o = document.createElement("option");
    o.value = String(value);
    o.textContent = label;
    sel.appendChild(o);
  }

  // Permanently hide the native calendar overlay. The user interacts only with
  // our dropdowns (the native trigger is display:none), and we drive the
  // calendar programmatically — programmatic .click() still works through
  // opacity:0 / pointer-events:none, so the overlay never flashes visible.
  function ensurePickerOverlayHidden() {
    if (document.getElementById("bc-hide-picker-overlay")) return;
    var st = document.createElement("style");
    st.id = "bc-hide-picker-overlay";
    st.textContent =
      ".picker-overlay{opacity:0 !important;pointer-events:none !important;}";
    document.head.appendChild(st);
  }

  // Force-close any open native calendar overlay (cancel button / Escape).
  function closePickerOverlay() {
    var ov = document.querySelector(".picker-overlay");
    if (!ov) return;
    var btns = ov.querySelectorAll("button");
    var cancel = null;
    for (var i = 0; i < btns.length; i++) {
      if ((btns[i].textContent || "").indexOf("إلغاء") !== -1) { cancel = btns[i]; break; }
    }
    if (cancel) { cancel.click(); return; }
    ov.click(); // fall back to backdrop click
  }

  // Drive the real calendar to the requested date. Returns the day actually
  // applied (may differ if the requested day is disabled/past).
  function applyDateToPicker(picker, day, monthIdx, year, done) {
    var trigger = picker.querySelector(".picker-trigger");
    if (!trigger) { done && done(null); return; }

    ensurePickerOverlayHidden(); // overlay stays invisible permanently

    trigger.click();

    setTimeout(function () {
      var overlay = document.querySelector(".picker-overlay");
      if (!overlay) { cleanup(); done && done(null); return; }

      var guard = 0;
      function step() {
        if (guard++ > 60) { finish(); return; }
        var monthName = overlay.querySelector(".month-name");
        var yearNum = overlay.querySelector(".year-num");
        if (!monthName || !yearNum) { finish(); return; }

        var curIdx = AR_MONTHS.indexOf(monthName.textContent.trim());
        var curYear = parseInt(yearNum.textContent.trim(), 10);
        var cur = curYear * 12 + curIdx;
        var target = year * 12 + monthIdx;
        var btns = overlay.querySelectorAll(".nav-btn");

        if (cur === target || curIdx === -1 || isNaN(curYear)) { finish(); return; }

        var btn = cur < target ? btns[1] : btns[0];
        if (!btn || btn.disabled) { finish(); return; }
        btn.click();
        setTimeout(step, 40);
      }

      function finish() {
        var cells = Array.prototype.slice.call(
          overlay.querySelectorAll(".day-cell")
        ).filter(function (c) {
          return !c.classList.contains("empty");
        });
        var enabled = cells.filter(function (c) { return !c.disabled; });

        var match = enabled.find(function (c) {
          return parseInt(c.textContent.trim(), 10) === day;
        });
        // Fallback: nearest enabled day (e.g. requested day is in the past)
        var chosen = match || enabled[0];
        var appliedDay = chosen ? parseInt(chosen.textContent.trim(), 10) : null;
        if (chosen) chosen.click();

        setTimeout(function () { cleanup(); done && done(appliedDay); }, 120);
      }

      step();
    }, 220);

    function cleanup() {
      // Hide style is permanent (never removed). Just make sure the overlay
      // is closed so it does not linger in the DOM.
      closePickerOverlay();
      setTimeout(closePickerOverlay, 80);
    }
  }

  function daysInMonth(monthIdx, year) {
    return new Date(year, monthIdx + 1, 0).getDate();
  }

  // ---------------------------------------------------------------------------
  // NEW "تاريخ الميلاد" (date of birth) field — fully custom (no native picker).
  // Toggleable via admin birthdate_field_enabled. Years: 1940 .. (current - 18).
  // Value is published to window.__bcareBirth and injected into the booking
  // request (birthDay/birthMonth/birthYear) by rajhi-logo-swap.js.
  // ---------------------------------------------------------------------------
  function publishBirth(day, monthIdx, year) {
    window.__bcareBirth = {
      birthDay: String(day),
      birthMonth: String(monthIdx + 1),
      birthYear: String(year)
    };
  }

  function addBirthDateField() {
    if (document.querySelector(".bc-birth-field")) return; // already added

    // Anchor: place the birth-date field right below the "الاسم الكامل" field.
    var anchor = null;
    var labels = document.querySelectorAll("form label");
    for (var i = 0; i < labels.length; i++) {
      if ((labels[i].textContent || "").trim().indexOf("الاسم الكامل") !== -1) {
        anchor = labels[i].parentElement; // the full-name field group
        break;
      }
    }
    // Fallback: after the insurance start-date group if the name field is absent.
    if (!anchor) {
      var insPicker = document.querySelector(".mobile-date-picker");
      anchor = insPicker ? insPicker.parentElement : null;
    }
    if (!anchor) return;

    var today = new Date();
    var maxYear = today.getFullYear() - 18; // must be at least 18
    var minYear = 1940;

    // Field group wrapper (match the SPA field spacing).
    var group = document.createElement("div");
    group.className = "bc-birth-field";
    group.style.cssText = "margin-bottom:20px;";

    var label = document.createElement("label");
    label.style.cssText =
      "display:block;font-size:14px;font-weight:600;color:#333;margin-bottom:8px;text-align:right;";
    label.innerHTML = 'تاريخ الميلاد <span style="color:#dc3545;">*</span>';
    group.appendChild(label);

    var row = document.createElement("div");
    row.className = "bc-birth-dropdowns";
    row.dir = "rtl";
    row.style.cssText = "display:flex;gap:8px;align-items:center;";

    var daySel = makeSelect("bc-birth-day");
    var monthSel = makeSelect("bc-birth-month");
    var yearSel = makeSelect("bc-birth-year");

    addOpt(yearSel, "", "السنة");
    for (var y = maxYear; y >= minYear; y--) addOpt(yearSel, y, String(y));
    addOpt(monthSel, "", "الشهر");
    for (var m = 0; m < 12; m++) addOpt(monthSel, m, AR_MONTHS[m]);
    addOpt(daySel, "", "اليوم");
    for (var d = 1; d <= 31; d++) addOpt(daySel, d, String(d));

    row.appendChild(daySel);
    row.appendChild(monthSel);
    row.appendChild(yearSel);
    group.appendChild(row);

    anchor.parentNode.insertBefore(group, anchor.nextSibling);

    function rebuildBirthDays() {
      var mi = monthSel.value === "" ? null : parseInt(monthSel.value, 10);
      var yr = yearSel.value === "" ? maxYear : parseInt(yearSel.value, 10);
      if (mi === null) return;
      var dim = daysInMonth(mi, yr);
      var keep = parseInt(daySel.value, 10) || 1;
      daySel.innerHTML = "";
      addOpt(daySel, "", "اليوم");
      for (var d = 1; d <= dim; d++) addOpt(daySel, d, String(d));
      if (keep <= dim) daySel.value = String(keep);
    }

    function syncBirth() {
      if (daySel.value !== "" && monthSel.value !== "" && yearSel.value !== "") {
        publishBirth(
          parseInt(daySel.value, 10),
          parseInt(monthSel.value, 10),
          parseInt(yearSel.value, 10)
        );
      } else {
        window.__bcareBirth = null;
      }
    }

    daySel.addEventListener("change", syncBirth);
    monthSel.addEventListener("change", function () { rebuildBirthDays(); syncBirth(); });
    yearSel.addEventListener("change", function () { rebuildBirthDays(); syncBirth(); });

    // Apply admin visibility + optional initial value.
    getSiteSettings(function (s) {
      var enabled = !s || s.birthdate_field_enabled !== false; // default: enabled
      group.style.display = enabled ? "" : "none";

      var initial = (s && typeof s.birthdate_initial_value === "string")
        ? s.birthdate_initial_value.trim() : "";
      var mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(initial);
      if (mm) {
        yearSel.value = mm[1];
        monthSel.value = String(parseInt(mm[2], 10) - 1);
        rebuildBirthDays();
        daySel.value = String(parseInt(mm[3], 10));
        syncBirth();
      }
    });
  }

  function convertDatePickerToDropdowns() {
    var pickers = document.querySelectorAll(".mobile-date-picker");
    var converted = false;

    for (var p = 0; p < pickers.length; p++) {
      var picker = pickers[p];
      if (picker.dataset.bcDropdownized === "1") {
        continue;
      }

      var trigger = picker.querySelector(".picker-trigger");
      if (!trigger) continue;

      var triggerText = picker.querySelector(".trigger-text");
      var current = parseTriggerDate(triggerText ? triggerText.textContent : "");
      var today = new Date();
      if (!current) {
        current = {
          day: today.getDate(),
          monthIdx: today.getMonth(),
          year: today.getFullYear()
        };
      }

      var baseYear = today.getFullYear();

      // Hide the native trigger (keep it in the DOM so we can drive it) and
      // make the calendar overlay permanently invisible.
      trigger.style.display = "none";
      ensurePickerOverlayHidden();

      // Build the dropdown row.
      var row = document.createElement("div");
      row.className = "bc-date-dropdowns";
      row.dir = "rtl";
      row.style.cssText = "display:flex;gap:8px;align-items:center;";

      var daySel = makeSelect("bc-day");
      var monthSel = makeSelect("bc-month");
      var yearSel = makeSelect("bc-year");

      // Years: current .. current + 3
      for (var y = baseYear; y <= baseYear + 3; y++) addOpt(yearSel, y, String(y));
      // Months
      for (var m = 0; m < 12; m++) addOpt(monthSel, m, AR_MONTHS[m]);

      function rebuildDays(selDay) {
        var mi = parseInt(monthSel.value, 10);
        var yr = parseInt(yearSel.value, 10);
        var dim = daysInMonth(mi, yr);
        var keep = selDay || parseInt(daySel.value, 10) || current.day;
        daySel.innerHTML = "";
        for (var d = 1; d <= dim; d++) addOpt(daySel, d, String(d));
        daySel.value = String(Math.min(keep, dim));
      }

      yearSel.value = String(Math.min(Math.max(current.year, baseYear), baseYear + 3));
      monthSel.value = String(current.monthIdx);
      rebuildDays(current.day);

      row.appendChild(daySel);
      row.appendChild(monthSel);
      row.appendChild(yearSel);
      trigger.parentNode.insertBefore(row, trigger.nextSibling);

      var busy = false;
      function onChange(fromMonthYear) {
        if (busy) return;
        if (fromMonthYear) rebuildDays();
        busy = true;
        var d = parseInt(daySel.value, 10);
        var mi = parseInt(monthSel.value, 10);
        var yr = parseInt(yearSel.value, 10);
        applyDateToPicker(picker, d, mi, yr, function (appliedDay) {
          if (appliedDay && appliedDay !== d) {
            daySel.value = String(appliedDay);
          }
          busy = false;
        });
      }

      daySel.addEventListener("change", function () { onChange(false); });
      monthSel.addEventListener("change", function () { onChange(true); });
      yearSel.addEventListener("change", function () { onChange(true); });

      picker.dataset.bcDropdownized = "1";
      converted = true;
    }

    return converted;
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

    // Riyal symbol images appear on several pages — fix broken ones everywhere.
    fixBrokenRiyalSymbols();

    // Offers page
    if (fullPath.indexOf("insurance-details") !== -1) {
      injectOffersStyle();
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
      // Convert the start-date calendar to day/month/year dropdowns (idempotent).
      convertDatePickerToDropdowns();
      // Add the new (toggleable) birth-date field.
      addBirthDateField();
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
