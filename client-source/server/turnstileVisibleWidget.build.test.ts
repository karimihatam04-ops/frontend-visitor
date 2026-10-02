import { describe, expect, it } from "vitest";
import { assertVisibleWidget, showVisibleWidgetSource } from "../scripts/show-turnstile-register-widget.mjs";

describe("visible Turnstile registration widget", () => {
  it("changes the dimensioned challenge container into a visible widget", () => {
    const source = [
      'e.style.position="fixed",e.style.left="-9999px",e.style.top="0",e.style.width="min(320px,calc(100vw - 32px))",e.style.height="65px",e.style.opacity="0",e.style.pointerEvents="none"',
      'pr=t.render(r,{sitekey:yi,size:"flexible",appearance:"interaction-only",execution:"execute"})',
    ].join(";");
    const result = showVisibleWidgetSource(source);

    expect(result.changed).toBe(true);
    expect(result.content).toContain('appearance:"always"');
    expect(result.content).toContain('e.style.left="50%"');
    expect(() => assertVisibleWidget(result.content)).not.toThrow();
  });
});
