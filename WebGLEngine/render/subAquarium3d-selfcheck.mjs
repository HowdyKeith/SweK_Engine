// WebGLEngine/render/subAquarium3d-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~4 s with a browser; section 1 alone ~0.1 s)
//
// Run: node render/subAquarium3d-selfcheck.mjs
//
// THE TANK IN THREE DIMENSIONS, HELD TO ITS COORDINATES AND TO A REAL DRAW:
//   1  THE POSE     subPose maps the tank's (x, y, depth, heading, pitch) to the scene's (X = x, Y = -depth, Z = y, rotation Y = heading, Z = pitch): depth goes DOWN, heading 0 is +x, a right turn (the
//                   tank's heading increases) turns the hull's nose from +x toward the scene's -z, which is what the plan view's `g.rotate(-heading)` on a y-down canvas draws;
//   2  THE DRAW     (needs a browser with WebGL; SKIPPED, and said, without one) in headless Chromium: the view renders four subs the page snapshot describes under the physics sea, the frame is lit and not
//                   flat; a sub at 14 m is more saturated than the same sub at 40 m (the tint, seen through the real renderer); the hull's long axis follows the heading (a sub at heading 0 is wider on
//                   screen along x than one at heading pi/2 seen from straight above); a sub that leaves the snapshot leaves the scene; the sea moves between two times;
//   3  THE PAGE     sub-aquarium.html builds the view with createView3d and renders it from the same frame loop that draws the 2D views.
// NOT GRADED, said plainly: that it looks like a tank, any timing, a real GPU, and the pilots (the subs here are rows of numbers).
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as V3 from "./subAquarium3d.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "../tools/ship/playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

console.log("subAquarium3d-selfcheck -- the tank in three dimensions\n");
console.log("1. THE POSE");
{
    const p = V3.subPose({ x: 120, y: 80, depth: 22, heading: 0.7, pitch: -0.1 });
    ok("!! subPose: X = x, Y = -depth (down is negative), Z = y, rotation Y = heading, rotation Z = pitch", p.x === 120 && p.y === -22 && p.z === 80 && p.rotY === 0.7 && p.rotZ === -0.1);
    // a hull's nose is +x in its own frame; rotation about Y by h carries +x to (cos h, 0, -sin h): a right turn (h > 0) swings the nose toward -z
    const nose = (h) => [Math.cos(h), 0, -Math.sin(h)];
    ok("!! heading 0 points the nose along +x; a positive heading (a right turn) swings it toward -z, the way the plan view's rotate(-heading) on a y-down canvas draws it", nose(0)[0] === 1 && nose(0.3)[2] < 0 && nose(0.3)[0] > 0);
    ok("  the on-screen length is larger than life and the water colour and tint density are the ones the bench report prints", V3.HULL_LENGTH === 16 && V3.WATER_COLOUR === 0x0a3b46 && V3.TINT_DENSITY === 0.045 && V3.reportLines()[0].includes("14 m 47%"));
}

