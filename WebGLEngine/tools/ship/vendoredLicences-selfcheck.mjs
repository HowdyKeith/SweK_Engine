#!/usr/bin/env node
// WebGLEngine/tools/ship/vendoredLicences-selfcheck.mjs -- v4257
//
// Run: node tools/ship/vendoredLicences-selfcheck.mjs
//
// *** THE LEDGER RECORDED WHAT WAS READ AND NOT TAKEN. NOTHING RECORDED WHAT WAS TAKEN. ***
//
// world/reachedLicences.mjs says so in its own docstring -- "sources read during assessment rounds and NOT
// vendored" -- and it is a careful record of eleven repositories whose bytes never entered the tree. The
// bytes that DID enter had no register at all. #61 filed it as "box3d and htmx", and the census says the
// shape is bigger and stranger than two names.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { VENDORED, KIND, GRANT, needsGrant, unpapered, spdxSet, naiveUnpapered } from "../../world/vendoredLicences.mjs";
import { REACHED_SOURCES } from "../../world/reachedLicences.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const ENG = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

console.log("vendoredLicences-selfcheck -- what came IN, as against what was only read\n");

// =============================================================================================================
console.log("1. *** THE REGISTER AND THE DISK AGREE IN BOTH DIRECTIONS ***");
{
    const onDisk = fs.readdirSync(path.join(ENG, "vendor"), { withFileTypes: true })
        .filter((e) => e.isDirectory()).map((e) => "vendor/" + e.name).sort();
    const declared = VENDORED.map((e) => e.path).sort();
    const missing = onDisk.filter((p) => !declared.includes(p));
    const stale = declared.filter((p) => !fs.existsSync(path.join(ENG, p)));
    ok("!! every directory under vendor/ is declared -- an UNDECLARED dependency cannot pass quietly",
        missing.length === 0, onDisk.length + " on disk, " + declared.length + " declared" +
        (missing.length ? ", MISSING: " + missing.join(", ") : ""));
    ok("!! ...and every declared path exists -- a stale record is the other failure and it is silent",
        stale.length === 0, stale.length ? stale.join(", ") : "none");
    // *** THE SECOND vendor/ DIRECTORY, which a census pointed at the first one never sees. ***
    ok("!! *** ui/vendor IS DECLARED TOO, and a census that globbed vendor/* would have missed it entirely ***",
        declared.includes("ui/vendor") && fs.existsSync(path.join(ENG, "ui/vendor/qrcode.mjs")),
        "there are two vendor directories in this tree. The top-level one is the obvious one and it is not " +
        "the only one, which is the difference between a census and a look.");
}

// =============================================================================================================
console.log("\n2. *** COUNTING BY FILENAME IS WRONG IN BOTH DIRECTIONS, AND HERE IS BY HOW MUCH ***");
{
    const naive = naiveUnpapered();
    ok("!! a filename census flags " + naive.length + " directories as unpapered",
        naive.length === 4, naive.join(", "));
    const real = unpapered();
    ok("!! *** AND THE TRUE ANSWER IS " + real.length + ", SO THREE OF THE FOUR ARE WRONG ***",
        real.length === 0,
        "vendor/fonts IS papered -- the grant is IBMPlexSerif-OFL.txt, the SIL Open Font License, under a " +
        "name no LICENSE pattern matches. vendor/keyhunt needs no grant because NOTHING IS VENDORED: its " +
        "ATTRIBUTION.txt records a technique reference and states 'NO CODE WAS COPIED'. vendor/wasm needs " +
        "none because it is OURS -- sha256.wasm and graphlayout.wasm are AssemblyScript output from .ts " +
        "files in the same directory. And ui/vendor is papered IN THE FILE HEADER. *** A LICENCE CENSUS " +
        "KEYED ON FILENAMES FINDS ONLY THE LICENCES SOMEBODY NAMED CONVENTIONALLY, and flags things that " +
        "need no licence at all.");
    ok("!! the one genuine gap was htmx, and it is closed",
        fs.existsSync(path.join(ENG, "vendor/htmx/LICENSE")),
        "the bundle carries no banner: ten licence-word hits in htmx.2.0.10.min.js are ALL the substring " +
        "'submit', so the grant could not be recovered from the vendored bytes and had to come from upstream " +
        "at the pinned tag. It is 0BSD, which drops even attribution -- *** SO NOTHING WAS EVER AT RISK AND " +
        "THE GAP WAS PURELY IN THE PAPERWORK, *** which is the moment to close one.");
    for (const e of VENDORED.filter(needsGrant)) {
        const p = e.grant === GRANT.IN_HEADER || e.grant === GRANT.NAMED_OTHER || e.grant === GRANT.LICENCE_FILE
            ? path.join(ENG, e.path, e.file) : null;
        if (p && !fs.existsSync(p)) ok("   " + e.path + "'s grant file exists", false, e.file + " not found");
    }
    ok("   every third-party entry's named grant file is actually on disk",
        VENDORED.filter(needsGrant).every((e) => fs.existsSync(path.join(ENG, e.path, e.file))),
        VENDORED.filter(needsGrant).length + " checked -- a register naming a licence file that is not there " +
        "would be worse than no register");
}

