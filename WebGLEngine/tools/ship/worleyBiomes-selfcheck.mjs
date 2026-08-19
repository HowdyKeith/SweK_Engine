// WebGLEngine/tools/ship/worleyBiomes-selfcheck.mjs -- v2779
//
// Run: node tools/ship/worleyBiomes-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES world/worleyBiomes.js. Pins the three things Keith asked for: (1) Worley cells give a valid nearest/
// second-nearest with a real border signal; (2) 2-AXIS classification -- BOTH heat and moisture change the
// biome (the old map was single-axis; SABOTAGE proves moisture matters); (3) border BLENDING is in range,
// pure inside cells, and mixes at borders. Plus determinism and the Uint8 heat field.

import { worley, classify, biomeAt, biomeForCell, cellClimate, BIOMES, biomeHeatField } from "../../world/worleyBiomes.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const SEED = 1337;

// 1. WORLEY invariants over a sweep
{
    let f1leF2 = true, sawBorder = false, sawInterior = false;
    for (let i = 0; i < 4000; i++) {
        const x = (i * 13.7) % 900, z = (i * 7.3) % 900;
        const w = worley(x, z, SEED);
        if (w.f1 > w.f2 + 1e-9) f1leF2 = false;
        if (w.f2 - w.f1 < 3) sawBorder = true;         // close to a Voronoi edge
        if (w.f2 - w.f1 > 25) sawInterior = true;      // deep inside a cell
    }
    ok("worley: f1 <= f2 everywhere", f1leF2);
    ok("worley: sweep sees both cell borders and interiors", sawBorder && sawInterior);
    const wa = worley(123.4, 56.7, SEED), wb = worley(123.4, 56.7, SEED);
    ok("worley: deterministic (same x,z,seed -> same cell)", wa.id1 === wb.id1 && wa.f1 === wb.f1);
}

// 2. CLASSIFY: total coverage + known Whittaker corners
{
    let covered = true;
    for (let h = 0; h <= 1.0001; h += 0.05) for (let m = 0; m <= 1.0001; m += 0.05) if (!BIOMES[classify(h, m)]) covered = false;
    ok("classify: every (heat,moisture) maps to a defined biome", covered);
    ok("classify: cold+dry -> tundra", classify(0.1, 0.1) === "tundra");
    ok("classify: cold+wet -> taiga", classify(0.1, 0.9) === "taiga");
    ok("classify: hot+dry -> desert", classify(0.9, 0.1) === "desert");
    ok("classify: hot+wet -> jungle", classify(0.9, 0.9) === "jungle");
    ok("classify: temperate mid -> plains", classify(0.4, 0.5) === "plains");
}

// 3. 2-AXIS: BOTH axes matter (the upgrade over single-axis banding)
{
    // moisture matters: same heat, dry vs wet -> different biome
    let moistureMatters = false;
    for (let h = 0.05; h < 1; h += 0.1) if (classify(h, 0.1) !== classify(h, 0.9)) moistureMatters = true;
    ok("SABOTAGE guard: moisture changes the biome (not single-axis)", moistureMatters);
    // heat matters: same moisture, cold vs hot -> different biome
    let heatMatters = false;
    for (let m = 0.05; m < 1; m += 0.1) if (classify(0.1, m) !== classify(0.9, m)) heatMatters = true;
    ok("heat changes the biome", heatMatters);
}

// 4. BLEND: range, pure interior, mixing at borders, monotone in (f2-f1)
{
    let inRange = true, sawPure = false, sawMix = false;
    for (let i = 0; i < 6000; i++) {
        const x = (i * 11.1) % 1200, z = (i * 4.9 + 3) % 1200;
        const b = biomeAt(x, z, SEED);
        if (b.blend < -1e-9 || b.blend > 0.5 + 1e-9) inRange = false;
        if (b.blend < 0.02) sawPure = true;
        if (b.blend > 0.35) sawMix = true;
    }
    ok("blend: always in [0, 0.5]", inRange);
    ok("blend: cell interiors are ~pure (blend~0) and borders mix (blend>0.35)", sawPure && sawMix);
    // params at a pure-interior point equal the primary biome exactly
    let pure = null;
    for (let i = 0; i < 6000 && !pure; i++) { const x = (i * 11.1) % 1200, z = (i * 4.9 + 3) % 1200; const b = biomeAt(x, z, SEED); if (b.blend < 1e-6) pure = b; }
    ok("blend: at a pure interior, params == primary biome params", pure && Math.abs(pure.params.baseH - BIOMES[pure.primary].baseH) < 1e-6 && Math.abs(pure.params.color[1] - BIOMES[pure.primary].color[1]) < 1e-6);
}

// 5. biomeAt determinism + blended params are a convex combination of the two biomes
{
    const a = biomeAt(321.5, 88.2, SEED), b = biomeAt(321.5, 88.2, SEED);
    ok("biomeAt: deterministic", a.primary === b.primary && a.blend === b.blend);
    // find a genuinely blended sample and check baseH lies between the two biomes
    let mix = null;
    for (let i = 0; i < 8000 && !mix; i++) { const x = (i * 9.3) % 1500, z = (i * 6.1 + 2) % 1500; const s = biomeAt(x, z, SEED); if (s.blend > 0.1 && s.primary !== s.secondary) mix = s; }
    if (mix) {
        const lo = Math.min(BIOMES[mix.primary].baseH, BIOMES[mix.secondary].baseH);
        const hi = Math.max(BIOMES[mix.primary].baseH, BIOMES[mix.secondary].baseH);
        ok("blend: blended baseH lies between the two biomes", mix.params.baseH >= lo - 1e-6 && mix.params.baseH <= hi + 1e-6, mix.primary + "/" + mix.secondary + " baseH=" + mix.params.baseH.toFixed(2));
    } else ok("blend: found a blended two-biome sample", false);
}

// 6. HEAT FIELD (the Uint8 "TinyVec"): typed array, right size, range, deterministic
{
    const size = 16;
    const hf = biomeHeatField(2, -3, size, SEED);
    ok("heatField: is a Uint8Array (the JS 'TinyVec' for heat)", hf instanceof Uint8Array);
    ok("heatField: length == size*size (one byte per column)", hf.length === size * size);
    let rangeOK = true; for (const v of hf) if (v < 0 || v > 255) rangeOK = false;
    ok("heatField: all values in 0..255", rangeOK);
    const hf2 = biomeHeatField(2, -3, size, SEED);
    ok("heatField: deterministic", hf.every((v, i) => v === hf2[i]));
}

// 7. browser/worker-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("../../world/worleyBiomes.js", import.meta.url), "utf8");
    ok("source: worleyBiomes imports no Node builtin / DOM at module scope", !/^\s*import/m.test(src) && !/\bdocument\b|\bwindow\b/.test(src));
}

console.log("worleyBiomes-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
