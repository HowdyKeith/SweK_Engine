#!/usr/bin/env node
// WebGLEngine/ui/upscalerSwitch-selfcheck.mjs -- the render pages' one upscaler switch (ui/upscalerSwitch.mjs): its modes, what makes a
// mode unavailable and the reason it gives (with the localhost link on a LAN address), which choice a page starts in, the Settings Hub's
// default, and every render page that mounts it, loaded in a browser and driven through the button, the console and the URL.
//
// SABOTAGED, each restored byte-identical (/root/swek-sab/safe2.py, against this gate and tools/ship/settingsCensus-selfcheck.mjs): U2 the
//   localhost link dropped, U3 the GPU class ignored, U10 denoise.html's ?ut= ignored, U13 a page's own `needs` ignored -> 1 red each; U4 the
//   stored choice over the URL, U9 fsr-three.html's FSR2 mapped to its FSR1, U11 the Settings Hub entry removed, U12 path-tracer.html without
//   the chain view -> 2 red each; U5 a choice not stored -> 4; U8 the global default's key renamed -> 5; U6 an unavailable mode accepted and
//   U7 the pop-up listing only the available modes -> 6 each; U1 a mode the page lacks taken as available -> 8.
// SECTION 5 (the main engine): E1 resize() ignoring the scale, E2 bilinear at a half, E3 the engine's button top right, E4 the scale never
//   applied -> 2 red each (the wiring row and the engine driven).
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInEngineOrigin } from "../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const U = await imp("ui/upscalerSwitch.mjs"), { describeWebGPU } = await imp("ui/webgpuProbe.mjs");

/** The pages that mount the switch, the modes each declares, and what it starts in on a fresh browser with WebGPU. */
const PAGES = Object.freeze({
    "fsr-three.html": { page: "fsr-three", modes: ["native", "bilinear", "fsr1", "fsr2", "fsr3"], starts: "fsr1" },
    "fsr.html": { page: "fsr", modes: ["bilinear", "fsr1", "fsr2"], starts: "fsr1" },
    "anime4k.html": { page: "anime4k", modes: ["bilinear", "anime4k"], starts: "anime4k" },
    "nebula-live.html": { page: "nebula-live", modes: ["bilinear"], starts: "bilinear" },
    "path-tracer.html": { page: "path-tracer", modes: ["fsr3", "chain", "uth"], starts: "chain" },
    "denoise.html": { page: "denoise", modes: ["chain", "uth"], starts: null },
});

console.log("1. THE MODES, AND WHAT MAKES ONE UNAVAILABLE");
{
    ok("  UPSCALER_MODES: native, bilinear, FSR1, FSR2, FSR3, Anime4K, the learned U, the denoiser chain and U_TH, frozen; the temporal ones need a history, U_TH WebGPU and its GPU class",
        U.MODE_IDS.join() === "native,bilinear,fsr1,fsr2,fsr3,anime4k,learned,chain,uth" && Object.isFrozen(U.UPSCALER_MODES) && U.UPSCALER_MODES.every((m) => Object.isFrozen(m) && m.label && m.desc) &&
        ["fsr2", "fsr3", "chain", "uth"].every((id) => U.UPSCALER_MODES.find((m) => m.id === id).needs.includes("history")) && U.UPSCALER_MODES.find((m) => m.id === "uth").needs.join() === "history,webgpu,gpuClass");
    const pm = { fsr1: {}, uth: {}, chain: { why: "this page runs the chain at 1080p only" } }, lan = { hostname: "192.168.50.57", host: "192.168.50.57:8787", port: "8787", pathname: "/denoise.html", search: "?x=1" };
    const off = U.availability("fsr2", pm, { gpu: true }), why = U.availability("chain", pm, { gpu: true }), here = U.availability("fsr1", pm, { gpu: false, secure: false, location: lan });
    const nogpu = U.availability("uth", pm, { gpu: false, secure: true, location: { hostname: "localhost" } }), onLan = U.availability("uth", pm, { gpu: false, secure: false, location: lan });
    const cls = U.availability("uth", pm, { gpu: true, gpuClassOk: false }), fine = U.availability("uth", pm, { gpu: true, gpuClassOk: true }), unknown = U.availability("dlss", pm, {});
    ok("!! availability: a mode the page does not declare is 'not on this page'; a page may refuse one with its own reason; a mode with no needs runs anywhere",
        !off.ok && off.kind === "page" && off.reason === "not on this page" && !why.ok && why.reason === pm.chain.why && here.ok && !unknown.ok && /no upscaler mode "dlss"/.test(unknown.reason));
    ok("!! *** ...WebGPU missing on a LAN address says so and carries the localhost link -- this page, its port, path and query, ui/webgpuProbe.mjs's own; missing elsewhere says only that ***",
        !onLan.ok && onLan.kind === "webgpu" && onLan.localUrl === "http://localhost:8787/denoise.html?x=1" && onLan.localUrl === describeWebGPU({ navigator: {}, isSecureContext: false, location: lan }).localUrl &&
        /open this page as localhost/.test(onLan.reason) && !nogpu.ok && nogpu.kind === "webgpu" && !("localUrl" in nogpu) && /does not offer/.test(nogpu.reason));
    ok("  ...and U_TH off its GPU class is unavailable with UTH_BY_ADAPTER's reason; on it, available", !cls.ok && cls.kind === "gpuClass" && /UTH_BY_ADAPTER/.test(cls.reason) && fine.ok);
    const own = U.availability("uth", { uth: { needs: ["webgpu"] } }, { gpu: true, gpuClassOk: false });
    ok("  a page's own `needs` replaces the mode's (denoise.html runs U_TH on any WebGPU, as ?ut=1 did)", own.ok);
}