// =============================================================================================================
console.log("\n3. the licence shapes, which are not the same set on the two sides");
{
    const vend = spdxSet();
    const reach = [...new Set(REACHED_SOURCES.filter((e) => e.spdx).map((e) => e.spdx))].sort();
    ok("!! VENDORED shapes: " + vend.join(", "),
        vend.includes("MIT") && vend.includes("0BSD") && vend.includes("OFL-1.1"),
        "0BSD and a font licence are both firsts. An OFL grant is the only one here that constrains RENAMING " +
        "rather than copying -- Reserved Font Name Plex -- which is a different kind of obligation entirely.");
    ok("!! *** REACHED shapes: " + reach.join(", ") + " -- Apache-2.0 and BSD-3-Clause ARE NEW ***",
        reach.includes("Apache-2.0") && reach.includes("BSD-3-Clause"),
        "before v4257 this register held exactly TWO distinct spdx values, MIT and AGPL-3.0, and the strings " +
        "'Apache' and 'BSD' appeared nowhere in the file. The two commonest permissive licences after MIT had " +
        "never been recorded, which is what backlog #121 was about.");
    const img = REACHED_SOURCES.find((e) => /img2threejs/.test(e.repo));
    ok("!! *** AND THE FIRST Apache-2.0 ENTRY WAS ALREADY LOAD-BEARING IN SHIPPED CODE ***",
        !!img && img.spdx === "Apache-2.0" && img.taken && img.takenPaths.length >= 2,
        "v3337 built render/perceptual.mjs and render/silhouette.mjs around img2threejs's hard-gate rule and " +
        "cited it in both; v4255 built mesh/lathe.mjs against the judge they provide. So an Apache-2.0 source " +
        "shaped shipped code for nine hundred rounds while the register that exists to record such things did " +
        "not contain it. Taken: " + JSON.stringify(img.takenPaths));
}

// =============================================================================================================
console.log("\n4. *** WHY THIS WENT UNNOTICED: A BYTE-SCANNING GATE IS INVISIBLE TO AN IMPORT-GRAPH FILTER ***");
{
    const { affectedGates } = await import("./affected.mjs");
    const reachOf = (f) => { const a = affectedGates([f]); return (a.gates || a.all || []).map(String); };
    const scanned = (() => {
        let n = 0;
        const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.name === "node_modules" || e.name === ".git" || e.name.startsWith(".")) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p); else if (/\.(mjs|js|html)$/.test(e.name)) n++; } };
        walk(ENG); return n;
    })();
    const probes = ["ui/gazeDwell.mjs", "main.js", "render/perceptual.mjs", "mesh/lathe.mjs"];
    const hits = probes.filter((f) => reachOf(f).some((n) => /reachedLicences-selfcheck/.test(n)));
    const own = reachOf("world/reachedLicences.mjs").some((n) => /reachedLicences-selfcheck/.test(n));
    ok("!! *** THE LICENCE GATE SCANS " + scanned + " FILES AND --affected CONNECTS IT TO THE ONES IT IMPORTS ***",
        hits.length === 0 && own,
        "of " + probes.length + " files that all MENTION registered repositories -- " + probes.join(", ") +
        " -- exactly " + hits.length + " reach the gate through --affected, while world/reachedLicences.mjs, " +
        "which it imports, does. tools/ship/affected.mjs walks the IMPORT GRAPH and says so in its own header; " +
        "a gate that reads files with readFileSync imports none of them, so its real inputs are invisible to " +
        "the filter.");
    ok("!! ...and verify.mjs does not name it either: " +
       (fs.readFileSync(path.join(ENG, "tools/ship/verify.mjs"), "utf8").includes("reachedLicences") ? "it does" : "it does not"),
        !fs.readFileSync(path.join(ENG, "tools/ship/verify.mjs"), "utf8").includes("reachedLicences"),
        "so on a normal ship the licence register is graded by NEITHER path unless the register itself was " +
        "edited. *** THIS IS NOT HYPOTHETICAL: *** v4247 added a mention of kamend/ChuckClose-SparkAR to " +
        "ui/gazeDwell.mjs, shipped ALL GREEN, and left the gate red -- found this round by running it by hand, " +
        "and fixed by recording the citation. A round can currently make this register wrong and be told " +
        "nothing.");
    report("*** WHAT THIS ROUND DOES NOT DO ABOUT IT: *** widening --affected to model byte-scanners, or " +
           "adding the licence gate to verify.mjs's explicit list. The first is a change to the filter every " +
           "gate depends on and wants its own round and its own measurement of what it costs; the second " +
           "would fix one gate and leave the class. The finding is recorded with its number so the round that " +
           "does it has somewhere to start.");
}

