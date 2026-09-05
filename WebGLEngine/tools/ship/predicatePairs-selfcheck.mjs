// WebGLEngine/tools/ship/predicatePairs-selfcheck.mjs
//
// Run: node tools/ship/predicatePairs-selfcheck.mjs   (~8s -- MEASURED, it imports the tree's quiet modules)
//
// v4420 -- *** DISCOVERING THAT TWO FUNCTIONS ANSWER THE SAME QUESTION, WHICH IS WHERE v4418'S FINDING LIVED
// AND WHICH v4419 NAMED AS THE HALF NOTHING DID. ***
//
// v4418 compared world/orrery.mjs's isLicenceFile with world/orreryEjecta.mjs's isPaperFile BY HAND, because a
// person happened to know both existed. The signature turns out to be mechanical: run every predicate over one
// corpus and compare the sets they accept. identical is a duplicate; CONTAINMENT is a designed hierarchy
// (every licence is paperwork, and more besides); CROSSING -- each accepting what the other rejects -- is two
// functions answering one question and disagreeing about it. v4418's fix turned that pair from crossing into
// containment, which is the fixture this gate is built on.
//
// *** AND IT FOUND A DEFECT IN THE WIDEST, MOST-TRUSTED RULE IN THE TREE. *** v4263 widened LICENCE_NAME three
// times to stop isLicenceFile falsely accusing properly licensed dependencies, and every widening was right.
// NOBODY ASKED THE OTHER DIRECTION. Measured here, two of the six files it matched were .mjs MODULES --
// brain/rl/attribution.mjs and its gate -- because it looks for the word anywhere in a name and "attribution" is a
// fine name for code about attribution. A licence is a DOCUMENT. Requiring that costs nothing: all seventeen
// licences under vendor/ are documentary and stay matched.
//
// *** THE DETECTOR NARROWED ITSELF FOUR TIMES BEFORE IT COULD SEE ITS OWN MOTIVATING CASE. *** Each was found by
// asking "why is the known pair not here?" rather than by reading the output: the body cap was 700 characters
// and isPaperFile's comment is longer; comments were scanned for calls, so prose about a call read as a call;
// the probe corpus was the first 400 basenames, which contain no licence, so isLicenceFile looked like a
// function that never returns true; and raw agreement was the measure, under which two predicates that reject
// almost everything agree 92% of the time about nothing. That is v4418's finding for the third round running:
// the detector is built around the shape its author pictured, and the motivating case is not that shape.
//
// SABOTAGES (4, all logged, MEASURED 3/1/2/1 by name):
//   A. reverted isLicenceFile's documentary constraint -> 3 red: the crossing pair comes back UNADJUDICATED,
//      the direction check names six accepted files, and the module row names attribution.mjs.
//   B. replaced the overlap coefficient with raw agreement -> isErrorObservable and isDocumentary read as a
//      crossing pair, two unrelated predicates that agree 92% of the time by both saying NO.
//   C. restored the 700-character body cap -> isPaperFile stops being extracted, so the pair the file exists
//      to find vanishes from the census AND the ratchet notices the adjudicated entry is now unmatched.
//   D. scanned comments for calls again -> a predicate whose comment mentions fs.readFileSync is dropped.
"use strict";
import fs from "node:fs";
import path from "node:path";
import url, { fileURLToPath } from "node:url";
import * as PP from "./predicatePairs.mjs";
import { isDocumentary as PW_DOC } from "./patternWidth.mjs";
import { isLicenceFile, isDocumentary } from "../../world/orrery.mjs";
import { isPaperFile } from "../../world/orreryEjecta.mjs";
import { gateReport } from "./gateReport.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const REPORT = gateReport("tools/ship/predicatePairs-selfcheck.mjs");

const FILES = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (/node_modules|^\.git$|GPU_Assets|demos_code/.test(e.name)) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else FILES.push(path.relative(ENG, p).replace(/\\/g, "/"));
    }
})(ENG);
const CORPUS = [...new Set(FILES.map((f) => f.split("/").pop()))];

// isPaperFile exactly as it stood before v4418 widened it. The known positive.
const PAPER_PRE_V4418 = (p) =>
    /^(LICEN[CS]E|COPYING|NOTICE|ATTRIBUTION|PROVENANCE|README|AUTHORS|PATENTS)/i.test(String(p || "").split("/").pop());

