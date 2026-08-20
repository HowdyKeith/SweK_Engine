// WebGLEngine/tools/ship/syncWalkProbe-selfcheck.mjs -- v3036
//
// Run: node tools/ship/syncWalkProbe-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// WHAT THIS GATE IS ACTUALLY GUARDING. Not "is the walk fast" -- the walk's speed is the QUESTION, and a gate
// that asserted an answer to it would be asserting the thing we built the instrument to find out. What it
// guards is that the instrument MEASURES THE REAL WALK.
//
// The failure mode this exists to prevent has cost this tree eight defects under a different name: two
// implementations of one fact. A probe that walks the tree "the same way" as listModels is a second walker,
// and a second walker drifts -- and then the number on the page is a true measurement of a function nobody
// runs. So listModels takes an optional probe argument and there is exactly ONE walker, and the load-bearing
// check below is that attaching the instrument does not change the result by so much as a byte.
//
// SABOTAGE (section 2): a deliberately divergent reference walker. If the identity check could not fail, it
// would be decoration, and the whole "one walker" argument above would be unenforced prose.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const assetSync = require(path.join(ENG, "ai-bridge", "assetSync.js"));

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- a fixture tree with real files, so stat timing has something to time -----------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-walkprobe-"));
const mk = (rel, bytes) => { const p = path.join(tmp, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.alloc(bytes || 32)); };
mk("a.glb", 64); mk("b.gltf", 32); mk("notamodel.txt", 16);
mk("nested/c.vox", 48); mk("nested/deeper/d.obj", 96); mk("nested/deeper/e.ply", 12);
mk(".hidden/skipme.glb", 8); mk("node_modules/skipme2.glb", 8);

const probeShape = () => ({ dirs: 0, maxDepth: 0, depthCapHit: false, readdirMs: 0, statMs: 0, slowest: [] });

// ---- 1. THE INSTRUMENT DOES NOT CHANGE THE MEASUREMENT ------------------------------------------------------
{
    const plain = assetSync.listModels(tmp);
    const probed = assetSync.listModels(tmp, false, probeShape());
    ok("!! attaching the probe returns a BYTE-IDENTICAL file list", JSON.stringify(plain) === JSON.stringify(probed),
       plain.length + " files both ways -- the probe times the walk that actually runs, it does not run its own");
    ok("the walk still honours its exclusions", plain.length === 5 && !plain.some((f) => /hidden|node_modules|notamodel/.test(f.name)),
       plain.map((f) => f.name).sort().join(","));
}

// ---- 2. SABOTAGE: prove the identity check above can FAIL ---------------------------------------------------
{
    // A second walker that drifts by one extension -- exactly the drift the probe argument exists to make
    // impossible. If check 1 cannot notice this, check 1 is decoration.
    const drifted = (dir, prefix = "") => {
        const out = [];
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name.startsWith(".") || e.name === "node_modules") continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { out.push(...drifted(full, prefix + e.name + "/")); continue; }
            if (!/\.(glb|gltf|vox|obj)$/i.test(e.name)) continue;      // <-- drops .ply. One extension. That is all it takes.
            const st = fs.statSync(full);
            out.push({ name: prefix + e.name, size: st.size, mtime: Math.round(st.mtimeMs) });
        }
        return out;
    };
    const real = assetSync.listModels(tmp);
    const fake = drifted(tmp);
    ok("!! SABOTAGE: a second walker drifting by ONE extension is caught by the identity check",
       JSON.stringify(real) !== JSON.stringify(fake) && real.length === fake.length + 1,
       "real " + real.length + " vs drifted " + fake.length + " -- the check that passes in section 1 fails here, so it is load-bearing");
}

