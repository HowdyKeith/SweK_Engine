// WebGLEngine/tools/rigWorklist-selfcheck.mjs — v2638
//
// Run: node tools/rigWorklist-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The worklist is only trustworthy if it accounts for EVERY open claim -- one dropped, and a falsifiable claim
// quietly never gets pointed at a rig. So the gate checks the worklist against predictions.html: every open claim
// appears exactly once, no settled/broken claim leaks in, every bucketed claim carries a concrete "how", and the
// worklist's open count matches the claims gate.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractClaims } from "./ship/claimsGate.mjs";
import { buildWorklist, BUCKETS } from "./rigWorklist.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(ROOT, "predictions.html"), "utf8");
const claims = extractClaims(html);
const open = claims.filter((c) => c.state === "open");
const wl = buildWorklist(html);

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// flatten the worklist back to a list of claim names (buckets + any unclassified)
const listed = [];
for (const b of BUCKETS) for (const c of wl.byBucket.get(b.id)) listed.push(c.name);
for (const c of wl.unclassified) listed.push(c.name);

// ---- 1. EVERY OPEN CLAIM APPEARS EXACTLY ONCE ---------------------------------------------------------------------
{
    const openNames = open.map((c) => c.name).sort();
    const listedSorted = [...listed].sort();
    const same = openNames.length === listedSorted.length && openNames.every((n, i) => n === listedSorted[i]);
    const dupes = listed.length !== new Set(listed).size;
    ok("!! every open claim is on the worklist exactly once", same && !dupes,
       same && !dupes ? open.length + " open claims, all present, none duplicated -- the worklist is the open set, re-sorted by machine." : "worklist has " + listed.length + " entries vs " + open.length + " open (dupes=" + dupes + "). A DROPPED CLAIM IS A FALSIFIABLE CLAIM THAT NEVER GETS TESTED.");
}

// ---- 2. NO SETTLED OR BROKEN CLAIM LEAKS IN -----------------------------------------------------------------------
{
    const notOpen = new Set(claims.filter((c) => c.state !== "open").map((c) => c.name));
    const leak = listed.filter((n) => notOpen.has(n));
    ok("!! no settled or broken claim appears on the rig worklist", leak.length === 0,
       leak.length === 0 ? "only open claims need a rig -- settled and broken ones are done and stay off the list." : leak.length + " already-adjudicated claims leaked onto the worklist: " + leak.slice(0, 2).join(", "));
}

// ---- 3. EVERY BUCKET WITH CLAIMS CARRIES A CONCRETE ACTION, AND NOTHING IS UNCLASSIFIED ----------------------------
{
    let good = true;
    for (const b of BUCKETS) if (wl.byBucket.get(b.id).length && !(b.how && b.machine)) good = false;
    ok("!! every open claim reaches a machine with a concrete how, nothing left unclassified", good && wl.unclassified.length === 0,
       (wl.unclassified.length === 0 ? "each non-empty bucket names a machine and what to run; " : wl.unclassified.length + " claims fell through to no machine -- ") + "a worklist item with no action, or a claim with no bucket, is a task nobody can pick up.");
}

// ---- 4. THE WORKLIST OPEN COUNT MATCHES THE CLAIMS GATE -----------------------------------------------------------
{
    ok("!! the worklist's open count matches the claims themselves", wl.open === open.length,
       wl.open + " open, from the same predictions.html the claims gate reads -- the worklist cannot report a different number than the source of truth.");
}

console.log(fails ? "\nrigWorklist-selfcheck: " + fails + " FAILED" : "\nrigWorklist-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
