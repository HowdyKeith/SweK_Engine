// WebGLEngine/tools/ship/repoTerrain-selfcheck.mjs -- v4149
//
// Run: node tools/ship/repoTerrain-selfcheck.mjs   (a few seconds -- it scans this repository for real)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES world/repoHeightfield.js, ai-bridge/repoTerrainBridge.js, the biome override added to
// world/biomeTerrain.js + world/world.js, and window.repoTerrain's wiring in main.js.
//
// Keith: "What about github into a terrain view? ... I have at times described my VBA programming as mountains
// of code. maybe 3 mountains." Then, on the first map: "data-storage as water" and "we have a fairly healthy
// biome selection."
//
// *** EVERY MEASUREMENT BELOW IS TAKEN AGAINST THIS REPOSITORY'S REAL TREE, NOT A FIXTURE. *** A treemap that
// tiles four hand-written files proves nothing about 4,600 real ones at eleven directory levels, and the two
// defects this gate exists to catch (a lake big enough to be silently dropped by the stamper's own area cap; a
// blur wide enough to eat the shoreline) BOTH need a real tree's proportions to appear at all.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { repoHeightfield, treemapLeaves, buildTree, isWaterEntry, biomeIdFor, boxBlur,
         BIOME_ORDER, LANGUAGE_BIOME, DATA_EXT, DEFAULTS } from "../../world/repoHeightfield.js";
import { biomeColumnMaterials } from "../../world/biomeTerrain.js";
import { applyRealTerrain, clearRealTerrain } from "../../world/realTerrainStamp.js";
import { BIOMES } from "../../world/worleyBiomes.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(ENG, "..");
const require = createRequire(import.meta.url);
const bridge = require("../../ai-bridge/repoTerrainBridge.js");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("repoTerrain-selfcheck -- a source tree, walked as ground\n");

// ---- 0. THE REAL SCAN, ONCE, SHARED BY EVERY SECTION BELOW ------------------------------------------------
const t0 = Date.now();
const scan = bridge.scanTree(REPO);
const scanMs = Date.now() - t0;
const t1 = Date.now();
const field = repoHeightfield(scan.entries, { grid: 128 });
const fieldMs = Date.now() - t1;

{
    console.log("0. THE MEASUREMENT EVERYTHING ELSE IS TAKEN AGAINST");
    ok("the bridge scanned this repository", scan.ok && scan.files > 500,
        scan.files + " files / " + scan.lines.toLocaleString() + " lines in " + scanMs + "ms");
    ok("the heightfield built from it", field.grid === 128 && field.heights.length === 128 * 128,
        field.stats.files + " as land, " + field.stats.lakeFiles + " as water, " + fieldMs + "ms");
    report("peak: " + (field.peaks[0] ? field.peaks[0].path + " (" + field.peaks[0].lines + " lines, " +
           field.peaks[0].biome + ")" : "none") + " | biggest lake: " +
           (field.lakes[0] ? field.lakes[0].path + " (" + field.lakes[0].lines + " lines)" : "none"));
}

