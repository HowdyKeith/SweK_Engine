// WebGLEngine/render/mossField-selfcheck.mjs — v4077
//
// Run: node render/mossField-selfcheck.mjs   (~1-2s pure; live sections need a browser, skip with a reason otherwise)
//
// Keith: could a moss/root demo (github.com/MengTo/sylva's IDEA, not its all-rights-reserved code) fold into the
// engine's own terrain generation, on both terrain kinds. This is the gate for render/mossField.js, the shared
// placement generator, and for its two consumers: render/mossPatches.js (voxel) and es-box3d-fly3d.html (planet).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const MF = await import(pathToFileURL(path.join(HERE, "mossField.js")).href);
const CF = await import(pathToFileURL(path.join(HERE, "cloudField.js")).href);
const PS = await import(pathToFileURL(path.join(ROOT, "world", "planetSurface.js")).href);
const PP = await import(pathToFileURL(path.join(ROOT, "world", "procPlanet.js")).href);

console.log("mossField-selfcheck -- one generator, two terrain kinds, and moss that avoids a slope\n");

console.log("0. *** offsetDir/norm -- EXPORTED FROM cloudField.js AT v4076 SO THIS FILE DOES NOT RE-DERIVE THEM,");
console.log("   AND CLOSED HERE BY ASSERTION RATHER THAN BY MENTION ***");
{
    // v4076 -- definitionGates-selfcheck's tree-wide ratchet is closed by a real check calling the function and
    // grading the answer, per its own stated rule ("closed by ASSERTION, not by mention"). These two were
    // private to cloudField.js until this round; exporting them without a gate that exercises them from their
    // NEW consumer's perspective would be exactly the "definition nobody had even looked at" shape that ratchet
    // exists to catch, even though render/cloudField-selfcheck.mjs already exercises them indirectly through
    // buildPuffsShell(). mossField.js's whole shell placement depends on this arithmetic being right, so it is
    // worth its own direct proof here, not just a name typed to satisfy a scan.
    ok("!! offsetDir(dir, 0, 0) returns dir unchanged -- no offset is no offset",
        JSON.stringify(CF.offsetDir([0, 1, 0], 0, 0)) === JSON.stringify([0, 1, 0]));
    ok("!! offsetDir ALWAYS returns a unit vector, whatever the offset",
        Math.abs(Math.hypot(...CF.offsetDir([0, 0, 1], 0.3, -0.2)) - 1) < 1e-12);
    ok("!! ...even at the pole, where the eastward tangent degenerates and falls back to +x",
        Math.abs(Math.hypot(...CF.offsetDir([0, 1, 0], 0.4, 0.15)) - 1) < 1e-12,
        "the same pole case world/planetSurface.js's tangentFrame() names -- moss patches can land there too");
    ok("!! norm() actually normalizes", JSON.stringify(CF.norm([3, 4, 0])) === JSON.stringify([0.6, 0.8, 0]));
    ok("!! ...and mossField.js IMPORTS this exact function rather than carrying a second copy",
        /import \{ offsetDir \} from "\.\/cloudField\.js"/.test(fs.readFileSync(path.join(HERE, "mossField.js"), "utf8")),
        "one tangent-offset arithmetic, read by clouds and by moss");
}

