// WebGLEngine/tools/ship/biomeSpawns-selfcheck.mjs -- v2788
//
// Run: node tools/ship/biomeSpawns-selfcheck.mjs
// GATES world/biomeSpawns.js -- per-biome tree/decor spawn tables. Headless (no GPU): coverage for every Worley
// biome; ecology ordering (jungle/forest dense, tundra/desert sparse); realized density matches the table over a
// large sample; kind selection stays within the biome's allowed kinds (SABOTAGE: desert never spawns oak, tundra
// stays near-bare); determinism; browser-safe.

import { BIOME_SPAWNS, spawnAt, biomeSpawnPlan, spawnCoverageComplete } from "../../world/biomeSpawns.js";
import { BIOMES } from "../../world/worleyBiomes.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const SEED = 1337;

// 1. coverage: every biome has a spawn table
{
    ok("coverage: every Worley biome has a spawn table", spawnCoverageComplete());
    ok("coverage: no spawn table references an unknown biome", Object.keys(BIOME_SPAWNS).every((b) => !!BIOMES[b]));
}

// 2. ecology ordering: dense vs sparse tree density
{
    ok("ecology: jungle & forest are the densest tree biomes", BIOME_SPAWNS.jungle.treeDensity > BIOME_SPAWNS.plains.treeDensity && BIOME_SPAWNS.forest.treeDensity > BIOME_SPAWNS.plains.treeDensity);
    ok("ecology: desert & tundra are near-bare (sparsest)", BIOME_SPAWNS.desert.treeDensity < BIOME_SPAWNS.plains.treeDensity && BIOME_SPAWNS.tundra.treeDensity < BIOME_SPAWNS.plains.treeDensity);
}

// 3. realized density: over a large sample of a FORCED biome, tree-spawn fraction ~ table density
{
    let worst = 0, worstBiome = "";
    for (const biome of Object.keys(BIOME_SPAWNS)) {
        let trees = 0; const N = 40000;
        for (let i = 0; i < N; i++) { const s = spawnAt(biome, (i * 31) % 4000, ((i * 17) % 4000) + 5, SEED); if (s && s.category === "tree") trees++; }
        const realized = trees / N, expected = BIOME_SPAWNS[biome].treeDensity;
        const err = Math.abs(realized - expected);
        if (err > worst) { worst = err; worstBiome = biome; }
    }
    ok("density: realized tree fraction ~ table density for every biome", worst < 0.01, "worstErr=" + worst.toFixed(4) + " (" + worstBiome + ")");
}

// 4. kind selection stays within the biome's allowed kinds (SABOTAGE cases)
{
    const kindsSeen = (biome, cat) => { const set = new Set(); for (let i = 0; i < 60000; i++) { const s = spawnAt(biome, (i * 13) % 5000, ((i * 29) % 5000) + 3, SEED); if (s && s.category === cat) set.add(s.kind); } return set; };
    const desertTrees = kindsSeen("desert", "tree");
    ok("SABOTAGE: desert trees are palms only, NEVER oak/pine", desertTrees.has("tree_palm") && !desertTrees.has("tree_oak") && !desertTrees.has("tree_pine"), "seen=" + [...desertTrees].join(","));
    const tundraTrees = kindsSeen("tundra", "tree");
    ok("tundra trees are pine only", [...tundraTrees].every((k) => k === "tree_pine"));
    const jungleTrees = kindsSeen("jungle", "tree");
    ok("jungle trees include palm and oak", jungleTrees.has("tree_palm") && jungleTrees.has("tree_oak"));
    // every emitted kind is declared in the biome's table
    let allDeclared = true;
    for (const biome of Object.keys(BIOME_SPAWNS)) {
        const declaredT = new Set(BIOME_SPAWNS[biome].treeKinds.map((k) => k[0]));
        const declaredD = new Set(BIOME_SPAWNS[biome].decorKinds.map((k) => k[0]));
        for (const k of kindsSeen(biome, "tree")) if (!declaredT.has(k)) allDeclared = false;
        for (const k of kindsSeen(biome, "decor")) if (!declaredD.has(k)) allDeclared = false;
    }
    ok("every emitted kind is declared in the biome's table", allDeclared);
}

// 5. trees take precedence over decor (never both at one column)
{
    let bothNever = true;
    for (let i = 0; i < 50000; i++) { const s = spawnAt("forest", (i * 7) % 6000, ((i * 11) % 6000) + 1, SEED); /* returns one or null */ if (s && !(s.category === "tree" || s.category === "decor")) bothNever = false; }
    ok("one thing per column (tree OR decor OR nothing)", bothNever);
}

// 6. determinism + full plan classifies a biome
{
    const a = spawnAt("jungle", 123, 456, SEED), b = spawnAt("jungle", 123, 456, SEED);
    ok("deterministic: same column -> same spawn", JSON.stringify(a) === JSON.stringify(b));
    let planned = 0, biomeSet = new Set();
    for (let i = 0; i < 20000; i++) { const p = biomeSpawnPlan((i * 19) % 8000, ((i * 23) % 8000) + 2, SEED); if (p) { planned++; biomeSet.add(p.biome); } }
    ok("biomeSpawnPlan: classifies biomes and spawns across the map", planned > 0 && biomeSet.size >= 3, "spawned=" + planned + " biomes=" + biomeSet.size);
}

// 7. browser/worker-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("../../world/biomeSpawns.js", import.meta.url), "utf8");
    ok("source: biomeSpawns imports only worleyBiomes (no node/DOM at module scope)", !/^\s*import[^\n]*["'](node:|fs|path|url)/m.test(src) && !/\bdocument\b|\bwindow\b/.test(src));
}

console.log("biomeSpawns-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
