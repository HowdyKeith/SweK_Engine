// WebGLEngine/ai-bridge/partialSweep-selfcheck.mjs -- v3457
//
// Run: node ai-bridge/partialSweep-selfcheck.mjs
//
// The fixtures carry a known answer, and the one that matters is the file that must SURVIVE: a sweep that
// deleted every `.part` would break the in-flight transfers the write-then-rename idiom exists to protect.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stalePartials, reclaimable, PARTIAL_RE, DEFAULT_MIN_AGE_MS } from "./partialSweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const NOW = 1_700_000_000_000, H = 3600000;
const rows = [
    { path: "/d/EngineProject_v3455.zip.part", mtimeMs: NOW - 40 * H, bytes: 12_000_000 },  // Keith's actual file
    { path: "/d/EngineProject_v3456.zip.part", mtimeMs: NOW - 30_000,  bytes: 3_000_000 },  // 30s ago: LIVE
    { path: "/d/staged.zip.partial",           mtimeMs: NOW - 9 * H,   bytes: 500_000 },    // applyStaged spelling
    { path: "/d/EngineProject_v3456.zip",      mtimeMs: NOW - 99 * H,  bytes: 50_000_000 }, // a real build, NOT a partial
    { path: "/d/skewed.zip.part",              mtimeMs: NOW + 2 * H,   bytes: 1000 },       // clock skew
];
const { sweep, keep } = stalePartials(rows, { now: NOW });
const has = (list, frag) => list.some((e) => e.path.includes(frag));

ok("!! *** the abandoned partial Keith named is swept ***", has(sweep, "v3455.zip.part") && sweep.length === 2,
   `${sweep.length} swept: ${sweep.map((e) => e.path.split("/").pop() + " (" + e.reason + ")").join(", ")}. Both spellings are covered -- .partial is applyStaged's and it is the same idiom.`);

ok("!! *** A PARTIAL TOUCHED 30 SECONDS AGO IS KEPT, AND THIS IS THE CHECK THE WHOLE MODULE EXISTS FOR ***",
   has(keep, "v3456.zip.part"),
   `*** A FILE BEING WRITTEN RIGHT NOW IS INDISTINGUISHABLE FROM ABANDONED DEBRIS BY NAME ALONE. A sweep matching on the suffix and nothing else would delete an in-flight download and break the very transfers write-then-rename exists to protect. AGE IS THE ONLY CHEAP EVIDENCE, and it is a HEURISTIC -- it cannot prove a transfer is dead, only that nothing has written recently, which is why ${DEFAULT_MIN_AGE_MS / H} HOURS is generous rather than tight. ***`);

ok("!! a finished .zip is never touched, however old",
   has(keep, "v3456.zip") && !has(sweep, "v3456.zip"),
   "99 hours old and 50 MB and it STAYS. Old build zips are pruneOldVersions' business and it has its own rules about which version is current; a partial sweep that also decided that would be a second declaration of what is safe to delete.");

ok("!! *** an mtime in the FUTURE is kept, because that is a clock problem and not an age ***",
   has(keep, "skewed"),
   "Clock skew across a LAN is ordinary here. A comparison testing only `age > minAge` would read a NEGATIVE age as very old and delete the file -- the sign error that turns a cautious sweep into a destructive one.");

ok("...and the two lists PARTITION the input, so nothing is silently dropped",
   sweep.length + keep.length === rows.length,
   `${sweep.length} + ${keep.length} = ${rows.length}. A file in neither list is a file nobody decided about.`);

ok("...and the bytes a sweep would reclaim are reported, not just the count",
   reclaimable(sweep) === 12_500_000,
   `${reclaimable(sweep)} bytes. A count of files is not a reason to run a cleanup; the space is.`);

/* ---- the idiom really is in this tree, so the sweep is not solving an imagined problem ------------------- */
{
    const writers = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.name === "node_modules" || e.name.startsWith(".")) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(js|mjs)$/.test(e.name) || /partialSweep/.test(e.name)) continue;
            let s = ""; try { s = fs.readFileSync(p, "utf8"); } catch { continue; }
            if (/\+\s*["'`]\.part(ial)?["'`]/.test(s)) writers.push(path.relative(ROOT, p));
        }
    })(ROOT);
    ok("!! the write-then-rename idiom is REAL and widespread in this tree, not a guessed cause",
       writers.length >= 5,
       `${writers.length} files build a name with + ".part": ${writers.join(", ")}. DERIVED FROM THE TREE rather than asserted, so if the idiom is ever retired this line goes red and the sweep can retire with it.`);
}

ok("...and the suffix test accepts both spellings and nothing else",
   PARTIAL_RE.test("a.part") && PARTIAL_RE.test("b.PARTIAL") && !PARTIAL_RE.test("particles.js") && !PARTIAL_RE.test("a.part.zip"),
   "`particles.js` is the near-miss that matters -- this tree has several files whose names begin with 'part', and a substring test would have swept source code.");

console.log(fails ? "\npartialSweep-selfcheck: " + fails + " FAILED" : "\npartialSweep-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
