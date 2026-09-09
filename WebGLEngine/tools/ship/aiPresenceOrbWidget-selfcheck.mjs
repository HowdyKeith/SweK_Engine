#!/usr/bin/env node
// WebGLEngine/tools/ship/aiPresenceOrbWidget-selfcheck.mjs
//
// Run: node tools/ship/aiPresenceOrbWidget-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES ui/aiPresenceOrbWidget.js -- the mounting/integration layer over the already-gated shader+state math
// (tools/ship/aiPresenceOrb-selfcheck.mjs owns that). This file is deliberately about the MOUNT: does it
// appear once, at the right place, respond to real events, respect document.hidden and reduced-motion, clean
// up on remove(), and is main.js's own wiring to it still intact -- not a re-grading of the orb's own pixels.
//
// A full main.js boot (onboarding modals, "Full engine" picker, world generation) was used by hand to confirm
// the widget mounts correctly in the real running game -- screenshotted, not just reasoned about -- but is too
// slow (tens of seconds) to carry as a routine gate. This file tests ui/aiPresenceOrbWidget.js directly on a
// minimal page instead, the same "test the module, not the whole app" scope tools/ship/aiPresenceOrb-
// selfcheck.mjs itself uses for the shader.
"use strict";
import { SECURE_HOST } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (s) => console.log("  ----  " + s);
const sec = (s) => console.log("\n" + s);

async function runInEngineOrigin({ engineRoot, script, args = null, reducedMotion = null }) {
    if (!fs.existsSync(HEADLESS_SHELL)) return { ok: false, skipped: true, reason: "no headless shell", result: null, pageErrors: [] };
    const pw = resolvePlaywright();
    if (!pw) return { ok: false, skipped: true, reason: "playwright not resolvable", result: null, pageErrors: [] };
    const root = path.resolve(engineRoot);
    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html" };
    const srv = http.createServer((q, s) => {
        let u = decodeURIComponent(String(q.url).split("?")[0]);
        if (u === "/") { s.writeHead(200, { "Content-Type": "text/html" }); return s.end("<!doctype html><title>engine-origin</title>"); }
        const f = path.join(root, u);
        if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end("no"); }
        s.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
        s.end(fs.readFileSync(f));
    });
    await new Promise((r) => srv.listen(0, SECURE_HOST, r));
    let browser = null;
    try {
        browser = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader", "--enable-unsafe-webgpu"] });
        const page = await browser.newPage();
        if (reducedMotion) await page.emulateMedia({ reducedMotion });
        const pageErrors = [];
        page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));
        page.on("console", (m) => { if (m.type() === "error") pageErrors.push("console: " + m.text().slice(0, 300)); });
        await page.goto(`http://${SECURE_HOST}:${srv.address().port}/`);
        const out = await page.evaluate(async ({ src, a }) => {
            try { const fn = new Function("return (" + src + ")")(); return { ok: true, result: await fn(a) }; }
            catch (e) { return { ok: false, reason: String(e && e.stack || e).slice(0, 600) }; }
        }, { src: String(script), a: args });
        return { skipped: false, ok: out.ok, result: out.ok ? out.result : null, reason: out.ok ? null : out.reason, pageErrors };
    } catch (e) {
        return { ok: false, skipped: false, reason: "harness error: " + String(e).slice(0, 300), result: null, pageErrors: [] };
    } finally { try { await browser?.close(); } catch {} srv.close(); }
}