// =============================================================================================================
console.log("\n5. *** AND THIS GATE COULD NOT BE DISCOVERED, WHICH NOBODY WOULD HAVE NOTICED ***");
{
    const { gateFiles } = await import("./staleness.mjs");
    const all = gateFiles().map(String);
    ok("!! *** THIS FILE IS IN gateFiles(), AND WHEN IT WAS WRITTEN IT WAS NOT ***",
        all.some((p) => /vendoredLicences-selfcheck/.test(p)),
        all.length + " gate files discovered. staleness.mjs's SKIP pattern read `[\\/]vendor` with no " +
        "trailing separator, so it matched any path segment BEGINNING with \"vendor\" -- and this gate is " +
        "named vendoredLicences-selfcheck.mjs. *** IT EXISTED, IT PASSED WHEN RUN BY HAND, AND IT WOULD NEVER " +
        "HAVE RUN ON A SHIP: *** gateFiles() feeds the knowledge index, countGateFiles() and the affected " +
        "filter alike. Found because the index count did not grow after adding a gate.");
    ok("!! ...and anchoring it did not start sweeping vendor/ in: 0 gates from inside a vendor directory",
        all.filter((p) => /[\\/]vendor[\\/]/.test(p)).length === 0,
        "the skip still does what it was for. Measured before the fix: exactly ONE file on disk was wrongly " +
        "excluded, this one -- the hole had been there for hundreds of rounds and never bitten, because no " +
        "gate had ever been named vendor-anything. `[\\/]\\.git` carried the identical hole.");
    report("*** TWO INDEPENDENT DISCOVERABILITY FAILURES IN ONE ROUND, FOUND FROM OPPOSITE DIRECTIONS: *** " +
           "section 4's is a gate that RUNS and cannot see its inputs; this one is a gate that cannot be " +
           "FOUND. Neither shows up as a red check anywhere -- the first reports green on stale data, the " +
           "second reports nothing at all. A suite's coverage is not what its gates assert; it is what its " +
           "discovery and filtering let them assert.");
}

// =============================================================================================================
// ---- v4257 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL -----------------------
//
// (world/vendoredLicences.mjs md5 89f4e6683bff0bd05973be195c18621e before and after all four.)
//
//   A  vendor/jolt deleted from the register while it stays on disk -- the undeclared-dependency case, which
//      is the one that matters, because a dependency nobody wrote down is exactly how #61 happened. -> 1 RED.
//
//   B  htmx marked GRANT.NONE again. -> 2 RED, and note the SHAPE of the second: the naive-census check reads
//      "5 flagged, true answer 1", so the sabotage moves BOTH numbers and the gate reports the pair rather
//      than a bare count. A check that only asserted "unpapered is empty" would have said less.
//
//   C  vendor/wasm reclassified THIRD_PARTY, so this tree's own AssemblyScript output is made to demand a
//      grant nobody can give. -> 1 RED. This is the misclassification a filename census makes by default,
//      shipped as a sabotage so the taxonomy is load-bearing rather than decorative.
//
//   D  draco's grant file renamed to COPYING in the register while LICENSE is what is on disk. -> 2 RED. A
//      register that NAMES a licence file which is not there is worse than no register: it reads as
//      diligence and is not.
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether the recorded SPDX identifiers are RIGHT. Each was read from the licence " +
    "text in the tree or from upstream at a pinned tag, but nothing verifies that the text under " +
    "vendor/<x>/LICENSE is the licence it is labelled with -- a mislabelled MIT would pass every check above. " +
    "Also unchecked: node_modules, which this register deliberately does not cover, and the eleven other " +
    "first-party .wasm artefacts outside vendor/wasm that nobody has asked the origin question about.");
process.exit(fails ? 1 : 0);
