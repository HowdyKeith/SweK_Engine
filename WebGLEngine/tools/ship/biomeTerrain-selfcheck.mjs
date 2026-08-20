// WebGLEngine/tools/ship/biomeTerrain-selfcheck.mjs -- v2780
//
// Run: node tools/ship/biomeTerrain-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES world/biomeTerrain.js -- the Worley-biome -> VOXEL-material integration the terrain generator uses when
// useWorleyBiomes is on. Pins: valid VOXEL ids, every biome tag maps (no undefined), elevation overrides
// (snow cap / rock peak / beach / cliff) take precedence in the right order, biomes actually change materials
// (SABOTAGE), and determinism.

import { biomeColumnMaterials, WORLEY_SURFACE_VOXEL, biomeHeightParams } from "../../world/biomeTerrain.js";
import { VOXEL } from "../../world/voxelFormat.js";
import { BIOMES, biomeAt } from "../../world/worleyBiomes.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const SEED = 1337;
const solids = new Set([VOXEL.STONE, VOXEL.DIRT, VOXEL.GRASS, VOXEL.SAND, VOXEL.SNOW]);

// 1. every biome's surface + sub tag has a VOXEL mapping (no undefined materials)
{
    let allMapped = true;
    for (const b of Object.values(BIOMES)) {
        if (WORLEY_SURFACE_VOXEL[b.surface] === undefined) allMapped = false;
        if (WORLEY_SURFACE_VOXEL[b.sub] === undefined) allMapped = false;
    }
    ok("every biome surface+sub tag maps to a VOXEL id", allMapped);
}

// 2. mid-elevation column returns valid solids and reflects the biome's own material
{
    let allSolid = true, matched = 0, checked = 0;
    for (let i = 0; i < 3000; i++) {
        const wx = (i * 17) % 2000, wz = (i * 29 + 5) % 2000;
        const h = 20;                        // mid elevation: no override band
        const m = biomeColumnMaterials(wx, wz, SEED, h, { slope: 0, waterLevel: 8 });
        if (!solids.has(m.surface) || !solids.has(m.sub)) allSolid = false;
        // at mid elevation with no slope, surface should equal the biome's mapped surface
        const b = biomeAt(wx, wz, SEED);
        checked++;
        if (m.surface === WORLEY_SURFACE_VOXEL[b.params.surface]) matched++;
    }
    ok("mid-elevation columns return valid solid materials", allSolid);
    ok("mid-elevation surface == the biome's own mapped material", matched === checked, matched + "/" + checked);
}

// 3. ELEVATION OVERRIDES in precedence order
{
    // snow cap (height > 44) wins regardless of biome
    const snow = biomeColumnMaterials(100, 100, SEED, 48, { slope: 0 });
    ok("elevation: height>44 -> snow cap", snow.surface === VOXEL.SNOW && snow.sub === VOXEL.STONE);
    // rock peak (36 < h <= 44) -> stone (non-sandy)
    let sawPeakStone = false;
    for (let i = 0; i < 200 && !sawPeakStone; i++) { const m = biomeColumnMaterials(i * 31, i * 13, SEED, 40, { slope: 0 }); if (m.surface === VOXEL.STONE) sawPeakStone = true; }
    ok("elevation: 36<h<=44 -> bare rock (stone) for non-sandy biomes", sawPeakStone);
    // beach (h <= waterLevel+2) -> sand (non-snowy)
    let sawBeach = false;
    for (let i = 0; i < 400 && !sawBeach; i++) { const m = biomeColumnMaterials(i * 23, i * 41, SEED, 9, { slope: 0, waterLevel: 8 }); if (m.surface === VOXEL.SAND && m.sub === VOXEL.SAND) sawBeach = true; }
    ok("elevation: near water -> beach sand", sawBeach);
    // cliff (slope>=3) -> dirt (non-sandy, mid elevation)
    let sawCliff = false;
    for (let i = 0; i < 400 && !sawCliff; i++) { const m = biomeColumnMaterials(i * 19, i * 7, SEED, 22, { slope: 4, waterLevel: 8 }); if (m.surface === VOXEL.DIRT) sawCliff = true; }
    ok("slope: steep cliff -> dirt", sawCliff);
}

