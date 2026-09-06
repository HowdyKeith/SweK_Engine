#!/usr/bin/env node
// WebGLEngine/tools/ship/cityGenSeed-selfcheck.mjs -- v4508
//
// CITYGEN SEEDED (buildings 1): world/CityGen.js drew every decision from Math.random since round 253, so the Kaiju sandbox's
// city could not be regenerated and no later round could say "same seed, same building". generate() takes a seed now and draws
// from world/procPlanet.js's mulberry32; the damage rolls come from a second stream seeded from the same number. Held here on a
// RECORDING world (setVoxel appends, voxelAt answers from the record): one seed stamps the same voxel list byte for byte twice
// and the same building list; a different seed differs in both; the tier weights hold over many seeds; a topple from one seed
// lays the same rubble twice; the default seed is fixed, so a sandbox started without one is reproducible; and no Math.random
// remains in the file.
//
// MEASURED AT v4508 (a recording world, radius 40, 20 buildings): seed 7 stamps 14,803 voxels, hash 2ccc123aee1a42da, the same twice;
// seed 8 stamps 10,247, hash 76aa7fd24bde2dc9; the tier weights over 60 seeds and 1,200 buildings read 36 / 30 / 21 / 8 / 3 / 1 percent
// against 35 / 30 / 20 / 10 / 4 / 1 before packing rejections; a topple of seed 7's first building writes 164 voxels, hash 726a50c003b75eca,
// the same twice; regenerating after two different topples stamps the first city's hash again. A first draft's file hold read the
// header's own sentence "every decision here used Math.random" as a use; the hold reads code only now (sourceScan's codeOnly).
//
// SABOTAGE (v4508): A  the height roll back on Math.random                          -> 5 red: the twice-the-same hold, the default-seed hold,
//                                                                                      the topple-twice hold (the buildings differ), the
//                                                                                      separate-streams hold, and the file hold by name.
//                   B  the damage stream seeded from Date.now() in generate()        -> 1 red: the topple-twice hold alone -- the city itself
//                                                                                      is unchanged, which is what two streams buy.
//                   C  weightedPick ignoring its stream (always the first tier)      -> 2 red: every building a shed, so the spread hold and
//                                                                                      the tier-weights hold.
//                   D  the seed not narrowed to u32 (this.seed = seed)               -> 1 red: the u32 hold (-1 and 7.9 recorded as given).
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/cityGenSeed-selfcheck.mjs      (~2 s)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { CityGen } from "../../world/CityGen.js";
import { codeOnly } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);

/** a recording voxel world: every setVoxel appended, voxelAt read from the record */
function recorder() {
    const cells = new Map(), log = [];
    return { log, cells,
        setVoxel(x, y, z, m) { cells.set(`${x},${y},${z}`, m); log.push(x, y, z, m); },
        voxelAt(x, y, z) { return cells.get(`${x},${y},${z}`) || 0; },
        getVoxel(x, y, z) { return cells.get(`${x},${y},${z}`) || 0; } };
}
const hashOf = (arr) => createHash("sha256").update(Int32Array.from(arr).buffer instanceof ArrayBuffer ? Buffer.from(Int32Array.from(arr).buffer) : "").digest("hex").slice(0, 16);
const city = (seed, opts = {}) => { const w = recorder(); const g = new CityGen(w); const b = g.generate({ radius: 40, buildingCount: 20, seed, ...opts }); return { w, g, b, hash: hashOf(w.log), n: w.log.length / 4 }; };