console.log("1. *** SEEDED: THE SAME SEED IS THE SAME MOSS, AND A DIFFERENT ONE IS NOT ***");
{
    const accept = () => ({ ok: true, y: 10 });
    const a = MF.buildMossVoxel({ seed: 5, patches: 12, accept });
    const b = MF.buildMossVoxel({ seed: 5, patches: 12, accept });
    const c = MF.buildMossVoxel({ seed: 6, patches: 12, accept });
    ok("!! *** the same seed rebuilds a BYTE-IDENTICAL voxel field ***",
        a.length > 0 && JSON.stringify(a) === JSON.stringify(b),
        a.length + " tufts, identical across two calls with seed 5");
    ok("!! ...and a different seed really is a different field", JSON.stringify(a) !== JSON.stringify(c));

    ok("...and no `accept` refuses rather than guesses a ground truth",
        MF.buildMossVoxel({ seed: 1, patches: 12 }).length === 0,
        "this file does not know where the voxel world's ground is; only the caller does");
    ok("...and every accept:false site is honoured (zero tufts, not a fallback)",
        MF.buildMossVoxel({ seed: 5, patches: 12, accept: () => ({ ok: false }) }).length === 0);

    const spec = PP.planetSpec(7);   // confirmed terran, deterministic from the seed
    const s1 = MF.buildMossShell({ seed: 42, spec, groundRadius: 150, dir: [0, 1, 0], patches: 14 });
    const s2 = MF.buildMossShell({ seed: 42, spec, groundRadius: 150, dir: [0, 1, 0], patches: 14 });
    const s3 = MF.buildMossShell({ seed: 43, spec, groundRadius: 150, dir: [0, 1, 0], patches: 14 });
    ok("!! *** the same seed rebuilds a BYTE-IDENTICAL shell field ***",
        s1.length > 0 && JSON.stringify(s1) === JSON.stringify(s2),
        s1.length + " tufts, identical across two calls with seed 42");
    ok("!! ...and a different seed really is a different shell field", JSON.stringify(s1) !== JSON.stringify(s3));
    ok("...and no `spec` refuses rather than placing on nothing",
        MF.buildMossShell({ seed: 1 }).length === 0,
        "no planet, no placement -- the same refusal as an unknown cloud type in render/cloudField.js");
}

console.log("\n2. *** THE VOXEL PLACEMENT: PATCHY, NOT A CARPET, AND THAT IS MEASURED ON THE OUTPUT ***");
{
    const accept = () => ({ ok: true, y: 3 });
    const tufts = MF.buildMossVoxel({ seed: 9, patches: 16, accept });
    const byPatch = new Map();
    for (const t of tufts) { if (!byPatch.has(t.patchId)) byPatch.set(t.patchId, []); byPatch.get(t.patchId).push(t); }
    const within = [];
    for (const pts of byPatch.values())
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
            within.push(Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z));
    const centroids = [...byPatch.values()].map((pts) => [
        pts.reduce((s, p) => s + p.x, 0) / pts.length, pts.reduce((s, p) => s + p.z, 0) / pts.length,
    ]);
    const between = [];
    for (let i = 0; i < centroids.length; i++) for (let j = i + 1; j < centroids.length; j++)
        between.push(Math.hypot(centroids[i][0] - centroids[j][0], centroids[i][1] - centroids[j][1]));
    const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const avgWithin = avg(within), avgBetween = avg(between);
    ok("!! *** within-patch tufts sit far closer together than patch centres do to each other ***",
        avgWithin * 5 < avgBetween,
        "avg within-patch " + avgWithin.toFixed(2) + " vs avg centroid-to-centroid " + avgBetween.toFixed(2) +
        " -- a uniform scatter (vegetation.js's own shape, correct for a lawn) would show these roughly equal");

    ok("!! ...and `patchId` is the census's OWN evidence for the claim above, not a re-derived cluster",
        tufts.every((t) => Number.isInteger(t.patchId)),
        "a gate that had to re-cluster the output to check clumping would be trusting the code it is checking");

    ok("...and the placement height is exactly what accept() said, never invented",
        tufts.every((t) => t.y === 3), "y=3 on every tuft, verbatim from the injected ground truth");
}

console.log("\n3. *** patchDensity(): THE VOXEL SIDE'S SLOPE HOOK, PROVEN INDEPENDENTLY OF ANY REAL TERRAIN ***");
{
    const accept = () => ({ ok: true, y: 0 });
    const full = MF.buildMossVoxel({ seed: 5, patches: 10, accept, patchDensity: () => 1 }).length;
    const bare = MF.buildMossVoxel({ seed: 5, patches: 10, accept }).length;   // default patchDensity
    ok("!! default patchDensity is full density -- a caller that does not care about slope is unaffected",
        full === bare, full + " tufts either way");
    ok("!! patchDensity 0 zeroes the field", MF.buildMossVoxel({ seed: 5, patches: 10, accept, patchDensity: () => 0 }).length === 0);
    const half = MF.buildMossVoxel({ seed: 5, patches: 10, accept, patchDensity: () => 0.5 }).length;
    ok("!! patchDensity 0.5 roughly halves it (each patch's own tuft count is rounded, so not exact)",
        half > full * 0.3 && half < full * 0.7, half + " against " + full + " at full density");
}

