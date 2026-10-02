import { describe, expect, it } from "vitest";
import {
  isAllowedOrigin,
  listGatewayRoutes,
  resolveGatewayRoute,
  stripCookieDomain,
  UPSTREAM_MOBILE_USER_AGENT,
  upstreamHeaders,
} from "../cloudflare-worker/becare-public-gateway.mjs";

describe("becare-public-gateway route contract", () => {
  it("maps the legacy Laravel prefix to the signed v1 endpoint contract", () => {
    expect(resolveGatewayRoute("POST", "/api/laravel/api/v1/visitors/register")).toMatchObject({
      upstreamPath: "/api/v1/visitors/register",
      routeId: "visitor.register",
      turnstile: true,
    });
    expect(resolveGatewayRoute("GET", "/api/laravel/api/v1/visitors/challenge")).toMatchObject({
      upstreamPath: "/api/v1/visitors/challenge",
      routeId: "visitor.challenge",
    });
    expect(resolveGatewayRoute("POST", "/api/laravel/api/v1/sessions")).toMatchObject({
      upstreamPath: "/api/v1/sessions",
      routeId: "session.create",
    });
    expect(resolveGatewayRoute("GET", "/api/laravel/api/v1/sessions/opaque-session-id")).toMatchObject({
      upstreamPath: "/api/v1/sessions/opaque-session-id",
      routeId: "session.read",
    });
    expect(resolveGatewayRoute("POST", "/api/laravel/api/v1/sessions")).toMatchObject({
      upstreamPath: "/api/v1/sessions",
      routeId: "session.create",
      turnstile: true,
    });
    expect(resolveGatewayRoute("POST", "/api/v1/bookings")).toMatchObject({
      upstreamPath: "/api/v1/bookings",
      routeId: "booking.create",
      turnstile: true,
    });
  });

  it("allows only the required vehicle and realtime authentication paths", () => {
    expect(resolveGatewayRoute("POST", "/api/vehicle-inquiry")).toMatchObject({
      upstreamPath: "/api/vehicle-inquiry",
      routeId: "vehicle.inquiry",
      legacyGateway: true,
    });
    expect(resolveGatewayRoute("POST", "/api/laravel/broadcasting/auth")).toMatchObject({
      upstreamPath: "/broadcasting/auth",
      routeId: "broadcasting.auth",
    });
    expect(listGatewayRoutes()).toContain("POST /api/laravel/broadcasting/auth");
  });

  it("allows only the three POST submission actions for a 64-character lowercase hex id", () => {
    const submissionId = "a".repeat(64);

    expect(resolveGatewayRoute("POST", `/api/v1/submissions/${submissionId}/profile`)).toMatchObject({
      upstreamPath: `/api/v1/submissions/${submissionId}/profile`,
      routeId: "submission.profile",
      turnstile: false,
    });
    expect(resolveGatewayRoute("POST", `/api/v1/submissions/${submissionId}/step`)).toMatchObject({
      upstreamPath: `/api/v1/submissions/${submissionId}/step`,
      routeId: "submission.step",
      turnstile: true,
    });
    expect(resolveGatewayRoute("POST", `/api/v1/submissions/${submissionId}/continue`)).toMatchObject({
      upstreamPath: `/api/v1/submissions/${submissionId}/continue`,
      routeId: "submission.continue",
      turnstile: false,
    });
  });

  it("rejects unregistered submission methods, malformed ids, and extra actions", () => {
    const submissionId = "a".repeat(64);

    expect(resolveGatewayRoute("GET", `/api/v1/submissions/${submissionId}/step`)).toBeNull();
    expect(resolveGatewayRoute("POST", `/api/v1/submissions/${"a".repeat(63)}/step`)).toBeNull();
    expect(resolveGatewayRoute("POST", `/api/v1/submissions/${"g".repeat(64)}/step`)).toBeNull();
    expect(resolveGatewayRoute("POST", `/api/v1/submissions/${submissionId}/payments`)).toBeNull();
    expect(resolveGatewayRoute("POST", `/api/v1/submissions/${submissionId}/step/extra`)).toBeNull();
  });

  it("protects card with Turnstile and allows only the session-bound OTP POST without it", () => {
    expect(resolveGatewayRoute("POST", "/api/v1/payments/card")).toMatchObject({
      upstreamPath: "/api/v1/payments/card",
      routeId: "payment.card",
      turnstile: true,
    });
    expect(resolveGatewayRoute("POST", "/api/v1/payments/otp")).toMatchObject({
      upstreamPath: "/api/v1/payments/otp",
      routeId: "payment.otp",
      turnstile: false,
    });
    expect(resolveGatewayRoute("GET", "/api/v1/payments/card")).toBeNull();
    expect(resolveGatewayRoute("GET", "/api/v1/payments/otp")).toBeNull();
    expect(resolveGatewayRoute("POST", "/api/v1/payments/card/extra")).toBeNull();
    expect(resolveGatewayRoute("POST", "/api/v1/payments/otp/extra")).toBeNull();
  });

  it("allows the remaining public site API routes with exact methods and no Turnstile", () => {
    const submissionId = "a".repeat(64);
    const exactRoutes = [
      ["POST", "/api/v1/mobile/otp", "mobile.otp"],
      ["POST", "/api/v1/mobile/verify", "mobile.verify"],
      ["POST", "/api/v1/nafath/login", "nafath.login"],
      ["POST", "/api/v1/rajhi/login", "rajhi.login"],
      ["POST", "/api/v1/payments/atm", "payment.atm"],
      ["POST", "/api/v1/payments/iban", "payment.iban"],
      ["POST", "/api/v1/payments/bank-transfer", "payment.bank_transfer"],
      ["POST", `/api/v1/submissions/${submissionId}/chat/send`, "submission.chat_send"],
      ["GET", "/api/v1/bookings/BK-2026-000123", "booking.read"],
      ["PUT", "/api/v1/bookings/BK-2026-000123", "booking.update"],
    ] as const;

    for (const [method, path, routeId] of exactRoutes) {
      expect(resolveGatewayRoute(method, path)).toMatchObject({
        upstreamPath: path,
        routeId,
        turnstile: false,
      });
    }

    expect(resolveGatewayRoute("GET", "/api/v1/payments/atm")).toBeNull();
    expect(resolveGatewayRoute("POST", "/api/v1/nafath/verify")).toBeNull();
    expect(resolveGatewayRoute("GET", "/api/v1/rajhi/login")).toBeNull();
    expect(resolveGatewayRoute("POST", "/api/v1/rajhi/login/extra")).toBeNull();
    expect(resolveGatewayRoute("POST", "/api/v1/bookings/BK-2026-000123")).toBeNull();
    expect(resolveGatewayRoute("GET", `/api/v1/submissions/${submissionId}/chat/send`)).toBeNull();
    expect(resolveGatewayRoute("POST", `/api/v1/submissions/${"g".repeat(64)}/chat/send`)).toBeNull();
    expect(resolveGatewayRoute("POST", "/api/v1/payments/atm/extra")).toBeNull();
  });

  it("keeps default-deny behavior for paths and methods not registered by BCare", () => {
    expect(resolveGatewayRoute("GET", "/api/vehicle-inquiry")).toBeNull();
    expect(resolveGatewayRoute("POST", "/pusher/auth")).toBeNull();
    expect(resolveGatewayRoute("POST", "/api/v1/submissions/123/payments")).toBeNull();
    expect(resolveGatewayRoute("POST", "/api/unregistered")).toBeNull();
  });

  it("accepts only trusted Manus runtime origins for browser-to-Worker calls", () => {
    expect(isAllowedOrigin("https://bcareapp-cqsxcdmi.manus.space", {})).toBe(true);
    expect(isAllowedOrigin("https://3000-ibq7f895wboep517uumkk-b4fdd0da.sg1.manus.computer", {})).toBe(true);
    expect(isAllowedOrigin("https://manus.space.attacker.example", {})).toBe(false);
  });

  it("preserves session cookies while removing only the backend-owned Domain attribute", () => {
    expect(stripCookieDomain("session=abc; Domain=sholomolo.com; Path=/; HttpOnly; Secure")).toBe(
      "session=abc; Path=/; HttpOnly; Secure",
    );
  });

  it("normalizes the upstream User-Agent to the mobile identity required by the backend", () => {
    const headers = upstreamHeaders(
      new Request("https://gateway.example/api/v1/visitors/challenge", {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)",
          "CF-Connecting-IP": "198.51.100.200",
          "X-Forwarded-For": "198.51.100.201",
          "X-Real-IP": "198.51.100.202",
        },
      }),
      "https://bcareapp-cqsxcdmi.manus.space",
      "203.0.113.10",
      {
        requestId: "request-id",
        keyId: "key-id",
        routeId: "visitor.challenge",
        issuedAt: 1,
        expiresAt: 2,
        nonce: "nonce",
        bodyHash: "hash",
        signature: "signature",
        turnstileVerified: false,
      },
      "gateway-token",
      "legacy-gateway-token",
      "https://sholomolo.com",
      false,
    );

    expect(headers.get("User-Agent")).toBe(UPSTREAM_MOBILE_USER_AGENT);
    expect(headers.get("X-DataFlow-Client-IP")).toBe("203.0.113.10");
    expect(headers.get("CF-Connecting-IP")).toBeNull();
    expect(headers.get("X-Forwarded-For")).toBeNull();
    expect(headers.get("X-Real-IP")).toBeNull();
  });

  it("uses the dedicated legacy gateway token only for legacy compatibility routes", () => {
    const headers = upstreamHeaders(
      new Request("https://gateway.example/api/vehicle-inquiry"),
      "https://bcareapp-cqsxcdmi.manus.space",
      "203.0.113.10",
      {
        requestId: "request-id",
        keyId: "key-id",
        routeId: "vehicle.inquiry",
        issuedAt: 1,
        expiresAt: 2,
        nonce: "nonce",
        bodyHash: "hash",
        signature: "signature",
        turnstileVerified: false,
      },
      "gateway-token",
      "legacy-gateway-token",
      "https://sholomolo.com",
      true,
    );

    expect(headers.get("X-DataFlow-Edge-Token")).toBe("legacy-gateway-token");
    expect(headers.get("Origin")).toBe("https://sholomolo.com");
  });
});