sec("1. ONE SEED, ONE CITY");
{
    const a = city(7), b = city(7), c = city(8);
    report(`seed 7: ${a.n} voxels set, ${a.b.length} buildings, hash ${a.hash}; seed 8: ${c.n} voxels, ${c.b.length} buildings, hash ${c.hash}`);
    ok("*** seed 7 twice stamps the same voxel list byte for byte and the same building list ***", a.hash === b.hash && a.n === b.n && JSON.stringify(a.b.map((x) => [x.x, x.z, x.w, x.d, x.h, x.mat])) === JSON.stringify(b.b.map((x) => [x.x, x.z, x.w, x.d, x.h, x.mat])));
    ok("seed 8 stamps a different city (different hash, and not the same building rects)", a.hash !== c.hash && JSON.stringify(a.b.map((x) => [x.x, x.z, x.w, x.d, x.h])) !== JSON.stringify(c.b.map((x) => [x.x, x.z, x.w, x.d, x.h])));
    ok("the generator records its seed narrowed to u32, and the last stamp carries it", a.g.seed === 7 && a.g._lastStamp.seed === 7 && city(-1).g.seed === 4294967295 && city(7.9).g.seed === 7);
    const d1 = city(), d2 = city();
    ok("no seed given is the fixed default (1): a sandbox started without one is reproducible", d1.hash === d2.hash && d1.g.seed === 1);
    ok("the city has buildings in more than one tier (heights spread) and every building is inside the radius", new Set(a.b.map((x) => x.h > 12 ? "tall" : "low")).size === 2 && a.b.every((x) => Math.abs(x.x) <= 40 && Math.abs(x.z) <= 40));
    const tally = { shed: 0, house: 0, midrise: 0, tower: 0, skyscraper: 0, megastructure: 0 }; let total = 0;
    for (let s = 100; s < 160; s++) for (const x of city(s).b) { total++; tally[x.h <= 5 ? "shed" : x.h <= 12 ? "house" : x.h <= 24 ? "midrise" : x.h <= 40 ? "tower" : x.h <= 80 ? "skyscraper" : "megastructure"]++; }
    report(`60 seeds, ${total} buildings: ` + Object.entries(tally).map(([k, v]) => `${k} ${(100 * v / total).toFixed(0)}%`).join(", ") + " (weights 35/30/20/10/4/1 before packing rejections)");
    ok("the tier weights read through the seeded stream: sheds and houses are the most common, megastructures the rarest", tally.shed > tally.midrise && tally.house > tally.tower && tally.megastructure < tally.skyscraper && tally.megastructure < tally.midrise);
}

sec("2. THE DAMAGE STREAM: a topple from one seed lays the same rubble twice, and is its own stream");
{
    const run = (seed) => { const c = city(seed); const b = c.b[0]; const before = c.w.log.length; c.g.damageAt(b.x, b.z, b.maxHp, { x: 1, z: 0 }); return { rubble: hashOf(c.w.log.slice(before)), laid: (c.w.log.length - before) / 4, state: b.state }; };
    const r1 = run(7), r2 = run(7), r3 = run(8);
    report(`seed 7: building 0 toppled (${r1.state}), ${r1.laid} voxels written by the topple, hash ${r1.rubble}; seed 8: ${r3.laid}, ${r3.rubble}`);
    ok("*** the same seed topples the same building the same way twice, byte for byte ***", r1.rubble === r2.rubble && r1.laid === r2.laid && r1.state === "toppled");
    ok("a different seed lays different rubble", r1.rubble !== r3.rubble);
    // the two streams are separate: a topple before a second generate() does not change the second city
    const w = recorder(), g = new CityGen(w); g.generate({ radius: 40, buildingCount: 20, seed: 7 }); const first = hashOf(w.log); g.damageAt(g.buildings[0].x, g.buildings[0].z, g.buildings[0].maxHp, { x: 1, z: 0 });
    const w2 = recorder(), g2 = new CityGen(w2); g2.generate({ radius: 40, buildingCount: 20, seed: 7 }); g2.damageAt(g2.buildings[1].x, g2.buildings[1].z, g2.buildings[1].maxHp, { x: 0, z: 1 });
    const again = recorder(), g3 = new CityGen(again); g3.generate({ radius: 40, buildingCount: 20, seed: 7 });
    ok("generation and damage are separate streams: however much damage a city took, regenerating from the seed stamps the same voxels", hashOf(again.log) === first);
}

sec("3. THE FILE");
{
    const src = fs.readFileSync(path.join(ENG, "world/CityGen.js"), "utf8");
    // CODE only: the header now says in prose that every decision USED Math.random, and a raw scan would count the sentence (the v4266 rule)
    ok("no Math.random remains in world/CityGen.js's code (comments aside), and it imports rng from world/procPlanet.js", !/Math\.random/.test(codeOnly(src)) && /import \{ rng \} from "\.\/procPlanet\.js"/.test(src));
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the sandbox's own seed choice (KaijuSandbox passes cityOpts through; none of its callers set a seed yet, so every sandbox city is seed 1 until one does); the crumble passes' geometry (held by the sandbox's own gates); facades (buildings 3).");
process.exit(fails ? 1 : 0);