// ---- 1. THE TREEMAP IS A MAP: IT TILES, AND AREA IS TRUTHFULLY PROPORTIONAL ---------------------------------
{
    console.log("\n1. *** THE MAP IS A FAIR MAP -- NO OVERLAP, NO GAP, AREA PROPORTIONAL TO SIZE ***");
    const root = buildTree(scan.entries);
    const leaves = treemapLeaves(root, { x: 0, y: 0, w: 1, h: 1 });
    ok("every file in the listing got a rectangle", leaves.length === scan.entries.length,
        leaves.length + " rects for " + scan.entries.length + " entries");
    let area = 0, neg = 0;
    for (const l of leaves) { area += l.rect.w * l.rect.h; if (l.rect.w < 0 || l.rect.h < 0) neg++; }
    ok("!! the rectangles tile the unit square exactly (sum of areas == 1)", Math.abs(area - 1) < 1e-9 && neg === 0,
        "sum=" + area.toFixed(12) + ", negative=" + neg);

    // Sampling proves NON-OVERLAP, which summed area alone cannot: two rects could overlap and leave a gap of
    // the same size. A stochastic point test over the real layout is what actually rules that out.
    let hits = 0, multi = 0, miss = 0;
    for (let i = 0; i < 4000; i++) {
        const x = ((i * 7919) % 10007) / 10007, y = ((i * 104729) % 10009) / 10009;
        let n = 0;
        for (const l of leaves) { const r = l.rect; if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) n++; }
        if (n === 1) hits++; else if (n > 1) multi++; else miss++;
    }
    ok("!! *** 4,000 sampled points each land in EXACTLY ONE file's rectangle -- no overlap, no hole ***",
        multi === 0 && miss === 0, hits + " single / " + multi + " overlapping / " + miss + " uncovered");

    // AREA IS LINEAR IN SIZE. This is the claim that makes the picture a map of the codebase rather than a
    // decoration, so it is measured, not asserted: the ratio of areas must track the ratio of line counts.
    const byLines = leaves.slice().sort((a, b) => b.node.weight - a.node.weight);
    const big = byLines[0], small = byLines[Math.floor(byLines.length / 2)];
    const areaRatio = (big.rect.w * big.rect.h) / (small.rect.w * small.rect.h);
    const lineRatio = big.node.weight / small.node.weight;
    ok("!! area is LINEAR in size (area ratio tracks line ratio within 1%)",
        Math.abs(areaRatio / lineRatio - 1) < 0.01,
        big.node.path + " (" + big.node.weight + "L) vs " + small.node.path + " (" + small.node.weight +
        "L): area x" + areaRatio.toFixed(1) + " vs lines x" + lineRatio.toFixed(1));
}

// ---- 2. *** AND THE SKYLINE IS LOGARITHMIC, WHICH IS THE ONE JUDGEMENT CALL IN THE MODULE *** ---------------
{
    console.log("\n2. *** HEIGHT IS LOG, NOT LINEAR -- OR ONE FILE WOULD BE THE WHOLE MOUNTAIN RANGE ***");
    // Two synthetic files 100x apart in size. Linear height would put them 100x apart; log1p puts them ~2.4x.
    // The number is CHECKED against log1p directly rather than against a remembered constant, so a change to
    // the massif weight cannot quietly turn this into a tautology.
    const f = repoHeightfield([{ path: "d/big.js", lines: 10000 }, { path: "d/small.js", lines: 100 }],
                              { grid: 64, blurPasses: 0, margin: 0 });
    const big = f.peaks.find((p) => /big/.test(p.path)), small = f.peaks.find((p) => /small/.test(p.path));
    const ratio = big.height / small.height;
    ok("!! a 100x bigger file stands ~2-3x taller, not 100x taller", ratio > 1.4 && ratio < 3.2,
        "10,000L height " + big.height.toFixed(2) + " vs 100L height " + small.height.toFixed(2) + " = x" + ratio.toFixed(2));
    // ...and it is still unambiguously the taller one. A compression that flattened them would pass the bound
    // above while destroying the thing the view is for.
    ok("...and it is still clearly the bigger mountain", big.height > small.height * 1.4);

    // THE MASSIF TERM: a file in a big directory stands higher than the SAME file alone, because the directory
    // lifts it. Same file, same size, two trees -- so nothing but the parent's total differs.
    const alone = repoHeightfield([{ path: "solo/x.js", lines: 500 }], { grid: 32, blurPasses: 0, margin: 0 });
    const crowd = repoHeightfield([{ path: "big/x.js", lines: 500 },
        ...Array.from({ length: 60 }, (_, i) => ({ path: "big/f" + i + ".js", lines: 900 }))],
        { grid: 32, blurPasses: 0, margin: 0, peaks: 100 });   // peaks:100 -- the 500L file is the SMALLEST here
    const hA = alone.peaks.find((p) => /x\.js/.test(p.path)).height;
    const hC = crowd.peaks.find((p) => /x\.js/.test(p.path)).height;
    ok("!! the SAME 500-line file stands higher inside a big directory (the massif term is live)", hC > hA * 1.2,
        "alone " + hA.toFixed(2) + " vs inside a 54,500-line directory " + hC.toFixed(2));
}

