// WebGLEngine/tools/ship/importPosition-selfcheck.mjs
//
// Run: node tools/ship/importPosition-selfcheck.mjs   (~3s -- MEASURED)
//
// v4410 -- *** A GUARD WAS DELETED BECAUSE IT WAS MEASURED INERT. THE MEASUREMENT WAS TRUE. THE TREE THEN GREW
// THE CASE THE GUARD EXISTED FOR. ***
//
// world/orreryEjecta.mjs's own header records the whole thing in advance. Its first draft required a
// `vendor/<name>/` hit to sit inside a quoted specifier; all 32 matching files satisfied that anyway; so the
// guard was removed under the rule that "a guard whose removal changes no count is not caution, it is an
// assertion that cannot fail". THE RULE IS RIGHT. What it does not carry is that INERTNESS IS A PROPERTY OF THE
// TREE ON THE DAY IT IS MEASURED, and at v4406 tools/ship/gateSweep.mjs was filed as a box3d importer because a
// sweep closing's `verdict:` string quotes "/vendor/box3d/box3d.js" while explaining that box3dLoader imports it.
//
// AND THE DELETED GUARD WOULD NOT HAVE CAUGHT IT EITHER: that mention IS quoted. The question is not whether
// the path is in a string. It is whether THE STRING IS THE PATH.
//
// FIVE KINDS, AND THE FIFTH WAS ADDED ONLY AFTER LOOKING AT WHAT THE FOURTH CAUGHT. The first census called 21
// files record-only; NINE OF THEM DEPEND ON THE BODY through path.join(..., "vendor", "box3d", ...), whose only
// literal hit is a log line saying the artifact is absent. Filtering the 21 would have deleted nine real
// dependants to remove twelve false ones -- item 5's own warning that this fix could trade one wrong count for
// another, met by reading the list instead of the number (v4404's rule).
//
// MEASURED, AND THE OLD RULE IS WRONG IN BOTH DIRECTIONS: 138 counted, of which 12 are records; and 17 files it
// never saw at all. The corrected population is 143.
//
// SABOTAGES (4 attempted, 5 more probed, ALL LOGGED -- and three of them cost ZERO RED, which is the finding
// that rewrote section 2):
//   A. dropped the SPECIFIER test, leaving v4329's deleted guard exactly as it was ("is it quoted") -> 3 reds
//      by name, INCLUDING the gateSweep.mjs row. That is the direct proof the old guard would not have helped.
//   B. reverted enclosingString to a whole-file quote scan -- this round's own first draft -> ZERO RED.
//   B2. took the FIRST enclosing pair instead of the tightest -> ZERO RED.
//   B3. let a quote pair span lines -> ZERO RED.
//      *** THREE SABOTAGES, NO REDS, AND THE ROW WAS TESTING NOTHING. *** Section 2 used a two-line fixture,
//      and a fixture has too few quotes to go wrong. A sabotage that goes 0 red is a finding, not a pass
//      (v4290, v4297), so the row now runs against main.js -- 6,600 lines, the file the bug was actually found
//      on -- and sabotage B then costs a red BY NAME. The other two still cost nothing, and that is stated
//      rather than hidden: they are weaker mutations than the one that happened.
//   D. filed importmap values back as `path` -> 1 red by name, the three-real-pages row.
// The population does not move under D: an importmap value was always counted as a dependency, and what
// changed is whether the report can say HOW a page reaches a body.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as IP from "./importPosition.mjs";
import * as E from "../../world/orreryEjecta.mjs";
import { engineSources } from "./orreryFleetScan.mjs";
import { gateReport } from "./gateReport.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const REPORT = gateReport("tools/ship/importPosition-selfcheck.mjs");

const N = "vendor/box3d/";

