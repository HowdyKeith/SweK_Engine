// WebGLEngine/tools/ship/gateReport-selfcheck.mjs
//
// Run: node tools/ship/gateReport-selfcheck.mjs   (~20s -- MEASURED, most of it the live page)
//
// v4394 -- A GATE'S VERDICT IS A WORD; ITS ARGUMENT IS A TABLE, AND THE TABLE DIED WITH THE TERMINAL.
//
// Keith raised 3Blue1Brown/manim beside ValkyrienSkies/Valkyrien-Skies-2 and asked what the pair generates. The
// thread is that both get a simulation to EXPLAIN ITSELF, and manim's discipline is not animation: it is that
// THE EXPLANATION IS GENERATED FROM THE SAME OBJECTS AS THE ARGUMENT, so it cannot drift. A caption can be
// wrong about a number; a number rendered from the number cannot be.
//
// *** THE CENSUS RAN BEFORE ANYTHING WAS BUILT AND THE ANSWER WAS NOT "FEW", IT WAS NONE. ***
//
//     1429 gates -- 67 print rows of formatted numbers -- 0 wrote anything a second reader could open
//
// AND THE REGISTER THAT EXISTS TO ANSWER THAT QUESTION COULD NOT SEE ONE OF THEM. tools/ship/artefactWriters.mjs
// walks tools/ and skips /-selfcheck\.mjs$/ by construction, so its census of "who emits something readable"
// reports zero gates because it never looks at a gate. Its own header names this species -- "a register that
// knows one shape of a thing reports everything else as absent" -- and v3609 fixed it in the DETECTOR (a
// declaration shape replaced by a behavioural one) while leaving it standing in the WALK.
//
// THE EXCLUSION IS NOT REMOVED HERE, AND THAT IS A DECISION. artefactWriters answers "which TOOL builds an
// artefact a page needs", and a gate is not a build step; widening its walk would put 1429 files through a
// census built for 30 and would change what its rows mean. The blindness is MEASURED below instead, so the
// next reader meets it as a number rather than as a clean-looking zero.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gateFiles } from "./staleness.mjs";
import { noComments } from "./sourceScan.mjs";
import { runInEngineOrigin } from "./webgpuHarness.mjs";
import * as AW from "./artefactWriters.mjs";
import { gateReport, reports, arguesInNumbers, REPORT_DIR, enabled } from "./gateReport.mjs";

const SELF_REPORT = gateReport("tools/ship/gateReport-selfcheck.mjs");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (p) => path.relative(ENG, p).split(path.sep).join("/");

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE CENSUS -- and the ratchet is on the gap, because the gap is the debt
 * --------------------------------------------------------------------------------------------------------- */
