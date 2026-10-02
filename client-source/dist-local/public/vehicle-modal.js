/* =============================================================================
 * BCare — Vehicle Details Modal (injected overlay)
 * -----------------------------------------------------------------------------
 * This script augments the pre-built SPA without touching the app bundle.
 *
 * Behaviour:
 *   1. It wraps window.fetch to capture the response of POST /api/vehicle-inquiry.
 *   2. When a successful inquiry (summary.isVehicleExist) is captured, it defers
 *      the SPA's automatic navigation to /book-appointment and instead shows a
 *      modal listing every available vehicle field.
 *   3. The modal has a primary button "إظهار العروض" that resumes navigation to
 *      the booking (data-entry) page, and a close button that keeps the visitor
 *      on the current page.
 *
 * The SPA navigates via history.pushState (vue-router). We intercept the very
 * next book-appointment navigation that happens right after a captured inquiry
 * and hold it until the user clicks "إظهار العروض".
 * ===========================================================================*/
(function () {
  "use strict";

  var MODAL_ID = "bcare-vehicle-modal-root";
  var lastInquiry = null; // { summary, at }
  var pendingNav = null; // { type: 'push'|'assign', args | url }
  var INQUIRY_TTL = 20000; // consider an inquiry "fresh" for 20s

  // ---------------------------------------------------------------------------
  // Field definitions (Arabic labels). Only fields present in the summary and
  // holding a meaningful value are rendered.
  // ---------------------------------------------------------------------------
  var FIELDS = [
    { key: "maker", label: "الشركة الصانعة" },
    { key: "model", label: "الطراز" },
    { key: "modelYear", label: "سنة الصنع" },
    { key: "estimatedPrice", label: "القيمة التقديرية", suffix: " ريال" },
    { key: "plate", label: "رقم اللوحة" },
    { key: "chassisNumber", label: "رقم الهيكل" },
    { key: "cylinders", label: "عدد الأسطوانات" },
    { key: "weight", label: "الوزن" },
    { key: "majorColor", label: "اللون" },
    { key: "registrationPlace", label: "مكان التسجيل" },
    { key: "licenseExpiryDate", label: "تاريخ انتهاء الرخصة" },
    { key: "sequenceNumber", label: "الرقم التسلسلي" },
  ];

  function isMeaningful(v) {
    if (v === null || v === undefined) return false;
    var s = String(v).trim();
    if (!s) return false;
    if (s === "0") return false;
    if (s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return false;
    return true;
  }

  function formatValue(field, value) {
    var s = String(value).trim();
    if (field.key === "estimatedPrice") {
      var digits = s.replace(/[^\d.]/g, "");
      if (digits) {
        var n = Number(digits);
        if (!isNaN(n)) s = n.toLocaleString("en-US");
      }
    }
    return s + (field.suffix || "");
  }

  // ---------------------------------------------------------------------------
  // Modal rendering
  // ---------------------------------------------------------------------------
  function buildRows(summary) {
    var rows = "";
    for (var i = 0; i < FIELDS.length; i++) {
      var f = FIELDS[i];
      var val = summary ? summary[f.key] : undefined;
      if (!isMeaningful(val)) continue;
      rows +=
        '<div class="bcare-vm-row">' +
        '<span class="bcare-vm-label">' + f.label + "</span>" +
        '<span class="bcare-vm-value">' + escapeHtml(formatValue(f, val)) + "</span>" +
        "</div>";
    }
    if (!rows) {
      rows =
        '<div class="bcare-vm-empty">تم العثور على المركبة. اضغط "إظهار العروض" لمتابعة تعبئة البيانات.</div>';
    }
    return rows;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function closeModal() {
    var el = document.getElementById(MODAL_ID);
    if (el) el.parentNode.removeChild(el);
    document.documentElement.style.overflow = "";
  }

  function proceed() {
    var nav = pendingNav;
    pendingNav = null;
    lastInquiry = null;
    closeModal();
    if (nav) {
      // Resume the deferred navigation the SPA originally intended.
      if (nav.type === "push") {
        realPushState.apply(window.history, nav.args);
        // Notify vue-router so it renders the new route.
        window.dispatchEvent(new PopStateEvent("popstate", { state: nav.args[0] }));
      } else if (nav.type === "assign") {
        realAssign ? realAssign.call(window.location, nav.url) : (window.location.href = nav.url);
      } else if (nav.type === "href") {
        window.location.href = nav.url;
      }
    }
  }

  function showModal(summary) {
    closeModal();
    document.documentElement.style.overflow = "hidden";

    var root = document.createElement("div");
    root.id = MODAL_ID;
    root.setAttribute("dir", "rtl");
    root.innerHTML =
      '<div class="bcare-vm-backdrop"></div>' +
      '<div class="bcare-vm-dialog" role="dialog" aria-modal="true" aria-labelledby="bcare-vm-title">' +
        '<button type="button" class="bcare-vm-close" aria-label="إغلاق">&times;</button>' +
        '<div class="bcare-vm-head">' +
          '<h2 id="bcare-vm-title" class="bcare-vm-title">بيانات المركبة</h2>' +
        "</div>" +
        '<div class="bcare-vm-body">' + buildRows(summary) + "</div>" +
        '<div class="bcare-vm-actions">' +
          '<button type="button" class="bcare-vm-primary">إظهار العروض</button>' +
          '<button type="button" class="bcare-vm-secondary">إغلاق</button>' +
        "</div>" +
      "</div>";

    document.body.appendChild(root);

    root.querySelector(".bcare-vm-close").addEventListener("click", cancel);
    root.querySelector(".bcare-vm-secondary").addEventListener("click", cancel);
    root.querySelector(".bcare-vm-backdrop").addEventListener("click", cancel);
    root.querySelector(".bcare-vm-primary").addEventListener("click", proceed);

    // Animate in on next frame.
    requestAnimationFrame(function () {
      root.classList.add("bcare-vm-open");
    });
  }

  function cancel() {
    // User dismissed: drop the deferred navigation and stay on the page.
    pendingNav = null;
    lastInquiry = null;
    closeModal();
  }

  // ---------------------------------------------------------------------------
  // fetch interception — capture inquiry summary
  // ---------------------------------------------------------------------------
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var isInquiry = url.indexOf("/api/vehicle-inquiry") !== -1;
    var p = realFetch(input, init);
    if (!isInquiry) return p;
    return p.then(function (res) {
      try {
        var clone = res.clone();
        clone
          .json()
          .then(function (data) {
            if (data && data.success && data.summary && data.summary.isVehicleExist) {
              lastInquiry = { summary: data.summary, at: Date.now() };
            } else {
              lastInquiry = null;
            }
          })
          .catch(function () {});
      } catch (e) {}
      return res;
    });
  };

  // ---------------------------------------------------------------------------
  // Navigation interception — defer book-appointment nav after an inquiry
  // ---------------------------------------------------------------------------
  var realPushState = window.history.pushState;
  window.history.pushState = function (state, title, url) {
    var target = url != null ? String(url) : "";
    var freshInquiry =
      lastInquiry && Date.now() - lastInquiry.at < INQUIRY_TTL;

    if (freshInquiry && target.indexOf("book-appointment") !== -1) {
      // Hold this navigation; show the modal first.
      pendingNav = { type: "push", args: [state, title, url] };
      var summary = lastInquiry.summary;
      showModal(summary);
      return; // do NOT navigate yet
    }
    return realPushState.apply(this, arguments);
  };

  // Guard window.location.assign / href just in case the SPA changes strategy.
  var realAssign = window.location.assign ? window.location.assign.bind(window.location) : null;

  // Expose a tiny debug hook (non-intrusive).
  window.__bcareVehicleModal = {
    show: showModal,
    _state: function () {
      return { lastInquiry: lastInquiry, pendingNav: pendingNav };
    },
  };
})();