console.log("\n2. WHICH CHOICE A PAGE STARTS IN");
{
    const pm = { bilinear: {}, fsr1: {}, fsr2: {}, uth: {} }, E = { gpu: false, secure: true, location: { hostname: "localhost" } };
    const R = (o) => U.resolveMode(pm, { env: E, ...o });
    ok("!! *** the URL, then this page's stored choice, then the global default, then the page's own default -- each taken only if it can run here ***",
        R({ search: "?upscaler=fsr2", stored: "bilinear", globalDefault: "fsr1", pageDefault: "bilinear" }).id === "fsr2" && R({ search: "?upscaler=fsr2" }).from === "url" &&
        R({ stored: "bilinear", globalDefault: "fsr2", pageDefault: "fsr1" }).id === "bilinear" && R({ stored: "bilinear" }).from === "page" &&
        R({ globalDefault: "fsr2", pageDefault: "fsr1" }).id === "fsr2" && R({ globalDefault: "fsr2" }).from === "default" && R({ pageDefault: "fsr1" }).from === "page-default");
    const skip = R({ search: "?upscaler=uth", stored: "anime4k", pageDefault: "fsr1" });
    ok("  ...an unavailable or undeclared choice is passed over and named (U_TH without WebGPU, Anime4K not on the page); with nothing given, the first mode the page can run",
        skip.id === "fsr1" && skip.refused.map((x) => x.id).join() === "uth,anime4k" && /WebGPU/.test(skip.refused[0].reason) && R({}).id === "bilinear" && R({}).from === "first-available");
}

console.log("\n3. THE SETTINGS HUB's DEFAULT");
{
    const mem = new Map(), was = globalThis.localStorage;
    globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
    const c = U.settingsControl(), before = c.get(); c.set("fsr2"); const after = c.get(); c.set("dlss");
    globalThis.localStorage = was;
    const hub = (await imp("ui/settingsHub.js")).buildSettingsSchema({}), g = hub.find((t) => t.id === "graphics"), hc = g.controls.find((x) => x.id === "upscalerDefault");
    ok("!! the Settings Hub's Graphics tab has 'Upscaler default (render pages)': a select of every mode, read and written at swek.upscaler.default, FSR1 when unset, an unknown mode refused",
        !!hc && hc.type === "select" && hc.options.join() === U.MODE_IDS.join() && before === "fsr1" && after === "fsr2" && mem.get(U.STORE_DEFAULT) === "fsr2" && U.STORE_DEFAULT === "swek.upscaler.default" &&
        U.storePage("denoise") === "swek.upscaler.page.denoise" && typeof hc.get === "function" && typeof hc.set === "function");
}

{
    const fs = await import("node:fs");
    const src = Object.fromEntries(Object.keys(PAGES).map((f) => [f, fs.readFileSync(path.join(ENG, f), "utf8")]));
    ok("  every render page imports mountUpscalerSwitch from ui/upscalerSwitch.mjs and mounts it under its OWN page name (so no two share a stored choice)",
        Object.entries(PAGES).every(([f, P]) => src[f].includes('import { mountUpscalerSwitch } from "/ui/upscalerSwitch.mjs";') && src[f].includes(`mountUpscalerSwitch({ page: "${P.page}"`)) &&
        new Set(Object.values(PAGES).map((P) => P.page)).size === Object.keys(PAGES).length && typeof U.mountUpscalerSwitch === "function");
}