console.log("\n1. the kinds, on fixtures where the answer is not in doubt");
{
    const cases = [
        ['import * as B from "/vendor/box3d/box3d.js";', "import", "a static import"],
        ['const m = await import("./vendor/box3d/box3d.js");', "import", "a dynamic import"],
        ['const m = require("./vendor/box3d/box3d.js");', "import", "require"],
        ['export { x } from "/vendor/box3d/box3d.js";', "import", "a re-export"],
        ['await fetch("/vendor/box3d/box3d.wasm");', "load", "fetched at runtime"],
        ['new Worker("/vendor/box3d/worker.js");', "load", "a worker"],
        ['<script src="/vendor/box3d/box3d.js"></script>', "load", "markup"],
        ['files: ["vendor/box3d/box3d.js", "vendor/box3d/box3d.wasm"]', "path", "a specifier the tool weighs"],
        ['console.log("SKIPPED: vendor/box3d/box3d.wasm absent -- run the build");', "record", "a sentence that CONTAINS the path"],
        ['verdict: "box3dLoader imports \\"/vendor/box3d/box3d.js\\", a browser-absolute path"', "record", "*** THE ONE THAT SHIPPED: a record ABOUT an import ***"],
    ];
    let wrong = [];
    for (const [src, want, why] of cases) {
        const got = IP.kindOf(src, N, "box3d");
        if (got !== want) wrong.push(`${why}: want ${want}, got ${got}`);
    }
    ok("!! *** all ten fixtures land on the kind they are ***", wrong.length === 0, wrong.join("; ") || `${cases.length} of ${cases.length}`);
    ok("!! ...and the one that shipped -- a verdict string quoting an import -- reads RECORD",
        IP.kindOf('v: "box3dLoader imports \\"/vendor/box3d/box3d.js\\" absolutely"', N, "box3d") === "record",
        "v4329's deleted guard asked 'is it quoted'. THIS IS QUOTED. The question is whether the string IS the path");
    ok("...and a joined path is seen even with no substring hit at all",
        IP.kindOf('const W = path.join(here, "..", "vendor", "box3d", "box3d.wasm");', N, "box3d") === "joined",
        "the hole BOTH rules had: nine dependants were only ever counted because they ALSO mentioned the path in prose");
    REPORT.table("what a quoted path is worth, by where it sits", ["source", "kind"],
        cases.map(([src, want]) => [src.length > 54 ? src.slice(0, 54) + "..." : src, want]),
        "The last row is the occurrence that put tools/ship/gateSweep.mjs in box3d's fleet for four rounds.");
}

console.log("\n2. the string finder is LINE-LOCAL, because the first draft was not");
{
    // *** THIS ROUND'S OWN DEFECT, KEPT AS A CHECK. *** The first enclosingString paired quotes from byte 0.
    // One unbalanced apostrophe in prose offset everything after it, so every occurrence got an "enclosing
    // string" and every one was wrong: the census read `import: 0` across the whole tree and filed main.js --
    // which does `import("./vendor/three/...")` twice -- as a record. It answered confidently and was
    // measuring something else, which is exactly what this gate exists to catch one level up.
    // *** AND A FIXTURE COULD NOT FALSIFY THIS, WHICH IS ITS OWN FINDING. *** The first version of this row used
    // a two-line string with an apostrophe in it. Reverting enclosingString to a whole-file scan, then to the
    // first-enclosing-pair, then to a pair allowed to span lines, cost ZERO RED all three times: a short fixture
    // has too few quotes to go wrong. A sabotage that goes 0 red is a finding and not a pass (v4290, v4297), so
    // the row now runs against THE FILE THE BUG WAS FOUND ON. main.js is 6,600 lines with hundreds of
    // apostrophes in prose ahead of its `import("./vendor/three/...")`, and the first draft read it as a record.
    const MAIN = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    ok("!! *** main.js, 6,600 lines of prose and apostrophes, reads as an IMPORT of three ***",
        IP.kindOf(MAIN, "vendor/three/", "three") === "import",
        "THE FIRST DRAFT READ THIS EXACT FILE AS A RECORD and reported 0 imports across the whole tree. " +
        "A fixture could not catch that; only a file long enough to break the pairing could");
    ok("...and every real page that imports three reads as an import too",
        ["ascii-object.html", "splat_viewer.html", "tsl-rig.html"].every((f) => {
            const src = fs.existsSync(path.join(ENG, f)) ? fs.readFileSync(path.join(ENG, f), "utf8") : "";
            const k = IP.kindOf(src, "vendor/three/", "three") || IP.kindOf(src, "vendor/three-webgpu/", "three-webgpu");
            return k === "import" || k === "load";
        }), "three real pages, importmap and script-src between them");
    const q = IP.enclosingString('a = "/vendor/box3d/box3d.js";', 6);
    ok("...and the enclosing string is the string, not a neighbour", q && q.text === "/vendor/box3d/box3d.js", q ? q.text : "null");
    ok("...and a hit outside any string is a record, not a crash",
        IP.occurrences("// bare vendor/box3d/ text\nx", N)[0].kind === "record", "nothing the runtime can load");
}

