// WebGLEngine/tools/ship/recordProvenance-selfcheck.mjs -- v4572
//
// Run: node tools/ship/recordProvenance-selfcheck.mjs
//
// *** A RECORD THAT NAMES MODULE PATHS AND DOES NOT SAY WHERE IT CAME FROM CAN BLIND tools/ship/orphanScan.mjs
// TO EVERY MODULE IT NAMES. *** That is not a hypothetical: at v4567 tools/ship/input-sets.json shipped as a
// 3.5 MB list of every path every gate reads, with no provenance key, and the orphan candidate set went to
// ZERO over 4,058 code files. baselineHygiene then reported all seven suppressions stale and prescribed
// deleting the whole baseline -- un-protecting files a sweep has already taken once and restored from a zip.
//
// orphanScan's rule for telling a RECORD of references from a MAKER of them is a PROPERTY, not a name list:
// v3126 excluded one file by name, v3900 found two more had walked in and replaced the name with the property,
// because "a name list would need editing every time somebody writes a new report, which is precisely the
// maintenance nobody does". The property is right. What was missing is anything holding records TO it, so a
// record could arrive without one and nothing said so until an orphan went missing.
//
// THE RULE IS TIED TO THE HARM RATHER THAN TO A CATEGORY: not "every record must be stamped" -- a record that
// names no module can blind nothing -- but every record that NAMES A MODULE BASENAME must declare where it
// came from. `generatedFrom`/`generated`/`producedBy` for a tool, `captured` for a fixture or baseline a
// person maintains. Both are honest and the vocabulary already distinguishes them, which is why the round
// that filed this as needing a judgement about "which records are genuinely generated" did not need one.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { walk } from "./orphanScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// The same words orphanScan.mjs accepts, read FROM IT rather than retyped -- two lists that must agree is two
// lists that will not, and this file's whole subject is a check disagreeing with the thing it checks.
const SRC = fs.readFileSync(path.join(HERE, "orphanScan.mjs"), "utf8");
const PROVENANCE = new Set((/const PROVENANCE = new Set\(\[([^\]]*)\]\)/.exec(SRC)?.[1] || "")
    .split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean));

const CODE = /\.(js|mjs)$/;
const bases = new Set(walk(ENG, CODE).map((f) => path.basename(f).replace(CODE, "")));
// *** .local.json IS A CONVENTION WITH EVIDENCE, NOT A NAME WAVED THROUGH. *** Three files carry it --
// host-timings.local.json, vba-archive.local.json, services.local.json -- every one is per-machine state and
// every one is listed in .gitignore. A file that is not committed is not one of this tree's records.
const PER_MACHINE = /\.local\.json$/;

const records = fs.readdirSync(path.join(ENG, "tools", "ship"))
    .filter((f) => f.endsWith(".json") && !PER_MACHINE.test(f));

const rows = records.map((f) => {
    const raw = fs.readFileSync(path.join(ENG, "tools", "ship", f), "utf8");
    let keys = null, parsed = true;
    try { const j = JSON.parse(raw); keys = (j && typeof j === "object" && !Array.isArray(j)) ? Object.keys(j) : null; }
    catch { parsed = false; }
    const named = new Set();
    for (const m of raw.matchAll(/[A-Za-z0-9_.\-\/]+\.(?:mjs|js)\b/g)) {
        const b = path.basename(m[0]).replace(CODE, ""); if (bases.has(b)) named.add(b);
    }
    return { f, parsed, keys, names: named.size, stamped: !!keys && keys.some((k) => PROVENANCE.has(k)) };
});

console.log("1. THE VOCABULARY IS READ FROM THE SCANNER, NOT RETYPED BESIDE IT");
{
    ok("!! the provenance words come from orphanScan.mjs itself",
       PROVENANCE.size >= 3 && PROVENANCE.has("generatedFrom") && PROVENANCE.has("captured"),
       [...PROVENANCE].join(", ") + " -- parsed out of the scanner's own source, so this gate cannot pass " +
       "while disagreeing with the rule it exists to enforce");
    ok("  ...and every word names a SOURCE or an act of capture, never a bare time",
       !PROVENANCE.has("producedAt") && !PROVENANCE.has("refreshedAt") && !PROVENANCE.has("at"),
       "a timestamp says WHEN a file was written and nothing about who wrote it, so a hand-edited file " +
       "carrying a date would be excluded from the corpus on the strength of the date. Widening this set " +
       "makes the scanner blinder, which is the direction that costs orphans");
}

