// WebGLEngine/tools/ship/gateReport.mjs -- v4394
//
// *** A GATE'S ARGUMENT DIES WITH THE TERMINAL, AND 67 OF THEM MAKE ONE. ***
//
// Keith raised 3Blue1Brown/manim beside ValkyrienSkies/Valkyrien-Skies-2 and asked what the pair generates.
// The thread is that both are ways of getting a simulation to EXPLAIN ITSELF, and manim's real discipline is
// not animation: it is that THE EXPLANATION IS GENERATED FROM THE SAME OBJECTS AS THE ARGUMENT, so it cannot
// drift from it. A caption can be wrong about a number. A number rendered from the number cannot be.
//
// MEASURED BEFORE ANYTHING WAS BUILT, and the answer is not "few":
//
//     1429 gates in the tree
//       67 print rows of formatted numbers -- a measured TABLE, which is the argument
//        0 write anything a second reader can open
//        0 are even VISIBLE to tools/ship/artefactWriters.mjs, the register that exists to answer exactly
//          that question, because its walk excludes /-selfcheck\.mjs$/ BY CONSTRUCTION
//
// So the tree's own register of "who emits something readable" cannot see the population this file is about.
// Its header says "a register that knows one shape of a thing reports everything else as absent" -- v3609 fixed
// that in its DETECTOR (a declaration shape replaced by a behavioural one) and left it standing in its WALK.
//
// ---- *** WHAT THIS IS AND, MORE IMPORTANTLY, WHAT IT IS NOT *** -----------------------------------------------
//
// It is a place to PUT a table a gate already computed, so a second reader can open it. It is NOT a reporting
// framework: no formatting, no verdicts, no assertions, no opinion about what a row means. A gate keeps printing
// exactly what it printed -- the terminal is still the primary surface and nothing here changes a verdict.
//
// *** AND IT WRITES ONLY WHEN ASKED. *** registerResidue's rule is that emitters are dry-run by default because
// "emitting on sight leaves a stale artefact behind every accidental run and A STALE MAP IS WORSE THAN NONE",
// with one exemption for artefacts that are a PURE FUNCTION OF THE TREE. A gate's table is not that: the
// shipyard gate's device rows need a GPU, and on a box without one the same gate honestly produces fewer rows.
// So SWEK_GATE_REPORT=1 turns emitting on, and every report records WHAT WAS NOT MEASURED rather than leaving
// the last box's numbers standing in place of this one's.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The served directory. One JSON per gate, named by the gate's basename, so a page can list them. */
export const REPORT_DIR = "gate-reports";
export const enabled = () => process.env.SWEK_GATE_REPORT === "1";

/**
 * *** v4408 -- HOW A RENDERED TABLE IS IDENTIFIED, AND WHY THE NAMES LIVE HERE. ***
 *
 * A report is a gate plus its tables, and this module is what says so; the attributes a page stamps on a
 * rendered table are therefore part of that shape and not the page's private business. They exist because
 * gateReport-selfcheck selected the register's table by SHAPE -- "the first table in #gr with over 20 rows"
 * -- and v4404 added tools/ship/claimEvidence-selfcheck.mjs, whose 32-row table sorts ahead of
 * registerDrift's 27 in index.json. The selector kept matching, silently, on somebody else's table, and
 * three checks went red over a subject nobody had touched.
 *
 * *** A SHAPE IS NOT AN IDENTITY. *** A selector written as a shape keeps matching after its subject is
 * replaced, which is the failure that gives no error and no diff -- and the reason it went unrepaired for
 * four versions is the other half of the same round: gateReport-selfcheck costs 7.8 s against quickSweep's
 * 3 s budget, so v4404 through v4407 all shipped ALL GREEN over the gate v4404 broke.
 *
 * instruments.html declares these strings a second time -- a browser page cannot import a Node module -- so
 * the second declaration is CHECKED rather than trusted: tools/ship/gateReport-selfcheck.mjs holds that the
 * page's markup uses exactly these names, which is the tree's standing answer to a constant that must live
 * in two places.
 */
export const TABLE_ATTR = Object.freeze({ gate: "data-gate", title: "data-report-table" });