console.log("\n4. EVERY RENDER PAGE, LOADED AND DRIVEN");
{
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 400000, args: { pages: PAGES }, script: `async (a) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), out = {};
        const open = async (url) => { const f = document.createElement("iframe"); f.style.width = "1200px"; f.style.height = "900px"; f.src = url; document.body.appendChild(f);
            await new Promise((r) => f.onload = r); for (let i = 0; i < 100 && !f.contentWindow.swek?.upscaler; i++) await sleep(100); return f; };
        for (const [file, P] of Object.entries(a.pages)) {
            localStorage.clear();
            const f = await open("/" + file), w = f.contentWindow, d = f.contentDocument, api = w.swek && w.swek.upscaler;
            const o = out[file] = { api: !!api, btn: !!d.getElementById("swek-upscaler-button"), errs: [] };
            if (!api) { f.remove(); continue; }
            o.start = api.get(); o.list = api.list().map((m) => [m.id, m.ok, m.reason]); o.label = d.getElementById("swek-upscaler-button").textContent;
            d.getElementById("swek-upscaler-button").click(); const pop = d.getElementById("swek-upscaler-popup");
            o.popOpen = !pop.hidden; o.rows = [...pop.querySelectorAll(".swek-upscaler-mode")].map((e) => [e.dataset.mode, e.dataset.ok]);
            const target = P.modes.find((m) => m !== o.start) || null;
            if (target && file !== "path-tracer.html") { const row = [...pop.querySelectorAll(".swek-upscaler-mode")].find((e) => e.dataset.mode === target); row.click(); await sleep(50);
                o.clicked = api.get(); o.stored = localStorage.getItem("swek.upscaler.page." + P.page); }
            try { api.set("dlss"); o.badSet = "accepted"; } catch (e) { o.badSet = String(e.message); }
            if (file === "fsr-three.html") { api.set("fsr2"); o.select = d.getElementById("mode").value; d.getElementById("mode").value = "bilinear"; d.getElementById("mode").dispatchEvent(new Event("change")); o.follows = api.get(); }
            f.remove();
            if (P.modes.length > 1) { localStorage.clear(); const g = await open("/" + file + "?upscaler=" + P.modes[P.modes.length - 1]); o.fromUrl = g.contentWindow.swek && g.contentWindow.swek.upscaler.get(); g.remove(); }
            if (file === "denoise.html") { localStorage.clear(); const g = await open("/denoise.html?ut=1"); o.ut1 = g.contentWindow.swek.upscaler.get(); o.flag = g.contentWindow.__swekUpscaler; g.remove();
                const h = await open("/denoise.html?ut=0"); o.ut0 = h.contentWindow.swek.upscaler.get(); h.remove(); }
            localStorage.clear(); localStorage.setItem("swek.upscaler.default", P.modes[0]); const k = await open("/" + file); o.fromDefault = k.contentWindow.swek.upscaler.get(); k.remove();
        }
        return out;
    }` });
    if (r.skipped) ok("  the browser ran (no browser here: NOT A PASS)", false, r.reason);
    else if (!r.ok || !r.result) ok("!! the browser loaded the pages", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 300)}`);
    else {
        const R = r.result;
        for (const [file, P] of Object.entries(PAGES)) {
            const o = R[file] || {}, avail = (o.list || []).filter((m) => m[1]).map((m) => m[0]);
            ok(`!! ${file}: the switch is mounted (the button, swek.upscaler); its pop-up lists all ${U.MODE_IDS.length} modes and exactly the page's own (${P.modes.join(", ")}) are available, the rest "not on this page"`,
                o.api && o.btn && o.popOpen && (o.rows || []).length === U.MODE_IDS.length && avail.join() === P.modes.join() &&
                (o.list || []).filter((m) => !m[1]).every((m) => m[2] === "not on this page") && (o.rows || []).every(([id, okv]) => (okv === "1") === P.modes.includes(id)),
                `starts ${o.start}; available ${avail.join(", ")}`);
            const target = P.modes.find((m) => m !== o.start);
            ok(`  ${file}: it starts in ${P.starts || "UTH_BY_ADAPTER's choice"}, the label says so; a click in the pop-up chooses and is stored for the page; an unknown mode is refused; ?upscaler= and the Settings Hub default choose`,
                (P.starts ? o.start === P.starts : P.modes.includes(o.start)) && (o.label || "").includes(U.UPSCALER_MODES.find((m) => m.id === o.start).label) &&
                (file === "path-tracer.html" || !target || (o.clicked === target && o.stored === target)) && /unavailable on|no upscaler mode/.test(o.badSet || "") &&
                (P.modes.length < 2 || o.fromUrl === P.modes[P.modes.length - 1]) && o.fromDefault === P.modes[0], JSON.stringify({ clicked: o.clicked, fromUrl: o.fromUrl, fromDefault: o.fromDefault }));
        }
        const t = R["fsr-three.html"] || {}, dn = R["denoise.html"] || {};
        ok("!! fsr-three.html: the switch drives its own mode <select> (FSR2 -> fsr2), and choosing in the <select> moves the switch (bilinear)", t.select === "fsr2" && t.follows === "bilinear");
        ok("  denoise.html: ?ut=1 and ?ut=0 still choose, as the switch's URL choice, and the chain run reads the switch's mode", dn.ut1 === "uth" && dn.ut0 === "chain" && dn.flag === "uth");
        // the one error excused, by its exact text: this sandbox's headless Chromium refusing three.js's swizzle default (tools/ship/webgpuHarness.mjs's
        // installSwizzleWorkaround header -- the rig's Chrome draws the same pages cleanly); the patch cannot reach a page in a frame before its own scripts
        const SWIZZLE = /^TypeError: Failed to execute 'createView' on 'GPUTexture': Failed to read the 'swizzle' property from 'GPUTextureViewDescriptor'/;
        const errs = (r.pageErrors || []).filter((e) => !SWIZZLE.test(e));
        ok("  no page error on any of them (bar the sandbox's documented three.js swizzle refusal)", !errs.length, JSON.stringify(errs).slice(0, 400));
    }
}