// ---- 3. *** DATA IS WATER, AT ITS TRUE FOOTPRINT -- NOT A FOOTNOTE *** -------------------------------------
{
    console.log("\n3. *** KEITH: \"DATA-STORAGE AS WATER\" -- AND THE LAKE IS AS BIG AS THE FILE REALLY IS ***");
    // The first version EXCLUDED data files and named them in a footnote. That kept the skyline honest and made
    // the MAP dishonest: es-universe.json is ~18% of this repository and would have covered 0% of the ground.
    const star = field.lakes.find((l) => /es-universe\.json$/.test(l.path));
    ok("!! the 200k-line generated star catalogue is present as a lake, not omitted", !!star,
        star ? star.lines.toLocaleString() + " lines across " + star.cells + " cells" : "MISSING");
    if (star) {
        const share = star.lines / scan.lines, cellShare = star.cells / (field.grid * field.grid);
        // Its footprint is its true share of the tree, scaled by the treemap's inset (the margin is unlaid).
        const laid = (1 - 2 * field.stats.margin) ** 2;
        ok("!! ...covering its TRUE share of the ground (within 15% of lines-share x laid area)",
            Math.abs(cellShare / (share * laid) - 1) < 0.15,
            (share * 100).toFixed(1) + "% of lines -> " + (cellShare * 100).toFixed(1) + "% of cells (laid area " + (laid * 100).toFixed(0) + "%)");
    }
    ok("!! and it is NOT the tallest thing on the map any more (a hand-written file is)",
        field.peaks[0] && !isWaterEntry({ path: field.peaks[0].path }),
        "tallest: " + (field.peaks[0] || {}).path);

    // *** THE STAMPER SILENTLY DROPS ANY WATER BODY WHOSE BOUNDING BOX EXCEEDS 20,000 WORLD UNITS SQUARED. ***
    // That cap is realTerrainStamp's, written for an OSM query that catches an open bay, and a lake this big
    // would have hit it and vanished with no error. lakePolys() splits instead. This is why the section runs
    // on the real tree: no hand-written fixture has a file that is a fifth of its repository.
    const perFile = new Map();
    for (const a of field.water.areas) perFile.set(a.path, (perFile.get(a.path) || 0) + 1);
    ok("!! *** the biggest lake is SPLIT into pieces small enough to survive the stamper's own area cap ***",
        (perFile.get(star && star.path) || 0) > 1,
        "es-universe.json -> " + (perFile.get(star && star.path) || 0) + " polygons; " +
        field.water.areas.length + " polygons for " + field.stats.lakeFiles + " data files");
    let worst = 0;
    for (const a of field.water.areas) {
        const xs = a.poly.map((p) => p[1]), ys = a.poly.map((p) => 1 - p[0]);
        worst = Math.max(worst, (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)));
    }
    // Region ~240 voxels across => the cap is 20000/240^2 of the unit square.
    const capUnit = 20000 / (240 * 240);
    ok("...every polygon's box is under the cap for the default region", worst < capUnit,
        "worst " + (worst * 240 * 240).toFixed(0) + " sq voxels vs cap 20000");

    // The polygon coordinate convention. realTerrainStamp maps [lat,lon] through the unit bbox as fx=lon,
    // fy=1-lat; getting that backwards would mirror every lake onto dry land with nothing to show it.
    const a0 = field.water.areas[0];
    const lons = a0.poly.map((p) => p[1]), lats = a0.poly.map((p) => p[0]);
    ok("!! lake polygons are emitted in the [1-y, x] convention the stamp's bbox expects",
        Math.min(...lons) >= 0 && Math.max(...lons) <= 1 && Math.min(...lats) >= 0 && Math.max(...lats) <= 1,
        "lon " + Math.min(...lons).toFixed(3) + ".." + Math.max(...lons).toFixed(3) +
        ", lat " + Math.min(...lats).toFixed(3) + ".." + Math.max(...lats).toFixed(3));
    ok("water:false puts the data files back on land", (() => {
        const dry = repoHeightfield(scan.entries, { grid: 64, water: false });
        return dry.stats.lakeFiles === 0 && dry.peaks.some((p) => isWaterEntry({ path: p.path }));
    })(), "the option is real, not decorative");
}

