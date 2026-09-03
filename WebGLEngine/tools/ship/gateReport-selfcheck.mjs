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

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (p) => path.relative(ENG, p).split(path.sep).join("/");

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE CENSUS -- and the ratchet is on the gap, because the gap is the debt
 * --------------------------------------------------------------------------------------------------------- */
const GATES = gateFiles(ENG).map(rel);
const argues = [], emits = [];
for (const g of GATES) {
    let src = ""; try { src = fs.readFileSync(path.join(ENG, g), "utf8"); } catch { continue; }
    if (arguesInNumbers(src, noComments)) argues.push(g);
    if (/gateReport\s*\(/.test(noComments(src)) && g !== "tools/ship/gateReport-selfcheck.mjs") emits.push(g);
}
{
    // v4394 -- MEASURED: 67 argue, 1 emits. The ratchet is on the DIFFERENCE and it may only shrink, which is
    // the only direction that is work: paying it down means a gate's table reaching a reader, and the number
    // cannot fall by accident.
    const SILENT_CEILING = 66;
    const silent = argues.filter((g) => !emits.includes(g));
    say(`${GATES.length} gates; ${argues.length} argue in numbers; ${emits.length} emit a report; ${silent.length} argue and do not`);
    ok("!! *** the population of gates whose argument dies with the terminal may only SHRINK ***",
       silent.length <= SILENT_CEILING,
       `${silent.length} against a ceiling of ${SILENT_CEILING}. A RISE MEANS A NEW GATE HAS BEEN WRITTEN WHOSE ` +
       "TABLE NOBODY BUT ITS AUTHOR WILL EVER SEE. Falling means a gate's numbers reached a reader. THE " +
       "DETECTOR IS SOURCE-SIDE AND CRUDE ON PURPOSE -- running 1429 gates to find out costs half an hour, and " +
       "the property wanted is 'does this gate have a table at all', which the source answers");

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
console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM. That 66 gates are worth wiring: the ratchet says the number may not");
console.log("  ----  rise, not that it must fall fast, and a ratchet nobody can pay down is what this tree calls a");
console.log("  ----  list of grievances -- the answer is that each wiring is one line in a gate that already has");
console.log("  ----  the table. That a report is CORRECT: it holds what the gate computed, and whether the gate was");
console.log("  ----  right is the gate's own business. And that the reports stay current -- they carry the date they");
console.log("  ----  were measured and nothing re-emits them on a ship, which is the next thing to decide.");
if (fails) { console.log("gateReport-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("gateReport-selfcheck: all checks pass");
