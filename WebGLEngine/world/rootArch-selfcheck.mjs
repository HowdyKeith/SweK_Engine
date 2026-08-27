// WebGLEngine/world/rootArch-selfcheck.mjs — v4077
//
// Run: node world/rootArch-selfcheck.mjs   (~1-2s pure; live sections need a browser, skip with a reason otherwise)
//
// Keith: could Sylva's (github.com/MengTo/sylva -- all-rights-reserved, so nothing of its CODE is used, only the
// idea) procedural root/arch geometry fold into the engine too -- the follow-on v4076's moss round named rather
// than built. This is the gate for world/rootArch.js (the pure geometry), world/rootArchPlace.js (voxel
// placement), render/rootArchLandmark.js (the voxel GL draw), and es-box3d-fly3d.html's planet consumer.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const RA = await import(pathToFileURL(path.join(HERE, "rootArch.js")).href);
const RP = await import(pathToFileURL(path.join(HERE, "rootArchPlace.js")).href);

console.log("rootArch-selfcheck -- one landmark, closed at every branch, and placed only on real ground\n");

// The same directed-edge manifold check the investigation that fixed this file's winding actually used: volume
// SIGN ALONE is not sufficient evidence of a correctly wound closed mesh (a broken mesh reported a positive
// number by coincidence during that investigation), so this is graded here rather than trusted from memory.
function edgeManifold(indices) {
    const seen = new Map();
    for (let k = 0; k < indices.length; k += 3) {
        const tri = [indices[k], indices[k + 1], indices[k + 2]];
        for (let e = 0; e < 3; e++) {
            const key = tri[e] + "_" + tri[(e + 1) % 3];
            seen.set(key, (seen.get(key) || 0) + 1);
        }
    }
    let dup = 0, missing = 0;
    for (const [key, count] of seen) {
        if (count > 1) dup += count - 1;
        const [a, b] = key.split("_");
        if (!seen.has(b + "_" + a)) missing++;
    }
    return { dup, missing };
}

console.log("0. *** SEEDED: THE SAME SEED IS THE SAME STRUCTURE, AND A DIFFERENT ONE IS NOT ***");
{
    const a = RA.rootArch(11);
    const b = RA.rootArch(11);
    const c = RA.rootArch(12);
    ok("!! *** the same seed rebuilds a BYTE-IDENTICAL mesh (positions, normals, indices) ***",
        a.vertexCount > 0 &&
        JSON.stringify(Array.from(a.positions)) === JSON.stringify(Array.from(b.positions)) &&
        JSON.stringify(Array.from(a.indices)) === JSON.stringify(Array.from(b.indices)),
        a.vertexCount + " verts, " + a.triangleCount + " tris, identical across two calls with seed 11");
    ok("!! ...and branchCount/branches metadata are identical too",
        a.branchCount === b.branchCount && JSON.stringify(a.branches) === JSON.stringify(b.branches));
    ok("!! ...and a different seed really is a different structure",
        a.branchCount !== c.branchCount || a.vertexCount !== c.vertexCount ||
        JSON.stringify(Array.from(a.positions)) !== JSON.stringify(Array.from(c.positions)));
}