// ---- 4. THE SHORELINE, AND THE SABOTAGE THAT PROVES IT IS LOAD-BEARING --------------------------------------
{
    console.log("\n4. *** THE ISLAND HAS A COAST, AND THE BLUR WOULD HAVE EATEN IT ***");
    ok("!! the lowest ground is exactly zero, so a baseY under WATER_LEVEL gives a real sea",
        field.min === 0 && field.max > 5, "min=" + field.min + " max=" + field.max.toFixed(2));
    // SABOTAGE: rebuild the same field with the shore mask's effect undone (blur, no mask) and show the sea
    // fills in. Without this the "island" claim rests on a line of code nobody has ever seen fail.
    const noMask = (() => {
        const raw = repoHeightfield(scan.entries, { grid: 128, margin: 0 });   // margin 0 == no shore band
        return raw.min;
    })();
    ok("!! *** SABOTAGE: with no margin to mask, the lowest ground is well above zero -- no coast ***",
        noMask > 0.5, "min without a shore band: " + noMask.toFixed(2) + " (against a max of " + field.max.toFixed(2) + ")");
    report("that is the bug the mask was written for: three passes of a radius-3 box blur reach further than " +
           "the margin is wide, so an unlaid border does not stay empty -- it fills, and the sea vanishes.");
    // The blur is doing real work: it must smooth without flattening.
    const sharp = repoHeightfield(scan.entries, { grid: 128, blurPasses: 0 });
    let stepSharp = 0, stepSmooth = 0;
    for (let r = 1; r < 128; r++) for (let c = 0; c < 128; c++) {
        stepSharp = Math.max(stepSharp, Math.abs(sharp.heights[r * 128 + c] - sharp.heights[(r - 1) * 128 + c]));
        stepSmooth = Math.max(stepSmooth, Math.abs(field.heights[r * 128 + c] - field.heights[(r - 1) * 128 + c]));
    }
    ok("!! smoothing cuts the worst cliff between neighbouring cells...", stepSmooth < stepSharp * 0.75,
        "worst step " + stepSharp.toFixed(2) + " -> " + stepSmooth.toFixed(2));
    ok("...without flattening the map (relief is preserved)", field.max > sharp.max * 0.7,
        "max " + sharp.max.toFixed(2) + " -> " + field.max.toFixed(2));
    ok("boxBlur of a constant field is that constant (no drift at the clamped edges)", (() => {
        const c = new Float64Array(16 * 16).fill(3.5);
        const b = boxBlur(c, 16, 2);
        return [...b].every((v) => Math.abs(v - 3.5) < 1e-12);
    })());
}

// ---- 5. *** BIOME BY LANGUAGE, AND THE OVERRIDE THAT ACTUALLY CHANGES THE GROUND *** ------------------------
{
    console.log("\n5. *** KEITH: \"WE HAVE A FAIRLY HEALTHY BIOME SELECTION\" -- ALL EIGHT, DRIVEN BY LANGUAGE ***");
    const named = Object.keys(LANGUAGE_BIOME);
    ok("!! the legend names every biome world/worleyBiomes.js ships", named.length === Object.keys(BIOMES).length &&
        named.every((b) => BIOMES[b]), named.join(", "));
    ok("...and every id in BIOME_ORDER resolves to a real biome (0 excepted -- it means 'no opinion')",
        BIOME_ORDER.slice(1).every((b) => !!BIOMES[b]) && BIOME_ORDER[0] === "");
    ok("!! a shader is jungle, a C header is tundra, a markdown file is savanna",
        BIOME_ORDER[biomeIdFor("a/x.frag")] === "jungle" && BIOME_ORDER[biomeIdFor("a/x.h")] === "tundra" &&
        BIOME_ORDER[biomeIdFor("a/README.md")] === "savanna");
    ok("an unlisted extension falls back to plains rather than to nothing",
        BIOME_ORDER[biomeIdFor("a/x.wibble")] === "plains");
    const census = field.stats.biomeCensus;
    ok("!! this JavaScript tree comes out mostly forest, with more than one biome present",
        census.forest > 0 && Object.keys(census).length >= 4 &&
        census.forest === Math.max(...Object.values(census)),
        Object.entries(census).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ":" + v).join(" "));

    // *** THE OVERRIDE MUST CHANGE THE ACTUAL VOXELS, NOT JUST THE LABEL. *** A biome name that never reaches
    // biomeColumnMaterials would report a beautiful census over ground that is all the same grass.
    const nat = biomeColumnMaterials(0, 0, 1337, 20, { slope: 0 });
    const des = biomeColumnMaterials(0, 0, 1337, 20, { slope: 0, biome: "desert" });
    const tun = biomeColumnMaterials(0, 0, 1337, 20, { slope: 0, biome: "tundra" });
    ok("!! *** forcing a biome changes the SURFACE VOXEL, at the same coordinate and the same height ***",
        des.surface !== nat.surface && tun.surface !== des.surface,
        "natural=" + nat.surface + " (" + nat.biome + ") desert=" + des.surface + " tundra=" + tun.surface);
    ok("an unknown biome name falls through to the noise instead of throwing or blanking the column",
        biomeColumnMaterials(0, 0, 1337, 20, { slope: 0, biome: "nope" }).surface === nat.surface);
    // Elevation still wins over biome -- a jungle summit is still bare rock, which is biomeTerrain's own rule
    // and must not have been broken by adding a way in.
    ok("elevation overrides still beat the forced biome (a jungle peak is still rock)",
        biomeColumnMaterials(0, 0, 1337, 50, { slope: 0, biome: "jungle" }).surface !==
        biomeColumnMaterials(0, 0, 1337, 20, { slope: 0, biome: "jungle" }).surface);
}