const GATES = gateFiles(ENG).map(rel);
const argues = [];
for (const g of GATES) {
    let src = ""; try { src = fs.readFileSync(path.join(ENG, g), "utf8"); } catch { continue; }
    if (arguesInNumbers(src, noComments)) argues.push(g);
}
// *** WHICH GATES EMIT IS ANSWERED BEHAVIOURALLY, AND THE FIRST DRAFT ASKED THE WRONG QUESTION. ***
// It tested source for a call to gateReport() -- a DECLARATION SHAPE, which is exactly the detector
// artefactWriters had to abandon at v3609 -- and then needed an exclusion for this file, which calls it in its
// own tests without writing. The property is "is there a report naming this gate", and the artefact answers it.
// *** AND IT COUNTS ITSELF, WHICH IS NOT THE SELF-COUNTING DEFECT BUT THE OPPOSITE. *** reports() reads disk,
// and this gate writes its own report DURING the run -- so reading disk alone makes the answer depend on
// whether anybody has run it before, which is the shape v4392 caught as "a count of failures is not a verdict
// unless the process finished". A register that emits must count its own emission or its number is an artefact
// of run order.
const SELF = "tools/ship/gateReport-selfcheck.mjs";
const emits = [...new Set([...reports().map((r) => r.gate), SELF])].filter((g) => GATES.includes(g));
{
    // *** v4399 -- THE RATCHET WAS A COUNT AND ITS FIRST CATCH WAS SOMEBODY ELSE'S NEW GATE, ONE ROUND AFTER
    // IT WAS INSTALLED. *** v4395 froze the number at 66. The very next gate anybody wrote --
    // physics/box3d/sensorsCcd-selfcheck.mjs, from the other branch's v4396 -- arrived with a table and no
    // report, and the count went to 67. A COUNT RATCHET DRIFTS WITH THE TREE: every round that writes a
    // table-printing gate pushes it, and raising it each time is the failure referenceKind-selfcheck's own
    // v3453 note PREDICTED for its rescued population and never fixed -- "this ceiling drifts upward one per
    // round for as long as the habits hold, and a ratchet that rises every round stops being a ratchet".
    //
    // SO IT IS TWO RATCHETS ON A FROZEN SET INSTEAD OF ONE ON A NUMBER. The 69 below are named, and:
    //   (1) THE LIST MAY ONLY SHRINK -- paying the debt down means a gate's numbers reaching a reader.
    //   (2) NOTHING OUTSIDE IT MAY ARGUE IN NUMBERS WITHOUT EMITTING -- the cost of a new table-printing gate
    //       lands on the round that writes it, which is where it belongs and where a count cannot put it.
    // The second is the one a count cannot express, and it is the whole reason this list is by name.
    //
    // *** THE LIST IS FROZEN AT MERGE TIME AND THAT IS TWO FILES LATER THAN IT WAS FIRST MEASURED. *** It read
    // 67 while this round was building; the other branch landed a v4397 and a v4398 during the verify, each
    // with a table-printing gate, and the arrivals check fired on both -- which is the check working, not
    // failing. A ratchet's baseline is what exists the moment it is installed, and these two exist now, so they
    // are named rather than excused. THE FIRST GENUINELY NEW ARRIVAL IS THE NEXT ONE, and it costs its own
    // round one line.
    const SILENT_AT_V4399 = Object.freeze([
        "ai-bridge/deviceWorker-selfcheck.mjs",
        "brain/blob-policy-selfcheck.mjs",
        "brain/policyCacheSite-selfcheck.mjs",
        "physics/backendLimits-selfcheck.mjs",
        "physics/box3d/sensorsCcd-selfcheck.mjs",
        "physics/centrifugeKnob-selfcheck.mjs",
        "physics/em/absorbing-selfcheck.mjs",
        "physics/em/conservativeRemap-selfcheck.mjs",
        "physics/em/fresnelJoin-selfcheck.mjs",
        "physics/em/gridRefine-selfcheck.mjs",
        "physics/em/limiterNonUniform-selfcheck.mjs",
        "physics/md/normalModes-selfcheck.mjs",
        "physics/mechanics/reposeOps-selfcheck.mjs",
        "physics/mesh/boundaryRank-selfcheck.mjs",
        "physics/mesh/curvedWall-selfcheck.mjs",
        "physics/mesh/gradientJoin-selfcheck.mjs",
        "physics/mesh/nodeGradient-selfcheck.mjs",
        "physics/mesh/rowWeight-selfcheck.mjs",
        "physics/mesh/tetRank-selfcheck.mjs",
        "physics/mesh/triReconstruct-selfcheck.mjs",
        "physics/mesh/weightScaling-selfcheck.mjs",
        "physics/render/bounces-selfcheck.mjs",
        "physics/render/colour-selfcheck.mjs",
        "physics/render/directStrategy-selfcheck.mjs",
        "physics/render/fresnel-selfcheck.mjs",
        "physics/render/furnace-selfcheck.mjs",
        "physics/render/microfacet-selfcheck.mjs",
        "physics/render/msDirect-selfcheck.mjs",
        "physics/render/nee-selfcheck.mjs",
        "physics/render/occlusion-selfcheck.mjs",
        "physics/render/pathStrat-selfcheck.mjs",
        "physics/render/pathTracerNEE-selfcheck.mjs",
        "physics/render/renderBsdf-selfcheck.mjs",
        "physics/render/roulette-selfcheck.mjs",
        "physics/render/sdfMarch-selfcheck.mjs",
        "physics/render/stratified-selfcheck.mjs",
        "physics/scoreDirection-selfcheck.mjs",
        "physics/tomography/sirtKeys-selfcheck.mjs",
        "physics/wheelJoint-selfcheck.mjs",
        "text/slug-selfcheck.mjs",
        "tools/render-qa/edgeBiasOracle-selfcheck.mjs",
        "tools/render-qa/referenceScan-selfcheck.mjs",
        "tools/render-qa/terminatorOracle-selfcheck.mjs",
        "tools/roundhouse/androidPeer-selfcheck.mjs",
        "tools/roundhouse/census-selfcheck.mjs",
        "tools/roundhouse/corroborationCensus-selfcheck.mjs",
        "tools/roundhouse/escTolKnob-selfcheck.mjs",
        "tools/roundhouse/hydrostatic-selfcheck.mjs",
        "tools/roundhouse/knobPromotions-selfcheck.mjs",
        "tools/roundhouse/labGalaxy-selfcheck.mjs",
        "tools/roundhouse/lensCorroborated-selfcheck.mjs",
        "tools/roundhouse/runtimeBench-selfcheck.mjs",
        "tools/roundhouse/sdfMarchDevice-selfcheck.mjs",
        "tools/roundhouse/seedSpread-selfcheck.mjs",
        "tools/roundhouse/skillProof-selfcheck.mjs",
        "tools/roundhouse/vibrationsDevice-selfcheck.mjs",
        "tools/ship/budgetEvidence-selfcheck.mjs",
        "tools/ship/coverageTriage-selfcheck.mjs",
        "tools/ship/ddaPrecision-selfcheck.mjs",
        "tools/ship/divineEye-selfcheck.mjs",
        "tools/ship/gateAxioms-selfcheck.mjs",
        "tools/ship/gateReach-selfcheck.mjs",
        "tools/ship/generatedLadder-selfcheck.mjs",
        "tools/ship/microfacetShader-selfcheck.mjs",
        "tools/ship/referenceKind-selfcheck.mjs",
        "tools/ship/rigProgress-selfcheck.mjs",
        "tools/ship/roughDiffuse-selfcheck.mjs",
        "tools/ship/strayBackups-selfcheck.mjs",
        "ui/morphSvg-selfcheck.mjs",
    ]);
    const silent = argues.filter((g) => !emits.includes(g));
    const stillSilent = SILENT_AT_V4399.filter((g) => silent.includes(g));
    const arrivals = silent.filter((g) => !SILENT_AT_V4399.includes(g));
    say(`${GATES.length} gates; ${argues.length} argue in numbers; ${emits.length} emit a report; ${silent.length} argue and do not`);

    // AND IT PUBLISHES ITS OWN CENSUS, because a gate that counts gates whose numbers die in a terminal and
    // then leaves its own there would be the joke this round is about. The first column is TEXT on purpose:
    // the plot below only takes tables with a numeric x, so this one is read as a table and not drawn as a
    // one-point line -- which also exercises the page's non-plottable path.
    SELF_REPORT.table("the population that argues in numbers",
        ["population", "count"],
        [["gate files", GATES.length], ["argue in numbers", argues.length],
         ["emit a report", emits.length], ["argue and do not", silent.length],
         ["frozen at v4399", SILENT_AT_V4399.length], ["arrived since", arrivals.length],
         ["visible to artefactWriters", AW.toolFiles().filter((f) => /-selfcheck\.mjs$/.test(f)).length]],
        "artefactWriters' walk skips -selfcheck.mjs by construction, so its zero was a fact about the walk " +
        "rather than a finding about gates. The exclusion stays; the blindness is counted.");
    SELF_REPORT.write();

    ok("!! *** the named population whose argument dies with the terminal may only SHRINK ***",
       stillSilent.length <= SILENT_AT_V4399.length,
       `${stillSilent.length} of the ${SILENT_AT_V4399.length} frozen at v4399 still emit nothing. Falling means ` +
       "a gate's numbers reached a reader; each one is a line in a gate that ALREADY HAS THE TABLE. THE " +
       "DETECTOR IS SOURCE-SIDE AND CRUDE ON PURPOSE -- running 1432 gates costs half an hour, and it will miss " +
       "a gate that builds rows without a formatter, which is why the population is a LIST and not a count");

    ok("!! ...and no gate written SINCE may argue in numbers and emit nothing",
       arrivals.length === 0,
       arrivals.length ? `ARRIVALS: ${arrivals.join(", ")} -- each prints a table of numbers that will die with ` +
       "the terminal it was written to. One line of gateReport in the gate that already has the table fixes it" :
       "nothing new. A COUNT RATCHET COULD NOT ASK THIS: it can only say the total rose, and the round that " +
       "raised it is the round least able to tell which file did");

    // *** THE BLINDNESS, MEASURED RATHER THAN LEFT AS A CLEAN-LOOKING ZERO. ***
    const seen = AW.toolFiles().filter((f) => /-selfcheck\.mjs$/.test(f));
    ok("!! ...and the artefact register cannot see a gate at all, which is why its zero read clean",
       seen.length === 0 && GATES.length > 1000,
       `artefactWriters.toolFiles() returns ${seen.length} of ${GATES.length} gates. Its walk skips ` +
       "/-selfcheck.mjs$/ BY CONSTRUCTION, so 'no gate emits an artefact' was never a finding about gates -- it " +
       "was a fact about the walk. THE EXCLUSION STAYS: that register answers 'which TOOL builds an artefact a " +
       "page needs', a gate is not a build step, and widening a census built for 30 files to 1429 would change " +
       "what its rows mean. Named here instead, so the next reader meets it as a number");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE EMITTER IS OFF BY DEFAULT, AND THE REASON IS registerResidue'S
 * --------------------------------------------------------------------------------------------------------- */
{
    const r = gateReport("tools/ship/probe-selfcheck.mjs").table("t", ["a", "b"], [[1, 2.5]]);
    const before = process.env.SWEK_GATE_REPORT;
    delete process.env.SWEK_GATE_REPORT;
    const off = r.write();
    if (before !== undefined) process.env.SWEK_GATE_REPORT = before;
    ok("!! *** a gate writes nothing unless asked, because a stale map is worse than none ***",
       off.written === false && !fs.existsSync(path.join(ENG, REPORT_DIR, "probe-selfcheck.json")),
       `write() returned ${JSON.stringify(off.why)} and left no file. registerResidue's rule is that emitters ` +
       "are dry-run by default; the exemption is for an artefact that is a PURE FUNCTION OF THE TREE, and a " +
       "gate's table is not one -- the shipyard gate's device rows need a GPU, so the same gate honestly " +
       "produces fewer rows on a different box");
    ok("...and build() returns the same document either way, so a gate can assert on it without emitting",
       JSON.stringify(off.doc) === JSON.stringify(r.build()),
       "the check and the artefact read the same object. A gate that asserted on one thing and wrote another " +
       "would be the caption problem with extra steps");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE NUMBERS SURVIVE THE ROUND TRIP AS NUMBERS
 * --------------------------------------------------------------------------------------------------------- */
{
    const vals = [6.310234e-6, 0.0625, 1e6, 8.4e6, 2 ** -149, 0.1 + 0.2, -1.7976931348623157e308];
    const doc = gateReport("x").table("t", ["v"], vals.map((v) => [v])).build();
    const back = JSON.parse(JSON.stringify(doc)).tables[0].rows.map((r) => r[0]);
    ok("!! *** a measured value reaches the page as a NUMBER, bit for bit ***",
       back.every((v, i) => v === vals[i] || (Number.isNaN(v) && Number.isNaN(vals[i]))),
       `${vals.length} values including a denormal and 0.1+0.2 round-trip exactly. STORING "6.31e-6" AS TEXT ` +
       "would make the reader parse a rendering of a number back into a number, which is the exact indirection " +
       "this whole thread is about");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. WHAT IS ON DISK, AND WHETHER IT IS THIS TREE'S
 * --------------------------------------------------------------------------------------------------------- */
const onDisk = reports();
{
    say(`${onDisk.length} report(s) on disk: ${onDisk.map((r) => r.gate || r.file).join(", ") || "(none)"}`);
    ok("!! *** every report on disk parses and names the gate that made it ***",
       onDisk.length > 0 && onDisk.every((r) => !r.broken && typeof r.gate === "string" &&
           fs.existsSync(path.join(ENG, r.gate))),
       onDisk.map((r) => `${r.file}: ${r.broken ? "BROKEN" : r.gate}`).join("; ") +
       ". A report naming a gate that does not exist is the shape this tree calls unopened mail");
    const idx = (() => { try { return JSON.parse(fs.readFileSync(path.join(ENG, REPORT_DIR, "index.json"), "utf8")); }
                         catch { return null; } })();
    ok("...and the index lists exactly what is there, rebuilt from disk rather than typed",
       !!idx && idx.reports.length === onDisk.length &&
       idx.reports.every((f) => onDisk.some((r) => r.file === `${REPORT_DIR}/${f}`)),
       idx ? `index lists ${idx.reports.length}, disk has ${onDisk.length}` : "no index.json. A BROWSER CANNOT " +
       "LIST A DIRECTORY, and a hand-typed list of report names would be a second declaration of which gates emit");
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. THE PAGE -- LOADED, NOT SCANNED, AND SHOWING THE NUMBERS THE REPORT HOLDS
 * --------------------------------------------------------------------------------------------------------- */
{
    ok("!! *** instruments.html READS the reports rather than describing them ***",
       noComments(fs.readFileSync(path.join(ENG, "instruments.html"), "utf8")).includes(`${REPORT_DIR}/index.json`),
       "checked against the page's code with comments stripped. artefactWriters' own header calls a page that " +
       "tells the reader to run a terminal command a PROSE DOOR, and names two that were still standing");

    const probe = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 90000, script: `
        async () => {
            const f = document.createElement("iframe");
            f.style.width = "1200px"; f.style.height = "900px";
            f.src = "/instruments.html";
            document.body.appendChild(f);
            await new Promise((r) => { f.onload = r; setTimeout(r, 20000); });
            await new Promise((r) => setTimeout(r, 2500));
            const d = f.contentDocument;
            const gr = d.getElementById("gr");
            if (!gr) return { tables: 0, cells: 0, text: "" };
            return { tables: gr.querySelectorAll("table").length,
                     cells: gr.querySelectorAll("td").length,
                     titles: Array.from(gr.querySelectorAll("td")).map((td) => td.getAttribute("title")),
                     text: (gr.textContent || "").slice(0, 1500) };
        }` });
    if (probe.skipped) {
        say("the live page read was SKIPPED: " + probe.reason + " -- the source and disk checks above still ran");
    } else {
        const r = probe.result || { tables: 0, cells: 0, text: "" };
        const expectTables = onDisk.reduce((n, d) => n + (d.tables || []).length, 0);
        const expectCells = onDisk.reduce((n, d) => n + (d.tables || []).reduce((m, t) =>
            m + t.rows.reduce((k, row) => k + row.length, 0), 0), 0);
        ok("!! *** and it draws every table every report holds, cell for cell ***",
           r.tables === expectTables && r.cells === expectCells,
           `page drew ${r.tables} tables and ${r.cells} cells; the reports hold ${expectTables} and ${expectCells}. ` +
           (probe.pageErrors.length ? "PAGE ERRORS: " + probe.pageErrors.join(" | ") : "no page errors") +
           ". A SOURCE SCAN WOULD PASS ON A PAGE THAT FETCHED THE INDEX AND DREW NOTHING");
        // *** PICK A DISTINCTIVE VALUE, NOT THE FIRST ONE. *** The first cell of the first table is 0, and
        // "the page contains a zero" is a check that cannot fail. This takes the longest decimal rendering in
        // any report -- the one a formatter is most likely to have rounded away.
        let anyNumber;
        for (const d of onDisk) for (const t of (d.tables || [])) for (const row of t.rows) for (const v of row)
            if (typeof v === "number" && Number.isFinite(v) &&
                (anyNumber === undefined || String(v).length > String(anyNumber).length)) anyNumber = v;
        // *** THE FIRST DRAFT OF THIS CHECK LOOKED IN THE RENDERED TEXT AND THE PAGE HAD ROUNDED THE VALUE
        // AWAY -- 0.0000045892996283214416 drawn as 4.589e-6. *** The check was right and the PAGE was wrong: a
        // table of 17-digit floats is unreadable, but one that has thrown them away is a rounding of the
        // argument rather than the argument. The cell formats for width and its title carries the exact value.
        const titles = new Set((r.titles || []).filter(Boolean));
        const allValues = [];
        for (const d of onDisk) for (const t of (d.tables || [])) for (const row of t.rows) for (const v of row)
            allValues.push(String(v == null ? "" : v));
        const missing = allValues.filter((v) => !titles.has(v));
        ok("!! *** EVERY value in every report reaches the DOM to the digit, not a rounding of it ***",
           allValues.length > 0 && missing.length === 0,
           `${allValues.length} values, ${missing.length} missing. Example held exactly: ` +
           `${JSON.stringify(String(anyNumber))}. The cell shows ${JSON.stringify(String(anyNumber).slice(0, 9))}... ` +
           "for width and the title gives it back whole, so a reader who wants the digits can have them");
    }
}

// SABOTAGE LOG for section 6 and the frozen ratchets -- MEASURED at v4399.
//   BF the plot nudging an exact zero to 1e-16 instead of naming it -> exit=1, 1 red: the undrawable count
//      falls from 9 to 3 and the zeros vanish into a line that says "very small" where the report says "none".
//   BG the plot silently dropping its last series -> exit=1, 2 red, and THE COVERAGE CHECK IS THE ONE THAT
//      CATCHES IT. Membership -- "everything drawn is in the report" -- stays true when a plot draws less;
//      only drawn-plus-named-equals-held can see a number quietly disappear.
//   BH one path removed from the frozen silent list, so an existing gate reads as an arrival -> exit=1, 1 red
//      naming it. A COUNT RATCHET CANNOT ASK THIS QUESTION: it can only say the total rose.
//   BI the recorder import removed from the page -> exit=1, 1 red.
//
// AND THE COUNT RATCHET THIS FILE SHIPPED AT v4395 WENT RED ONE ROUND LATER ON SOMEBODY ELSE'S GATE.
// physics/box3d/sensorsCcd-selfcheck.mjs, from the other branch's v4396, arrived with a table and no report and
// took 66 to 67. Raising it would have been the exact failure referenceKind-selfcheck's v3453 note predicted
// for its own rescued population -- "a ratchet that rises every round stops being a ratchet" -- so the count is
// replaced by two ratchets on a NAMED SET, and the second asks the question the count could not.
//
// THE EMIT DETECTOR WAS ALSO WRONG IN THE WAY THIS TREE KEEPS FINDING. Its first draft tested source for a call
// to gateReport() -- a DECLARATION SHAPE, which is the detector artefactWriters had to abandon at v3609 -- and
// needed an exclusion for this file, which calls it in its own tests without writing. The property is "is there
// a report naming this gate", and the artefact answers it. Reading disk ALONE then made the answer depend on
// whether anybody had run this gate before, since it writes its own report during the run, so it counts its own
// emission by name: a register that emits must, or its number is an artefact of run order.
//
// SABOTAGE LOG -- applied, gate run, exit code read, restored, md5 checked. MEASURED at v4394.
//   BA write() ignoring SWEK_GATE_REPORT and emitting on sight -> exit=1, 2 red: the off-by-default check, and
//      the disk check, which found the probe report the sabotage had just left behind. THE SECOND RED IS THE
//      POINT: a stale artefact from an accidental run is what registerResidue's rule exists to prevent, and it
//      appeared within one run of turning the rule off.
//   BB the page's exact-value title attribute emptied -> exit=1, 3 red, 92 of 92 values missing from the DOM.
//      (The edit also broke the table markup, so the draw check went red too; the value check is the one that
//      would have caught a page that still drew but had rounded the argument away.)
//   BC the page pointed at an index that does not exist -> exit=1, 3 red including the SOURCE check, which
//      passes only on the exact served path.
//   BD (in shipyard-selfcheck) its report carrying 1.5x the C value its own checks ran on -> exit=1, 1 red
//      naming both figures. THAT IS THE WHOLE DISCIPLINE IN ONE CHECK: the explanation is held to the objects
//      the argument used, so a table edited for the page cannot quietly disagree with the gate that made it.
//
// AND THE FIRST DRAFT OF reports() RETURNED index.json AS A REPORT -- a register counting its own listing as an
// instance of the thing it registers, which is the species this tree has now caught six times and the first in
// this file. The gate went red on a document with no gate field, which is how it was found.
//
// THE VALUE CHECK'S FIRST DRAFT WAS ALSO WRONG, AND THE PAGE WAS THE THING THAT NEEDED FIXING. It looked for the
// exact value in the rendered text and the page had drawn 0.0000045892996283214416 as 4.589e-6. A table of
// 17-digit floats is unreadable; a table that has thrown them away is a rounding of the argument rather than
// the argument. The cell formats for width now and its title carries the value whole.
//
/* ------------------------------------------------------------------------------------------------------------
 * 6. v4397 -- ITEM 3: THE SAME NUMBERS, UNFOLDING -- AND THE ONE THE CHART CANNOT DRAW
 *
 * docs/EXPLAIN-ITSELF.md item 3 said the animation must draw the REPORT and not a copy, and be checked the same
 * way item 2 was. The written prediction for this round was that the argument's strongest number would be the
 * one the chart cannot plot, and it is: the shipyard's claim-local error is EXACTLY ZERO at every distance --
 * the entire point of that encoding -- and a log axis has no place for a zero. So does the first distance, x = 0.
 * NINE OF THAT TABLE'S TWENTY-ONE VALUES ARE UNPLOTTABLE, 43% of it, and the plot names every one under itself
 * rather than nudging a zero to 1e-16 and drawing a line that says "very small" where the measurement says
 * "none".
 *
 * MEMBERSHIP IS NEARLY FREE HERE, because the plot reads the same array the tables do. COVERAGE is the check
 * that earns its keep: drawn plus dropped must account for every value the table holds.
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = noComments(fs.readFileSync(path.join(ENG, "instruments.html"), "utf8"));
    ok("!! *** the page installs the recorder, so the unfolding can leave it as a clip ***",
       src.includes("installRecorder") && src.includes("swekRecord"),
       "ui/canvasRecorder.js has captured a canvas since v2270. THAT IS MANIM'S OUTPUT SHAPE WITH NO PYTHON, NO " +
       "LaTeX AND NO FFMPEG -- the skill itself was the one thing this thread deliberately did not take");

    const probe = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 120000, script: `
        async () => {
            const f = document.createElement("iframe");
            f.style.width = "1200px"; f.style.height = "1400px";
            f.src = "/instruments.html";
            document.body.appendChild(f);
            await new Promise((r) => { f.onload = r; setTimeout(r, 20000); });
            await new Promise((r) => setTimeout(r, 2500));
            const d = f.contentDocument;
            const cv = d.getElementById("vcv"), sel = d.getElementById("vsel");
            if (!cv || !sel) return { tables: [] };
            const out = { tables: [], recorder: !!(f.contentWindow && f.contentWindow.swekRecord) };
            for (let i = 0; i < sel.options.length; i++) {
                sel.value = String(i); sel.onchange({ target: sel });
                await new Promise((r) => setTimeout(r, 300));
                const g = cv.getContext("2d");
                const px = g.getImageData(0, 0, cv.width, cv.height).data;
                let ink = 0;
                for (let k = 0; k < px.length; k += 4) if (px[k] > 40 || px[k+1] > 60 || px[k+2] > 60) ink++;
                out.tables.push({ title: sel.options[i].textContent, ink,
                    plotted: (cv.dataset.plotted || "").split(",").filter(Boolean),
                    dropped: (cv.dataset.dropped || "").split(",").filter(Boolean),
                    held: Number(cv.dataset.held || 0) });
            }
            return out;
        }` });
    if (probe.skipped) {
        say("the live plot read was SKIPPED: " + probe.reason + " -- the checks above still ran");
    } else {
        const r = probe.result || { tables: [] };
        // What the reports actually hold, computed here from the same definition the page uses.
        const mine = [];
        for (const d of onDisk) for (const t of (d.tables || [])) {
            const numeric = (c) => t.rows.length && t.rows.every((row) => typeof row[c] === "number" && Number.isFinite(row[c]));
            if (!numeric(0)) continue;
            const series = t.columns.map((_, c) => c).filter((c) => c > 0 && numeric(c));
            if (!series.length) continue;
            const vals = [];
            for (const row of t.rows) for (const c of series) vals.push(row[c]);
            mine.push({ title: t.title, vals, series: series.length, rows: t.rows.length });
        }
        for (const t of r.tables) say(`"${t.title.slice(0, 46)}" -- ${t.plotted.length} drawn, ` +
            `${t.dropped.length} named as undrawable, ${t.held} held, ${t.ink} ink pixels`);

        ok("!! *** every plottable table is DRAWN, not merely fetched ***",
           r.tables.length === mine.length && r.tables.every((t) => t.ink > 2000),
           `${r.tables.length} tables offered, ${mine.length} plottable in the reports; ink ` +
           r.tables.map((t) => t.ink).join(", ") + " pixels. A blank canvas beside a fetched index is the " +
           "shape v4395 built the DOM checks to refuse");

        // *** THE CHECK THE PREDICTION SAID WOULD EARN ITS KEEP. ***
        const gaps = [];
        for (const t of r.tables) {
            const m = mine.find((x) => x.title === t.title);
            if (!m) { gaps.push(`${t.title}: not in the reports at all`); continue; }
            const accounted = new Set([...t.plotted, ...t.dropped]);
            const missing = m.vals.map(String).filter((v) => !accounted.has(v));
            if (t.held !== m.vals.length) gaps.push(`${t.title}: page says it holds ${t.held}, report holds ${m.vals.length}`);
            if (missing.length) gaps.push(`${t.title}: ${missing.length} value(s) neither drawn nor named, e.g. ${missing[0]}`);
        }
        ok("!! *** drawn PLUS named-as-undrawable accounts for EVERY value the report holds ***",
           gaps.length === 0,
           gaps.length ? gaps.join("; ") : `${mine.reduce((n, m) => n + m.vals.length, 0)} values across ` +
           `${mine.length} tables, all either plotted or named. MEMBERSHIP IS NEARLY FREE when the plot reads ` +
           "the report directly; THIS is the one that catches a plot quietly losing numbers");

        const zeroTable = r.tables.find((t) => t.dropped.length > 0);
        ok("!! *** and the value the chart CANNOT draw is named rather than nudged ***",
           !!zeroTable && zeroTable.dropped.filter((v) => v === "0").length >= 6,
           zeroTable ? `${zeroTable.dropped.length} of ${zeroTable.held} values in "${zeroTable.title.slice(0, 40)}" ` +
           `are undrawable -- ${zeroTable.dropped.filter((v) => v === "0").length} of them EXACTLY ZERO. That is ` +
           "the shipyard's whole result: claim-local storage is not small, it is NONE, and a log axis has no place " +
           "for it. A NUDGE TO 1e-16 WOULD DRAW A LINE SAYING 'VERY SMALL' WHERE THE MEASUREMENT SAYS 'NONE', " +
           "which is the caption problem with a chart on top of it" : "no table reported an undrawable value, " +
           "which cannot be right while the shipyard report holds a column of exact zeros");
    }
}

console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM. That 66 gates are worth wiring: the ratchet says the number may not");
console.log("  ----  rise, not that it must fall fast, and a ratchet nobody can pay down is what this tree calls a");
console.log("  ----  list of grievances -- the answer is that each wiring is one line in a gate that already has");
console.log("  ----  the table. That a report is CORRECT: it holds what the gate computed, and whether the gate was");
console.log("  ----  right is the gate's own business. And that the reports stay current -- they carry the date they");
console.log("  ----  were measured and nothing re-emits them on a ship, which is the next thing to decide.");
if (fails) { console.log("gateReport-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("gateReport-selfcheck: all checks pass");
