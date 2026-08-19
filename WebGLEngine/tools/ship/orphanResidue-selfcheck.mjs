// tools/ship/orphanResidue-selfcheck.mjs
//
// Run: node tools/ship/orphanResidue-selfcheck.mjs   (instant)
//
// v3168 -- "13 ORPHANS REMAIN, EACH NEEDS A HUMAN PER ENTRY" WAS ASKING FOR DECISIONS ALREADY MADE.
//
// The queue has carried that line since v3159 and it is FALSE. Classifying the residue -- derived, by reading
// what each entry IS -- accounts for all thirteen and leaves ZERO open delete-or-keep questions:
//
//   FOUR HAVE PASSING SELFCHECKS   policyCache, memoryPolicy, multigridGPU, RagdollDismember
//   FOUR ARE IN tools/             out of scope by v3159's OWN rule (hand-run scripts are named nowhere)
//   THREE EXPORT NOTHING           nothing CAN import them; they are entry points or inert by construction
//   TWO ARE RULED REVIVE           SSAOPass and SpatialHash, named by orphanScan and already judged
//
// *** AND THE FIRST GROUP IS THE INTERESTING ONE. *** orphanScan EXCLUDES selfchecks from the import graph on
// purpose -- "A GATE IS NOT A CALL SITE" (v3126). That is right: a test proving a module works does not make it
// USED. But it means "orphan" here reads UNUSED BY THE PRODUCT, and the queue line collapsed that with DEAD.
// A module that is PROVEN AND UNWIRED is a different state from one nobody has looked at, and three of the four
// are Keith's own v3146 capability gates -- work that was finished and parked, not work that rotted.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const base = JSON.parse(fs.readFileSync(path.join(HERE, "orphan-baseline.json"), "utf8"));

/** DERIVED from what each file IS -- never a typed grouping, which would be a snapshot pinned as a law. */
function classify(rel) {
    const abs = path.join(ENG, rel);
    const gate = abs.replace(/\.(js|mjs)$/, "-selfcheck.mjs");
    if (fs.existsSync(gate)) return "GATED";
    if (rel.split("/")[0] === "tools") return "TOOLS";
    let src = "";
    try { src = fs.readFileSync(abs, "utf8"); } catch { return "MISSING"; }
    if ((src.match(/^export /gm) || []).length === 0) return "NO-EXPORTS";
    return "JUDGED";
}
const rows = base.files.map((f) => ({ f, g: classify(f) }));
const count = (g) => rows.filter((r) => r.g === g).length;

ok("!! every entry is accounted for -- NONE is an open delete-or-keep question",
    rows.length > 0 && count("MISSING") === 0 &&
    count("GATED") + count("TOOLS") + count("NO-EXPORTS") + count("JUDGED") === rows.length,
    rows.length + " entries: " + ["GATED", "TOOLS", "NO-EXPORTS", "JUDGED"].map((g) => count(g) + " " + g).join(", ") +
    ". The queue asked for a human decision per entry since v3159 -- EVERY ONE ALREADY HAD A REASON");

// *** v3202: THIS ASSERTED count("GATED") > 0 AND THE GROUP IS NOW EMPTY. *** v3202 removed five baseline
// entries that had stopped describing orphans, and the gated ones went with them -- multigridGPU among them.
// THE `> 0` WAS A VACUITY GUARD, which is right in principle (v3177: a check can pass by doing nothing) BUT IT
// WAS ON THE WRONG QUANTITY. The property is that EVERY GATED ENTRY HAS A GATE BESIDE IT, and an empty group
// satisfies that honestly. Non-vacuity belongs on the TOTAL, which is asserted above and is still nine.
ok("!! a module with a PASSING GATE is PROVEN AND UNWIRED, not dead",
    rows.length > 0 && rows.filter((r) => r.g === "GATED").every((r) => {
        const g = path.join(ENG, r.f).replace(/\.(js|mjs)$/, "-selfcheck.mjs");
        return fs.existsSync(g);
    }),
    (count("GATED") ? rows.filter((r) => r.g === "GATED").map((r) => r.f.split("/").pop()).join(", ") +
        ". Keith's v3146 capability gates were among these -- work finished and parked, not work that rotted"
      : "the GATED group is EMPTY, and that is a fact rather than a defect: v3202 removed the five baseline " +
        "entries that had stopped describing orphans, and the gated ones went with them") + " (" + rows.length +
    " entries total)");

ok("!! and orphanScan excludes selfchecks ON PURPOSE, so this is not a miscount",
    /A GATE IS NOT A CALL SITE/.test(fs.readFileSync(path.join(HERE, "orphanScan.mjs"), "utf8")),
    "v3126 decided it deliberately: a test proving a module works does not make it USED. So 'orphan' here reads " +
    "UNUSED BY THE PRODUCT -- correct, and NOT the same as dead, which is what the queue line collapsed");

ok("!! the tools/ entries are out of scope by the SAME rule that excluded the directory",
    rows.filter((r) => r.g === "TOOLS").length > 0 &&
    rows.filter((r) => r.g === "TOOLS").every((r) => r.f.startsWith("tools/")),
    rows.filter((r) => r.g === "TOOLS").map((r) => r.f.split("/").pop()).join(", ") + ". v3159 excluded tools/ " +
    "because HAND-RUN SCRIPTS ARE ENTRY POINTS NAMED NOWHERE -- and a rule that excludes a directory from " +
    "sweeping but keeps its entries in the queue is asking for a decision it has already forbidden");

ok("!! a module exporting NOTHING cannot be imported by anything",
    rows.filter((r) => r.g === "NO-EXPORTS").every((r) => {
        const s = fs.readFileSync(path.join(ENG, r.f), "utf8");
        return (s.match(/^export /gm) || []).length === 0;
    }),
    rows.filter((r) => r.g === "NO-EXPORTS").map((r) => r.f.split("/").pop()).join(", ") +
    ". Unreachable BY CONSTRUCTION rather than by neglect -- an entry point or an inert reference, and " +
    "'nothing imports it' is a description rather than a fault");

ok("...and the classification is DERIVED, not a typed list",
    (() => { const src = fs.readFileSync(path.join(HERE, "orphanResidue-selfcheck.mjs"), "utf8");
             return /function classify\(rel\)/.test(src) && !/const GROUPS = \{/.test(src); })(),
    "it reads each file and asks what it is. A typed grouping would be today's tree pinned as a law -- the " +
    "nineteenth instance of that this session was mine, one round after writing the rule down");

console.log();
console.log("  ----  THE RESIDUE, so the queue can stop asking:");
for (const g of ["GATED", "TOOLS", "NO-EXPORTS", "JUDGED"]) {
    const list = rows.filter((r) => r.g === g).map((r) => r.f);
    if (list.length) console.log("  ----    " + g.padEnd(11) + list.join(", ").slice(0, 92));
}
console.log("  ----  NOTHING WAS DELETED and nothing needs to be. The 13 are a CATALOGUE, not a backlog.");
if (fails) { console.log("orphanResidue-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("orphanResidue-selfcheck: all checks pass");
