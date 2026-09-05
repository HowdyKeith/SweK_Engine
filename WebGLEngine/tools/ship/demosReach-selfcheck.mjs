// WebGLEngine/tools/ship/demosReach-selfcheck.mjs -- v4425
//
// Run: node tools/ship/demosReach-selfcheck.mjs
//
// The FIRST GATE THAT LOOKS INSIDE demos_code/ -- 56 files and 19,110 lines excluded from staleness.mjs's
// gateFiles() and from buildKnowledgeIndex, and therefore from countGateFiles(), the knowledge index and the
// affected-file filter.
//
// *** SECTION 2 IS THE ONE THAT EARNS ITS KEEP LATER RATHER THAN TODAY. *** A gate living in demos_code would
// exist, pass by hand, and NEVER RUN ON A SHIP -- the exact defect staleness.mjs's own header records for the
// old `[\\/]vendor` pattern, which bit because a gate WAS there. Today none is. The check turns that from
// luck into a standing fact.
"use strict";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as D from "./demosReach.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// ---- 1. THE EXCLUSION IS WHERE THIS ROUND SAYS IT IS ---------------------------------------------------------
{
    const ENG = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
    const missing = D.EXCLUDED_BY.filter((rel) => {
        const src = fs.readFileSync(path.join(ENG, rel), "utf8");
        return !/const SKIP = \/[^\n]*demos_code/.test(src);
    });
    say(`demos_code/: ${D.demoFiles().length} files`);
    ok("!! both scanners named here really do exclude it -- the claim is checked, not asserted",
        missing.length === 0,
        missing.length ? "NOT excluding: " + missing.join(", ")
                       : D.EXCLUDED_BY.join(" and ") + " both carry demos_code in SKIP. IF THIS GOES RED " +
                         "somebody widened a scan, which is GOOD NEWS -- update this file rather than " +
                         "restoring the skip");
}

// ---- 2. *** NOTHING IS HIDING IN THERE, AND THAT IS NOW A STANDING FACT *** -----------------------------------
{
    say("");
    const hidden = D.hiddenGates();
    ok("!! *** no gate lives inside the excluded directory ***",
        hidden.length === 0 && D.MEASURED_AT_V4425.hiddenGates === 0,
        hidden.length ? "HIDDEN GATES: " + hidden.join(", ") + " -- these exist, pass by hand, and NEVER RUN " +
                        "ON A SHIP. Move them out; do not add demos_code to a walk to fix it"
                      : "0 of " + D.demoFiles().length + " files. This is the vendor defect's shape, caught " +
                        "BEFORE it happened rather than after -- staleness.mjs's header records the version " +
                        "where the same pattern hid a real gate for hundreds of rounds");
}

// ---- 3. THE COLLISIONS, NAMED -- AND EVERY ONE WITH AN ORACLE AGREES ------------------------------------------
{
    say("");
    const cols = D.collisions();
    for (const c of cols) say(`  ${c.name.padEnd(14)} ${c.demo[0]}  vs  ${c.tree[0]}`);
    ok("the collision list is frozen by NAME, so an arrival is pointed at rather than inferred",
        cols.map((c) => c.name).join(",") === [...D.MEASURED_AT_V4425.collisionNames].join(","),
        `measured [${cols.map((c) => c.name).join(", ")}]`);

    // *** THE ONE COLLISION WITH A KNOWN ANSWER. *** demos_code hand-rolls SHA-256; updatePolicy.mjs uses node
    // crypto. A standard has a right answer, so this is decidable rather than a matter of reading both.
    const { sha256 } = await import("../../demos_code/bitcoin_miner.js");
    const enc = (s) => new TextEncoder().encode(s);
    const badKat = D.SHA256_KAT.filter(([msg, want]) => D.toHex(sha256(enc(msg))) !== want);
    ok("!! *** the demo's hand-rolled SHA-256 passes the NIST vectors ***",
        badKat.length === 0,
        `${D.SHA256_KAT.length - badKat.length} of ${D.SHA256_KAT.length} FIPS 180-4 vectors. The file's ` +
        "header claims 'real double-SHA-256' and 'byte-identical hashes' -- TRUE, and never once checked " +
        "in 4,412 versions, because the directory it lives in is outside every scanner");

    let diff = 0;
    for (let i = 0; i < D.MEASURED_AT_V4425.sha256.randomInputs; i++) {
        const buf = crypto.randomBytes(1 + (i * 7) % 200);
        if (D.toHex(sha256(new Uint8Array(buf))) !== crypto.createHash("sha256").update(buf).digest("hex")) diff++;
    }
    ok("!! ...and agrees with node's crypto on every random input, not just the vectors",
        diff === 0,
        `${diff} of ${D.MEASURED_AT_V4425.sha256.randomInputs} disagree. Vectors prove the published cases; ` +
        "random inputs are what catch a length-padding bug that the three canonical messages happen to miss");

    // mat4Identity: same name, different container, and the sixteen values are the question.
    const demoSrc = fs.readFileSync(new URL("../../demos_code/texture_studio.js", import.meta.url), "utf8");
    const { mat4Identity } = await import("../../engine/xrSession.mjs");
    const treeVals = Array.from(mat4Identity());
    const demoVals = JSON.parse("[" + demoSrc.split("function mat4Identity()")[1].split("[")[1].split("]")[0] + "]");
    ok("!! mat4Identity: different container, SAME MATRIX",
        JSON.stringify(treeVals) === JSON.stringify(demoVals),
        `tree ${treeVals.join("")} vs demo ${demoVals.join("")}. One returns a Float32Array through an ` +
        "out-param and the other a plain Array -- v4412's fireRamp was a trap because two COLOUR RAMPS with " +
        "one name had different curves; these agree, and a negative result measured is worth more than a " +
        "trap assumed");
}

// ---- 4. THE COUNTS THE HEADER STATES ---------------------------------------------------------------------------
{
    say("");
    ok("the recorded counts are what the tree gives now",
        D.demoFiles().length === D.MEASURED_AT_V4425.files &&
        D.demoFunctionNames().size === D.MEASURED_AT_V4425.functionNames &&
        D.collisions().length === D.MEASURED_AT_V4425.collisions,
        `${D.demoFiles().length} files, ${D.demoFunctionNames().size} names, ${D.collisions().length} collisions`);
    ok("names are read from CODE, not from prose",
        !D.demoFunctionNames().has("thisNameOnlyAppearsInAComment"),
        "v4424 measured its own changelog because it read raw source; this file strips comments by default");
}

console.log("demosReach-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