// Mounts on a bare page (no main.js, no onboarding), pokes at the returned handle, and reports what a real
// browser actually did -- element presence/position, idempotency, event wiring, hidden/reduced-motion pausing,
// and clean removal.
const SCRIPT = `async ({ forceWebGL }) => {
    const { mountAiPresenceOrbWidget } = await import("/ui/aiPresenceOrbWidget.js");
    const h1 = await mountAiPresenceOrbWidget({ forceWebGL });
    if (!h1) return { mounted: false };
    const h2 = await mountAiPresenceOrbWidget({ forceWebGL });   // idempotency: must be the SAME handle, not a second canvas

    const canvas = document.getElementById("ai-presence-orb-widget");
    const countCanvases = document.querySelectorAll("#ai-presence-orb-widget").length;
    const rect = canvas.getBoundingClientRect();

    // real event wiring: idle -> listening -> thinking -> responding, via the SAME window events
    // ai-presence-orb.html and ui/wakeWord.js/ui/sttLayer.js use, not h1.setState() directly.
    const before = h1.getState();
    window.dispatchEvent(new CustomEvent("engine:wakeState", { detail: { state: "capturing" } }));
    await new Promise((r) => setTimeout(r, 30));
    const afterListening = h1.getState();
    window.dispatchEvent(new CustomEvent("engine:voiceTranscript", {}));
    await new Promise((r) => setTimeout(r, 30));
    const afterThinking = h1.getState();
    window.dispatchEvent(new CustomEvent("engine:voiceReply", {}));
    await new Promise((r) => setTimeout(r, 30));
    const afterResponding = h1.getState();

    // document.hidden: state.tick() must not advance phase while hidden (checked via the orb's own phase field)
    h1.setState("thinking");
    await new Promise((r) => requestAnimationFrame(r));
    const phaseBeforeHide = h1.state.getParams().phase;
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((r) => setTimeout(r, 150));
    const phaseWhileHidden = h1.state.getParams().phase;
    Object.defineProperty(document, "hidden", { value: false, configurable: true });

    const consoleHandleIsSame = window.aiPresenceOrb === h1;
    h1.remove();
    const canvasAfterRemove = document.getElementById("ai-presence-orb-widget");
    const consoleHandleAfterRemove = window.aiPresenceOrb;

    return {
        mounted: true, sameHandle: h1 === h2, countCanvases,
        rectLeft: rect.left, rectBottom: window.innerHeight - rect.bottom,
        before, afterListening, afterThinking, afterResponding,
        phaseBeforeHide, phaseWhileHidden,
        consoleHandleIsSame, canvasGoneAfterRemove: !canvasAfterRemove, consoleHandleAfterRemove,
    };
}`;