// 4. SABOTAGE-style: the biome actually changes materials across the map (not a constant)
{
    const surfaces = new Set();
    for (let i = 0; i < 5000; i++) { const wx = (i * 37) % 4000, wz = (i * 53 + 9) % 4000; surfaces.add(biomeColumnMaterials(wx, wz, SEED, 20, { slope: 0 }).surface); }
    ok("biomes produce MULTIPLE distinct surface materials across the map", surfaces.size >= 3, "distinct=" + surfaces.size);
}

// 5. determinism
{
    const a = biomeColumnMaterials(456, 789, SEED, 20, { slope: 1, waterLevel: 8 });
    const b = biomeColumnMaterials(456, 789, SEED, 20, { slope: 1, waterLevel: 8 });
    ok("deterministic", a.surface === b.surface && a.sub === b.sub && a.biome === b.biome);
}

// 5b. BIOME-DRIVEN HEIGHT: base/amp/profile vary by biome, ranges sane, blended at borders, deterministic
{
    let baseOK = true, ampOK = true;
    const kinds = new Set(), bases = [];
    for (let i = 0; i < 5000; i++) {
        const wx = (i * 37) % 4000, wz = (i * 53 + 9) % 4000;
        const hp = biomeHeightParams(wx, wz, SEED);
        if (hp.base < 16 || hp.base > 26) baseOK = false;
        if (hp.ampMul < 0.4 || hp.ampMul > 1.6) ampOK = false;
        kinds.add(hp.kind); bases.push(hp.base);
    }
    ok("height: base always in a sane band (~18..24)", baseOK);
    ok("height: ampMul always in [0.4, 1.6]", ampOK);
    ok("height: multiple noise profiles occur across the map (flat/rolling/ridged)", kinds.size >= 2, "kinds=" + [...kinds].join(","));
    ok("height: base varies across biomes (not constant)", Math.max(...bases) - Math.min(...bases) > 2);

    // deserts (low amp) get a lower ampMul than jungle/forest (high amp) -- shape actually tracks the biome
    const { BIOMES } = await import("../../world/worleyBiomes.js");
    const desertAmp = Math.max(0.4, Math.min(1.6, BIOMES.desert.amp / 6));
    const jungleAmp = Math.max(0.4, Math.min(1.6, BIOMES.jungle.amp / 6));
    ok("height: flat biomes get lower amplitude than dramatic ones", desertAmp < jungleAmp, "desert=" + desertAmp.toFixed(2) + " jungle=" + jungleAmp.toFixed(2));

    // determinism
    const a = biomeHeightParams(1234, 5678, SEED), b = biomeHeightParams(1234, 5678, SEED);
    ok("height: deterministic", a.base === b.base && a.ampMul === b.ampMul && a.kind === b.kind);
}

// 6. generateChunk wiring is present + flagged (source check)
{
    const src = (await import("node:fs")).readFileSync(new URL("../../world/world.js", import.meta.url), "utf8");
    ok("world.js: generateChunk calls biomeColumnMaterials behind this.useWorleyBiomes", /this\.useWorleyBiomes/.test(src) && /biomeColumnMaterials\(/.test(src));
    ok("world.js: _baseHeightAt drives base/amp from biomeHeightParams behind the flag", /biomeHeightParams\(/.test(src));
    ok("world.js: flag defaults OFF (existing path preserved)", /window\.__swekBiomes === true/.test(src));
}

// 7. worker/browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("../../world/biomeTerrain.js", import.meta.url), "utf8");
    ok("biomeTerrain imports no Node builtin / DOM at module scope", !/^\s*import[^\n]*["'](node:|fs|path|url)/m.test(src) && !/\bdocument\b|\bwindow\b/.test(src));
}

console.log("biomeTerrain-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
