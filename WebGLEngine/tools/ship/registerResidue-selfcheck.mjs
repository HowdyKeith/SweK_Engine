// WebGLEngine/tools/ship/registerResidue-selfcheck.mjs -- v3447
//
// Run: node tools/ship/registerResidue-selfcheck.mjs
//
// *** TWO REGISTERS, ONE DEFECT: A DECLARED LIST THAT COVERS PART OF ITS POPULATION, WITH NOTHING COMPARING THE
// TWO. *** This tree names that shape more often than any other, and it was sitting in two places at once.
//
//   ARTEFACT_TOOLS   3 tools declare `export const OUT` -- "I emit a named artefact" -- and only ONE had a row.
//                    labGalaxy (v3443) and gateActivity (v3444) are BOTH MINE, and cosmic-map.html FETCHES the
//                    files they write while naming their absence by TELLING THE READER TO RUN A TERMINAL
//                    COMMAND. A CLI-only deliverable, shipped twice running by the rounds that gated everything
//                    else about those files -- and harder to notice than a missing page, because the page is
//                    right there and looks finished.
//
//   UNPLACED         18 pages declared unplaced WITH A REASON EACH, against SIXTY linked from server.html and
//                    in no section. *** SO FORTY-TWO PAGES ARE IN NEITHER LIST, and the register whose own
//                    comment says "AN UNPLACED PAGE AND A PAGE NOBODY GOT TO LOOK THE SAME" cannot currently
//                    tell them apart -- which is the one thing it exists to do. ***
//
// THE TWO HALVES GET OPPOSITE TREATMENT, AND THE DIFFERENCE IS WHO CAN ANSWER:
//
//   The artefact gap is FAILED, because the answer is not a judgement. A tool that declares OUT is claiming to
//   emit a named file, and either a page offers it or somebody says in a sentence why not.
//
//   The page residue is RATCHETED, because writing forty-two reasons would be FABRICATING PROVENANCE at scale --
//   the exact refusal deviceInstrumentMap makes about devices with no front door, and unwiredRegister about
//   modules nothing calls. A page in neither list may be a considered decision or drift AND NOTHING HERE CAN
//   DERIVE WHICH. The number may only SHRINK; a new arrival fails; and each judgement is Keith's, one at a time.
//
// THE DETECTOR IS THE CODE'S OWN IDIOM AND NOT A KEYWORD PROBE. `export const OUT = "name"` is how this tree's
// emitters declare their artefact -- detectionMap, labGalaxy and gateActivity all do it. Matching on "--write"
// instead would sweep in gen-ship-section, makeIncremental and verify-all, which are BUILD tools that write
// where they are told, plus gateActivity-selfcheck, which writes a PLANT and deletes it again. THE KEYWORD
// PROBE HAS MISLED THIS PROJECT THREE TIMES; this one asks what the file DECLARES.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { idempotent } from "./artefactWriters.mjs";
import { ARTEFACT_TOOLS, REPORTING, NO_MAIN } from "./reportingTools.mjs";
import { SECTIONS, UNPLACED, claimedPages } from "./pageSections.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (p) => path.relative(ENG, p).split(path.sep).join("/");

/* ------------------------------------------------------------------------------------------------------------
 * 1. EVERY DECLARED ARTEFACT EMITTER HAS A DOOR
 * --------------------------------------------------------------------------------------------------------- */
function emitters() {
    const out = [];
    (function walk(d) {
        let entries = [];
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { if (!/node_modules|\.git/.test(p)) walk(p); continue; }
            if (!/\.mjs$/.test(e.name) || /-selfcheck\.mjs$/.test(e.name)) continue;
            let s = ""; try { s = fs.readFileSync(p, "utf8"); } catch { continue; }
            // v3609 -- COMMENTS STRIPPED FIRST. This scan read RAW SOURCE, so a comment QUOTING the idiom
            // registered a phantom emitter: v3609's own note in reportingTools.mjs, explaining that the
            // detector keys on `export const OUT`, made reportingTools itself look like a tool emitting an
            // artefact called "name". PROSE-AS-CODE, in the register, produced by the sentence describing the
            // register. codeOnly is right here -- the operand is a literal but the DECLARATION is an idiom.
            s = s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
            const m = /export const OUT\s*=\s*["']([^"']+)["']/.exec(s);
            if (m) out.push({ rel: rel(p), out: m[1] });
        }
    })(path.join(ENG, "tools"));
    return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