console.log("\n0b. *** sweptTube() IN ISOLATION -- THE PRIMITIVE rootArch() BUILDS EVERY BRANCH FROM ***");
{
    const p0 = [0, 0, 0], p1 = [2, 3, 0], p2 = [4, 0, 0];
    const tube = RA.sweptTube(p0, p1, p2, { r0: 0.5, r1: 0.2, sides: 8, samples: 12 });
    ok("!! *** its endpoints ARE the given control points, not an approximation ***",
        JSON.stringify(tube.startPoint) === JSON.stringify(p0) && JSON.stringify(tube.endPoint) === JSON.stringify(p2));
    ok("!! ...it is itself a closed, positively-wound solid (meshVolume() > 0)",
        RA.meshVolume(tube.positions, tube.indices) > 0, "volume " + RA.meshVolume(tube.positions, tube.indices).toFixed(4));
    const { dup, missing } = edgeManifold(tube.indices);
    ok("!! ...and edge-manifold clean on its own, before rootArch() ever merges branches together",
        dup === 0 && missing === 0);
    // start ring vertices (indices 0..sides-1) sit at radius r0 from p0; end ring vertices (the ring just before
    // the two cap centres) sit at radius r1 from p2 -- proving the taper is real, not merely that SOME radius
    // shrinks somewhere in the buffer.
    const distFrom = (cx, i) => {
        const px = tube.positions[i * 3] - cx[0], py = tube.positions[i * 3 + 1] - cx[1], pz = tube.positions[i * 3 + 2] - cx[2];
        return Math.hypot(px, py, pz);
    };
    const startR = distFrom(p0, 0);
    const lastRingStart = tube.vertexCount - 2 - 8;   // 2 cap centres appended last, 8 = sides
    const endR = distFrom(p2, lastRingStart);
    // tolerance is Float32Array precision (positions are stored as float32), not a fudge for the arithmetic
    ok("!! ...the start ring really is at r0=0.5 and the end ring really is at r1=0.2, not swapped or constant",
        Math.abs(startR - 0.5) < 1e-6 && Math.abs(endR - 0.2) < 1e-6,
        "start " + startR.toFixed(4) + ", end " + endR.toFixed(4));
}

console.log("\n1. *** EVERY BRANCH IS ITS OWN CLOSED, POSITIVELY-WOUND, TOPOLOGICALLY CONSISTENT SOLID ***");
{
    let totalBranches = 0, badVolume = 0, badManifold = 0;
    const SEEDS = 40;
    for (let seed = 1; seed <= SEEDS; seed++) {
        const mesh = RA.rootArch(seed);
        for (const br of mesh.branches) {
            totalBranches++;
            const localIdx = RA.branchIndices(mesh, br.span);
            const localPos = mesh.positions.slice(br.span.vertexStart * 3, (br.span.vertexStart + br.span.vertexCount) * 3);
            const vol = RA.meshVolume(localPos, localIdx);
            if (!(vol > 0)) badVolume++;
            const { dup, missing } = edgeManifold(localIdx);
            if (dup !== 0 || missing !== 0) badManifold++;
        }
    }
    ok("!! *** every branch across " + SEEDS + " seeds (" + totalBranches + " branches) has meshVolume() > 0 ***",
        badVolume === 0, badVolume + " bad volumes");
    ok("!! ...AND every branch is edge-manifold clean (no duplicate directed edge, every edge has its reverse)",
        badManifold === 0, badManifold + " bad edge-manifolds -- volume sign alone would have missed this class of defect");
    ok("...and every index in the merged mesh is in range for the merged vertex buffer",
        (() => {
            const mesh = RA.rootArch(3);
            for (let k = 0; k < mesh.indices.length; k++) if (mesh.indices[k] >= mesh.vertexCount) return false;
            return true;
        })());
}

console.log("\n2. *** RADIUS SHRINKS WITH DEPTH -- MEASURED FROM THE `branches` METADATA, NOT ASSERTED FROM THE CODE ***");
{
    const mesh = RA.rootArch(3);
    const byDepth = new Map();
    for (const br of mesh.branches) { if (!byDepth.has(br.depth)) byDepth.set(br.depth, []); byDepth.get(br.depth).push(br.r0); }
    ok("!! *** depth 0 (the main arch) is the widest branch in the whole structure ***",
        Math.max(...(byDepth.get(0) || [-1])) === Math.max(...mesh.branches.map((b) => b.r0)));
    const depths = [...byDepth.keys()].sort((a, b) => a - b);
    let monotone = true;
    for (let i = 1; i < depths.length; i++) {
        const prevAvg = byDepth.get(depths[i - 1]).reduce((s, r) => s + r, 0) / byDepth.get(depths[i - 1]).length;
        const curAvg = byDepth.get(depths[i]).reduce((s, r) => s + r, 0) / byDepth.get(depths[i]).length;
        if (!(curAvg < prevAvg)) monotone = false;
    }
    ok("!! ...and each successive depth's AVERAGE r0 is strictly smaller than the depth before it",
        monotone, "depths present: " + depths.join(","));
    ok("...at the SCALE_PER_LEVEL=0.55 this file's own comment names (depth1/depth0 ratio, within 1%)",
        (() => {
            const d0 = byDepth.get(0)[0], d1s = byDepth.get(1);
            if (!d1s || !d1s.length) return false;
            const ratio = (d1s.reduce((s, r) => s + r, 0) / d1s.length) / d0;
            return Math.abs(ratio - 0.55) < 0.01;
        })());
}