// ---- 6. THE STAMP TAKES IT: SHAPE, INSTALL, AND RESTORE -----------------------------------------------------
{
    console.log("\n6. THE FIELD IS THE SHAPE applyRealTerrain ALREADY CONSUMES -- CHECKED BY RUNNING IT");
    for (const k of ["heights", "grid", "min", "max", "bbox"])
        ok("carries `" + k + "`, as a fetched elevation grid does", field[k] !== undefined);
    ok("heights is grid*grid, row-major", field.heights.length === field.grid * field.grid);
    ok("biomes is the same shape, so the two index together", field.biomes.length === field.heights.length);

    // A stub world with only the four members applyRealTerrain touches. Not the real VoxelWorld: constructing
    // one pulls in erosion, fluids and WebGL. What is under test here is the STAMP's contract, and the stub
    // makes a broken contract visible instead of drowning it in engine setup.
    const voxels = [];
    const w = {
        gridRadius: 7, chunkSize: 16, useWorleyBiomes: false, regenerated: 0,
        regenerate() { this.regenerated++; },
        _heightAt(x, z) { return this._heightOverride ? (this._heightOverride(x, z) ?? 20) : 20; },
        setVoxel(x, y, z, v) { voxels.push([x, y, z, v]); },
    };
    const summary = applyRealTerrain(w, field, { baseY: 4, amp: 46 });
    ok("!! the stamp accepted the repo field and rebuilt the world", w.regenerated > 0 && summary.grid === field.grid);
    ok("!! a height override is installed and answers inside the region, null outside",
        typeof w._heightOverride === "function" && w._heightOverride(0, 0) !== null &&
        w._heightOverride(99999, 99999) === null);
    ok("!! *** THE BIOME OVERRIDE IS INSTALLED AND THE WORLEY PATH IS FORCED ON ***", !!w._biomeOverride && w.useWorleyBiomes === true,
        "it is OFF by default in world.js, and the override is only consulted there -- without the force this " +
        "whole layer would do nothing in an ordinary session, silently and with no error");
    const names = new Set();
    for (let x = -100; x <= 100; x += 7) for (let z = -100; z <= 100; z += 7) { const b = w._biomeOverride(x, z); if (b) names.add(b); }
    ok("...and it returns real biome names across the region", names.size >= 2 && [...names].every((n) => !!BIOMES[n]),
        [...names].join(", "));
    ok("!! water voxels were actually painted for the data lakes", voxels.length > 100 && voxels.every((v) => v[3] === 10),
        voxels.length + " WATER voxels");
    clearRealTerrain(w);
    ok("!! *** clear() puts useWorleyBiomes BACK to what it was, rather than leaving the world altered ***",
        w._heightOverride === null && w._biomeOverride === null && w.useWorleyBiomes === false);
}