// ---- 3. THE REPORT IS ARITHMETICALLY HONEST -----------------------------------------------------------------
{
    const r = assetSync.walkProbe(tmp);
    ok("walkProbe reports ok on a real directory", r.ok === true, "root " + r.root);
    ok("it counts the same files the walk found", r.files === assetSync.listModels(tmp).length, r.files + " files, " + r.dirs + " dirs");
    ok("every timing is a non-negative number", [r.coldMs, r.warmMs, r.readdirMs, r.statMs].every((v) => typeof v === "number" && v >= 0),
       "cold " + r.coldMs + "ms, warm " + r.warmMs + "ms, readdir " + r.readdirMs + "ms, stat " + r.statMs + "ms");
    // readdir and stat are SUBSETS of the cold walk, so their sum cannot exceed it. A probe whose parts add up
    // to more than its whole is measuring something twice, and every number it prints would be suspect.
    ok("!! the parts do not exceed the whole", r.readdirMs + r.statMs <= r.coldMs + 0.5,
       "readdir+stat = " + (Math.round((r.readdirMs + r.statMs) * 100) / 100) + "ms vs cold " + r.coldMs + "ms");
    ok("it walks TWICE, so a cold-only cost is distinguishable from a per-poll one", typeof r.warmMs === "number" && r.warmMs > 0);
    ok("the slowest-stat list is ranked descending", (r.slowest || []).every((s, i, a) => i === 0 || a[i - 1].ms >= s.ms),
       (r.slowest || []).length + " entries");
}

// ---- 4. THE VERDICT TRACKS THE MEASUREMENT, AND CAN EXONERATE ------------------------------------------------
{
    const r = assetSync.walkProbe(tmp);
    // A tiny fixture walks in single-digit ms, so this asserts the NEGATIVE branch fires -- the probe must be
    // able to clear its own suspect, or it is a machine for confirming the theory that motivated it.
    ok("!! a fast walk EXONERATES the walk instead of blaming it",
       r.exceedsFreshMachineTimeout === false && /NOT the bottleneck/.test(r.verdict),
       r.coldMs + "ms -> \"" + r.verdict.slice(0, 62) + "...\"");
    ok("the flag agrees with the 4000ms budget it names", r.exceedsFreshMachineTimeout === (r.coldMs >= 4000));
    ok("it names a cause nowhere in its own verdict", !/cloud|onedrive|drive|defender|antivirus/i.test(r.verdict),
       "readdir vs stat is all it can see; the note says so and the verdict does not overreach");
}

// ---- 5. IT REFUSES INSTEAD OF RETURNING A FAST-LOOKING ZERO --------------------------------------------------
{
    const gone = assetSync.walkProbe(path.join(tmp, "no-such-dir-9f3a"));
    ok("!! a missing root REFUSES rather than reporting 0 files in 0 ms",
       gone.ok === false && !!gone.error && gone.files === undefined,
       "a zero here would render on the page as \"the walk is instant\", which is the opposite of the truth");
    ok("the refusal names the path it resolved", typeof gone.root === "string" && gone.root.includes("no-such-dir-9f3a"));
    const asFile = assetSync.walkProbe(path.join(tmp, "a.glb"));
    ok("a root that is a FILE is refused too", asFile.ok === false);
}

// ---- 6. THE FRONT DOOR EXISTS AND IS WIRED -------------------------------------------------------------------
{
    const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("server.js dispatches GET /sync/walk-probe", /sp === "\/sync\/walk-probe"/.test(srv));
    ok("the route calls assetSync.walkProbe and does not reimplement it",
       /assetSync\.walkProbe\(_syncRoot\(\)\)/.test(srv) && !/function\s+walkProbe/.test(srv),
       "the route is a dispatch, not a second copy of the measurement");
    ok("the route reports WHICH root branch was walked", /rootSource/.test(srv),
       "externalAssetsDir and the GPU_Assets default are different machines; a number without the root is unreadable");

    const pagePath = path.join(ENG, "sync-probe.html");
    ok("!! EVERY TOOL NEEDS A FRONT DOOR: sync-probe.html exists", fs.existsSync(pagePath));
    const page = fs.readFileSync(pagePath, "utf8");
    ok("the page calls the route", /fetch\("\/sync\/walk-probe"/.test(page));
    ok("the page renders the refusal path, not just the happy one", /ok === false/.test(page) && /Refused/.test(page));
    ok("the page surfaces the cold/warm split and the readdir/stat split",
       /coldMs/.test(page) && /warmMs/.test(page) && /readdirMs/.test(page) && /statMs/.test(page));
    // BROWSER-NODE LAW (v2762/v2766): a page that imports a Node builtin is a black page.
    ok("!! the page imports no Node builtin", !/(from|import|require)\s*\(?\s*["'](node:)?(fs|path|url|crypto|os|net|dgram|zlib|module)["']/.test(page));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log("\nsyncWalkProbe-selfcheck: " + (fails ? fails + " FAILED" : "all checks passed"));
process.exit(fails ? 1 : 0);