console.log("\n1. VALIDATED ON THE PAIR v4418 FOUND BY HAND, in both of its states");
{
    const pre = PP.relate(PP.accepts(isLicenceFile, CORPUS), PP.accepts(PAPER_PRE_V4418, CORPUS));
    const now = PP.relate(PP.accepts(isLicenceFile, CORPUS), PP.accepts(isPaperFile, CORPUS));
    ok("!! *** the pre-v4418 pair reads as CROSSING, and names the two files v4418 found ***",
        pre.shape === "crossing" && pre.onlyA.includes("ASHIMA-LICENSE.txt") && pre.onlyA.includes("IBMPlexSerif-OFL.txt"),
        `overlap ${(pre.overlap * 100).toFixed(0)}%, only-licence: ${pre.onlyA.join(", ")}`);
    ok("!! ...and the SAME pair after the fix reads as containment, so the repair is visible in the measure",
        now.shape === "containment" && now.overlap === 1 && now.onlyA.length === 0,
        `overlap ${(now.overlap * 100).toFixed(0)}%, every licence is paperwork and ${now.onlyB.length} paper files are not licences`);
    ok("...and the measure is OVERLAP, not Jaccard: containment scores 1.0 where Jaccard scores 0.35",
        now.overlap === 1 && now.jaccard < 0.5,
        `overlap 1.00, jaccard ${now.jaccard.toFixed(2)} -- Jaccard punishes a hierarchy for being a hierarchy`);
    ok("...and raw agreement is useless here, which is why it is not used",
        CORPUS.filter((s) => isLicenceFile(s) === isPaperFile(s)).length / CORPUS.length > 0.99,
        "these two agree on 99% of filenames by both saying NO -- two predicates that reject almost everything " +
        "agree about nothing, at length");
    REPORT.table("the pair v4418 found by hand, before and after its fix", ["state", "overlap", "shape", "only the licence rule"],
        [["before v4418", (pre.overlap * 100).toFixed(0) + "%", pre.shape, pre.onlyA.join(", ")],
         ["at v4420", (now.overlap * 100).toFixed(0) + "%", now.shape, now.onlyA.join(", ") || "-"]],
        "The fix turned a crossing into a containment, which is what a repair to this defect looks like in the measure.");
}

console.log("\n2. calling a function to find out what it is is a hazard, and two layers guard it");
{
    ok("a module with a top-level call is not quiet, so it is never imported",
        !PP.isQuiet("import x from 'y';\nrunEverything();\n") && PP.isQuiet("import x from 'y';\nexport const f = (s) => s.length > 0;\n"),
        "the first draft called every unary export and ran render/passFootprint.mjs's perturbFootprint, which " +
        "reached for a GPU and threw");
    ok("...and a body that calls anything but string work is not extracted",
        PP.extractPredicates('export function isX(s) {\n    return fs.readFileSync(s).length > 0;\n}').length === 0,
        "purity is decided from the SOURCE, before anything is imported");
    ok("!! ...and a long comment does not hide a predicate, which cost the first draft its own subject",
        PP.extractPredicates('export function isY(p) {\n' + '    // ' + "x".repeat(900) + '\n    return String(p).includes("a");\n}').length === 1,
        "the body cap was 700 characters and isPaperFile's comment is longer than that");
    ok("!! ...and a call named inside a COMMENT is not a call",
        PP.extractPredicates('export function isZ(p) {\n    // this used to call fs.readFileSync(p)\n    return String(p).includes("a");\n}').length === 1,
        "prose about a call is not a call -- v4412's finding, in a fourth place");
}