console.log("\n3. *** THE THIN-BRANCH REFUSAL IS REAL, NOT DEAD CODE: SABOTAGE VIA A DELIBERATELY TINY BASE RADIUS ***");
{
    // baseRadius 0.02 -> depth-1 r0 = 0.011 (still built), depth-2 r0 = 0.011*0.55 = 0.00605 < 0.01 -- the file's
    // own `if (rr0 < 0.01) continue` should refuse every depth-2 branch here, without refusing depth-1.
    const mesh = RA.rootArch(5, { baseRadius: 0.02, maxDepth: 2 });
    const depths = new Set(mesh.branches.map((b) => b.depth));
    ok("!! *** depth-1 branches still built (0.011 clears the 0.01 floor) ***", depths.has(1));
    ok("!! ...but depth-2 branches were refused for being too thin to see (0.00605 < 0.01)", !depths.has(2),
        "depths actually present: " + [...depths].join(","));
    const normalMesh = RA.rootArch(5, { maxDepth: 2 });
    const normalDepths = new Set(normalMesh.branches.map((b) => b.depth));
    ok("...and the SAME seed with a normal baseRadius DOES reach depth 2, proving the refusal is radius-driven",
        normalDepths.has(2));
}

console.log("\n4. *** world/rootArchPlace.js: A DETERMINISTIC SITE SEARCH THAT REFUSES ON BAD GROUND ***");
{
    const flatWorld = { biomeSeed: 1337, voxelAt: (x, y, z) => (y <= 5 ? 2 : 0) };
    const s1 = RP.findRootArchSite(flatWorld, { seed: 4242 });
    const s2 = RP.findRootArchSite(flatWorld, { seed: 4242 });
    ok("!! *** the same seed and world find the SAME site twice ***",
        s1 && s2 && JSON.stringify(s1) === JSON.stringify(s2), JSON.stringify(s1));

    const emptyWorld = { biomeSeed: 1337, voxelAt: () => 0 };
    ok("!! ...and refuses (returns null) when no column has streamed real ground at all",
        RP.findRootArchSite(emptyWorld, { seed: 4242, tries: 20 }) === null);

    // a known real desert column (world/worleyBiomes.js's own biomeAt, seed 1337) sits at the search origin --
    // the site returned must not be it.
    const desertOriginWorld = { biomeSeed: 1337, voxelAt: (x, y, z) => (y <= 5 ? 2 : 0) };
    const s3 = RP.findRootArchSite(desertOriginWorld, { seed: 4242, originX: 0, originZ: 126 });
    ok("!! ...and steps off a desert origin rather than placing on it (0,126 is real desert at seed 1337)",
        s3 && (s3.x !== 0 || s3.z !== 126));

    const steepWorld = { biomeSeed: 1337, voxelAt: (x, y, z) => (Math.abs(x) < 20 ? (y <= 5 + x) : (y <= 5)) };
    const s4 = RP.findRootArchSite(steepWorld, { seed: 4242, maxSlope: 0.5 });
    ok("...and steps off a steep origin (a cliff too steep for two feet) onto gentler ground further out",
        s4 && Math.abs(s4.x) >= 3, JSON.stringify(s4));
}