/** The CSS selector that finds one report table by identity rather than by how big it happens to be. */
export function tableSelector(gate, title = null) {
    const q = (v) => String(v).replace(/["\\]/g, "\\$&");
    return `table[${TABLE_ATTR.gate}="${q(gate)}"]` + (title == null ? "" : `[${TABLE_ATTR.title}="${q(title)}"]`);
}

/**
 * Collect a gate's measured tables and, when asked, write them where a page can read them.
 *
 * `columns` is the header row; `rows` are arrays of the same length. NUMBERS STAY NUMBERS -- a report that
 * stored "6.31e-6" as text would have made the reader parse a rendering of a number back into a number, which
 * is the exact indirection this whole thread is about.
 */
export function gateReport(gateRelPath) {
    const tables = [], notes = [], skipped = [];
    return {
        table(title, columns, rows, note = null) {
            tables.push({ title, columns, rows, note });
            return this;
        },
        note(text) { notes.push(text); return this; },
        /** What this run did NOT measure, so a reader never mistakes a short report for a clean one. */
        skip(what, why) { skipped.push({ what, why }); return this; },
        /** Returns the object that would be written, whether or not writing is on -- so a gate can assert on it. */
        build() {
            return { gate: gateRelPath, at: new Date().toISOString().slice(0, 10),
                     tables, notes, skipped };
        },
        write() {
            const doc = this.build();
            if (!enabled()) return { written: false, why: "SWEK_GATE_REPORT is not 1", doc };
            const dir = path.join(ENG, REPORT_DIR);
            fs.mkdirSync(dir, { recursive: true });
            const name = path.basename(gateRelPath).replace(/\.mjs$/, "") + ".json";
            const file = path.join(dir, name);
            fs.writeFileSync(file, JSON.stringify(doc, null, 1) + "\n");
            // *** AND AN INDEX, BECAUSE A BROWSER CANNOT LIST A DIRECTORY. *** Without it the page would have to
            // carry a hand-typed list of report names -- a second declaration of which gates emit, drifting from
            // the first the moment somebody adds one. The index is rebuilt from what is actually on disk.
            const names = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json").sort();
            fs.writeFileSync(path.join(dir, "index.json"),
                JSON.stringify({ built: doc.at, reports: names }, null, 1) + "\n");
            return { written: true, file: `${REPORT_DIR}/${name}`, doc };
        },
    };
}

/** Every report currently on disk, for the page and for the census that counts them. */
export function reports() {
    const dir = path.join(ENG, REPORT_DIR);
    let names = [];
    // index.json is the LISTING, not a report. The first draft of this returned it as one and the gate went red
    // on a document with no gate field -- a register counting itself as an instance of the thing it registers,
    // which is the sixth time this tree has caught that species and the first in this file.
    try { names = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json"); }
    catch { return []; }
    return names.sort().map((f) => {
        try { return { file: `${REPORT_DIR}/${f}`, ...JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }; }
        catch { return { file: `${REPORT_DIR}/${f}`, broken: true }; }
    });
}

/**
 * *** THE POPULATION THIS FILE EXISTS FOR, COUNTED THE SAME WAY EVERY ROUND. ***
 *
 * A gate "argues in numbers" when it prints formatted numbers from a loop -- a table. THE TEST IS CRUDE AND SAID
 * SO: it reads source, not output, because running 1429 gates to find out costs half an hour and the property
 * wanted is "does this gate have a table at all", which the source answers. It will miss a gate that builds its
 * rows without a formatter and count one that formats a single number in a loop; both directions are named here
 * rather than discovered later.
 */
const FORMATTER = /toFixed\(|toExponential\(|padStart\(|toPrecision\(/;
export function arguesInNumbers(src, strip = (s) => s) {
    const code = strip(src);
    const loops = /for\s*\([^)]*\)[^;]{0,400}?(console\.log|say\()/s.test(code) ||
                  /\.forEach\([^)]*=>\s*(console\.log|say\()/.test(code) ||
                  /\.map\([^)]*=>\s*`[^`]*\$\{/.test(code);
    return loops && FORMATTER.test(code);
}