// ---- 7. THE BRIDGE RETURNS COUNTS, AND ONLY FROM REPOSITORIES -----------------------------------------------
{
    console.log("\n7. *** THE SCANNER NEVER RETURNS CONTENT, AND WILL NOT WALK $HOME ***");
    ok("!! no entry carries file contents -- only path, size and a flag",
        scan.entries.every((e) => Object.keys(e).every((k) => ["path", "lines", "bytes", "binary"].includes(k))),
        "keys: " + Object.keys(scan.entries[0]).join(","));
    // *** THE FIRST DRAFT ALLOWED THE PARENT DIRECTORY ITSELF, WHICH IS $HOME. *** The allowlist is the
    // REPOSITORIES, not the folders that hold them, so a path that is merely near one is refused.
    const parent = path.resolve(REPO, "..");
    ok("!! *** the repository's PARENT directory is refused (it is $HOME, and its listing is not ours) ***",
        bridge.insideAllowed(parent) === null, parent);
    ok("...and so is a path outside it entirely", bridge.insideAllowed("/etc") === null);
    ok("the repository itself is allowed", !!bridge.insideAllowed(REPO));
    ok("...as is a subdirectory of it, so you can stand on one folder", !!bridge.insideAllowed(path.join(ENG, "render")));
    ok("a refused scan says so instead of returning a partial tree", bridge.scanTree("/etc").ok === false);
    ok("!! .git and node_modules are never walked -- a repo's history is not its shape",
        !scan.entries.some((e) => /(^|\/)(\.git|node_modules)\//.test(e.path)) &&
        bridge.SKIP_DIRS.has(".git") && bridge.SKIP_DIRS.has("node_modules"));
    // The dotfile bug the first draft shipped: lastIndexOf(".") is 0 for ".gitignore", so it fell through to
    // the whole name and every dotfile in every repo was counted as binary at bytes/80.
    ok("!! a dotfile is classified by its name without the dot (.gitignore is text, not binary)",
        bridge.isText(".gitignore") && bridge.isText("Makefile") && !bridge.isText("photo.png"));
    const gi = scan.entries.find((e) => e.path === ".gitignore");
    ok("...and is counted by real lines, not by bytes/80", !!gi && !gi.binary && gi.lines > gi.bytes / 80,
        gi ? gi.lines + " lines from " + gi.bytes + " bytes" : "not found");
}

// ---- 8. THE WIRING EXISTS WHERE THE PAGE WILL LOOK FOR IT ---------------------------------------------------
{
    console.log("\n8. WIRED INTO main.js AND ai-bridge/server.js");
    const mainSrc = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    ok("!! window.repoTerrain exists with load/roots/clear", /window\.repoTerrain\s*=/.test(mainSrc) &&
        /repoTerrain[\s\S]{0,3000}?async load\(/.test(mainSrc));
    ok("...and it reuses realTerrain.flyIn rather than writing a second camera path",
        /repoTerrain[\s\S]{0,3000}?realTerrain\.flyIn\(/.test(mainSrc));
    ok("...and applyRealTerrain rather than a second voxelizer",
        /repoTerrain[\s\S]{0,3000}?applyRealTerrain\(/.test(mainSrc));
    const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("!! the bridge is required and mounted in server.js", /require\("\.\/repoTerrainBridge\.js"\)/.test(srv) &&
        /repoTerrainBridge\.owns\(req\.url\)/.test(srv) && /repoTerrainBridge\.handle\(/.test(srv));
    ok("DEFAULTS documents every knob load() passes", ["grid", "margin", "massif", "blurPasses", "water", "peaks"]
        .every((k) => k in DEFAULTS), Object.keys(DEFAULTS).join(", "));
    ok("DATA_EXT covers the generated shapes this tree actually contains",
        ["json", "csv", "lock", "svg", "map"].every((e) => DATA_EXT.has(e)));
    report("NOT RUN HERE: a rendered frame. tools/ship/realTerrainFlyIn-selfcheck.mjs already boots the real " +
           "page and watches the ~22s arrival onto a stamped heightfield; this view feeds that same stamp and " +
           "that same flight, so a browser run here would re-gate the arrival, not this module.");
}

console.log("\n" + (fails ? fails + " FAILED" : "repoTerrain-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
