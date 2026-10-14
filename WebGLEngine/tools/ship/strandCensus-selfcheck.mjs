#!/usr/bin/env node
// WebGLEngine/tools/ship/strandCensus-selfcheck.mjs -- v4857
//
// Run: node tools/ship/strandCensus-selfcheck.mjs
//
// tools/ship/strandCensus.mjs ran every gate once under the input probe and classified each path it WROTE inside the tree.
// This holds what that census found against the cleanup lists a killed sweep runs (gateSweep's TRANSIENT_FIXTURES,
// TRANSIENT_DIRS and TRANSIENT_PATHS, fixtureLitter's `__` fixtures, exitBusy's copies):
//   1. the classifier, on fixtures: each class by name, a file inside a reclaimed directory counts as covered, and the box's
//      own state (ai-bridge/apks, the loop-scope flag) is ignored by git rather than named by a list
//   2. the committed census leaves nothing strandable and nothing left behind under today's lists
//   3. every TRANSIENT_PATHS entry is a path some gate really wrote -- no list entry for a path nobody makes
//   4. no list prefix matches a committed file, so a reclaim can never delete anything git tracks
//   5. reclaimTransientPaths and fixtureLitter's reclaim remove what they name (directories too) and nothing else, on a scratch root
//   6. the probe still sees a write: maze-walker's .maze-boot.mjs, the leftover that started this, read live
//
// SABOTAGED v4857: TRANSIENT_PATHS without gfx-door-probe.html -> 3 RED (row 1's classes, row 2's strandable, row 5's reclaim);
// coveredBy without the ancestor step -> 2 RED (row 1's directory row; row 2, the __doorfixture__ files turn strandable);
// an entry ["", "main", ...] added -> 4 RED, row 4 among them (main.js is tracked); reclaimTransientPaths joining root to the
// name without its directory -> 1 RED, row 5; the probe's addWrite recording nothing -> 1 RED, row 6. Each restored, md5 verified.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { coveredBy, classify, readCensus, trackedSets, ignoredSet, runCensus, compactCensus } from "./strandCensus.mjs";
import { TRANSIENT_FIXTURES, TRANSIENT_DIRS, TRANSIENT_PATHS, reclaimTransientPaths } from "./gateSweep.mjs";
import { FIXTURE_DIRS, FIXTURE_PREFIX } from "./fixtureLitter.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (c, msg, detail = "") => { console.log(`${c ? "  ok  " : "  RED "} ${msg}${detail ? "\n        " + detail : ""}`); if (!c) fails++; };

console.log("1. THE CLASSIFIER, ON FIXTURES");
{
    const tracked = new Set(["main.js"]), trackedDirs = new Set(["tools", "tools/ship"]);
    const live = new Set(["ai-bridge/apks/x.apk", "stray.txt"]), ign = new Set(["ai-bridge/apks/x.apk"]);
    const got = Object.fromEntries(classify(["gfx-door-probe.html", "main.js", "tools/ship", "ai-bridge/apks/x.apk", "stray.txt", "gone.txt"],
        { tracked, trackedDirs, exists: (r) => live.has(r), ignored: (r) => ign.has(r) }).map((p) => [p.rel, p.kind]));
    const want = { "gfx-door-probe.html": "covered", "main.js": "tracked", "tools/ship": "tracked", "ai-bridge/apks/x.apk": "ignored", "stray.txt": "left", "gone.txt": "strandable" };
    ok(JSON.stringify(got) === JSON.stringify(want), "covered, tracked (a file or a directory holding one), ignored, left, strandable -- each by its rule", JSON.stringify(got));
    ok(coveredBy("tools/ship/__doorfixture__/a/b.mjs") === "fixtureLitter" && coveredBy("tools/.ub-x1/page.html") === "TRANSIENT_DIRS" &&
       coveredBy(".fsrclocks-ab/x.html") === "TRANSIENT_DIRS" && coveredBy("brain/bench/__gatecheck9/x.json") === "TRANSIENT_PATHS",
       "...a file inside a reclaimed directory is covered by it, and a root entry (\"\") matches at the root",
       ["tools/ship/__doorfixture__/a/b.mjs", "tools/.ub-x1/page.html", ".fsrclocks-ab/x.html", "brain/bench/__gatecheck9/x.json"].map((r) => `${r}: ${coveredBy(r)}`).join("; "));
    ok(coveredBy("x/.fsrclocks-ab") === null && coveredBy("ai-bridge/swek_loop_scope.flag") === null && coveredBy("ai-bridge/apks/x.apk") === null,
       "...a root entry does not match below the root, and the box's own state (loop scope, apks) is named by nothing");
    const ig = ignoredSet(["ai-bridge/apks/x.apk", "ai-bridge/swek_loop_scope.flag", "main.js", "zz-not-ignored.txt"], ENG);
    ok(ig.has("ai-bridge/apks/x.apk") && ig.has("ai-bridge/swek_loop_scope.flag") && !ig.has("main.js") && !ig.has("zz-not-ignored.txt"),
       "...and that state is IGNORED by git, so it is reported as a box's output and never as litter", [...ig].join(", "));
}

