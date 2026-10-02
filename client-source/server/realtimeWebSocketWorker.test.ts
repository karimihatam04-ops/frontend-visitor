import { describe, expect, it } from "vitest";
import {
  isWebSocketUpgrade,
  websocketUpstreamUrl,
} from "../cloudflare-worker/becare-public-gateway.mjs";

describe("BCare realtime Worker route", () => {
  it("recognizes only a genuine websocket upgrade request", () => {
    expect(isWebSocketUpgrade(new Request("https://gateway.example/ws", { headers: { Upgrade: "websocket" } }))).toBe(true);
    expect(isWebSocketUpgrade(new Request("https://gateway.example/ws"))).toBe(false);
  });

  it("preserves the Reverb path and query while targeting the configured backend", () => {
    const target = websocketUpstreamUrl(
      "https://becare-public-gateway.dariatameen.workers.dev/ws/app/test-key?protocol=7",
      "https://sholomolo.com",
    );

    expect(target.toString()).toBe("https://sholomolo.com/ws/app/test-key?protocol=7");
  });
});