console.log("\n4. *** slopeDensityMul(): MOSS THINS TO ZERO ON A SLOPE, AS A FORMULA, PROVEN WITHOUT A REAL TERRAIN ***");
{
    ok("!! flat ground (gradMag 0) is full density", MF.slopeDensityMul(0, 4.5) === 1);
    ok("!! exactly at maxSlope is exactly zero", MF.slopeDensityMul(4.5, 4.5) === 0);
    ok("!! past maxSlope stays clamped at zero, never negative", MF.slopeDensityMul(9, 4.5) === 0);
    ok("!! the midpoint is exactly half", MF.slopeDensityMul(2.25, 4.5) === 0.5);
    ok("!! *** monotonic: every step steeper is every step thinner, over the whole range ***",
        (() => { let prev = 1, mono = true;
            for (let g = 0; g <= 6; g += 0.25) { const d = MF.slopeDensityMul(g, 4.5); if (d > prev + 1e-12) mono = false; prev = d; }
            return mono; })(),
        "25 samples from 0 to 6, each no denser than the last");
    ok("!! maxSlope <= 0 means no slope is acceptable -- refuses rather than dividing by it",
        MF.slopeDensityMul(0, 0) === 0 && MF.slopeDensityMul(0, -1) === 0);
    ok("!! a negative gradMag (should not occur -- gradMag is a magnitude) is still treated as flat, not inverted",
        MF.slopeDensityMul(-3, 4.5) === 1);
}

console.log("\n5. *** THE SHELL PLACEMENT: TWO ROUTES AGREE, THE SAME IDIOM world/planetSurface.js's OWN GATE USES ***");
{
    const spec = PP.planetSpec(7);
    const P = PS.makeSurfaceParams();
    const R = 150;
    const tufts = MF.buildMossShell({ seed: 42, spec, groundRadius: R, dir: [0, 1, 0], patches: 20, maxSlope: 4.5 });
    ok("!! the shell builder produces tufts at all", tufts.length > 5, tufts.length + " tufts");

    let worstRadius = 0, worstNormal = 0;
    for (const t of tufts) {
        const r2 = PS.surfaceRadiusAt(spec, t.dir, { radius: R });
        const n2 = PS.surfaceNormal(spec, t.dir, P);
        worstRadius = Math.max(worstRadius, Math.abs(t.radius - r2));
        const dot = t.normal[0] * n2[0] + t.normal[1] * n2[1] + t.normal[2] * n2[2];
        worstNormal = Math.max(worstNormal, Math.abs(1 - dot));
    }
    ok("!! *** every tuft's radius is EXACTLY the real displaced ground, recomputed independently ***",
        worstRadius < 1e-9, "worst mismatch " + worstRadius.toExponential(2) +
        " -- moss sits on the terrain surfaceRadiusAt() gives, not a shell offset above it (unlike clouds)");
    ok("!! ...and every tuft's orientation is EXACTLY the real surface normal there, recomputed independently",
        worstNormal < 1e-9, "worst dot-product gap " + worstNormal.toExponential(2));

    // clumping property, same measurement as section 2, on the shell's world-space positions this time
    const byPatch = new Map();
    for (const t of tufts) { if (!byPatch.has(t.patchId)) byPatch.set(t.patchId, []); byPatch.get(t.patchId).push(t); }
    const within = [];
    for (const pts of byPatch.values())
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
            within.push(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z));
    const cent = [...byPatch.values()].map((pts) => [
        pts.reduce((s, p) => s + p.x, 0) / pts.length, pts.reduce((s, p) => s + p.y, 0) / pts.length,
        pts.reduce((s, p) => s + p.z, 0) / pts.length]);
    const between = [];
    for (let i = 0; i < cent.length; i++) for (let j = i + 1; j < cent.length; j++)
        between.push(Math.hypot(cent[i][0] - cent[j][0], cent[i][1] - cent[j][1], cent[i][2] - cent[j][2]));
    const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    ok("!! ...and the shell's own patches clump the same way the voxel side's do",
        avg(within) * 5 < avg(between),
        "avg within " + avg(within).toFixed(2) + " vs avg between " + avg(between).toFixed(2));

    ok("...and every tuft stays inside the coverage cone it was asked for",
        tufts.every((t) => Math.acos(Math.max(-1, Math.min(1, t.dir[0] * 0 + t.dir[1] * 1 + t.dir[2] * 0)))
            < 0.55 * 0.55 + 0.55),
        "generous bound: cluster spread and patch-radius jitter both widen it a little past the 0.55 rad cone");
}

