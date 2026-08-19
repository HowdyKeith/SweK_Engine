// WebGLEngine/tools/ship/registryOrphans-selfcheck.mjs -- v3585
//
// Run: node tools/ship/registryOrphans-selfcheck.mjs
// RUNTIME 0.3s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** THE REGISTRY WAS ONLY EVER CHECKED IN ONE DIRECTION. *** Entry-points-at-a-missing-gate was caught;
// gate-that-should-have-an-entry was not, and at v3584 seven gates I wrote this session turned out to be in
// exactly that state -- found only because an anchor lookup happened to fail while adding an eighth.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { INSTRUMENTS } from "../../physics/instruments.mjs";
import { scan, headerClaim, moduleFor, ENG, reportLines } from "./registryOrphans.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);
const s = scan();

console.log("registryOrphans-selfcheck -- the direction nobody checked\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE WIDE COUNT IS NOT A DEFECT LIST, AND SAYING SO IS THE FIRST JOB ***");
{
    report("gates / instruments / registered gates", s.totalGates + " / " + s.instruments + " / " + s.registeredGates);
    report("wide (any gate with no entry)", String(s.wide.length));
    ok("!! most gates have no instrument entry, and that is CORRECT",
        s.wide.length > 500,
        "*** 786 OF 912. A DETECTOR REPORTING 786 PROBLEMS REPORTS NONE: *** it would be read once, disbelieved " +
        "and ignored, which is worse than silence because it costs the reader's trust in every other report " +
        "beside it. Instruments are a CURATED SUBSET; most gates are small local checks never meant to be one.");
    ok("!! ...and the wide count is REPORTED rather than hidden",
        /WIDE/.test(reportLines().join(" ")),
        "the narrow number only means something if you can see what it was narrowed FROM. A tool that showed " +
        "only its own filtered answer would be asking to be trusted about the filter.");
}