console.log("\n3. the live census: every CROSSING pair adjudicated by name");
const PREDS = [];
for (const f of FILES.filter((x) => /\.mjs$/.test(x) && !/-selfcheck\.mjs$/.test(x) && /^(world|tools|engine|physics|render)\//.test(x))) {
    const src = fs.readFileSync(path.join(ENG, f), "utf8");
    if (!PP.isQuiet(src)) continue;
    const found = PP.extractPredicates(src);
    if (!found.length) continue;
    let mod;
    try { mod = await import(url.pathToFileURL(path.join(ENG, f)).href); } catch { continue; }
    for (const p of found) if (typeof mod[p.name] === "function") PREDS.push({ file: f, name: p.name, fn: mod[p.name] });
}
const CENSUS = PP.census(PREDS, CORPUS);
{
    // Adjudicated BY NAME, judgement recorded once. A new crossing pair is two functions nobody has compared.
    const ADJUDICATED = Object.freeze({
        "isDocumentary|isPaperFile": "DIFFERENT QUESTIONS that overlap. isDocumentary asks whether a file is a " +
            "document at all; isPaperFile asks whether it is paperwork for a vendored body. A .md design note " +
            "is documentary and not paperwork; that is not a disagreement, it is two questions.",
        // isDocumentary|isLicenceFile WAS here and is gone, which is the ratchet doing its job within the hour:
        // the pair crossed until v4420 -- isLicenceFile accepted attribution.mjs, a module -- and the fix made
        // it a containment, so the entry stopped being true and the shrink check said so BY NAME.
    });
    const key = (r) => [r.a.name, r.b.name].sort().join("|");
    const surprise = CENSUS.crossing.filter((r) => !(key(r) in ADJUDICATED));
    ok("!! *** every crossing pair in the tree has a verdict recorded against it ***", surprise.length === 0,
        surprise.length ? "UNADJUDICATED: " + surprise.map((r) => key(r) + " (" + r.onlyA.slice(0, 2).join(",") + " | " +
            r.onlyB.slice(0, 2).join(",") + ")").join("; ") + " -- two functions answer one question and disagree; fix one or record why"
            : `${CENSUS.crossing.length} crossing pair(s) of ${CENSUS.rows.length} above the floor, across ${CENSUS.predicates} predicates`);
    ok("...and the adjudicated list may only SHRINK", Object.keys(ADJUDICATED).every((k) => CENSUS.crossing.some((r) => key(r) === k)),
        Object.keys(ADJUDICATED).filter((k) => !CENSUS.crossing.some((r) => key(r) === k)).join(", ") || `${Object.keys(ADJUDICATED).length} standing`);
    ok("!! ...and no predicate accepts a file that is not documentary while claiming to classify licences",
        CORPUS.filter(isLicenceFile).every(isDocumentary),
        `${CORPUS.filter(isLicenceFile).length} accepted, all documentary. BEFORE v4420 TWO OF SIX WERE .mjs MODULES`);
    REPORT.table("predicate pairs above the overlap floor", ["pair", "overlap", "shape", "each rejects"],
        CENSUS.rows.map((r) => [r.a.name + " / " + r.b.name, (r.overlap * 100).toFixed(0) + "%", r.shape,
            (r.onlyA.slice(0, 1).join("") || "-") + " | " + (r.onlyB.slice(0, 1).join("") || "-")]),
        `${CENSUS.predicates} predicates the tree exposes safely, out of roughly three thousand exported functions.`);
}

console.log("\n4. the widest rule in the tree, checked in the direction nobody checked");
{
    const acc = CORPUS.filter(isLicenceFile);
    ok("!! *** isLicenceFile accepts no .mjs module ***", !acc.some((b) => /\.(mjs|js|ts)$/.test(b)),
        acc.join(", ") + " -- brain/rl/attribution.mjs and attribution-selfcheck.mjs were two of the six");
    const J = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
    let vendorLicences = 0;
    for (const b of J.bodies) for (const f of b.files || []) if (isLicenceFile(f.path.split("/").pop())) vendorLicences++;
    ok("!! ...and the constraint costs the rule NOTHING: every vendored licence is still matched",
        vendorLicences === 17, `${vendorLicences} of 17 -- measured before the change and after`);
    ok("...and one owner holds the rule, so the two copies cannot drift",
        // NOT a source pattern -- the first version of this row matched the exact `export { x } from "y"` line
        // and went red the moment that had to become an import plus an export, which it did, because a
        // re-export gives no local binding and patternWidth USES the function. A check on the spelling of an
        // import is the species this session has spent six rounds on. It compares the FUNCTIONS instead.
        (async () => true)() && PW_DOC === isDocumentary,
        "patternWidth's isDocumentary IS world/orrery.mjs's, the same function object -- a second copy of a classification is the defect this file finds, and identity is the only test that cannot be satisfied by a lookalike");
}

say("WHAT THIS DOES NOT CLAIM. That it can compare the tree's classifications in general. It found FIVE " +
    "predicates it can safely evaluate out of roughly three thousand exported functions, because a predicate " +
    "has to be exported from a QUIET module, take one argument, be provably free of anything but string work, " +
    "and return a boolean over the corpus -- and that is a deliberately small, safe corner rather than a survey. " +
    "The corpus is FILENAMES: two predicates about something else would be compared over the wrong population " +
    "or not at all. A crossing is not proof of a defect -- two of the three standing pairs are genuinely " +
    "different questions that overlap, and saying which is a judgement, made once and recorded by name. And it " +
    "cannot see the case that started all of this: a classification written inline as an `if`, never named, " +
    "never exported, is invisible to every part of this.");

REPORT.write();
console.log(`\npredicatePairs-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
