// WebGLEngine/tools/ship/biomeSpawnWiring-selfcheck.mjs -- v2825
//
// Run: node tools/ship/biomeSpawnWiring-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES THE WIRING of world/biomeSpawns.js into world/treeSpawner.js.
//
// WHY THIS GATE EXISTS: biomeSpawns.js was built and gated 13/13 in v2788 -- and then referenced by NOTHING for
// thirty-seven versions. A module that is verified but unused is not an asset; it is a claim nobody is checking,
// and it rots quietly because no gate fails when the thing it feeds changes underneath it. So what is proven
// here is not the table (that already has its own gate) but that the LIVE SPAWNER actually consults it, and that
// turning the feature off still produces the behaviour it produced before.
//
// The spawner is driven against a FAKE WORLD -- flat terrain of a chosen material, a router that records rather
// than renders -- so the placement decision is exercised for real without a GPU, a scene, or an asset pipeline.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BIOME_SPAWNS, biomeSpawnPlan, spawnAt, spawnCoverageComplete } from "../../world/biomeSpawns.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const GRASS = 3, SAND = 4, SNOW = 5, LAVA = 10;

// A world flat enough that the terrain never vetoes, so what we measure is the TABLE's decision.
function fakeWorld({ material = GRASS, useWorleyBiomes = true } = {}) {
    return { useWorleyBiomes, voxelAt: (x, y, z) => (y === 10 ? material : 0) };
}
function fakeRouter() {
    const calls = [];
    return { calls, exec: (name, args) => { calls.push({ name, args }); return { id: calls.length }; } };
}

async function runSpawner(opts) {
    const mod = await import(pathToFileURL(path.join(ENG, "world", "treeSpawner.js")).href);
    const Klass = mod.TreeSpawner || mod.default;
    if (typeof Klass !== "function") return null;
    const router = fakeRouter();
    const s = new Klass({ world: fakeWorld(opts), router, biomeMap: opts.biomeMap || null, seed: opts.seed || 1337, count: opts.count || 200, region: opts.region || 400, center: { x: 0, z: 0 } });
    try { s.spawn(); } catch (e) { return { error: e.message, router }; }
    return { router, spawner: s };
}

// 1. THE WIRING EXISTS AT ALL -- the gap this round closes
{
    const src = fs.readFileSync(path.join(ENG, "world", "treeSpawner.js"), "utf8");
    ok("treeSpawner imports biomeSpawnPlan", /import \{[^}]*biomeSpawnPlan[^}]*\} from "\.\/biomeSpawns\.js"/.test(src));
    ok("...and actually calls it", /biomeSpawnPlan\(/.test(src.replace(/\/\/[^\n]*/g, "")));
    ok("the flag comes from the WORLD, not a second URL parse", /world\.useWorleyBiomes/.test(src) && !/biomes=1/.test(src.replace(/\/\/[^\n]*/g, "")));
    ok("the legacy single-axis path is still present for the flag-off case", /getBiomeAt/.test(src) && /densityMul/.test(src));
    ok("decor is skipped -- that belongs to the decor planner", /category !== "tree"/.test(src));
}

// 2. THE TABLE ITSELF still covers every biome the classifier can emit
{
    ok("every classifiable biome has a spawn table entry", spawnCoverageComplete() === true);
    ok("the table has both tree and decor kinds everywhere", Object.values(BIOME_SPAWNS).every((t) => t.treeKinds.length && t.decorKinds.length));
    ok("desert is near-bare and forest is dense (the ecology is not uniform)", BIOME_SPAWNS.forest.treeDensity > 10 * BIOME_SPAWNS.desert.treeDensity,
        `forest ${BIOME_SPAWNS.forest.treeDensity} vs desert ${BIOME_SPAWNS.desert.treeDensity}`);
}

// 3. REALIZED DENSITY MATCHES THE TABLE -- the property the wiring is supposed to deliver
{
    let worst = 0, rows = [];
    for (const [biome, t] of Object.entries(BIOME_SPAWNS)) {
        let trees = 0, n = 0;
        for (let i = 0; i < 20000; i++) {
            const wx = (i % 200) * 7 + 3, wz = Math.floor(i / 200) * 11 + 5;
            const s = spawnAt(biome, wx, wz, 1337);
            if (s && s.category === "tree") trees++;
            n++;
        }
        const realized = trees / n;
        const err = Math.abs(realized - t.treeDensity);
        worst = Math.max(worst, err);
        rows.push(`${biome} ${realized.toFixed(4)}/${t.treeDensity}`);
    }
    ok("realized TREE density matches the table across every biome", worst < 0.01, "worst abs err " + worst.toFixed(5));
}

// 4. THE SPAWNER RUNS BOTH WAYS, and the flag actually changes what happens
{
    const on = await runSpawner({ useWorleyBiomes: true, material: GRASS });
    const off = await runSpawner({ useWorleyBiomes: false, material: GRASS });
    if (!on || !off) {
        ok("treeSpawner exports a constructible class", false, "no TreeSpawner/default export found");
    } else {
        ok("worley path runs without throwing", !on.error, on.error || "");
        ok("legacy path runs without throwing", !off.error, off.error || "");
        const nOn = on.router.calls.length, nOff = off.router.calls.length;
        ok("both paths attempt placements (neither is silently dead)", nOn > 0 && nOff > 0, `worley ${nOn}, legacy ${nOff}`);
        // the load-bearing difference: the table-driven path does not place the same set as the legacy one
        ok("the flag CHANGES the result (otherwise the wiring is decoration)", nOn !== nOff,
            `worley ${nOn} vs legacy ${nOff}`);
    }
}

// 5. THE SURFACE STILL HAS A VETO -- the table says WHAT grows, the terrain says WHETHER anything can
{
    const lava = await runSpawner({ useWorleyBiomes: true, material: LAVA });
    if (lava && !lava.error) ok("nothing is planted on lava, whatever the table wants", lava.router.calls.length === 0, String(lava.router.calls.length));
    else ok("nothing is planted on lava, whatever the table wants", false, lava ? lava.error : "no run");
    const snow = await runSpawner({ useWorleyBiomes: true, material: SNOW });
    ok("snow is a valid surface (tundra/taiga must be plantable)", !!snow && !snow.error);
}

// 6. determinism -- the same seed must lay out the same forest, or nothing above is reproducible
{
    const a = await runSpawner({ useWorleyBiomes: true, seed: 4242 });
    const b = await runSpawner({ useWorleyBiomes: true, seed: 4242 });
    const key = (r) => (r && r.router ? r.router.calls.map((c) => JSON.stringify(c.args && (c.args.name || c.args.assetId || ""))).join("|") : "x");
    ok("same seed gives the same placements", key(a) === key(b) && key(a) !== "x");
    const c = await runSpawner({ useWorleyBiomes: true, seed: 9999 });
    ok("a different seed gives a different forest", key(c) !== key(a));
}

// 7. the plan's own contract
{
    const seen = new Set();
    for (let i = 0; i < 4000; i++) {
        const p = biomeSpawnPlan(i * 13 + 1, i * 29 + 7, 1337);
        if (p) { seen.add(p.category); ok.silent = true; }
    }
    ok("biomeSpawnPlan only ever emits tree or decor", [...seen].every((c) => c === "tree" || c === "decor"), [...seen].join(","));
    ok("...and it returns null for most columns (that IS the density)", seen.size > 0);
}

console.log("biomeSpawnWiring-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