console.log("\n5. THE MAIN ENGINE: A RENDER SCALE");
{
    const fs = await import("node:fs"), main = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    let bad = null; try { U.renderScaleFor("fsr1"); } catch (e) { bad = e.message; }
    ok("  ENGINE_RENDER_SCALE: native 1, bilinear 2/3, frozen; anything else is refused by name", U.renderScaleFor("native") === 1 && U.renderScaleFor("bilinear") === 2 / 3 && Object.isFrozen(U.ENGINE_RENDER_SCALE) && /no "fsr1" mode -- native or bilinear/.test(bad || ""));
    ok("!! main.js mounts the switch as page 'engine' (bottom right, clear of its own chrome) with native and bilinear, FSR1 refused with its reason, and resize() multiplies the device pixel ratio by the scale",
        main.includes('import { mountUpscalerSwitch, renderScaleFor } from "./ui/upscalerSwitch.mjs";') && /mountUpscalerSwitch\(\{ page: "engine", pageDefault: "native", corner: "bottom-right",/.test(main) &&
        /modes: \{ native: \{\}, bilinear: \{\}, fsr1: \{ why: "the main engine has no FSR1 pass yet/.test(main) && /onChange: \(id\) => \{ _renderScale = renderScaleFor\(id\); resize\(\); \}/.test(main) &&
        /const dpr = Math\.min\(window\.devicePixelRatio \|\| 1, 2\) \* _renderScale;/.test(main));
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, script: `async () => {
        const f = document.createElement("iframe"); f.style.width = "1200px"; f.style.height = "800px"; f.src = "/index.html"; document.body.appendChild(f);
        await new Promise((r) => f.onload = r); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 0; i < 300 && !f.contentWindow.swek?.upscaler; i++) await sleep(100);
        const api = f.contentWindow.swek && f.contentWindow.swek.upscaler; if (!api) return { mounted: false };
        const cv = f.contentDocument.getElementById("glCanvas"), before = [cv.width, cv.height, cv.clientWidth, cv.clientHeight];
        api.set("bilinear"); await sleep(200); const after = [cv.width, cv.height, cv.clientWidth, cv.clientHeight]; api.set("native"); await sleep(200);
        return { mounted: true, before, after, back: [cv.width, cv.height], list: api.list().map((m) => [m.id, m.ok]), btn: f.contentDocument.getElementById("swek-upscaler-button").style.bottom };
    }` });
    if (r.skipped) ok("  the engine ran (no browser here: NOT A PASS)", false, r.reason);
    else {
        const R = r.result || {}, avail = (R.list || []).filter((m) => m[1]).map((m) => m[0]);
        ok("!! *** the main engine, loaded (index.html): bilinear renders its canvas at 2/3 -- 1200 x 800 to 800 x 533 at the same CSS size -- and native puts it back; only native and bilinear are available ***",
            r.ok && R.mounted && R.before[0] === 1200 && R.before[1] === 800 && R.after[0] === 800 && R.after[1] === 533 && R.after[2] === R.before[2] && R.after[3] === R.before[3] &&
            R.back[0] === 1200 && R.back[1] === 800 && avail.join() === "native,bilinear" && R.btn === "8px", JSON.stringify({ before: R.before, after: R.after, back: R.back }));
    }
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)`);
process.exit(fails ? 1 : 0);