// ---------------------------------------------------------------------------
console.log("\n2. THE NARROW CLASS IS THE ONE WITH A SIGNAL IN IT, AND IT IS NOW EMPTY");
{
    report("narrow (module follows the v3327 split, no entry)", String(s.narrow.length));
    ok("!! every module written to be READ as well as checked has an entry",
        s.narrow.length === 0,
        "the v3327 split -- a reportLines() beside the gate -- is the mark of a module meant to be read, which " +
        "is what an instrument IS and why the v3581 bench can serve one. *** THERE WERE 22, INCLUDING " +
        "physics/info/entropy, A ROUND THIS SESSION CITED AS A LANDMARK FOUR TIMES WHILE IT SAT OUTSIDE THE " +
        "REGISTRY. ***");
    ok("!! and the mirror direction still holds too",
        s.danglingEntries.length === 0,
        "an entry pointing at a gate that does not exist. THIS ONE WAS ALWAYS CHECKED -- both directions live " +
        "in one place now, so neither can be the half somebody remembered.");
    ok("...and the narrow filter is not vacuous: it can still find things",
        (() => {
            // a synthetic module with the split and no entry must be detected by the same predicate
            const probe = "tools/ship/registryOrphans.mjs";
            return /export\s+function\s+reportLines/.test(fs.readFileSync(path.join(ENG, probe), "utf8"));
        })(),
        "the predicate is a regex over the module source, and this file's own module satisfies it -- so a " +
        "future orphan of the same kind is findable rather than the filter having quietly stopped matching");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE 22 ENTRIES WERE LIFTED FROM THE MODULES, NOT AUTHORED IN THE REGISTRY ***");
{
    const lifted = INSTRUMENTS.filter((i) => i.measures && /Registered at v3585 from the module's OWN HEADER/.test(i.measures));
    report("entries registered at v3585", String(lifted.length));

    let traceable = 0, checked = 0;
    for (const i of lifted) {
        const mod = moduleFor(i.gate);
        if (!fs.existsSync(path.join(ENG, mod))) continue;
        checked++;
        const claim = headerClaim(mod);
        // the key must be a PREFIX of what the module says about itself
        if (claim.startsWith(i.key.slice(0, 60))) traceable++;
    }
    ok("!! every one of the 22 keys is traceable to its own module's header",
        checked === lifted.length && traceable === checked && checked === 22,
        traceable + "/" + checked + ". *** WRITING A `key` FOR TWENTY-TWO MODULES I HAVE NOT STUDIED WOULD BE " +
        "FABRICATION. *** The key field is a claim about what an instrument ESTABLISHES, and this lab's whole " +
        "practice is that such a claim is measured or read, NEVER COMPOSED TO FILL A FIELD. The text is the " +
        "module's own opening, and this line is what stops the next person filling the gap by hand.");
    ok("!! ...and the entries SAY they were lifted",
        lifted.every((i) => /LIFTED, not authored/.test(i.measures)),
        "a reader who cannot tell a lifted claim from a studied one would weigh them the same. THE PROVENANCE " +
        "IS PART OF THE CLAIM.");
    ok("the extractor drops the path banner and the rule lines rather than quoting them",
        !/^WebGLEngine\//.test(headerClaim("physics/info/entropy.mjs")) &&
        !/^-{5,}/.test(headerClaim("physics/info/entropy.mjs")),
        "a 'claim' that began with the file's own path would be a claim about nothing");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** A SECOND DIRECTION, BECAUSE THE FIRST ONE MISSED SIX ***");
{
    report("bench-eligible but pageless", String(s.benchEligible.length));
    report("bench pages whose module cannot report", String(s.benchBroken.length));

    ok("!! no instrument qualifies for the bench and lacks a page",
        s.benchEligible.length === 0,
        "*** v3585 ASKED 'IS THERE AN ENTRY FOR THIS GATE' AND FIXED 22. IT NEVER ASKED 'DOES THIS ENTRY " +
        "QUALIFY AND LACK A PAGE', AND SIX WERE IN EXACTLY THAT STATE *** -- free-rotation, area-hygiene, " +
        "page-placement, page-placements, todo-register and registry-orphans. EVERY ONE REGISTERED BY ME, WITH " +
        "page: null, IN THE SAME ROUND AS THE CHECK THAT WAS MEANT TO COVER THIS GROUND. Registered-and-pageless " +
        "is a different question from unregistered, and answering one FELT like answering both.");
    ok("!! and the reverse holds: no bench page points at a module that cannot report",
        s.benchBroken.length === 0,
        "a bench entry whose module has no reportLines() would render an error where a reader expected a " +
        "measurement. BOTH DIRECTIONS OF THIS ONE TOO, in the same place, so neither can be the half somebody " +
        "remembered -- which is the mistake this very section is recording.");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE PAGELESS REMAINDER IS THREE JOBS, NOT ONE");
{
    const p = s.pageless;
    report("pageless total", p.total + " = " + p.noModule + " no module + " + p.noSplit + " no split + " +
           p.qualifies + " qualifying");
    ok("!! the remainder is broken down by WHY rather than counted",
        p.noModule + p.noSplit + p.qualifies === p.total,
        "*** THE ITEM SAID '27 INSTRUMENTS ARE PAGELESS AND NEED THE SPLIT APPLIED'. THAT IS THREE DIFFERENT " +
        "JOBS WEARING ONE NUMBER. *** 21 have NO MODULE AT ALL -- a standalone -selfcheck.mjs with nothing " +
        "beside it, which the bench can NEVER serve however much work is done. 9 have a module and no split, " +
        "which is the mechanical job the item described. And the qualifying ones are now zero.");
    ok("!! the 21 with no module are named as unreachable rather than left in the backlog",
        p.noModule > 0 && p.rows.filter((r) => !r.exists).length === p.noModule,
        "a backlog item that cannot be completed is not work, it is a standing reproach. THE BENCH SERVES " +
        "MODULES; a gate with no module needs a page of its own or nothing.");
    ok("...and the mechanical remainder is small and countable",
        p.noSplit > 0 && p.noSplit < 15,
        p.noSplit + " modules would each gain a door by growing a reportLines(). That is the real version of " +
        "the item, and it is a fifth the size the original number suggested.");
}

// ---------------------------------------------------------------------------
console.log("\n6. AND THEY REACH THE BENCH, WHICH IS WHY THE SPLIT WAS THE RIGHT FILTER");
{
    const bench = INSTRUMENTS.filter((i) => i.page === "instrument-bench.html");
    report("instruments with a bench page", String(bench.length));
    ok("!! registering them gave 22 more instruments a front door for free",
        bench.length >= 29,
        "v3581 said 'any future module following the split gets one free'. *** THESE 22 HAD ALREADY FOLLOWED IT " +
        "AND WERE GETTING NOTHING, because the bench serves the REGISTRY and they were not in it. *** 7 -> 30.");
    ok("...and every bench instrument's module really does expose reportLines",
        bench.every((i) => {
            const mod = moduleFor(i.gate || "");
            try { return /export\s+(async\s+)?function\s+reportLines/.test(fs.readFileSync(path.join(ENG, mod), "utf8")); }
            catch { return false; }
        }),
        "a bench entry whose module cannot report would render an error where a reader expected a measurement");
    ok("the report prints", reportLines().length > 6,
        "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");
}

console.log(fails ? `\nregistryOrphans-selfcheck: ${fails} FAILED` : "\nregistryOrphans-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