console.log("\n6. *** THE SLOPE RULE, MEASURED AGAINST A REAL PLANET RATHER THAN ONLY THE FORMULA ***");
{
    const spec = PP.planetSpec(7), P = PS.makeSurfaceParams();
    const tufts = MF.buildMossShell({ seed: 7, spec, groundRadius: 150, dir: [0, 1, 0], patches: 60, coverage: 1.2, maxSlope: 4.5 });
    // one row per PATCH (not per tuft), since the slope derating happens once per patch
    const patchRows = new Map();
    for (const t of tufts) if (!patchRows.has(t.patchId)) patchRows.set(t.patchId, { gradMag: t.gradMag, densityMul: t.densityMul });
    const rows = [...patchRows.values()].sort((a, b) => a.gradMag - b.gradMag);
    ok("!! densityMul is a non-increasing function of gradMag ACROSS REAL PATCH DATA, not just the formula in isolation",
        rows.every((r, i) => i === 0 || r.densityMul <= rows[i - 1].densityMul + 1e-9),
        rows.length + " real patches on planetSpec(7), sorted by measured slope");
    const lowThird = rows.slice(0, Math.floor(rows.length / 3));
    const highThird = rows.slice(-Math.floor(rows.length / 3));
    const avg = (a) => a.reduce((s, x) => s + x.densityMul, 0) / a.length;
    ok("!! ...and the flattest third of real patches carries strictly more density than the steepest third",
        avg(lowThird) > avg(highThird),
        "flat-third avg " + avg(lowThird).toFixed(3) + " vs steep-third avg " + avg(highThird).toFixed(3));
}

console.log("\n6b. *** MOSS_SPECIES: FOUR REAL SPECIES, AND AN UNRECOGNISED NAME REFUSES ON BOTH TERRAIN KINDS ***");
{
    // v4077 -- Keith: could the follow-on (species/biomes, root/arch) be built. Species is here; root/arch is
    // world/rootArch.js and its own gate. Four keys, not the single "common" v4076 shipped -- the exact scope
    // v4076 named as deliberately NOT built yet.
    const keys = Object.keys(MF.MOSS_SPECIES).sort();
    ok("!! exactly four species, each with the fields both placements read",
        JSON.stringify(keys) === JSON.stringify(["common", "dry", "lush", "pale"]) &&
        keys.every((k) => {
            const s = MF.MOSS_SPECIES[k];
            return Array.isArray(s.patchRadius) && Array.isArray(s.tuftsPerPatch) && Array.isArray(s.tuftScale) &&
                   Array.isArray(s.colTop) && s.colTop.length === 3 && Array.isArray(s.colBot) && s.colBot.length === 3 &&
                   typeof s.vigor === "number" && s.vigor > 0 && s.vigor <= 1;
        }), keys.join(", "));

    ok("!! lush is denser than dry -- the species TABLE, not chance, drives the count difference",
        (() => {
            const accept = () => ({ ok: true, y: 0 });
            const lush = MF.buildMossVoxel({ seed: 5, patches: 20, accept, speciesFor: () => "lush" }).length;
            const dry = MF.buildMossVoxel({ seed: 5, patches: 20, accept, speciesFor: () => "dry" }).length;
            return lush > dry * 3;
        })(), "same seed, same patch count, only the species differs");

    ok("!! ...and each species carries its OWN colour, not a shared palette scaled by a tint scalar",
        (() => {
            const accept = () => ({ ok: true, y: 0 });
            const lush = MF.buildMossVoxel({ seed: 5, patches: 20, accept, speciesFor: () => "lush" })[0];
            const pale = MF.buildMossVoxel({ seed: 5, patches: 20, accept, speciesFor: () => "pale" })[0];
            const spread = (c) => Math.max(...c) - Math.min(...c);
            // pale is a washed-out lichen grey (channels close together); lush is a saturated green -- a real
            // distinguishing property, not an arbitrary one directional check happened to pick.
            return spread(MF.MOSS_SPECIES.lush.colTop) > spread(MF.MOSS_SPECIES.pale.colTop) &&
                   spread(lush.colTop) > spread(pale.colTop);
        })(), "lush is a saturated green (max-min spread " + (Math.max(...MF.MOSS_SPECIES.lush.colTop) - Math.min(...MF.MOSS_SPECIES.lush.colTop)).toFixed(2) +
        "), pale is washed-out lichen grey (spread " + (Math.max(...MF.MOSS_SPECIES.pale.colTop) - Math.min(...MF.MOSS_SPECIES.pale.colTop)).toFixed(2) + ") -- read from MOSS_SPECIES, not derived");

    ok("!! an unrecognised species name grows NOTHING on the voxel side, the same refusal as no `accept` at all",
        MF.buildMossVoxel({ seed: 5, patches: 20, accept: () => ({ ok: true, y: 0 }), speciesFor: () => "nonexistent" }).length === 0);

    const spec = PP.planetSpec(7);
    ok("!! ...and the same refusal holds on the shell placement",
        MF.buildMossShell({ seed: 42, spec, groundRadius: 150, dir: [0, 1, 0], patches: 14, speciesFor: () => "nonexistent" }).length === 0);

    ok("...and the default speciesFor is exactly \"common\" -- v4076's one species, unaffected for a caller that does not ask",
        (() => {
            const accept = () => ({ ok: true, y: 0 });
            const a = MF.buildMossVoxel({ seed: 5, patches: 12, accept });
            const b = MF.buildMossVoxel({ seed: 5, patches: 12, accept, speciesFor: () => "common" });
            return JSON.stringify(a) === JSON.stringify(b);
        })());
}