const census = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "strand-census.json"), "utf8"));
console.log("\n2. THE COMMITTED CENSUS, READ AGAINST TODAY'S LISTS");
const R = readCensus(census);
{
    ok(R.strandable.length === 0, "nothing a gate makes and removes goes unnamed: a kill at the cap strands nothing the sweep will not reclaim",
       R.strandable.length ? R.strandable.map((p) => `${p.rel} <- ${p.gate}`).join("; ") : `${census.gatesRun} gates run, ${R.covered.length} paths covered`);
    ok(R.left.length === 0, "...and nothing is left untracked and unignored after a clean exit",
       R.left.map((p) => `${p.rel} <- ${p.gate}`).join("; "));
    ok(census.gatesRun >= 1900 && compactCensus(census) === fs.readFileSync(path.join(ENG, "tools", "ship", "strand-census.json"), "utf8"),
       "...the census is the whole population, written by strandCensus itself", `gatesRun ${census.gatesRun}; unread at the cap ${R.unread.length}`);
}

console.log("\n3. EVERY TRANSIENT_PATHS ENTRY IS A PATH SOME GATE WROTE");
{
    const writes = census.gates.flatMap((g) => g.writes.map((w) => [w, g.gate]));
    const hit = (dir, prefix) => writes.find(([w]) => (dir ? w.startsWith(dir + "/" + prefix) : !w.includes("/") && w.startsWith(prefix)));
    const orphans = TRANSIENT_PATHS.filter(([d, p]) => !hit(d, p));
    ok(!orphans.length, "no entry names a path nobody makes", orphans.map(([d, p]) => `${d}/${p}`).join("; ") || `${TRANSIENT_PATHS.length} entries, each written`);
    const wrongWriter = TRANSIENT_PATHS.filter(([d, p, w]) => { const h = hit(d, p); return h && !writes.some(([x, g]) => g === w && x.startsWith((d ? d + "/" : "") + p)); });
    ok(!wrongWriter.length, "...and each entry's writer is a gate the census saw write it", wrongWriter.map(([d, p, w]) => `${d}/${p} <- ${w}`).join("; "));
}

console.log("\n4. NO LIST CAN DELETE A COMMITTED FILE");
{
    const { tracked } = trackedSets(ENG);
    const hits = [];
    for (const [d, p] of [...TRANSIENT_DIRS, ...TRANSIENT_PATHS, ...FIXTURE_DIRS.map((d) => [d, FIXTURE_PREFIX])])
        for (const f of tracked) if (d ? f.startsWith(d + "/" + p) : f.startsWith(p)) hits.push(`${f} (${d}/${p})`);
    for (const f of TRANSIENT_FIXTURES) if (tracked.has(f)) hits.push(f);
    ok(!hits.length, "every prefix a reclaim removes matches no file git tracks", hits.slice(0, 8).join("; ") || `${tracked.size} committed files checked`);
}

console.log("\n5. THE RECLAIMS, ON A SCRATCH ROOT");
{
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "swek-strandsc-"));
    const mk = (rel, dir = false) => { const a = path.join(root, rel); fs.mkdirSync(dir ? a : path.dirname(a), { recursive: true }); if (!dir) fs.writeFileSync(a, "x"); };
    mk("gfx-door-probe.html"); mk("brain/bench/__gatecheck7/deep/x.json"); mk("ai-bridge/__qrBridge.123.js");
    mk("gfx-door-probe.keep"); mk("main.js"); mk("brain/bench/gatecheck.json"); mk("ai-bridge/qrBridge.js");
    const gone = reclaimTransientPaths(root).sort();
    const left = ["gfx-door-probe.keep", "main.js", "brain/bench/gatecheck.json", "ai-bridge/qrBridge.js"].filter((r) => fs.existsSync(path.join(root, r)));
    ok(JSON.stringify(gone) === JSON.stringify(["ai-bridge/__qrBridge.123.js", "brain/bench/__gatecheck7", "gfx-door-probe.html"]) && left.length === 4 &&
       !fs.existsSync(path.join(root, "brain/bench/__gatecheck7")),
       "reclaimTransientPaths removes the named files and directories (recursively) and nothing beside them", `removed ${gone.join(", ")}; kept ${left.length}/4`);
    fs.rmSync(root, { recursive: true, force: true });
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "fixtureLitter.mjs"), "utf8");
    ok(/export function reclaimStranded\(\)[\s\S]{0,400}fs\.rmSync\(fixtureAbs\(dir \+ "\/" \+ nm\), \{ recursive: true, force: true \}\)/.test(src),
       "...and fixtureLitter's reclaim removes a `__` directory too (tools/ship/__doorfixture__), not only a file");
    const qs = fs.readFileSync(path.join(ENG, "tools", "ship", "quickSweep.mjs"), "utf8");
    ok(/for \(const rel of reclaimTransientPaths\(root\)\) gone\.push\(rel\)/.test(qs), "...and the sweep's reclaim runs TRANSIENT_PATHS before any gate starts");
}

console.log("\n6. THE PROBE STILL SEES A WRITE (LIVE)");
{
    const c = await runCensus({ workers: 1, capMs: 60000, only: "brain/tools/maze-walker-selfcheck.mjs", log: () => {} });
    const g = c.gates[0] || {};
    ok(c.gates.length === 1 && g.code === 0 && (g.writes || []).includes(".maze-boot.mjs") && g.existsNow[".maze-boot.mjs"] === false,
       "maze-walker, run under the probe, is seen writing .maze-boot.mjs and removing it -- the leftover that took two gates red on the rig",
       JSON.stringify({ code: g.code, writes: g.writes, ms: g.ms }));
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: writes by a non-node child (a browser, git, a shell) and the " + R.unread.length + " gates the census " +
    "stopped at its cap (" + R.unread.slice(0, 3).join(", ") + ", ...) -- their writes were never read, so they are unknown, not clean. " +
    "A new gate's writes are not in the census until it is re-run: node tools/ship/strandCensus.mjs --run --out tools/ship/strand-census.json.");
process.exitCode = fails ? 1 : 0;
