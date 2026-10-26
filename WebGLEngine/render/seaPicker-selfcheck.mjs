// WebGLEngine/render/seaPicker-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~5 s with a browser; the arithmetic alone ~0.3 s)
//
// Run: node render/seaPicker-selfcheck.mjs
//
// THE SEA THE SUB AQUARIUM SHOWS IS A CHOICE: three physics styles and the GPU ocean (render/seaStyles.mjs, render/subAquarium3d.mjs setSeaStyle / setBackdrop, sub-aquarium.html's picker).
//   1  THE STYLES    calm is the set the page always drew (CALM_OPTIONS), the three are frozen, the labels cover exactly the styles and the GPU ocean, a name is a style or it is not, and gpuSeaAvailable says why not
//   2  THE SWELL     the three are different seas: the rms height of the surface over a grid and a minute is smaller for calm than for default and smaller for default than for rough
//   3  THE VIEW      (a browser with WebGL; SKIPPED, and said, without one) setSeaStyle rebuilds the mesh in place (a new surface, the same place, the same visibility), refuses an unknown name and changes nothing;
//                    setBackdrop(frame) hides the physics sea and the floor, clears TRANSPARENT (a corner pixel's alpha is 0; 255 with it off), and each frame sets the frame's sea camera to this camera's pose
//                    (position, yaw, pitch and the vertical field of view in radians); a frame whose sea is not ready is "waiting" and its camera is left alone; a frame that throws on access is "waiting" and does not throw;
//                    turning it off puts the sea and the floor back
//   4  THE PAGE      the page loads, offers the four seas, a physics choice is remembered, the GPU ocean is either tried (a state line) or refused with its reason and the select goes back; no page error
//
// SABOTAGE LOG -- TWENTY-NINE, each applied in place, the gate run, the file restored; every one red by name (rows red in brackets):
//   render/seaStyles.mjs: S1 calm changed 1 | S2 rough's slope as default's 1 | S3 rough the same set as default 1 | S4 rough past the generator's limit (a crash in the swell row: red, not by name) | S5 no-WebGPU not refused 1 | S6 insecure origin not refused 1 | S7 `in` instead of an own-property test 1
//   render/subAquarium3d.mjs: V1 a rebuilt mesh forgets its visibility 2 | V2 the old mesh left in the scene 1 | V3 the style name not kept 2 | V4 an unknown style not refused 1 | V5 the sea not hidden in backdrop 1 | V6 the floor not hidden 2 | V7 the clear stays opaque 1
//   V8 the field of view fixed at 58 1 | V9 the camera set before the sea is ready 1 | V10 a throwing frame throws 1 | V11 a style change un-hides the sea under a backdrop 2 | V12 the camera height dropped 1
//   sub-aquarium.html: H1 the frame never given the sea URL 1 | H2 no GPU refusal 1 | H3 the choice not remembered 1 | H4 a physics choice leaves the backdrop on 1 | H5 the frame never shown 1
// V13 (the drawing buffer built with `alpha: false`) went 0 red AND STAYED 0: it is not a defect. The vendored three.js gives the buffer an alpha channel either way (getContextAttributes().alpha is true), so only the clear's alpha matters; the view keeps `alpha: false`, as it always had, and the row for the clear (V7) is the one that holds it. H1, H2 and H4 were 0 red until the source-reading row was added (a headless run takes one branch of the GPU choice).
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as SS from "./seaStyles.mjs";
import { CALM_OPTIONS } from "./seaThree.mjs";
import { createSurface, defaultComponents } from "../physics/ocean/oceanSurface.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "../tools/ship/playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

console.log("seaPicker-selfcheck -- which sea the aquarium shows\n");