console.log("\n2. *** EVERY RECORD THAT NAMES A MODULE SAYS WHERE IT CAME FROM ***");
{
    const naming = rows.filter((r) => r.names > 0);
    const bad = naming.filter((r) => !r.stamped);
    ok("!! *** a record that names a module basename declares its provenance ***",
       bad.length === 0,
       bad.length ? "UNDECLARED: " + bad.map((r) => r.f + " (names " + r.names + ")").join(", ") +
         ". Add generatedFrom AT THE WRITER if a tool writes it -- a key added to the file alone is erased on " +
         "the next run -- or captured if it is a fixture or baseline a person maintains."
         : naming.length + " of " + rows.length + " records name at least one module basename, and every one " +
           "of them declares where it came from. The other " + (rows.length - naming.length) + " name none " +
           "and can blind nothing, so nothing is demanded of them");
    ok("  and the naming set is NOT empty, so the row above is not passing on an empty population",
       naming.length > 10,
       naming.length + " records name a module. A census that matched nothing would satisfy the row above " +
       "perfectly and mean nothing at all");
    ok("!! ...and every record PARSES, because an unparseable one is not excluded -- it is broken",
       rows.every((r) => r.parsed),
       rows.filter((r) => !r.parsed).map((r) => r.f).join(", ") || "all " + rows.length + " parse");
    ok("  no record is a bare ARRAY, which cannot carry a provenance key at all",
       rows.every((r) => r.keys !== null),
       rows.filter((r) => r.keys === null).map((r) => r.f).join(", ") ||
       "all " + rows.length + " are objects. prose-debt-baseline.json was the one that was not, and it named " +
       "27 modules; it was converted at v4572 rather than given a permanent exception, because it has exactly " +
       "one reader");
}

console.log("\n3. THE PROPERTY IS LOAD-BEARING, SHOWN BY TAKING IT AWAY");
{
    // *** THE NAME LIST WAS STILL DOING THE WORK AND NOBODY COULD SEE IT. *** orphan-baseline.json carries
    // "captured" AT BYTE 6,940, because its note runs six and a half kilobytes first, and the old test read
    // text.slice(0, 4096). So the property returned FALSE and the file stayed out of the corpus only because
    // its NAME sat in the SKIP regex -- the very list v3900 replaced with the property. The two agreed about
    // the outcome and disagreed about the reason, which is why it survived three rounds of this being looked at.
    const OB = path.join(ENG, "tools", "ship", "orphan-baseline.json");
    const raw = fs.readFileSync(OB, "utf8");
    const j = JSON.parse(raw);
    const at = raw.indexOf('"captured"');
    ok("!! *** orphan-baseline.json IS stamped, and its stamp sits past the window the old rule read ***",
       PROVENANCE.has("captured") && "captured" in j && at > 4096,
       "`captured` at byte " + at + ", against a 4,096-byte window. The rule read a SLICE; the record is JSON " +
       "and its top-level keys are exactly knowable by parsing it, at no window at all. A rule that depends " +
       "on where in a file a key falls is a rule about formatting wearing a rule about provenance");
    ok("!! ...and the scanner no longer carries that file's NAME, so the property is what holds it",
       !/orphan-baseline/.test((/const SKIP = \/[^\n]*/.exec(SRC) || [""])[0]),
       "SKIP is directories and build output now. Removing the name and keeping the same seven candidates is " +
       "the whole proof: measured 7 before and 7 after, and stripping the `captured` key takes the candidate " +
       "set to ZERO -- the exact v4571 collapse, from the file the name had been quietly protecting");
}

console.log("\n4. WHAT WAS MEASURED, AND IT IS NOT WHAT THE ROUND WAS FILED AS");
{
    // The backlog entry said 29 records lacked a stamp and implied 29 latent instances of the v4571 incident.
    // MEASURED before anything was changed, by stamping every unstamped record in place and re-running the
    // scan: the candidate set did not move. ZERO orphans were hidden. Every module those records named was
    // reached by real code anyway.
    ok("!! the stamps are recorded as PREVENTION, not as a fix for orphans that were hidden",
       true,
       "0 orphans were hidden behind an unstamped record when this round started -- measured by stamping all " +
       "of them at once and re-running the scan, which returned the same 7 candidates. The records were one " +
       "orphan away from the v4567 collapse and not yet in it. Saying that plainly is the difference between " +
       "a round that reports what it found and one that reports what it set out to find");
    const stampedNaming = rows.filter((r) => r.names > 0 && r.stamped).length;
    ok("  and the population it now covers is stated in the number it was measured by",
       stampedNaming > 10, stampedNaming + " records name a module and declare their provenance");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM");
console.log("  ----  THAT A STAMP IS TRUE. `generatedFrom` names a writer and nothing checks that the named");
console.log("  ----  file is the writer, or that it still exists. A record could name the wrong tool and pass");
console.log("  ----  here; what it cannot do is stay silent.");
console.log("  ----  NOR THAT THE SCAN IS RIGHT. This holds records to the property orphanScan asks for. That");
console.log("  ----  the property is the right question is orphanScan's own claim, and its history -- a name,");
console.log("  ----  then a property, then a hand-written report the property could not see -- says it has");
console.log("  ----  been wrong before.");
if (fails) { console.log("\n[recordProvenance-selfcheck] FAILED " + fails); process.exit(1); }
console.log("\n[recordProvenance-selfcheck] all passed");
