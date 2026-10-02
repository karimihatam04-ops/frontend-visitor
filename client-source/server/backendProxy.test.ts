import { describe, expect, it } from "vitest";
import {
  buildVehibookHeaders,
  isBCareProxyPath,
  mapBCareProxyPath,
  stripCookieDomain,
} from "./backendProxy";

describe("BCare VehiBook proxy", () => {
  it("maps only the approved client routes to the upstream service", () => {
    expect(mapBCareProxyPath("/api/laravel/api/v1/quotes")).toBe("/api/v1/quotes");
    expect(mapBCareProxyPath("/api/vehicle-inquiry")).toBe("/api/vehicle-inquiry");
    expect(mapBCareProxyPath("/broadcasting/auth")).toBe("/broadcasting/auth");
    expect(mapBCareProxyPath("/pusher/auth")).toBe("/pusher/auth");
    expect(isBCareProxyPath("/api/trpc/auth.me")).toBe(false);
    expect(mapBCareProxyPath("/api/unrelated-endpoint")).toBeNull();
  });

  it("forwards browser identity, cookies, and the required VehiBook origin headers", () => {
    const headers = buildVehibookHeaders(
      {
        "user-agent": "BCare Browser/1.0",
        cookie: "session=abc; visitor=def",
        "x-forwarded-for": "203.0.113.18",
        authorization: "Bearer visitor-token",
        origin: "https://public-bcare.example",
        referer: "https://public-bcare.example/",
      },
      Buffer.from('{"plate":"123"}'),
    );

    expect(headers).toMatchObject({
      host: "vehibook.com",
      "user-agent": "BCare Browser/1.0",
      cookie: "session=abc; visitor=def",
      authorization: "Bearer visitor-token",
      origin: "https://vehibook.com",
      referer: "https://vehibook.com/",
      "x-forwarded-for": "203.0.113.18",
      "content-length": "15",
    });
  });

  it("prefers a valid platform client address and localizes upstream cookies", () => {
    const headers = buildVehibookHeaders(
      {
        "cf-connecting-ip": "198.51.100.40",
        "x-forwarded-for": "203.0.113.200",
      },
      null,
    );

    expect(headers["x-forwarded-for"]).toBe("198.51.100.40");
    expect(stripCookieDomain("session=value; Domain=vehibook.com; Path=/")).toBe(
      "session=value; Path=/",
    );
  });
});