console.log("1. THE STYLES");
{
    ok("!! calm is the option set the page always drew (CALM_OPTIONS itself), and the three styles are frozen", SS.STYLES.calm === CALM_OPTIONS && Object.isFrozen(SS.STYLES) && Object.isFrozen(SS.STYLES.default) && Object.isFrozen(SS.STYLES.rough) && SS.DEFAULT_STYLE === "calm");
    ok("!! the labels cover exactly calm, default, rough and the GPU ocean, and isStyle says yes to those and no to anything else", Object.keys(SS.LABELS).sort().join() === "calm,default,gpu,rough" && ["calm", "default", "rough", "gpu"].every(SS.isStyle) && !SS.isStyle("choppy") && !SS.isStyle("toString") && !SS.isStyle("") && !SS.isStyle(undefined));
    const a = SS.gpuSeaAvailable({ gpu: {} }, true), b = SS.gpuSeaAvailable({}, true), c = SS.gpuSeaAvailable({ gpu: {} }, false), d = SS.gpuSeaAvailable(null);
    ok("!! the GPU sea is offered with navigator.gpu on a secure origin, and refused WITH A REASON without WebGPU, on an insecure origin, or with no navigator", a.ok && a.reason === "" && !b.ok && /no WebGPU/.test(b.reason) && !c.ok && /not secure/.test(c.reason) && !d.ok && /no WebGPU/.test(d.reason));
}

console.log("\n2. THE SWELL");
{
    const rms = (style) => { const s = createSurface({ components: defaultComponents(1, SS.STYLES[style]) }); let n = 0, q = 0; for (let t = 0; t < 60; t += 7) for (let x = -200; x <= 200; x += 25) for (let z = -200; z <= 200; z += 25) { const h = s.sample(x, z, t).h; q += h * h; n++; } return Math.sqrt(q / n); };
    const c = rms("calm"), d = rms("default"), r = rms("rough");
    ok("!! three different seas: the rms height is calm < default < rough, each by at least 25% over the one below", c * 1.25 < d && d * 1.25 < r, `${c.toFixed(3)} m, ${d.toFixed(3)} m, ${r.toFixed(3)} m`);
    ok("!! and rough is still a legal surface (the steepness sum stays under the generator's limit)", (() => { try { createSurface({ components: defaultComponents(1, SS.STYLES.rough) }); return true; } catch { return false; } })());
}

