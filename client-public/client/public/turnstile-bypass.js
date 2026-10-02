/* Turnstile token-pool bypass: Turnstile verification is disabled at the
 * gateway worker, so the client no longer needs a real challenge token.
 * We expose a token pool that resolves instantly, preventing the booking
 * flow from hanging on an invisible challenge that never completes. */
(function () {
  var pool = {
    prewarm: function () { return Promise.resolve(); },
    take: function () { return Promise.resolve('disabled'); },
    refresh: function () { return Promise.resolve('disabled'); }
  };
  try {
    Object.defineProperty(globalThis, '__BCareTokenPool', {
      configurable: true,
      get: function () { return pool; },
      set: function () { /* ignore the gateway's real pool */ }
    });
  } catch (e) {
    globalThis.__BCareTokenPool = pool;
  }
})();