console.log("\n2. THE DRAW");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: section 1 is arithmetic; only a draw shows the sea, the hulls and the tint agree");
    } else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript" };
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split("?")[0]);
            if (u === "/__v3.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><meta charset=utf-8><body style='margin:0'><canvas id=c width=320 height=200></canvas></body>"); }
            const fp = path.join(ENG, u);
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + server.address().port;
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await br.newContext()).newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
            await pg.goto(base + "/__v3.html", { waitUntil: "load" });
            const r = await pg.evaluate(async () => {
                const THREE = await import("/vendor/three/three.module.js"), V = await import("/render/subAquarium3d.mjs"), cv = document.getElementById("c");
                const view = V.createView3d(THREE, cv, { length: 500, width: 300, depthMax: 50 }); view.resize(320, 200);
                const gl = view.renderer.getContext(), W = 320, H = 200;
                const grab = () => { const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
                const lit = (px) => { let n = 0; const seen = new Set(); for (let i = 0; i < px.length; i += 4) { if (px[i] + px[i + 1] + px[i + 2] > 15) n++; seen.add((px[i] >> 4) + "," + (px[i + 1] >> 4) + "," + (px[i + 2] >> 4)); } return { n, colours: seen.size }; };
                const sat = (px) => { let m = 0; for (let i = 0; i < px.length; i += 4) m = Math.max(m, Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2])); return m; };
                const four = [0, 1, 2, 3].map((i) => ({ id: "s" + i, hue: 30 + i * 70, x: 100 + i * 90, y: 90 + (i % 2) * 90, depth: 16 + i * 8, heading: i * 0.5, pitch: 0 }));
                view.setView(0.4, 0.7, 600); view.render(four, 0); const a = grab(), A = lit(a), count4 = view.subs.size;
                view.render(four, 6.5); const a2 = grab(); let diff = 0; for (let i = 0; i < a.length; i++) if (a[i] !== a2[i]) diff++;
                // saturation of one sub alone, sea hidden, camera straight above, 14 m vs 40 m down
                view.sea.mesh.visible = false; view.setView(0, 1.5, 420);
                view.render([], 0); const empty = grab();
                // the sub alone: the pixels that differ from the empty tank (floor and edges cancel out)
                const one = (depth, heading) => { view.render([{ id: "x", hue: 0, x: 250, y: 150, depth, heading, pitch: 0 }], 0); const px = grab(), mask = new Uint8Array(W * H); let n = 0, mx = 0, dist = 0, minx = W, maxx = -1, miny = H, maxy = -1;
                    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const o = (j * W + i) * 4; if (Math.abs(px[o] - empty[o]) + Math.abs(px[o + 1] - empty[o + 1]) + Math.abs(px[o + 2] - empty[o + 2]) > 24) { n++; dist += Math.abs(px[o] - 10) + Math.abs(px[o + 1] - 59) + Math.abs(px[o + 2] - 70); minx = Math.min(minx, i); maxx = Math.max(maxx, i); miny = Math.min(miny, j); maxy = Math.max(maxy, j); } }
                    return { n, dist: dist / Math.max(1, n), w: maxx - minx + 1, h: maxy - miny + 1 }; };
                const sh = one(14, 0), dp = one(40, 0), h0 = one(14, 0), h90 = one(14, Math.PI / 2);
                const shallow = Math.round(sh.dist), deep = Math.round(dp.dist);
                view.render(four.slice(0, 2), 0); const count2 = view.subs.size;
                return { A, count4, diff, total: a.length, shallow, deep, h0: [h0.w, h0.h], h90: [h90.w, h90.h], n: [sh.n, dp.n], count2 };
            });
            ok("!! the view draws: " + r.A.n + " of " + 320 * 200 + " pixels lit, " + r.A.colours + " distinct colours, four subs in the scene", r.A.n > 320 * 200 * 0.5 && r.A.colours > 12 && r.count4 === 4);
            ok("!! the sea moves between two times (" + r.diff + " of " + r.total + " channel values differ)", r.diff > r.total * 0.002);
            ok("!! the tint is seen through the real renderer: one sub's mean distance from the water colour (0x0a3b46) is " + r.shallow + " at 14 m and " + r.deep + " at 40 m (deeper is closer to the water; the sub is isolated by differencing against the empty tank, " + r.n.join(" and ") + " pixels)", r.n[0] > 30 && r.n[1] > 30 && r.shallow > r.deep + 30, "");
            ok("!! the hull follows its heading: from straight above a sub at heading 0 is wider along x than along z (" + r.h0.join("x") + " px) and at heading pi/2 the other way round (" + r.h90.join("x") + " px)", r.h0[0] > r.h0[1] * 1.5 && r.h90[1] > r.h90[0] * 1.5);
            ok("  a sub that leaves the snapshot leaves the scene (4 -> " + r.count2 + " after two are dropped)", r.count2 === 2);
            ok("  no page or console error", errs.length === 0, errs.join(" | ").slice(0, 200));
        } finally { await br.close(); server.close(); }
    }
}

console.log("\n3. THE PAGE");
{
    const aq = fs.readFileSync(path.join(ENG, "sub-aquarium.html"), "utf8");
    ok("!! sub-aquarium.html builds the 3D view with createView3d from the same tank and renders it from the frame loop that draws the 2D views; a page without WebGL keeps its 2D views", /import \{ createView3d \} from "\/render\/subAquarium3d\.mjs"/.test(aq) && /createView3d\(THREE, cv, \{ length: LENGTH, width: WIDTH/.test(aq) && /view3d\.render\(snap/.test(aq) && /catch \(e\) \{ view3d = null;/.test(aq));
}

console.log(`\nsubAquarium3d-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
