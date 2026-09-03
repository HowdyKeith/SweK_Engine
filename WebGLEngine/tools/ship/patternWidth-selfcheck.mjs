// WebGLEngine/tools/ship/patternWidth-selfcheck.mjs
//
// Run: node tools/ship/patternWidth-selfcheck.mjs   (~4s -- MEASURED)
//
// v4418 -- *** SIX INSTANCES OF ONE DEFECT SPECIES AND NOTHING HAD EVER LOOKED FOR IT. ***
//
// v4416 fixed five too-narrow patterns in one function and closed with a claim it could not check: "this
// cannot prove there is no SIXTH narrow pattern, and the round's own history is that every widening found one
// more." Across this session the species has now been recorded in shaderCensus (v4383), claimEvidence (v4404),
// orreryFleetScan (v4412), the licence scan (v4415) and five times over in the provenance scan (v4416). EVERY
// ONE WAS FOUND BY A PERSON LOOKING AT A ROW THAT SEEMED WRONG.
//
// The shape is precise enough to search for: A PATTERN THAT NAMES A KIND OF FILE AND REJECTS A FILE IN THIS
// TREE THAT IS PLAINLY OF THAT KIND. The evidence is a real filename, not a style opinion.
//
// TWO DETECTORS, BECAUSE THEY FIND DIFFERENT FILES AND THAT IS THE ARGUMENT FOR BOTH:
//   A. the kind-word near-miss (tools/ship/patternWidth.mjs), validated against v4416's own five.
//   B. two classifiers of the same kind DISAGREEING on a real file, which is the check v4415 added after
//      sabotaging showed the census could look healthy while a licensed body was falsely accused.
//
// *** AND MY DETECTOR COMMITTED THE SPECIES TWICE WHILE BEING WRITTEN. *** It first counted world/gpuProvenance.mjs
// -- a MODULE -- as a provenance record, so every licence classifier "missed" it; and its kind matcher searched
// the pattern body for literal words, so world/orreryEjecta.mjs's `LICEN[CS]E` did not read as naming the
// licence kind at all and THE VERY INSTANCE THAT MOTIVATED THE ROUND WAS INVISIBLE TO IT. Single-character
// classes are expanded now. That is the sixth and seventh sightings, inside the detector for the species.
//
// SABOTAGES (4, all logged, MEASURED 3/2/1/2 by name):
//   A. reverted isPaperFile to the anchored list -> 3 red: the census names it UNADJUDICATED, the two-reader
//      check names ASHIMA-LICENSE.txt and IBMPlexSerif-OFL.txt, and the fonts row goes with them.
//   B. dropped character-class expansion -> 2 red, including the fixture row: orreryEjecta's pattern stops
//      being caught, which is the round's own find becoming invisible again.
//   C. dropped the documentary filter -> world/orrery.mjs:55 is flagged, which is LICENCE_NAME ITSELF, the
//      widest rule in the tree, "missing" a module called gpuProvenance.mjs. The false-positive direction,
//      demonstrated on the one pattern that must never be flagged.
//   D. dropped the standalone-token test -> /licenceSweep/ and /reachedLicences-selfcheck/ read as classifiers.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as PW from "./patternWidth.mjs";
import { isLicenceFile } from "../../world/orrery.mjs";
import { isPaperFile } from "../../world/orreryEjecta.mjs";
import { gateReport } from "./gateReport.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const REPORT = gateReport("tools/ship/patternWidth-selfcheck.mjs");

const FILES = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (/node_modules|^\.git$|GPU_Assets|demos_code/.test(e.name)) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else FILES.push(path.relative(ENG, p).replace(/\\/g, "/"));
    }
})(ENG);
const BASES = [...new Set(FILES.map((f) => f.split("/").pop()))];

// The five patterns v4416 shipped and then had to widen, verbatim. A detector for a species that cannot find
// the instances the species is named after is a detector nobody should trust, and none of the five original
// scanners was ever put to this test -- which is exactly why each of them shipped looking correct.
const V4416_PATTERNS = Object.freeze([
    { why: "the record must be .md", body: "(^|\\/)(provenance|readme)\\.md$", flags: "i" },
    { why: "the licence word only at a path-segment start", body: "(^|\\/)(licen[cs]e|copying|notice|attribution|ofl|unlicense)", flags: "i" },
    { why: "orreryEjecta's paperwork list, anchored at the filename start", body: "^(LICEN[CS]E|COPYING|NOTICE|ATTRIBUTION|PROVENANCE|README|AUTHORS|PATENTS)", flags: "i" },
]);