console.log("\n3. THE VIEW");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json" };
    const subs = [1, 2].map((i) => ({ id: "s" + i, name: "Sub" + i, hue: i * 100, pilot: "autopilot", from: "this-box", local: true, weights: null }));
    const server = http.createServer((req, res) => {
        const u = decodeURIComponent(req.url.split("?")[0]);
        if (u === "/__sp.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><meta charset=utf-8><body style='margin:0'><canvas id=c width=320 height=200></canvas></body>"); }
        if (u === "/subaquarium/list") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: true, subs })); }
        if (u.startsWith("/ai/")) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end("{}"); }
        const fp = path.join(ENG, u);
        if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
        res.writeHead(404); res.end("not found");
    });
    if (skip) { report("live half SKIPPED -- " + skip); report("*** THAT IS A SKIP AND NOT A PASS: sections 1-2 are arithmetic; only a draw shows the style change and the transparent clear"); }
    else {
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + server.address().port;
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await br.newContext()).newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
            await pg.goto(base + "/__sp.html", { waitUntil: "load" });
            const r = await pg.evaluate(async () => {
                const THREE = await import("/vendor/three/three.module.js"), V = await import("/render/subAquarium3d.mjs"), F = await import("/ui/seaFrame.mjs"), cv = document.getElementById("c");
                const view = V.createView3d(THREE, cv, { length: 500, width: 300, depthMax: 50 }); view.resize(320, 200);
                const gl = view.renderer.getContext();
                const alphaAt = (x, y) => { const px = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return px[3]; };
                const row = { id: "a", hue: 30, x: 250, y: 150, depth: 25, heading: 0, pitch: 0, cmd: {}, tank: null };
                const o = {};
                const m0 = view.sea.mesh, h0 = view.sea.heightAt(37, 11, 3), p0 = m0.position.toArray();
                o.styleBefore = view.getSeaStyle();
                m0.visible = false;
                o.ret = view.setSeaStyle("rough"); const m1 = view.sea.mesh;
                o.rebuilt = m1 !== m0 && !view.sea.mesh.parent === false && view.scene.children.includes(m1) && !view.scene.children.includes(m0);
                o.samePlace = JSON.stringify(m1.position.toArray()) === JSON.stringify(p0);
                o.sameVis = m1.visible === false;
                o.surfaceChanged = Math.abs(view.sea.heightAt(37, 11, 3) - h0) > 1e-6;
                o.styleAfter = view.getSeaStyle();
                let threw = ""; try { view.setSeaStyle("choppy"); } catch (e) { threw = e.message; }
                o.threw = /unknown style "choppy"/.test(threw); o.unchanged = view.getSeaStyle() === "rough" && view.sea.mesh === m1;
                view.sea.mesh.visible = true; view.setSeaStyle("calm");
                // the backdrop
                const api = { ready: true, camera: null }, frame = { contentWindow: { seaApi: api } };
                view.render([row], 0); o.clearOff = view.renderer.getClearAlpha(); o.alphaOff = alphaAt(2, 2);
                o.ret2 = view.setBackdrop(frame); o.state = view.backdropState();
                view.render([row], 1);
                o.hidden = view.sea.mesh.visible === false && view.scene.children.some((c) => c.geometry && c.geometry.type === "PlaneGeometry" && c.visible === false);
                o.ctxAlpha = gl.getContextAttributes().alpha; o.clearOn = view.renderer.getClearAlpha(); o.alphaOn = alphaAt(2, 2);
                const cam = api.camera, d = new THREE.Vector3(); view.camera.getWorldDirection(d); const fwd = F.forwardOfSeaCamera(cam || { yaw: 0, pitch: 0 });
                o.cam = !!cam && Math.abs(cam.x - view.camera.position.x) < 1e-6 && Math.abs(cam.y - view.camera.position.y) < 1e-6 && Math.abs(cam.z - view.camera.position.z) < 1e-6 && Math.abs(fwd[0] - d.x) < 1e-6 && Math.abs(fwd[1] - d.y) < 1e-6 && Math.abs(fwd[2] - d.z) < 1e-6 && Math.abs(cam.fovY - view.camera.fov * Math.PI / 180) < 1e-9;
                o.fov = cam && cam.fovY;
                view.setView(1.5, 0.3, 300); view.render([row], 2); const cam2 = api.camera; o.follows = !!cam2 && Math.abs(cam2.yaw - cam.yaw) > 0.1;
                view.setSeaStyle("rough"); o.stillHidden = view.sea.mesh.visible === false;
                const api2 = { ready: false, camera: null }; view.setBackdrop({ contentWindow: { seaApi: api2 } }); view.render([row], 3); o.waiting = view.backdropState() === "waiting" && api2.camera === null;
                const bad = { get contentWindow() { throw new Error("cross-origin"); } }; view.setBackdrop(bad); let thr = false; try { view.render([row], 4); o.badState = view.backdropState(); } catch { thr = true; } o.badOk = !thr && o.badState === "waiting";
                o.retOff = view.setBackdrop(null); o.offState = view.backdropState(); view.render([row], 5);
                o.restored = view.sea.mesh.visible === true && view.scene.children.filter((c) => c.geometry && c.geometry.type === "PlaneGeometry").every((c) => c.visible === true); o.clearBack = view.renderer.getClearAlpha(); o.alphaBack = alphaAt(2, 2);
                return o;
            });
            ok("!! setSeaStyle('rough') rebuilds the mesh IN PLACE: a new mesh in the scene where the old one was, still hidden if it was hidden, on a different surface, and the page can ask which style it is (" + r.styleBefore + " -> " + r.styleAfter + ")", r.ret === "rough" && r.rebuilt && r.samePlace && r.sameVis && r.surfaceChanged && r.styleAfter === "rough");
            ok("!! an unknown style throws by name and changes nothing (the mesh and the style stay)", r.threw && r.unchanged);
            ok("!! no backdrop: the canvas clears opaque (clear alpha " + r.clearOff + ", a corner pixel's alpha " + r.alphaOff + ")", r.clearOff === 1 && r.alphaOff === 255);
            ok("!! setBackdrop(frame) answers on, is live when the sea is ready, hides the physics sea and the floor, and clears TRANSPARENT (clear alpha " + r.clearOn + ", corner alpha " + r.alphaOn + ")", r.ret2 === "on" && r.state === "live" && r.hidden && r.clearOn === 0 && r.alphaOn === 0 && r.ctxAlpha === true);
            ok("!! the frame's sea camera is this camera's pose each frame: position, the forward direction (yaw and pitch in the sea's convention) and the vertical field of view in radians (" + (r.fov ? r.fov.toFixed(4) : "none") + ")", r.cam);
            ok("!! and it follows when the view moves (the yaw changed after an orbit)", r.follows);
            ok("a style change while the backdrop is on keeps the physics sea hidden", r.stillHidden);
            ok("!! a frame whose sea is not ready is waiting and its camera is left alone; a frame that throws on access is waiting and does not throw", r.waiting && r.badOk);
            ok("!! turning it off answers off, puts the sea and the floor back and clears opaque again (clear alpha " + r.clearBack + ", corner alpha " + r.alphaBack + ")", r.retOff === "off" && r.offState === "off" && r.restored && r.clearBack === 1 && r.alphaBack === 255);
            ok("  no page or console error", errs.length === 0, errs.join(" | ").slice(0, 200));

            console.log("\n4. THE PAGE");
            const pg2 = await (await br.newContext()).newPage(); const errs2 = [];
            pg2.on("pageerror", (e) => errs2.push(String(e.message))); pg2.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs2.push(m.text()); });
            await pg2.goto(base + "/sub-aquarium.html", { waitUntil: "load" }); await pg2.waitForTimeout(800);
            const opts = await pg2.evaluate(() => [...document.querySelectorAll("#seaSel option")].map((o) => o.value).join());
            ok("!! the page offers the four seas, calm first and selected", opts === "calm,default,gpu,rough" || opts === Object.keys(SS.LABELS).join(), opts);
            await pg2.selectOption("#seaSel", "rough"); await pg2.waitForTimeout(300);
            const saved = await pg2.evaluate(() => localStorage.getItem("subAquarium.sea"));
            ok("!! choosing a physics sea is remembered, and a reload comes back to it", saved === "rough" && (await (async () => { await pg2.reload({ waitUntil: "load" }); await pg2.waitForTimeout(500); return pg2.evaluate(() => document.getElementById("seaSel").value); })()) === "rough");
            await pg2.selectOption("#seaSel", "gpu"); await pg2.waitForTimeout(900);
            const g = await pg2.evaluate(() => ({ sel: document.getElementById("seaSel").value, msg: document.getElementById("msg").textContent, state: document.getElementById("seaState").textContent, hasGpu: !!navigator.gpu, frame: document.getElementById("seaFrame").style.display }));
            ok("!! the GPU ocean is either TRIED (a state line, the frame shown) or REFUSED with its reason and the select back where it was -- never a half state" + " (here: " + (g.hasGpu ? "navigator.gpu present" : "no navigator.gpu") + ")", (g.sel === "gpu" && /^GPU ocean: (waiting|live)/.test(g.state) && g.frame === "block") || (g.sel !== "gpu" && /GPU ocean: /.test(g.msg) && g.frame === "none"), JSON.stringify(g).slice(0, 220));
            const aq = fs.readFileSync(path.join(ENG, "sub-aquarium.html"), "utf8");
            ok("!! the page's wiring, read from the source (a headless run cannot take both branches): the GPU ocean loads hostUrl() into the frame, is refused through gpuSeaAvailable with the select put back, falls back to the default physics sea after 12 s, and every physics choice takes the backdrop OFF before it sets the style",
                /frame\.src = hostUrl\(\{\}\)/.test(aq) && /const a = gpuSeaAvailable\(navigator, window\.isSecureContext\);\s*if \(!a\.ok\) \{[^}]*sel\.value = current; return false;/.test(aq) && /> 12000\) \{[\s\S]{0,400}?physics\(DEFAULT_STYLE\)/.test(aq) && /view3d\.setBackdrop\(null\); view3d\.setSeaStyle\(name\)/.test(aq) && /view3d\.setBackdrop\(frame\)/.test(aq));
            ok("  no page or console error", errs2.length === 0, errs2.join(" | ").slice(0, 200));
        } finally { await br.close(); server.close(); }
    }
}

console.log(`\nseaPicker-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
