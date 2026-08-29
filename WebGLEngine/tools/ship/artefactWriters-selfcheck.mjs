// WebGLEngine/tools/ship/artefactWriters-selfcheck.mjs -- v3609
//
// Run: node tools/ship/artefactWriters-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/ship/artefactWriters.mjs, the two artefact rows it justified, and the widened rule in
// registerResidue-selfcheck.
//
// THE CHECK THIS FILE EXISTS FOR is section 2: the claim is that the SHIPPED detector is blind to two real
// writers, and a claim about blindness has to be SHOWN. registerResidue's own regex is re-run here over the
// two files and returns nothing, beside a positive control where it returns the right answer -- so "blind" is
// a reading of the same instrument rather than my description of it.
import fs from "node:fs";
import path from "node:path";
import { ARTEFACT_TOOLS } from "./reportingTools.mjs";
import { ENGINE, SELF, writesArtefact, writers, census, idempotent, mainBlock, pagesReading, MEASURED_V3609, reportLines } from "./artefactWriters.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const SHIPPED_DETECTOR = /export const OUT\s*=\s*["']([^"']+)["']/;

// ---- 1. THE INSTRUMENT EXCLUDES ITSELF, BY IDENTITY ---------------------------------------------------------------
{
    ok("!! it excludes ITSELF and by identity", SELF === "tools/ship/artefactWriters.mjs",
       "derived from import.meta.url -- this file names both offenders in its own header");
    ok("...and gates are out of the corpus", !writers().some((w) => /-selfcheck\.mjs$/.test(w.rel)),
       writers().length + " writers found");
}

// ---- 2. THE SHIPPED DETECTOR IS BLIND, SHOWN BY RE-RUNNING IT -------------------------------------------------------
{
    const missed = ["tools/ship/buildKnowledgeIndex.mjs", "tools/ship/buildPageIndex.mjs"];
    for (const rel of missed) {
        const src = fs.readFileSync(path.join(ENGINE, rel), "utf8");
        ok("!! registerResidue's own detector finds NOTHING in " + path.basename(rel),
           !SHIPPED_DETECTOR.test(src), Object.keys(MEASURED_V3609.blindTo).includes(rel) ? MEASURED_V3609.blindTo[rel] : "");
        const w = writesArtefact(rel);
        ok("...while the BEHAVIOURAL one finds the artefact it really writes", !!w && w.artefact.endsWith(".json"),
           w ? w.artefact + "  (via " + w.via + ")" : "NOTHING FOUND");
    }
    const withOut = fs.readdirSync(path.join(ENGINE, "tools", "roundhouse")).find((f) =>
        /\.mjs$/.test(f) && !/-selfcheck/.test(f) && SHIPPED_DETECTOR.test(fs.readFileSync(path.join(ENGINE, "tools", "roundhouse", f), "utf8")));
    ok("POSITIVE CONTROL: the shipped detector is not simply broken -- it finds the tools that spell the idiom",
       !!withOut, withOut ? "tools/roundhouse/" + withOut + " declares `export const OUT`" : "none found, which would make the comparison meaningless");
    ok("!! ...so BLIND is a reading of the SAME instrument, not my description of it", true,
       "a claim about absence has to be shown failing (this tree's standing rule)");
}

// ---- 3. THE WRITE NEED NOT BE IN THE MAIN BLOCK, WHICH DEFEATED MY OWN FIRST VERSION ----------------------------------
{
    const kb = fs.readFileSync(path.join(ENGINE, "tools", "ship", "buildKnowledgeIndex.mjs"), "utf8");
    ok("!! buildKnowledgeIndex's write is OUTSIDE its main block", !/write(File)?Sync/.test(mainBlock(kb)) && /write(File)?Sync/.test(kb),
       "its main block calls buildIndex() and the write lives in that function -- my first detector demanded " +
       "the write be IN the main block and therefore MISSED the very file this round is about, which is the " +
       "defect landing on the file studying it, eighth instance");
    const tmp = path.join(ENGINE, "tools", "__writerfixture__");
    fs.mkdirSync(tmp, { recursive: true });
    try {
        fs.writeFileSync(path.join(ENGINE, "fixture-artefact.json"), "{}\n");
        fs.writeFileSync(path.join(tmp, "nomain.mjs"), 'import fs from "node:fs";\nexport function go(){ fs.writeFileSync("fixture-artefact.json", "{}"); }\n');
        fs.writeFileSync(path.join(tmp, "writer.mjs"), 'import fs from "node:fs";\nfunction go(){ fs.writeFileSync("fixture-artefact.json", "{}"); }\nif (import.meta.url === "x") { go(); }\n');
        ok("!! A LIBRARY WITH NO MAIN BLOCK IS NOT A WRITER, however much it writes",
           writesArtefact("tools/__writerfixture__/nomain.mjs") === null,
           "this law is about tools you can RUN; a function somebody calls is not a front door question");
        ok("...and a tool with a main block whose write is elsewhere IS one",
           (writesArtefact("tools/__writerfixture__/writer.mjs") || {}).artefact === "/fixture-artefact.json");
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.rmSync(path.join(ENGINE, "fixture-artefact.json"), { force: true });
    }
    ok("the fixtures are removed", !fs.existsSync(path.join(ENGINE, "fixture-artefact.json")));
}

// ---- 4. THE TWO PROSE DOORS ARE CLOSED, AND THE ROW LINKS WHAT THE TOOL WRITES ----------------------------------------
{
    const rows = new Map(ARTEFACT_TOOLS.map((t) => [t.rel, t]));
    for (const rel of ["tools/ship/buildKnowledgeIndex.mjs", "tools/ship/buildPageIndex.mjs"]) {
        const row = rows.get(rel), w = writesArtefact(rel);
        ok("!! " + path.basename(rel) + " now has an artefact row", !!row, row ? row.label : "NO ROW");
        ok("...and the row LINKS the file the tool actually writes", row && w && row.artefact === w.artefact,
           row && w ? row.artefact + " == " + w.artefact + " -- two declarations of one filename, compared" : "");
        ok("...and the page that used to name a terminal command still reads it", pagesReading(w.artefact).length > 0,
           pagesReading(w.artefact).join(", "));
    }
    const gaps = census().filter((c) => !c.row && !c.exempt && c.readBy.length);
    ok("!! NO WRITER WHOSE ARTEFACT A PAGE READS IS LEFT WITHOUT A ROW", gaps.length === 0,
       gaps.length ? "STILL OPEN: " + gaps.map((g) => g.rel).join(", ") : "the join is what makes a missing row a defect");
}

// ---- 5. alwaysWrites IS ADMITTED BY MEASUREMENT, NEVER BY DECLARATION --------------------------------------------------
{
    const always = ARTEFACT_TOOLS.filter((t) => t.alwaysWrites === true);
    // v4072 -- this asserted `always.length === 2`, which is a ratchet on the COUNT and therefore blind to a
    // SWAP: drop one regenerator and add another and the number is still 2. The names are the claim, so the
    // names are what is compared -- and the third was added deliberately, with its idempotence measured by the
    // loop directly below rather than asserted here.
    const alwaysLabels = always.map((t) => t.label).sort().join(", ");
    ok("exactly the three regenerators declare alwaysWrites, BY NAME rather than by count",
        alwaysLabels === "Engine catalog, Knowledge index, Page index",
        alwaysLabels + ". A count ratchet cannot see a swap; this one can.");
    for (const t of always) {
        const r = idempotent(t.rel, t.artefact);
        ok("!! " + t.label + " is IDEMPOTENT, measured by running it twice", r.ok,
           r.ok ? r.first + " -> " + r.second : (r.error || r.first + " -> " + r.second));
    }
    ok("...so the dry-run rule keeps its teeth rather than being widened away", true,
       "the worry is a STALE artefact from an accidental run, and an artefact that is a pure function of the " +
       "tree cannot go stale that way -- a SWEEP declaring alwaysWrites would fail the check above");
    ok("and the flagged rows still carry --write", ARTEFACT_TOOLS.filter((t) => (t.args || []).includes("--write")).length + always.length === ARTEFACT_TOOLS.length,
       ARTEFACT_TOOLS.length + " rows, every one accounted for");
}

// ---- 6. WHAT IS NOT CLAIMED, AND THE ANTIDOTE ---------------------------------------------------------------------------
//
// ANTIDOTE: when somebody adds a writer whose artefact a page reads, section 4's gap list goes RED. GIVE IT A
// ROW -- do not narrow `pagesReading`, and do not add it to NO_MAIN without the reason that register demands.
// And if a future alwaysWrites row is a sweep, section 5 fails by RUNNING IT, not by reading its args.
{
    ok("the census reports writers AND the pages that read them", census().every((c) => Array.isArray(c.readBy)),
       "not every writer is owed a row: the law is about a PAGE THAT READS AN OUTPUT WHOSE PRODUCER HAS NO BUTTON");
    ok("...and the known limit is stated rather than hidden", (MEASURED_V3609.notClaimed || "").includes("NOT every writer"),
       "a name is admitted if it is in the served root OR a row declares it, so a writer whose artefact has " +
       "never been emitted and has no row is invisible here -- reported, not papered over");
    const rep = reportLines();
    ok("the report renders and names the blindness", rep.length > 8 && rep.join("\n").includes("export const OUT"), rep.length + " lines");
}

console.log(fails ? "\nartefactWriters-selfcheck: " + fails + " FAILED" : "\nartefactWriters-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
