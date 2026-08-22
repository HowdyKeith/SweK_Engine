// WebGLEngine/tools/ship/biomeDecorWiring-selfcheck.mjs -- v2830
//
// Run: node tools/ship/biomeDecorWiring-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the DECOR half of world/biomeSpawns.js reaching the live planner.
//
// v2825 wired the TREE half into treeSpawner and flagged that the decor half was still consumed by nothing --
// every {category:"decor"} plan the table produced was discarded. This closes that, and the interesting part is
// HOW: worker/biomeDecorPlanner.worker.js is a MODULE worker, so the table could be IMPORTED rather than copied.
// It already carries an inline BIOME_RULES table of its own, and a second table describing the same thing drifts
// until the two disagree about the world. One source for the Worley path; the legacy path untouched.
//
// The classifier switches WITH the table, deliberately. biomeSpawnPlan classifies using the same Worley
// classifier the terrain HEIGHT uses when the flag is on, so decor and landscape agree about where a desert is.
// Mixing the Worley table with the single-axis classifier would scatter palms across tundra -- which is exactly
// the kind of wrong that looks fine in a screenshot.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BIOME_SPAWNS, biomeSpawnPlan } from "../../world/biomeSpawns.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const workerSrc = fs.readFileSync(path.join(ENG, "worker", "biomeDecorPlanner.worker.js"), "utf8");
const poolSrc = fs.readFileSync(path.join(ENG, "world", "biomeDecorPool.js"), "utf8");
const code = workerSrc.replace(/\/\/[^\n]*/g, "");     // strip comments before asserting about CODE

// 1. THE WIRING EXISTS -- the gap v2825 flagged
{
    ok("the worker IMPORTS the table rather than copying it", /import \{[^}]*biomeSpawnPlan[^}]*\} from "\.\.\/world\/biomeSpawns\.js"/.test(workerSrc));
    ok("...and actually calls it", /biomeSpawnPlan\(/.test(code));
    ok("the pool passes the world's flag through", /useWorley:\s*!!\(this\.world/.test(poolSrc));
    ok("the worker accepts it, defaulting OFF so an unaware caller keeps the old behaviour", /useWorley\s*=\s*false/.test(code));
    ok("the legacy inline rules survive for the flag-off path", /BIOME_RULES\[/.test(code) && /_effectiveBiome\(/.test(code));
}

// 2. THE WORKER IS A MODULE WORKER -- which is what makes importing legal rather than a hopeful guess
{
    ok("biomeDecorPool constructs it with { type: \"module\" }", /type:\s*"module"/.test(poolSrc));
    const mesher = fs.readFileSync(path.join(ENG, "worker", "chunkMesher.worker.js"), "utf8");
    ok("...and another worker in this tree already imports, so the pattern is precedented", /^import /m.test(mesher));
}

// 3. THE KIND VOCABULARIES MUST AGREE, or a placement is silently dropped
{
    const m = workerSrc.match(/const KINDS = \[([^\]]+)\]/);
    const kinds = m ? m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")) : [];
    ok("the worker declares an encodable kind list", kinds.length >= 5, kinds.join(","));
    const tableKinds = new Set();
    for (const t of Object.values(BIOME_SPAWNS)) for (const [k] of t.decorKinds) tableKinds.add(k);
    const missing = [...tableKinds].filter((k) => !kinds.includes(k));
    ok("EVERY decor kind the table can emit is encodable by the worker", missing.length === 0,
        missing.length ? "worker cannot encode: " + missing.join(",") : [...tableKinds].join(","));
    ok("an unencodable kind is SKIPPED rather than guessed at", /kindIdx < 0\) continue/.test(code));
}

// 4. THE DECODE TABLES TRAVEL WITH THE DATA -- which is what makes swapping the table safe
{
    ok("the worker posts back the biome list that ACTUALLY produced the records", /biomes:\s*useWorley \? WORLEY_BIOMES : BIOMES/.test(code));
    ok("...and its kind list too", /kinds:\s*KINDS/.test(code));
}

// 5. THE TABLE'S DECOR HALF IS REAL AND NOT UNIFORM -- otherwise wiring it changes nothing visible
{
    ok("every biome declares decor kinds", Object.values(BIOME_SPAWNS).every((t) => t.decorKinds.length > 0));
    const densities = Object.values(BIOME_SPAWNS).map((t) => t.decorDensity);
    ok("decor density VARIES by biome (an ecology, not a constant)", Math.max(...densities) > 1.4 * Math.min(...densities),
        `${Math.min(...densities)} .. ${Math.max(...densities)}`);
    // desert should carry obelisks; tundra should not
    ok("the table is biome-appropriate (desert has obelisks, tundra does not)",
        BIOME_SPAWNS.desert.decorKinds.some(([k]) => k === "obelisk") && !BIOME_SPAWNS.tundra.decorKinds.some(([k]) => k === "obelisk"));
}

// 6. REALIZED DECOR DENSITY matches the table -- the property the wiring is meant to deliver
{
    let worst = 0, rows = [];
    for (const [biome, t] of Object.entries(BIOME_SPAWNS)) {
        let decor = 0, n = 0;
        for (let i = 0; i < 20000; i++) {
            const wx = (i % 200) * 7 + 3, wz = Math.floor(i / 200) * 11 + 5;
            const plan = biomeSpawnPlan(wx, wz, 1337);
            if (plan && plan.biome === biome) { n++; if (plan.category === "decor") decor++; }
        }
        if (n > 200) { rows.push(`${biome} n=${n}`); }
    }
    // sample the table function directly rather than the classifier-weighted mix
    const { spawnAt } = await import("../../world/biomeSpawns.js");
    for (const [biome, t] of Object.entries(BIOME_SPAWNS)) {
        let decor = 0;
        const N = 20000;
        for (let i = 0; i < N; i++) {
            const s = spawnAt(biome, (i % 200) * 7 + 3, Math.floor(i / 200) * 11 + 5, 1337);
            if (s && s.category === "decor") decor++;
        }
        // decor is rolled only when the tree roll misses, so expected = decorDensity * (1 - treeDensity)
        const expected = t.decorDensity * (1 - t.treeDensity);
        worst = Math.max(worst, Math.abs(decor / N - expected));
    }
    ok("realized DECOR density matches the table (allowing that trees are rolled first)", worst < 0.01, "worst abs err " + worst.toFixed(5));
}

// 7. worker-safety: the imported chain must not drag in node or DOM
{
    const spawns = fs.readFileSync(path.join(ENG, "world", "biomeSpawns.js"), "utf8");
    ok("biomeSpawns imports nothing but its classifier", (spawns.match(/^\s*import .*/gm) || []).every((l) => /worleyBiomes/.test(l)));
    ok("...and touches no DOM", !/\bwindow\.|\bdocument\./.test(spawns));
    const worley = fs.readFileSync(path.join(ENG, "world", "worleyBiomes.js"), "utf8");
    ok("the classifier is worker-safe too", !/^\s*import .*node:/m.test(worley) && !/\bwindow\.|\bdocument\./.test(worley));
}

console.log("biomeDecorWiring-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