async function main() {
    const skip = !fs.existsSync(HEADLESS_SHELL) ? "no headless shell" : (!resolvePlaywright() ? "playwright not resolvable" : null);
    if (skip) { ok("browser jobs ran", false, "SKIP: " + skip + " -- a SKIP counts as a fail here"); console.log(fails ? "\naiPresenceOrbWidget-selfcheck: " + fails + " FAILED" : "\nall checks pass"); process.exit(fails ? 1 : 0); }

    sec("1. *** MOUNTS ONCE ON A REAL PAGE, IS IDEMPOTENT, AND SITS WHERE IT SHOULD RELATIVE TO THE ICON RAIL ***");
    const r1 = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT, args: { forceWebGL: true } });
    if (!r1.ok || !r1.result || !r1.result.mounted) {
        ok("!! the widget mounted at all", false, r1.ok ? JSON.stringify(r1.result) : "harness: " + r1.reason);
        report("cannot continue without a mounted widget");
    } else {
        const R = r1.result;
        if (r1.pageErrors && r1.pageErrors.length) report("page errors: " + r1.pageErrors.slice(0, 5).join(" | "));
        ok("!! a second mount call returns the SAME handle, not a second widget", R.sameHandle && R.countCanvases === 1,
           `sameHandle=${R.sameHandle} canvases=${R.countCanvases}`);
        ok("!! positioned at ui/miniIconStack.js's own left rail offset (44px), clear above the rail's own icons",
           Math.abs(R.rectLeft - 44) < 1 && R.rectBottom > 60, `left=${R.rectLeft} bottom-offset=${R.rectBottom}`);

        sec("2. *** REAL EVENT WIRING: THE SAME window EVENTS ui/wakeWord.js AND ui/sttLayer.js ALREADY DISPATCH DRIVE THE STATE ***");
        ok("starts idle", R.before === "idle", `before=${R.before}`);
        ok("!! engine:wakeState{capturing} -> listening", R.afterListening === "listening", `afterListening=${R.afterListening}`);
        ok("!! engine:voiceTranscript -> thinking", R.afterThinking === "thinking", `afterThinking=${R.afterThinking}`);
        ok("!! engine:voiceReply -> responding", R.afterResponding === "responding", `afterResponding=${R.afterResponding}`);

        sec("3. *** document.hidden: A HIDDEN TAB DOES ZERO WORK, THE SAME LAW ui/stateOrb.js's OWN HEADER STATES ***");
        ok("!! phase does not advance while document.hidden is true (150ms of real elapsed time, no tick)",
           R.phaseWhileHidden === R.phaseBeforeHide, `before=${R.phaseBeforeHide} whileHidden=${R.phaseWhileHidden}`);

        sec("4. *** remove() CLEANS UP: CANVAS GONE, CONSOLE HANDLE CLEARED ***");
        ok("window.aiPresenceOrb pointed at the mounted handle while it lived", R.consoleHandleIsSame);
        ok("!! the canvas element is removed from the DOM", R.canvasGoneAfterRemove);
        ok("!! window.aiPresenceOrb is cleared (not left pointing at a removed handle)", R.consoleHandleAfterRemove == null, `after remove: ${R.consoleHandleAfterRemove === null ? "null" : typeof R.consoleHandleAfterRemove}`);
    }

    sec("5. *** REDUCED MOTION: THE CURRENT STATE STILL READS (A FROZEN FRAME, NOT A BLANK ONE) ***");
    {
        const REDUCED_SCRIPT = `async ({ forceWebGL }) => {
            const { mountAiPresenceOrbWidget } = await import("/ui/aiPresenceOrbWidget.js");
            const h = await mountAiPresenceOrbWidget({ forceWebGL });
            if (!h) return { mounted: false };
            h.setState("error");
            await new Promise((r) => setTimeout(r, 200));
            const p1 = h.state.getParams().glow;
            await new Promise((r) => setTimeout(r, 200));
            const p2 = h.state.getParams().glow;
            const canvas = document.getElementById("ai-presence-orb-widget");
            const gl = canvas.getContext("webgl2");
            const buf = new Uint8Array(4);
            gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            h.remove();
            return { mounted: true, glowStable: Math.abs(p1 - p2) < 1e-6, centrePixel: [buf[0], buf[1], buf[2], buf[3]] };
        }`;
        const r5 = await runInEngineOrigin({ engineRoot: ENG, script: REDUCED_SCRIPT, args: { forceWebGL: true }, reducedMotion: "reduce" });
        if (!r5.ok || !r5.result || !r5.result.mounted) {
            ok("!! reduced-motion harness ran", false, r5.ok ? JSON.stringify(r5.result) : "harness: " + r5.reason);
        } else {
            ok("!! under prefers-reduced-motion, glow (the state's own params) is stable rather than drifting from entry-envelope decay",
               r5.result.glowStable, `glow readings: stable=${r5.result.glowStable}`);
            ok("!! and a real pixel is still drawn (a frozen frame, not a blank transparent one)",
               r5.result.centrePixel[3] > 200, `centre rgba=${JSON.stringify(r5.result.centrePixel)}`);
        }
    }

    sec("6. *** WIRED INTO THE REAL ENGINE: main.js ACTUALLY CALLS mountAiPresenceOrbWidget ***");
    {
        const mainSrc = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
        ok("main.js imports mountAiPresenceOrbWidget from ui/aiPresenceOrbWidget.js",
           /import\(\s*"\.\/ui\/aiPresenceOrbWidget\.js"\s*\)/.test(mainSrc));
        ok("!! and actually calls it (not merely imported and unused)", /await mountAiPresenceOrbWidget\(\)/.test(mainSrc));
        const widgetSrc = fs.readFileSync(path.join(ENG, "ui", "aiPresenceOrbWidget.js"), "utf8");
        ok("the widget listens for the same 3 real events the standalone demo page does",
           /engine:wakeState/.test(widgetSrc) && /engine:voiceTranscript/.test(widgetSrc) && /engine:voiceReply/.test(widgetSrc));
    }

    console.log(fails ? "\naiPresenceOrbWidget-selfcheck: " + fails + " FAILED" : "\naiPresenceOrbWidget-selfcheck: all checks pass");
    process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error("aiPresenceOrbWidget-selfcheck: threw " + (e && e.stack || e)); process.exit(1); });
