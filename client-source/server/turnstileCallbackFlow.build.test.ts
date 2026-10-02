import { describe, expect, it } from "vitest";
import { assertCallbackFlow, repairCallbackFlowSource } from "../scripts/repair-turnstile-callback-flow.mjs";

describe("Turnstile registration callback flow", () => {
  it("moves callback handling to render and executes the configured widget", () => {
    const source = [
      'e.style.position="fixed",e.style.left="-9999px",e.style.top="0",e.style.width="1px",e.style.height="1px",e.style.opacity="0",e.style.pointerEvents="none"',
      "let Rr=null,pr=null,Wa=!1,Or=null;",
      'pr=t.render(r,{sitekey:yi,size:"invisible",appearance:"execute"}),Wa=!0,!0',
      'const t=bs();return!t||pr===null||typeof t.execute!="function"?"":new Promise(r=>{const n=o=>{r(String(o||"").trim())};try{t.execute(pr,{callback:o=>n(o),"error-callback":()=>n(""),"expired-callback":()=>n(""),"timeout-callback":()=>n("")})}catch{n("")}})',
    ].join(";");
    const repaired = repairCallbackFlowSource(source);

    expect(repaired.changed).toBe(true);
    expect(() => assertCallbackFlow(repaired.content)).not.toThrow();
    expect(repaired.content).not.toContain('t.execute(pr,{callback:');
    expect(repaired.content).toContain('before-interactive-callback');
    expect(repaired.content).toContain('appearance:"interaction-only"');
    expect(repaired.content).toContain('size:"flexible"');
    expect(repaired.content).toContain('e.style.height="65px"');
  });

  it("keeps the callback wiring intact when the visible widget transform already ran", () => {
    const visibleSource = [
      'e.style.width="min(320px,calc(100vw - 32px))",e.style.height="65px"',
      'let Rr=null,pr=null,Wa=!1,Or=null,__bcTsWait=null;',
      'pr=t.render(r,{sitekey:yi,size:"flexible",appearance:"always",__bcTsWidgetVisible:!0,execution:"execute",callback:o=>{},"before-interactive-callback":()=>{}})',
      't.execute(pr)',
    ].join(";");
    const result = repairCallbackFlowSource(visibleSource);

    expect(result.changed).toBe(false);
    expect(() => assertCallbackFlow(result.content)).not.toThrow();
  });

  it("keeps native Invisible callback wiring without Managed display options", () => {
    const invisibleSource = [
      'e.style.width="min(320px,calc(100vw - 32px))",e.style.height="65px"',
      'let Rr=null,pr=null,Wa=!1,Or=null,__bcTsWait=null;',
      'pr=t.render(r,{sitekey:yi,__bcTsInvisibleFirst:!0,execution:"execute",callback:o=>{},"error-callback":()=>{}})',
      't.execute(pr)',
    ].join(";");
    const result = repairCallbackFlowSource(invisibleSource);

    expect(result.changed).toBe(false);
    expect(() => assertCallbackFlow(result.content)).not.toThrow();
    expect(result.content).not.toContain('appearance:"interaction-only"');
    expect(result.content).not.toContain('size:"flexible"');
  });
});