console.log("\n3. the corrected census across the real tree");
const FILES = engineSources(ENG);
const BODIES = fs.readdirSync(path.join(ENG, "vendor"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
{
    let old = 0, kinds = { import: 0, load: 0, path: 0, joined: 0, record: 0 }, records = [], unseen = [];
    for (const b of BODIES) {
        const needle = "vendor/" + b + "/";
        const hitPaths = E.ejectaOf(b, FILES);
        old += hitPaths.length;
        const c = IP.census(hitPaths.map((p) => FILES.find((f) => f.path === p)), needle, b);
        for (const k of Object.keys(kinds)) kinds[k] += c[k].length;
        for (const r of c.record) records.push(b + ": " + r);
        for (const f of FILES) if (!hitPaths.includes(f.path) && IP.joined(f.source, b)) unseen.push(b + ": " + f.path);
    }
    const now = BODIES.reduce((a, b) => a + E.dependantsOf(b, FILES).length, 0);
    ok("!! *** the old substring rule is wrong in BOTH directions, and the round says by how much ***",
        records.length > 0 && unseen.length > 0,
        `it counted ${old}: ${records.length} are RECORDS rather than dependencies, and it never saw ${unseen.length} ` +
        `files that reach a body through path.join. Corrected population ${now}`);
    ok("...and the five kinds partition what it counted, with no sixth",
        kinds.import + kinds.load + kinds.path + kinds.joined + kinds.record === old,
        `${kinds.import} import + ${kinds.load} load + ${kinds.path} path + ${kinds.joined} joined + ${kinds.record} record = ${old}`);
    ok("...and MOST of what it counted was right, which is why this is a correction and not a rewrite",
        kinds.import + kinds.load + kinds.path + kinds.joined > old * 0.8,
        `${old - records.length} of ${old} entries stand`);
    REPORT.table("the fleet, re-derived positionally", ["kind", "files", "what it means"],
        [["import", String(kinds.import), "in the module graph"],
         ["load", String(kinds.load), "fetched, worked or scripted at runtime"],
         ["path", String(kinds.path), "a specifier the tool reads, stats or weighs"],
         ["joined", String(kinds.joined), "reached via path.join -- INVISIBLE to a substring rule"],
         ["record", String(kinds.record), "the path inside a sentence: NOT a dependency"]],
        `The old rule counted ${old}; it also missed ${unseen.length} files entirely. Corrected: ${now}.`);
    say("THE TWELVE RECORDS, NAMED so the next round can read them rather than trust this count: " + records.join("; "));
}

console.log("\n4. the baseline is frozen BY NAME, and the derived count cannot disagree with it");
{
    const derived = Object.fromEntries(Object.entries(E.DEPENDANTS_AT_V4410).map(([k, v]) => [k, v.length]));
    ok("!! *** every count in EJECTA_BASELINE is derived from the name list, never typed ***",
        JSON.stringify(derived) === JSON.stringify(E.EJECTA_BASELINE),
        "v4399's rule: a count ratchet drifts with the tree and cannot say WHICH entry moved, and the round " +
        "that raises it is the one least able to tell. The record is the list; the number is a view of it");
    const missing = BODIES.filter((b) => !(b in E.DEPENDANTS_AT_V4410));
    ok("...and every vendored body has an entry, so an arrival cannot land unmeasured",
        missing.length === 0, missing.join(", ") || `${BODIES.length} bodies`);
    ok("...and the frozen names still resolve, so every entry stays falsifiable",
        Object.values(E.DEPENDANTS_AT_V4410).flat().every((p) => fs.existsSync(path.join(ENG, p))),
        `${Object.values(E.DEPENDANTS_AT_V4410).flat().length} paths checked`);
}

console.log("\n5. and the occurrence that started it is gone from the fleet");
{
    const box = E.dependantsOf("box3d", FILES);
    ok("!! *** tools/ship/gateSweep.mjs is no longer a box3d importer ***", !box.includes("tools/ship/gateSweep.mjs"),
        "it was one for four rounds because a sweep closing quotes the vendor path while explaining an import");
    ok("...and the file still MATCHES the old substring rule, so this is the position and not a text edit",
        E.ejectaOf("box3d", FILES).includes("tools/ship/gateSweep.mjs"),
        "nothing was reworded to get green -- the record still says what it said, and the rule stopped miscounting it");
    ok("...and the files that really do import box3d are still there",
        box.includes("physics/box3d/box3dNode.mjs") && box.length > 20, `${box.length} dependants`);
}

say("WHAT THIS DOES NOT CLAIM. That the classification is right in general -- it is a POSITIONAL rule over " +
    "text, not a parse, and a specifier assembled at runtime from pieces is invisible to it exactly as it was " +
    "to the substring rule. It does not read a bundler config, a symlink, or an importmap that renames a bare " +
    "specifier to a vendored path in one file and uses the bare name in fifty others -- those fifty depend on " +
    "the body and this counts one. And the `joined` detector matches a literal \"vendor\" beside a literal body " +
    "name, so a path built from a VARIABLE body name -- which is what a generic vendor walker does -- is " +
    "attributed to no body at all, which is right for a walker and wrong the day somebody writes a specific " +
    "dependency that way.");

REPORT.write();
console.log(`\nimportPosition-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