console.log("\n7. *** THE VOXEL CONSUMER: STONE/DIRT ONLY, SLOPE-DERATED, AND DETERMINISTIC PER LOCATION ***");
{
    const MP = await import(pathToFileURL(path.join(HERE, "mossPatches.js")).href);
    const VOXEL = (await import(pathToFileURL(path.join(ROOT, "world", "voxelFormat.js")).href)).VOXEL;
    const fakeGl = {
        createVertexArray: () => ({}), bindVertexArray: () => {}, deleteVertexArray: () => {},
        createBuffer: () => ({}), bindBuffer: () => {}, bufferData: () => {}, deleteBuffer: () => {},
        enableVertexAttribArray: () => {}, vertexAttribPointer: () => {}, vertexAttribDivisor: () => {},
        createShader: () => ({}), shaderSource: () => {}, compileShader: () => {}, getShaderParameter: () => true,
        createProgram: () => ({}), attachShader: () => {}, linkProgram: () => {}, getProgramParameter: () => true,
        getUniformLocation: () => ({}),
    };
    // flat GRASS strip (-10..10) beside STONE, and a REAL-HEIGHT-BOUNDED hill east of x=30: rises 2 units per
    // x (steep enough to fully derate at maxSlope 1.6) until it caps at y=75, the way an actual mountain in
    // this engine's own PROBE_TOP_Y=80 ceiling would. v4076's first draft of this test rose UNBOUNDED and
    // probed it at x=200, where topY would be 345 -- far above what terrainTopAt() can even see (it scans down
    // from y=80), so the whole region read back as a FALSE PLATEAU at the scan ceiling: flat, not steep, and
    // the test measured its own broken fixture rather than the slope rule. Caught because the result ran
    // backwards (thinner ground read as denser); fixed by testing the rising face itself, inside real bounds.
    const world = {
        voxelAt: (x, y, z) => {
            let topY = Math.min(75, 5 + Math.max(0, x - 30) * 2);
            if (y === topY) return (x >= -10 && x <= 10) ? VOXEL.GRASS : VOXEL.STONE;
            return y < topY ? VOXEL.STONE : 0;
        },
    };
    const mp = new MP.MossPatches(fakeGl, world, { enabled: true, patches: 80, region: 15, maxSlope: 1.6 });
    mp.rebuild(0, 0);
    const flatCount = mp._count;
    ok("!! moss places on flat stone/dirt ground", flatCount > 0, flatCount + " tufts around (0,0)");

    mp.rebuild(0, 0);
    ok("!! the SAME location rebuilds to the SAME count -- a coarse-grid seed hash, not Math.random()",
        mp._count === flatCount, "returned to (0,0): " + mp._count + " both times");

    // ON the rising face itself (x=50: topY=45, well under the 80-unit probe ceiling, gradMag exactly 2 by
    // construction -- above maxSlope 1.6, so every patch here should derate to zero).
    mp.rebuild(50, 0);
    const steepCount = mp._count;
    ok("!! *** moss is markedly thinner on the steep rising face than on flat ground of the same region size ***",
        steepCount < flatCount * 0.5,
        "flat " + flatCount + " vs steep face " + steepCount + " (same region=15, patches=80)");

    // moss must never appear where the CENTRE strip is pure GRASS -- vegetation.js already owns that surface
    const grassWorld = { voxelAt: (x, y, z) => (y === 5 ? VOXEL.GRASS : (y < 5 ? VOXEL.STONE : 0)) };
    const mp2 = new MP.MossPatches(fakeGl, grassWorld, { enabled: true, patches: 60, region: 40 });
    mp2.rebuild(0, 0);
    ok("!! a world that is ENTIRELY grass grows NO moss at all",
        mp2._count === 0, "grass is vegetation.js's surface, not this file's -- 0 tufts confirms no overlap");

    // v4077 -- SPECIES BY REAL BIOME, on world.biomeSeed = 1337 (world/world.js's own default), a flat all-stone
    // world so surface type never confounds the result -- only the biome map decides what grows.
    const { biomeAt } = await import(pathToFileURL(path.join(ROOT, "world", "worleyBiomes.js")).href);
    const flatStoneWorld = { biomeSeed: 1337, voxelAt: (x, y, z) => (y === 5 ? VOXEL.STONE : (y < 5 ? VOXEL.STONE : 0)) };
    const findFarFromBorder = (biomeName) => {
        let best = null, bestMargin = -1;
        for (let x = -3000; x < 3000; x += 23) {
            const b = biomeAt(x, 0, 1337);
            if (b.primary !== biomeName) continue;
            const margin = 1 - 2 * b.blend;   // 1 = cell centre, 0 = right on a border
            if (margin > bestMargin) { bestMargin = margin; best = x; }
        }
        return best;
    };
    const jungleX = findFarFromBorder("jungle"), desertX = findFarFromBorder("desert");
    ok("!! a real jungle location (world.biomeSeed = 1337) grows moss -- lush, per SPECIES_BY_BIOME",
        jungleX !== null && (() => {
            const mp3 = new MP.MossPatches(fakeGl, flatStoneWorld, { enabled: true, patches: 60, region: 15, maxSlope: 50 });
            mp3.rebuild(jungleX, 0);
            return mp3._count > 0;
        })(), "jungle at x=" + jungleX);
    ok("!! *** and a real desert location, DEEP INSIDE THE CELL rather than near a border, grows NONE ***",
        desertX !== null && (() => {
            const mp4 = new MP.MossPatches(fakeGl, flatStoneWorld, { enabled: true, patches: 60, region: 15, maxSlope: 50 });
            mp4.rebuild(desertX, 0);
            return mp4._count === 0;
        })(), "desert at x=" + desertX +
        " -- SPECIES_BY_BIOME.desert is null, the same ecological refusal as bare rock with no moss habitat");
    ok("!! ...and SPECIES_BY_BIOME names all eight real biomes, not a guessed subset",
        JSON.stringify(Object.keys(MP.SPECIES_BY_BIOME).sort()) ===
        JSON.stringify(["desert", "forest", "jungle", "plains", "savanna", "shrubland", "taiga", "tundra"].sort()));
}

