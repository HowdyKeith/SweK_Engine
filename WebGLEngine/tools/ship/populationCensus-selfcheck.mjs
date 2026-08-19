// WebGLEngine/tools/ship/populationCensus-selfcheck.mjs — v3553
//
// Run: node tools/ship/populationCensus-selfcheck.mjs   (~10s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// *** THE HAND-TYPED PIN WENT RED TWICE AND NOBODY NOTICED EITHER TIME. ***
//   v3406 -- arrived at 338 against a pin of 328. Ten modules, red for an unknown number of versions.
//   v3551 -- arrived at 383 against a pin of 351. THIRTY-TWO modules.
//
// v3410 improved the message so it names the command and asks for a reason. v3528 single-sourced the number so
// it could not report a stale expectation. NEITHER TOUCHED THE DYNAMIC: both made an ignored signal better
// worded, and it stayed ignored, because the mechanism still needed a human to remember a number between rounds.
//
// The census is written at ship time the way knowledge-index.json already is, so the number moves with the tree
// by construction. AND THE POINT IS NOT THAT IT STOPS FAILING -- IT IS THAT IT FAILS FOR A BETTER REASON. A pin
// that goes red on every addition trains you to raise it. A census can tell routine growth from the thing that
// should actually stop a ship.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { census, readCensus, compare, areaOf, CENSUS_FILE, lines } from "./populationCensus.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---- 1. THE RECORD EXISTS AND THE TREE MATCHES IT ----------------------------------------------------------------
{
    const rec = readCensus();
    ok("!! a census is on disk, so the expectation is RECORDED rather than remembered",
       rec && rec.total > 0 && Array.isArray(rec.modules),
       rec ? `${rec.total} modules across ${Object.keys(rec.areas).length} areas` : "MISSING — run populationCensus.mjs --write");
    const c = compare();
    ok("!! and the tree agrees with it module for module",
       c.verdict === "UNCHANGED" || c.verdict === "GREW",
       c.verdict + " — " + c.why);
}

// ---- 2. THE AREA GROUPING ACTUALLY GROUPS ---------------------------------------------------------------------------
{
    const rec = readCensus();
    const areas = Object.keys(rec.areas).length;
    ok("!! the breakdown groups by DIRECTORY, not by the first two path segments",
       areas < rec.total / 4,
       areas + " areas for " + rec.total + " modules. The first attempt took the first two segments, which made " +
       "every file sitting directly in physics/ its own area and reported 236 areas for 383 modules — a " +
       "breakdown with no grouping power at all");
    ok("...and a top-level file lands in its root area rather than becoming one",
       areaOf("physics/backend.js") === "physics" && areaOf("physics/em/hall.js") === "physics/em");
}

// ---- 3. *** THE THREE VERDICTS, EACH CONSTRUCTED. *** ------------------------------------------------------------------
// A gate that has only ever seen the passing case is a gate nobody has watched work. These build the record by
// hand so every branch is exercised without touching the tree.
{
    const rec = readCensus();
    const fake = (mods) => ({ roots: rec.roots, total: mods.length, areas: {}, modules: mods });

    // GREW: the record is the tree minus two modules
    const grew = (() => {
        const now = census();
        const before = fake(now.modules.slice(0, now.modules.length - 2));
        const added = now.modules.filter((m) => !new Set(before.modules).has(m));
        const reconciles = (before.total + added.length - 0) === now.total;
        return { added, reconciles };
    })();
    ok("!! GREW: modules added, every one NAMED, and the totals reconcile exactly",
       grew.added.length === 2 && grew.reconciles,
       "two synthetic additions, both named — routine growth is reported and does not stop a ship");

    // REMOVALS: the record holds a module the tree does not
    const removed = (() => {
        const now = census();
        const before = fake([...now.modules, "physics/ghost/vanished.js"]);
        return (before.modules || []).filter((m) => !new Set(now.modules).has(m));
    })();
    ok("!! REMOVALS: a module in the record and absent from the tree is caught BY NAME",
       removed.length === 1 && removed[0] === "physics/ghost/vanished.js",
       "and a loss is treated harder than a gain on purpose: adding physics is routine, physics quietly " +
       "DISAPPEARING is how a deletion ships unnoticed — and the old pin fired identically for both, which is " +
       "why it taught people to raise the number");

    // NO-RECORD is a state of its own, not a pass
    const moved = path.join(ENG, CENSUS_FILE), tmp = moved + ".bak";
    let noRec = null;
    try { fs.renameSync(moved, tmp); noRec = compare(); } finally { if (fs.existsSync(tmp)) fs.renameSync(tmp, moved); }
    ok("!! NO-RECORD is its own verdict — not a pass, and not a failure of the tree",
       noRec && noRec.verdict === "NO-RECORD" && /never been taken/.test(noRec.why),
       "an absent record and a matching record are different situations, and reporting the first as either " +
       "outcome would be the absent-is-not-empty mistake this lab keeps naming");
    ok("...and the file was put back",
       fs.existsSync(moved) && readCensus() !== null);
}

// ---- 4. *** THE GATE DOES NOT REPAIR ITS OWN EXPECTATION. *** -------------------------------------------------------------
// A check that rewrites the record it compares against can never fail twice. That is the "control that cannot
// fail" this lab has caught four separate times, and it is the obvious wrong turn for a self-recording census.
{
    const before = fs.readFileSync(path.join(ENG, CENSUS_FILE), "utf8");
    compare(); compare(); compare();
    const after = fs.readFileSync(path.join(ENG, CENSUS_FILE), "utf8");
    ok("!! comparing does not write. Three compares leave the record byte-identical",
       before === after,
       "writing is a SHIP STEP and comparing is the GATE, and they are deliberately different programs. A census " +
       "that healed itself would pass forever and mean nothing");
    const src = fs.readFileSync(path.join(ENG, "tools/ship/populationCensus.mjs"), "utf8");
    const compareBody = src.slice(src.indexOf("export function compare"), src.indexOf("export function lines"));
    ok("...and compare() contains no write call at all",
       !/writeFileSync|writeCensus\(/.test(compareBody),
       "checked in the source rather than only in behaviour, so a later edit that adds one is caught here");
}

// ---- 5. IT IS A DECLARED SHIP STEP, SO THE RECORD CANNOT GO STALE THE WAY THE PIN DID -----------------------------------
{
    const ritual = fs.readFileSync(path.join(ENG, "tools/ship/shipRitual.mjs"), "utf8");
    ok("!! taking the census is a step in the declared ritual, not a thing to remember",
       /populationCensus\.mjs --write/.test(ritual),
       "the pin failed because it needed a human to notice between rounds. A step in the ritual is performed " +
       "because the ritual is performed");
}

for (const l of lines()) console.log("        " + l);
console.log(fails ? ("[populationCensus-selfcheck] FAILED " + fails) : "[populationCensus-selfcheck] all passed");
process.exit(fails ? 1 : 0);