console.log("\n5. *** WIRING: render/rootArchLandmark.js, main.js, es-box3d-fly3d.html ***");
{
    const landmarkSrc = fs.readFileSync(path.join(ROOT, "render", "rootArchLandmark.js"), "utf8");
    ok("!! render/rootArchLandmark.js imports rootArch() and findRootArchSite() rather than re-deriving either",
        /import\s*\{\s*rootArch\s*\}\s*from\s*"\.\.\/world\/rootArch\.js"/.test(landmarkSrc) &&
        /import\s*\{\s*findRootArchSite\s*\}\s*from\s*"\.\.\/world\/rootArchPlace\.js"/.test(landmarkSrc));
    ok("...exports a class with place()/render()/getState(), the same shape MossPatches uses",
        /class RootArchLandmark/.test(landmarkSrc) && /place\s*\(/.test(landmarkSrc) &&
        /render\s*\(camera/.test(landmarkSrc) && /getState\s*\(/.test(landmarkSrc));
    ok("...and place() is idempotent -- returns the existing placement rather than rebuilding it",
        /if\s*\(this\._placement\)\s*return this\._placement/.test(landmarkSrc));

    const mainSrc = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
    ok("!! main.js imports RootArchLandmark and instantiates it",
        /import\s*\{\s*RootArchLandmark\s*\}\s*from\s*"\.\/render\/rootArchLandmark\.js"/.test(mainSrc) &&
        /new RootArchLandmark\(/.test(mainSrc));
    ok("...exposes window.rootArch with on/off/state, the same control shape window.moss uses",
        /window\.rootArch\s*=\s*\{/.test(mainSrc) && /rootArchLandmark\.render\(camera/.test(mainSrc));
    ok("...and reads gfxSettings' own 'rootarch' toggle every frame, the same source-of-truth pattern moss uses",
        /rootArchLandmark\.enabled\s*=\s*gfxSettings\.get\("rootarch"\)/.test(mainSrc));

    const gfxSrc = fs.readFileSync(path.join(ROOT, "ui", "graphicsSettings.js"), "utf8");
    ok("!! ui/graphicsSettings.js's DEFAULTS carries a 'rootarch' key, and all three presets set it",
        /rootarch:\s*true/.test(gfxSrc) &&
        (gfxSrc.match(/rootarch:\s*true/g) || []).length >= 4,
        "(1 in DEFAULTS + 1 per preset = 4 occurrences expected)");

    const planetSrc = fs.readFileSync(path.join(ROOT, "es-box3d-fly3d.html"), "utf8");
    ok("!! es-box3d-fly3d.html imports rootArch() and defines buildRootArchLandmark()",
        /import\s*\{\s*rootArch\s*\}\s*from\s*"\/world\/rootArch\.js"/.test(planetSrc) &&
        /function buildRootArchLandmark\(/.test(planetSrc));
    ok("...refuses on gas/molten planets, the same solid-surface refusal mossSpeciesForPlanet already makes",
        /planetSpec_\.type === "gas" \|\| planetSpec_\.type === "molten"/.test(
            planetSrc.slice(planetSrc.indexOf("function buildRootArchLandmark"), planetSrc.indexOf("function buildRootArchLandmark") + 800)));
    ok("...and is built ONCE at boot alongside moss, not rebuilt every arrival",
        /window\.swekRootArch\(\);/.test(planetSrc));
}

console.log("\n6. *** LIVE: THE PLANET PAGE PLACES THE LANDMARK ON A SOLID WORLD AND REFUSES ON GAS/MOLTEN ***");
{
    const pw = await import(pathToFileURL(path.join(ROOT, "tools", "ship", "playwrightResolve.mjs")).href);
    const { createRequire } = await import("node:module");
    const rr = pw.resolvePlaywright(createRequire(import.meta.url));
    const skip = pw.browserSkipReason(rr.chromium, rr.from, pw.HEADLESS_SHELL);
    if (skip) {
        console.log("  ----  live check SKIPPED -- " + skip);
    } else {
        const http = await import("node:http");
        const srv = http.default.createServer((rq, rs) => {
            const p = decodeURIComponent((rq.url || "/").split("?")[0]);
            const f = path.join(ROOT, p === "/" ? "/index.html" : p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end("nf"); return; }
            const e = path.extname(f);
            const ct = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css" }[e] || "application/octet-stream";
            rs.writeHead(200, { "Content-Type": ct }); rs.end(fs.readFileSync(f));
        });
        await new Promise((x) => srv.listen(0, "127.0.0.1", x));
        const b = await rr.chromium.launch({ executablePath: pw.HEADLESS_SHELL, args: ["--use-gl=swiftshader", "--enable-webgl"] });
        try {
            const results = {};
            for (const [seed, type] of [[7, "terran"], [1, "ice"], [2, "gas"], [4, "molten"]]) {
                const pg = await b.newPage();
                const errs = [];
                pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
                await pg.setViewportSize({ width: 700, height: 460 });
                await pg.goto("http://127.0.0.1:" + srv.address().port + "/es-box3d-fly3d.html?seed=" + seed, { waitUntil: "load", timeout: 40000 });
                await pg.waitForTimeout(3000);
                const p = await pg.evaluate(() => window.swekRootArchProbe());
                results[type] = { placed: !!(p && p.placed), branchCount: p && p.placed ? p.branchCount : 0, errs: errs.length };
                await pg.close();
            }
            ok("!! *** gas and molten planets place NO root/arch landmark at all ***",
                results.gas.placed === false && results.molten.placed === false, JSON.stringify(results));
            ok("!! ...while terran and ice BOTH place a real landmark with at least one branch",
                results.terran.placed && results.terran.branchCount >= 1 && results.ice.placed && results.ice.branchCount >= 1,
                "terran " + results.terran.branchCount + " branches, ice " + results.ice.branchCount + " branches");
            ok("...and none of the four seeds threw a page error", Object.values(results).every((t) => t.errs === 0));
        } finally { await b.close(); await new Promise((x) => srv.close(x)); }
    }
}

console.log("\n7. *** LIVE: THE VOXEL ENGINE BOOTS CLEAN WITH THE LANDMARK WIRED IN -- SCOPE STATED HONESTLY ***");
{
    // Same honest scope render/mossField-selfcheck.mjs's own section 10 already states for moss: a live check
    // that the landmark actually PLACES on the real voxel engine would need real terrain streamed in around
    // the search origin first, which this ad hoc headless boot does not do for vegetation.js's grass either.
    // What IS checked here: the page boots with zero errors and window.rootArch exists in the correct default
    // (enabled) state, and its control functions run without throwing.
    const pw = await import(pathToFileURL(path.join(ROOT, "tools", "ship", "playwrightResolve.mjs")).href);
    const { createRequire } = await import("node:module");
    const rr = pw.resolvePlaywright(createRequire(import.meta.url));
    const skip = pw.browserSkipReason(rr.chromium, rr.from, pw.HEADLESS_SHELL);
    if (skip) {
        console.log("  ----  live check SKIPPED -- " + skip);
    } else {
        const http = await import("node:http");
        const srv = http.default.createServer((rq, rs) => {
            const p = decodeURIComponent((rq.url || "/").split("?")[0]);
            const f = path.join(ROOT, p === "/" ? "/index.html" : p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end("nf"); return; }
            const e = path.extname(f);
            const ct = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css" }[e] || "application/octet-stream";
            rs.writeHead(200, { "Content-Type": ct }); rs.end(fs.readFileSync(f));
        });
        await new Promise((x) => srv.listen(0, "127.0.0.1", x));
        const b = await rr.chromium.launch({ executablePath: pw.HEADLESS_SHELL, args: ["--use-gl=swiftshader", "--enable-webgl"] });
        try {
            const pg = await b.newPage();
            const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
            await pg.route("**/*", (route) => {
                const u = route.request().url();
                if (u.startsWith("http://127.0.0.1")) return route.continue();
                route.abort();   // no real external network in a gate
            });
            await pg.setViewportSize({ width: 700, height: 460 });
            await pg.goto("http://127.0.0.1:" + srv.address().port + "/index.html", { waitUntil: "load", timeout: 40000 });
            await pg.waitForTimeout(6000);
            const state = await pg.evaluate(() => (window.rootArch ? window.rootArch.state() : null));
            ok("!! index.html boots with window.rootArch present, enabled by default, with zero page errors",
                state && state.enabled === true && errs.length === 0,
                state ? JSON.stringify(state) : "window.rootArch missing" + (errs.length ? "; errors: " + errs[0] : ""));
            const toggled = await pg.evaluate(() => { window.rootArch.off(); const s = window.rootArch.state(); window.rootArch.on(); return s; });
            ok("!! ...and on()/off()/state() all run without throwing", toggled && toggled.enabled === false);
        } finally { await b.close(); await new Promise((x) => srv.close(x)); }
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
if (fails) process.exit(1);