console.log("\n8. *** WIRING: ONE GENERATOR, TWO CONSUMERS, NEITHER CARRYING A SECOND COPY ***");
{
    const mainJs = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
    ok("!! main.js imports the voxel consumer rather than a third placement scheme",
        /import \{ MossPatches \}\s*from "\.\/render\/mossPatches\.js"/.test(mainJs));
    ok("!! ...and wires a real window.moss control surface, the same shape as window.vegetation",
        /window\.moss = \{/.test(mainJs) && /mossPatches\.render\(camera/.test(mainJs),
        "on/off/density/rebuild/state, mirroring vegetation's own surface");
    ok("!! ...and honours the graphics-settings toggle, the same source of truth grass uses",
        /mossPatches\.enabled = gfxSettings\.get\("moss"\)/.test(mainJs));
    ok("!! ...and honours a saved off-preference the same way grass does",
        /localStorage\.getItem\("voxelEngine\.moss"\) === "0"/.test(mainJs));

    const gfx = fs.readFileSync(path.join(ROOT, "ui", "graphicsSettings.js"), "utf8");
    ok("!! ui/graphicsSettings.js declares a moss toggle, defaulted on like grass",
        /moss:\s*true,/.test(gfx) && /\["moss",\s*"Moss"/.test(gfx));
    ok("!! ...and every preset states it explicitly rather than leaving it to fall through",
        /grass: false, moss: false/.test(gfx) && /grass: true,\s*moss: true/.test(gfx));

    ok("!! render/mossPatches.js reads the biome from the SAME seed the real terrain was painted with",
        /world\.biomeSeed/.test(mainJs) || /world\.biomeSeed/.test(fs.readFileSync(path.join(ROOT, "render", "mossPatches.js"), "utf8")),
        "aligning to a different seed would give a species map that does not match the ground the player sees");

    const page = fs.readFileSync(path.join(ROOT, "es-box3d-fly3d.html"), "utf8");
    ok("!! es-box3d-fly3d.html builds its moss from the shared generator, not its own placement",
        /import \{ buildMossShell \} from "\/render\/mossField\.js"/.test(page) && /buildMossShell\(\{ spec: planetSpec_/.test(page));
    ok("!! ...and picks a species from the planet's REAL type and latitude, not a fixed one",
        /function mossSpeciesForPlanet\(spec, dir\)/.test(page) &&
        /case "gas": case "molten": return null;/.test(page),
        "gas and molten worlds have no solid biosphere-friendly surface and grow no moss at all");
    ok("!! ...as ONE instanced mesh, not a draw call per tuft",
        /new THREE\.InstancedMesh\(clumpGeo, mat, tufts\.length\)/.test(page));
    ok("!! ...parented under the planet mesh, so tilt AND spin carry it for free",
        /planetMesh\.add\(inst\)/.test(page) && /planetMesh\.remove\(mossDeck\)/.test(page));
    ok("!! ...oriented to the real surface normal, not the planet's radial up",
        /setFromUnitVectors\(up, new THREE\.Vector3\(t\.normal\[0\]/.test(page));
    ok("!! ...and it can be turned OFF, not only built once",
        /window\.swekMoss = \(on\) => \{/.test(page) && /on === false \|\| on === "off"/.test(page));
}

console.log("\n9. *** LIVE: THE PLANET REALLY GROWS MOSS ON THE DISPLACED GROUND, IN A REAL BROWSER ***");
{
    const pw = await import(pathToFileURL(path.join(ROOT, "tools", "ship", "playwrightResolve.mjs")).href);
    const { createRequire } = await import("node:module");
    const rr = pw.resolvePlaywright(createRequire(import.meta.url));
    const skip = pw.browserSkipReason(rr.chromium, rr.from, pw.HEADLESS_SHELL);
    if (skip) {
        console.log("  ----  live checks SKIPPED -- " + skip);
        console.log("  ----  *** A SKIP, NOT A PASS: source cannot show a tuft actually sits on the mesh.");
    } else {
        const http = await import("node:http");
        const srv = http.default.createServer((rq, rs) => {
            const p = decodeURIComponent((rq.url || "/").split("?")[0]);
            const f = path.join(ROOT, p);
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
            await pg.setViewportSize({ width: 700, height: 460 });
            await pg.goto("http://127.0.0.1:" + srv.address().port + "/es-box3d-fly3d.html?seed=7", { waitUntil: "load", timeout: 40000 });
            await pg.waitForTimeout(3500);
            const moss = await pg.evaluate(() => window.swekMossProbe());
            ok("!! a moss deck exists on load, sitting AT the planet's own radius rather than above it",
                moss && moss.deck && moss.count > 5 && Math.abs(moss.minR - 17) < 1 && moss.maxR < 18,
                moss && moss.deck ? moss.count + " tufts, radius " + moss.minR.toFixed(2) + ".." + moss.maxR.toFixed(2) + " on a groundRadius-17 planet" : "no deck");

            await pg.evaluate(() => window.swekMoss(false));
            const off = await pg.evaluate(() => window.swekMossProbe());
            ok("!! ...and it can be taken away entirely", off && off.deck === false, "swekMoss(false) leaves no deck");

            await pg.evaluate(() => window.swekMoss());
            const on2 = await pg.evaluate(() => window.swekMossProbe());
            ok("!! ...and rebuilt on request", on2 && on2.deck && on2.count > 0, on2.deck ? on2.count + " tufts" : "no deck");

            ok("!! ...with zero page errors from any of it", errs.length === 0, errs[0] || "clean");
            await pg.close();

            // v4077 -- SPECIES BY REAL PLANET TYPE, LIVE: seed 7 is terran (confirmed elsewhere in this file),
            // seed 1 ice, seed 2 gas, seed 4 molten -- planetSpec() is deterministic, so these seeds name their
            // types on every run. Gas and molten must show NO deck at all; the two solid types must both show
            // one, and a different one, because their species differ.
            const typeCounts = {};
            for (const [seed, type] of [[7, "terran"], [1, "ice"], [2, "gas"], [4, "molten"]]) {
                const pg2 = await b.newPage();
                const e2 = [];
                pg2.on("pageerror", (e) => e2.push(String(e).slice(0, 200)));
                await pg2.setViewportSize({ width: 700, height: 460 });
                await pg2.goto("http://127.0.0.1:" + srv.address().port + "/es-box3d-fly3d.html?seed=" + seed, { waitUntil: "load", timeout: 40000 });
                await pg2.waitForTimeout(3000);
                const m = await pg2.evaluate(() => window.swekMossProbe());
                typeCounts[type] = { deck: !!(m && m.deck), count: m && m.deck ? m.count : 0, errs: e2.length };
                await pg2.close();
            }
            ok("!! *** gas and molten planets grow NO moss at all -- no solid biosphere-friendly surface ***",
                typeCounts.gas.deck === false && typeCounts.molten.deck === false,
                JSON.stringify(typeCounts));
            ok("!! ...while terran and ice BOTH grow moss, with real decks on the real displaced ground",
                typeCounts.terran.deck && typeCounts.terran.count > 0 && typeCounts.ice.deck && typeCounts.ice.count > 0,
                "terran " + typeCounts.terran.count + " tufts, ice " + typeCounts.ice.count + " tufts");
            ok("...and none of the four seeds threw a page error",
                Object.values(typeCounts).every((t) => t.errs === 0));
        } finally { await b.close(); await new Promise((x) => srv.close(x)); }
    }
}

console.log("\n10. *** LIVE: THE VOXEL ENGINE BOOTS CLEAN WITH MOSS WIRED IN -- SCOPE STATED HONESTLY ***");
{
    // v4076 -- WHAT THIS DOES NOT CLAIM. A live check that moss tufts actually appear on the real running
    // voxel engine would need the world to have streamed real terrain in around the camera first -- and
    // measured here, render/vegetation.js's OWN grass shows the identical zero-count symptom under the same
    // ad hoc boot, in the same headless run, at the same camera position. Driving this engine into an active
    // streamed-terrain state is a harness vegetation.js has never had built for it either, and inventing one
    // FOR MOSS ALONE would be testing an unrelated gap in an existing, shipped feature under this feature's
    // name. What IS checked here, honestly: the page boots with zero errors and window.moss exists in the
    // correct default state, which is exactly the level section 9's planet check exceeds -- because the
    // planet page's own moss build runs at page-init time regardless of camera streaming, and the voxel
    // consumer's does not.
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
            const state = await pg.evaluate(() => (window.moss ? window.moss.state() : null));
            ok("!! index.html boots with window.moss present, enabled by default, with zero page errors",
                state && state.enabled === true && errs.length === 0,
                state ? JSON.stringify(state) : "window.moss missing" + (errs.length ? "; errors: " + errs[0] : ""));
            const rebuilt = await pg.evaluate(() => { window.moss.rebuild(); return window.moss.state(); });
            ok("!! ...and rebuild()/on()/off()/density() all run without throwing",
                rebuilt && typeof rebuilt.count === "number", JSON.stringify(rebuilt));
        } finally { await b.close(); await new Promise((x) => srv.close(x)); }
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
if (fails) process.exit(1);