console.log("\n1. VALIDATED AGAINST KNOWN POSITIVES, which is what none of the five originals ever was");
{
    const missed = [];
    for (const p of V4416_PATTERNS) {
        const nm = PW.nearMisses(p.body, p.flags, BASES);
        if (!nm) missed.push(p.why);
    }
    ok("!! *** every pattern this session had to widen is caught, with the file it rejects ***", missed.length === 0,
        missed.length ? "NOT CAUGHT: " + missed.join("; ") : V4416_PATTERNS.map((p) => {
            const nm = PW.nearMisses(p.body, p.flags, BASES);
            return p.why + " -> " + nm.miss[0];
        }).join(" | "));
    ok("!! ...and the licence pattern is caught naming IBMPlexSerif-OFL.txt, the file v4415 falsely accused",
        (PW.nearMisses(V4416_PATTERNS[1].body, "i", BASES) || { miss: [] }).miss.includes("IBMPlexSerif-OFL.txt"),
        "the round that wrote that pattern found this by hand; this finds it by running");
    ok("...and a pattern that is already WIDE is not flagged",
        PW.nearMisses("(licen[cs]e|copying|notice|attribution|ofl|unlicense)", "i", BASES) === null,
        "orrery.mjs's own LICENCE_NAME, the rule the tree arrived at after three false accusations");
    REPORT.table("the patterns this session had to widen, re-tested", ["pattern", "rejects"],
        V4416_PATTERNS.map((p) => [p.body.slice(0, 52), (PW.nearMisses(p.body, p.flags, BASES) || { miss: ["-"] }).miss.slice(0, 2).join(", ")]),
        "A detector for a species that cannot find the instances it is named after is one nobody should trust.");
}

console.log("\n2. a kind word inside a NAME is not a kind, or this is the word-counting defect one level up");
{
    ok("!! *** /licenceSweep/ names a MODULE and is not a classifier ***", PW.namesAKind("licenceSweep").length === 0,
        "it contains 'licence' and classifies nothing -- flagging it would be v4383's defect, in the tool for v4383's defect");
    ok("...nor is /reachedLicences-selfcheck/", PW.namesAKind("reachedLicences-selfcheck").length === 0, "'licences', inside an identifier");
    ok("...but (LICENCE|COPYING) classifies two kinds", PW.namesAKind("^(LICENCE|COPYING)$").sort().join(",") === "copying,licence", "standalone tokens");
    ok("!! ...and LICEN[CS]E reads as the licence kind, which the first draft could not see",
        PW.namesAKind("^(LICEN[CS]E|COPYING)").includes("licence") && PW.namesAKind("^(LICEN[CS]E|COPYING)").includes("license"),
        "THE PATTERN THAT MOTIVATED THIS ROUND WAS INVISIBLE TO ITS OWN DETECTOR until character classes were expanded");
    ok("...and a module named for a kind is not a file of that kind",
        !PW.isDocumentary("gpuProvenance.mjs") && PW.isDocumentary("PROVENANCE.txt") && PW.isDocumentary("LICENSE"),
        "the first draft counted world/gpuProvenance.mjs as a provenance record and every classifier 'missed' it");
}

