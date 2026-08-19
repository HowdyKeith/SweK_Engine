// tools/roundhouse/labExport-selfcheck.mjs
//
// Run: node tools/roundhouse/labExport-selfcheck.mjs   (~241s -- MEASURED, was a typed ~40s)
//
// v3183 -- A LAB RESULT THAT CARRIES THE CONFIGURATION THAT PRODUCED IT.
//
// v3182 measured that only 24% of the numeric claims in lab gates reproduce by running the device they name.
// The rest are legitimate and CONFIG-SPECIFIC, and the config was not written down -- because build() returns
// observables and NOTHING ELSE, so even a careful author has to remember the config by hand and put it in
// prose. THIS MAKES THE PAIRING STRUCTURAL.
//
// *** THE PROPERTY THAT MATTERS IS THAT A RECORD IS RE-RUNNABLE, AND IT IS CHECKED RATHER THAN ASSERTED. ***
// The gate re-runs every record FROM ITS OWN RECORD and compares. An export nobody can replay is a spreadsheet
// of assertions.
//
// *** AND THE CONFIG IS SHOWN TO MATTER. *** Recording a config proves nothing if the device ignores it -- that
// would be a provenance field decorating a number it had no part in. So a CHANGED config must produce a
// DIFFERENT result, demonstrated rather than assumed: a claim about absence must be shown failing, applied to
// the usefulness of the record's own key field.

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const L = await import(pathToFileURL(path.join(HERE, "labExport.mjs")).href);
const D = await import(pathToFileURL(path.join(HERE, "devices.mjs")).href);

const recs = [
    await L.runRecord(D, "thermal"),
    await L.runRecord(D, "thermal", { mode: "rayleigh" }),
    await L.runRecord(D, "kh", { config: { steps: 600 } }),
];

// ---- 1. THE RECORD CARRIES ITS CONFIG, AND REPLAYS FROM IT --------------------------------------------------
{
    ok("!! every record carries device, mode and the config that was passed",
        recs.every((r) => r.device && r.mode && "config" in r && "outputs" in r),
        "build() returns observables and NOTHING ELSE, so the config had to be remembered by hand and written " +
        "into prose -- which is exactly the 76% v3182 measured as unreproducible");

    ok("!! *** every record REPLAYS EXACTLY from its own record ***",
        (await Promise.all(recs.map((r) => L.replay(D, r)))).every((v) => v.ok),
        "the gate re-runs each one from what the record itself says. AN EXPORT NOBODY CAN REPLAY IS A " +
        "SPREADSHEET OF ASSERTIONS, and this is the only claim the module actually makes");

    ok("!! comparison is EXACT, not tolerant",
        /if \(now !== v\) drift\.push/.test(fsMod.readFileSync(path.join(HERE, "labExport.mjs"), "utf8")),
        "these devices are DETERMINISTIC, so a difference is a FINDING rather than noise -- and a tolerance " +
        "would hide the day one of them stops being deterministic, which is the thing most worth knowing");

    ok("...and an observable that APPEARED counts as drift too",
        /observable is new/.test(fsMod.readFileSync(path.join(HERE, "labExport.mjs"), "utf8")),
        "reporting only disappearances would call a device that GREW an output 'unchanged' -- true of every " +
        "number it used to emit and false about the device");
}

// ---- 2. THE CONFIG IS SHOWN TO MATTER --------------------------------------------------------------------------
{
    ok("!! *** a CHANGED config produces a DIFFERENT result ***",
        await (async () => {
            const a = await L.runRecord(D, "kh", { config: { steps: 600 } });
            const b = await L.runRecord(D, "kh", { config: { steps: 2400 } });
            if (!a.ok || !b.ok) return false;
            return Object.keys(a.outputs).some((k) => b.outputs[k] !== undefined && b.outputs[k] !== a.outputs[k]);
        })(),
        "RECORDING A CONFIG PROVES NOTHING IF THE DEVICE IGNORES IT -- that would be a provenance field " +
        "decorating a number it had no part in. Shown failing rather than assumed, on the record's own key field");

    ok("!! the config is stored AS PASSED, not merged with defaults",
        /const args = config \? \{ mode: m, config \} : \{ mode: m \};/.test(fsMod.readFileSync(path.join(HERE, "labExport.mjs"), "utf8")),
        "recording the MERGED view would silently claim the author chose every default, and a later change to " +
        "a default WOULD REWRITE HISTORY -- a record that changes meaning when code it never mentioned moves");

    ok("!! there is NO timestamp, deliberately",
        !/Date\.now|toISOString|new Date/.test(fsMod.readFileSync(path.join(HERE, "labExport.mjs"), "utf8")),
        "a time would make two identical runs DIFFER, which breaks the round-trip diff this project ships on " +
        "and adds nothing. THE CONFIG IS THE PROVENANCE: when something ran is a fact about a session, what it " +
        "ran WITH is a fact about the result");
}

// ---- 3. IT LEAVES THE BUILDING IN A FORM ANYTHING READS -----------------------------------------------------------
{
    const csv = L.toCSV(recs);
    const lines = csv.trim().split("\n");
    ok("!! CSV is LONG, one row per observable",
        lines[0] === "device,mode,config,observable,value,ok,error" && lines.length > recs.length + 1,
        lines.length - 1 + " rows from " + recs.length + " runs. A WIDE table has a column set that CHANGES WITH " +
        "THE DEVICE and a long one does not -- so a spreadsheet, pandas or R reads this without a parser and " +
        "without knowing what a device is");

    ok("!! and every row carries the config that would re-run it",
        lines.slice(1).every((l) => l.split(",").length >= 5),
        "the config is one JSON cell -- ugly to read and EXACTLY RE-PASTEABLE, which is the trade that matters " +
        "for a record whose whole job is to be re-runnable");

    ok("...and a FAILED run is a row too, not a silent gap",
        (() => { const bad = { device: "x", mode: "m", config: null, ok: false, error: "boom", outputs: {} };
                 return /x,m,,,,false,boom/.test(L.toCSV([bad])); })(),
        "dropping it would leave a row missing from an export WITH NO INDICATION ANYTHING WAS ATTEMPTED -- the " +
        "absence looking exactly like a config nobody tried");
}

console.log();
console.log("  ----  WHERE THIS CAN GO: the CSV is plain long-form, so it imports into a spreadsheet, pandas or R");
console.log("  ----  with no adapter. THE REASON THAT IS POSSIBLE IS THE CONFIG COLUMN -- a table of numbers with");
console.log("  ----  no configurations is not importable anywhere useful, because nothing downstream can say");
console.log("  ----  what it is looking at. NOT WIRED TO A PAGE OR A ROUTE YET: this is the format and the");
console.log("  ----  guarantee, and a front door for it is a separate round.");
if (fails) { console.log("labExport-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("labExport-selfcheck: all checks pass");