{
    const emit = emitters();
    const rows = new Map(ARTEFACT_TOOLS.map((t) => [t.rel, t]));
    say(`${emit.length} tool(s) declare an artefact via \`export const OUT\`: ${emit.map((e) => e.out).join(", ")}`);
    const doorless = emit.filter((e) => !rows.has(e.rel) && !NO_MAIN.has(e.rel));
    ok("!! *** every tool that DECLARES an artefact has a row that produces it, or a named exemption ***",
       doorless.length === 0,
       doorless.length
         ? `NO DOOR: ${doorless.map((d) => d.rel + " (" + d.out + ")").join(", ")}. A TOOL WHOSE PAGE READS ITS OUTPUT AND WHOSE OUTPUT HAS NO BUTTON IS HALF A FRONT DOOR, and it is harder to notice than a missing page because the page is right there and looks finished.`
         : `${emit.length} emitters, ${emit.length - doorless.length} with a row. labGalaxy and gateActivity SHIPPED WITHOUT ONE at v3443 and v3444 -- both mine, and cosmic-map.html named their absence by telling the reader to run a terminal command. THIS LINE IS THE CHECK THAT WOULD HAVE CAUGHT THAT.`);

    const rowPointsAtNothing = ARTEFACT_TOOLS.filter((t) => !fs.existsSync(path.join(ENG, t.rel)));
    ok("...and no artefact row names a tool that is not there",
       rowPointsAtNothing.length === 0,
       `${ARTEFACT_TOOLS.length} rows checked. THE COMPARISON RUNS BOTH WAYS: a row for a deleted tool is a button that 500s, and it looks exactly like a working one until pressed.`);

    const declaredOut = new Map(emit.map((e) => [e.rel, "/" + e.out]));
    const mismatched = ARTEFACT_TOOLS.filter((t) => declaredOut.has(t.rel) && declaredOut.get(t.rel) !== t.artefact);
    ok("!! *** and the file a row LINKS is the file the tool SAYS it writes ***",
       mismatched.length === 0,
       mismatched.length
         ? mismatched.map((m) => `${m.rel} links ${m.artefact}, declares ${declaredOut.get(m.rel)}`).join("; ")
         : "the row's `artefact` and the tool's `export const OUT` are TWO DECLARATIONS OF ONE FILENAME, and this is the thing that compares them. A row linking a path the tool never writes gives a 404 after a run that exited 0 -- a green button and an empty hand.");

    // v3609 -- THE RULE IS "A ROW CANNOT RUN WITHOUT PRODUCING ITS ARTEFACT", AND --write IS ONE WAY TO SATISFY
    // IT. The dry-run convention exists because emitting on sight leaves a STALE artefact behind an accidental
    // run. An artefact that is a PURE FUNCTION OF THE TREE cannot go stale that way, so `alwaysWrites` is
    // admitted -- BUT ONLY WHERE IDEMPOTENCE IS MEASURED, never where it is merely declared. A row that claimed
    // alwaysWrites over a sweep would be caught by the second check below, which runs it twice.
    const flagged = ARTEFACT_TOOLS.filter((t) => (t.args || []).includes("--write"));
    const always = ARTEFACT_TOOLS.filter((t) => t.alwaysWrites === true);
    ok("...and every artefact row either passes the flag that makes it write, or declares alwaysWrites",
       flagged.length + always.length === ARTEFACT_TOOLS.length,
       flagged.length + " dry-run-by-default + " + always.length + " always-write of " + ARTEFACT_TOOLS.length +
       ". A row that forgot the flag would run clean, exit 0 and link a file it did not produce.");
    {
        const bad = [];
        for (const t of always) {
            const r = idempotent(t.rel, t.artefact);
            if (!r.ok) bad.push(t.rel + " (" + (r.error || r.first + " -> " + r.second) + ")");
        }
        ok("!! *** and every alwaysWrites row is IDEMPOTENT, MEASURED BY RUNNING IT TWICE ***", bad.length === 0,
           bad.length ? "NOT IDEMPOTENT: " + bad.join(", ") + " -- an accidental press of this button CAN leave " +
           "something stale, which is exactly what the dry-run convention exists to prevent"
           : always.length + " always-write rows, each run twice with a byte-identical artefact. THE ADMISSION " +
             "IS A MEASUREMENT AND NOT A PREFERENCE, and a sweep declaring alwaysWrites would fail here.");
    }

    const both = ARTEFACT_TOOLS.filter((t) => REPORTING.some((r) => r.rel === t.rel));
    ok("...and no tool is BOTH an artefact row and a reporting row",
       both.length === 0,
       "the two categories mean different things -- a reporting row pastes text into a <pre> and is run TWICE at 120s by the front-door budget, which is what turned toolFrontDoor red at v3395 when a 205s sweep was filed as a report. A tool in both lists would be run as a report and read as an artefact.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE PAGE RESIDUE -- DERIVED, RATCHETED, AND NOT INVENTED
 * --------------------------------------------------------------------------------------------------------- */

// *** THE RATCHET REACHED ZERO AT v4590, AND THE COMMENT THAT USED TO STAND HERE SAID WHAT TO DO ABOUT IT:
// "REPLACED BY AN EQUALITY -- the residue IS the unplaced set -- NOT BY LOWERING THE NUMBER AGAIN." ***
// Forty-two pages were linked from server.html and in neither a section nor the UNPLACED register when this
// section was written; a RATCHET (may only shrink, never re-raised) rather than a WALL (a fixed cap), because
// writing forty-two reasons at once would have been FABRICATING PROVENANCE at scale -- the same refusal
// deviceInstrumentMap makes about devices with no front door and unwiredRegister about modules nothing calls.
//
// v3927 -- 42 -> 41 (eight GPU Brain pages, three lattice-Boltzmann). v4590's FIRST pass -- a background
// research read of all 62 residue pages that then existed -- took it 41 -> 22 in the round documented at
// pageSections.mjs's own v4590 SECTIONS entries (21 pages into nine existing drawers, 8 into a new "Slug Text"
// drawer, 11 into UNPLACED). v4590's SECOND pass, Keith reviewing the ~20 pages that first pass flagged
// "needs Keith's judgement" one at a time, closed the rest: 4 more placements (a new "Avatars" drawer, a new
// "Toroidal Buffers" drawer, and two subject fits with room), 9 more UNPLACED with individual reasons.
// RESIDUE IS NOW ZERO. The ratchet is retired, per the instruction it carried, and the check below is an
// EQUALITY: every page linked from server.html is now placed or excused, and a new one that is neither fails
// the moment it lands rather than being tolerated against a ceiling with slack in it.

{
    const html = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    const linked = new Set([...html.matchAll(/href="\/([a-z0-9._-]+\.html)"/gi)].map((m) => m[1]));
    const placed = claimedPages();
    const residue = [...linked].filter((p) => !placed.has(p) && !UNPLACED.has(p)).sort();

    say(`${linked.size} pages linked from server.html; ${placed.size} placed in ${SECTIONS.length} sections; ${UNPLACED.size} declared unplaced with a reason`);
    say(`residue (in neither list): ${residue.length}`);
    if (residue.length) say(residue.join(" "));

    ok("!! *** THE RESIDUE IS THE UNPLACED SET: every page linked from server.html is placed or excused, exactly ***",
       residue.length === 0,
       residue.length
           ? `${residue.length} still in neither list: ${residue.join(", ")}. *** UNPLACED's OWN COMMENT SAYS "AN UNPLACED PAGE AND A PAGE NOBODY GOT TO LOOK THE SAME", AND THIS LINE IS WHAT TELLS THEM APART. *** Each is a judgement (a section, or an exemption with a sentence) and it is Keith's, one at a time.`
           : `0 residue against ${linked.size} linked, ${placed.size} placed and ${UNPLACED.size} unplaced -- the two registers now partition every linked page with no third, unaccounted state`);

    // fdtd.html was the ONE instance on the open list, and it turned out to be one of forty-two -- which is why
    // the round derived the population instead of placing the page. A CRUDE COUNT NEAR A HUNDRED IS AN UNASKED
    // QUESTION, and a list of one is the same thing with the question still unasked.
    ok("REPORTED: fdtd.html was the item on the list, and it is one of the residue rather than a special case", true,
       `in residue: ${residue.includes("fdtd.html")}. The open list carried "fdtd's page sits in no section" as a one-line job. DERIVING THE POPULATION TURNED ONE INTO FORTY-TWO, and placing just fdtd would have closed the symptom and left the register still unable to answer its own question.`);

    const collide = [...UNPLACED.keys()].filter((p) => placed.has(p));
    ok("...and nothing is both placed and declared unplaced",
       collide.length === 0,
       `${collide.length} collision(s). Already asserted in pageSections-selfcheck; kept here because THIS file is the one that reads both lists as a population, and a contradiction between them would make the residue meaningless.`);
}

console.log(fails ? "\nregisterResidue-selfcheck: " + fails + " FAILED" : "\nregisterResidue-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