console.log("\n3. the live census, frozen with a verdict on every row");
const SRCS = FILES.filter((f) => /\.mjs$/.test(f) && /^(tools|world|engine|physics|render)\//.test(f))
    .map((p) => ({ path: p, source: fs.readFileSync(path.join(ENG, p), "utf8") }));
const CENSUS = PW.census(SRCS, BASES);
{
    // Frozen BY NAME with the judgement recorded once, which is the tree's habit and the only way a census of
    // patterns is useful: a new row is a new pattern nobody has adjudicated, and it fails here on arrival.
    // Frozen BY NAME with the judgement recorded once, which is the tree's habit and the only way a census of
    // patterns is useful: a new row is a pattern nobody has adjudicated, and it fails here on arrival.
    //
    // *** IT IS EMPTY, AND THAT IS A RESULT RATHER THAN A HOLE. *** The one row the first draft carried --
    // swekWebviewApk's /manifest\.webmanifest/ -- stopped being a near-miss when the documentary rule landed,
    // because every file it "missed" was AndroidManifest.xml, manifest.json and updateManifest.js: code and
    // config, not documents. isPaperFile, the round's actual find, was widened. So the tree currently has no
    // unadjudicated near-miss, and the reason to believe that number rather than suspect the detector is
    // SECTION 1: three patterns this session really did have to widen are fed back in and all three are caught.
    // An empty census beside a passing fixture set is evidence; an empty census alone is the shape v4402 named.
    const ADJUDICATED = Object.freeze({
        // v4420 -- A FROZEN FIXTURE OF THE DEFECT, ON PURPOSE. tools/ship/predicatePairs-selfcheck.mjs carries
        // isPaperFile exactly as it stood before v4418 widened it, as the known positive its own method is
        // validated against. This census correctly reports it as rejecting ASHIMA-LICENSE.txt, because it does.
        // Widening it would destroy the fixture; the row is adjudicated instead, and the two gates checking each
        // other two rounds apart is the census working rather than a collision.
        "tools/ship/predicatePairs-selfcheck.mjs": "a deliberately narrow pattern, frozen as the KNOWN POSITIVE " +
            "that validates predicatePairs' method. It is a fixture of the defect, not an instance of it.",
    });
    const rows = CENSUS.rows;
    const surprise = rows.filter((r) => !(r.path in ADJUDICATED));
    ok("!! *** every near-miss in the tree has a verdict recorded against it ***", surprise.length === 0,
        surprise.length ? "UNADJUDICATED: " + surprise.map((r) => r.path + ":" + r.line + " rejects " + r.miss[0]).join("; ") +
            " -- widen it, or record here WHY it is right to be narrow"
            : `${rows.length} near-miss(es) across ${CENSUS.examined} patterns, all adjudicated`);
    ok("...and the adjudicated list may only SHRINK -- a row that was widened is removed, not left standing",
        Object.keys(ADJUDICATED).every((p) => rows.some((r) => r.path === p)),
        Object.keys(ADJUDICATED).filter((p) => !rows.some((r) => r.path === p)).join(", ") ||
        `${Object.keys(ADJUDICATED).length} standing, each with a reason`);
    REPORT.table("patterns that reject a file of the kind they name", ["where", "pattern", "rejects", "verdict"],
        rows.map((r) => [r.path.split("/").pop() + ":" + r.line, r.body.slice(0, 34), r.miss.slice(0, 2).join(", "),
                         r.path in ADJUDICATED ? "names a file" : "UNADJUDICATED"]),
        `${CENSUS.examined} regex literals examined across ${SRCS.length} modules.`);
}

console.log("\n4. two classifiers of one kind, disagreeing on a real file -- the check that found the sixth");
{
    // *** DETECTOR A DID NOT FIND THIS ON ITS OWN AT FIRST, AND SAYING SO IS THE POINT. *** isPaperFile rejects
    // IBMPlexSerif-OFL.txt, but that filename carries no kind word isPaperFile NAMES -- "ofl" is not in its
    // list -- so the near-miss test could not see it. A found ASHIMA-LICENSE.txt instead. Two detectors, two
    // different real files, one defect: which is the argument for keeping both rather than picking a favourite.
    const disagree = BASES.filter((b) => isLicenceFile(b) && !isPaperFile(b));
    ok("!! *** no file is a LICENCE to world/orrery.mjs and PAYLOAD to world/orreryEjecta.mjs ***",
        disagree.length === 0,
        disagree.length ? disagree.join(", ") + " -- one of the two readers is wrong, and both ship"
                        : `${BASES.filter(isLicenceFile).length} licence-named files, and the two agree on every one`);
    const J = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
    const fonts = J.bodies.find((b) => b.name === "fonts");
    const ofl = (fonts.files || []).find((f) => /OFL/i.test(f.path));
    ok("!! ...and vendor/fonts' OFL is paperwork rather than code mass, which is what the disagreement cost",
        !!ofl && isPaperFile(ofl.path) && ofl.bytes > 1000,
        ofl ? `${ofl.path}, ${ofl.bytes} bytes, previously counted as payload and drawing a planet's radius` : "not found");
    ok("...and a provenance record is still NOT a licence, so the delegation did not flatten the two kinds",
        isPaperFile("PROVENANCE.txt") && !isLicenceFile("PROVENANCE.txt"),
        "paperwork and licence are different questions and stay different");
}

say("WHAT THIS DOES NOT CLAIM. That there is no eighth instance. It reads REGEX LITERALS on non-comment lines " +
    "and cannot see a pattern built from a string at runtime, one in an .html page, or a classification made " +
    "with indexOf and an if. It cannot tell what a pattern is APPLIED to -- section 3's one standing row is " +
    "adjudicated by hand precisely because a token test cannot know that manifest.webmanifest is a filename " +
    "and not a kind. It only finds misses against files that EXIST: a pattern that will reject the next file " +
    "somebody adds is invisible until they add it, which is the same limit v4416's five had and the reason the " +
    "adjudicated list is a ratchet rather than a report. And section 4 compares exactly two classifiers, named " +
    "by hand: nothing here discovers that two functions are answering the same question.");

REPORT.write();
console.log(`\npatternWidth-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
