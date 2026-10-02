import { describe, expect, it } from "vitest";
import { assertInvisibleTurnstile, configureInvisibleTurnstileSource } from "../scripts/configure-invisible-turnstile.mjs";

describe("invisible Turnstile configuration", () => {
  it("restores the normal invisible widget before registration", () => {
    const source = [
      'e.style.position="fixed",e.style.left="50%",e.style.top="50%",e.style.width="min(320px,calc(100vw - 32px))",e.style.height="65px",e.style.opacity="1",e.style.pointerEvents="auto",e.style.transform="translate(-50%,-50%)",e.style.zIndex="2147483647"',
      'pr=t.render(r,{sitekey:yi,size:"flexible",appearance:"always",__bcTsWidgetVisible:!0,execution:"execute","before-interactive-callback":()=>{r.style.cssText="position:fixed;left:50%;top:50%;width:min(320px,calc(100vw - 32px));height:auto;opacity:1;pointer-events:auto;transform:translate(-50%,-50%);z-index:2147483647";r.removeAttribute("aria-hidden")}})',
    ].join(";");
    const result = configureInvisibleTurnstileSource(source);

    expect(result.changed).toBe(true);
    expect(result.content).toContain('sitekey:yi,__bcTsInvisibleFirst:!0,execution:"execute"');
    expect(result.content).not.toContain('appearance:"interaction-only"');
    expect(result.content).toContain('e.style.left="-9999px"');
    expect(result.content).toContain('"before-interactive-callback":()=>{}');
    expect(() => assertInvisibleTurnstile(result.content)).not.toThrow();
  });
});
