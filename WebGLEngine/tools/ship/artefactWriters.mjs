// WebGLEngine/tools/ship/artefactWriters.mjs -- v3609
// ---------------------------------------------------------------------------------------------------------------
// THE RATCHET BUILT TO CATCH THIS DEFECT SAYS SO IN ITS OWN OUTPUT -- "THIS LINE IS THE CHECK THAT WOULD HAVE
// CAUGHT THAT" -- AND IT CANNOT SEE THE TWO REMAINING INSTANCES OF EXACTLY THAT DEFECT.
//
// v3447 found labGalaxy and gateActivity emitting artefacts that cosmic-map.html read while naming their
// absence BY TELLING THE READER TO RUN A TERMINAL COMMAND, gave both an ARTEFACT row, and built
// registerResidue-selfcheck so it could never happen again. v3608 then measured the front-door law and found
// TWO PROSE DOORS STILL STANDING: page-index.html renders "Run node tools/ship/buildPageIndex.mjs", and
// instruments.html renders "run node tools/ship/buildKnowledgeIndex.mjs".
//
// THE RATCHET IS BLIND TO BOTH, AND THE REASON IS ITS DETECTOR:
//
//     /export const OUT\s*=\s*["']([^"']+)["']/
//
//   tools/ship/buildKnowledgeIndex.mjs   declares `const OUT = path.join(ENG, "knowledge-index.json")`
//                                        -- NOT EXPORTED, and not a string literal
//   tools/ship/buildPageIndex.mjs        declares nothing at all; it writes
//                                        path.join(ROOT, "page-index.json") inline in its main block
//
// The detector keys on A DECLARATION SHAPE -- an exported string constant, which its own header calls "the
// code's own idiom and not a keyword probe" and which IS the idiom for the tools that had it. But the property
// that matters is BEHAVIOURAL: DOES THE MAIN BLOCK WRITE A FILE INTO THE SERVED ROOT. A tool can do that
// without ever spelling `export const OUT`, and two of them do.
//
// SO THE SHAPE IS v3608'S, ONE LEVEL DOWN: a register that knows one shape of a thing reports everything else
// as absent -- and here it reported nothing at all, which is worse, because the count read clean.
//
// ================================================================================================================
// AND THE SECOND SHAPE IS A REAL DESIGN QUESTION, NOT A GAP: THESE TWO WRITE UNCONDITIONALLY
// ================================================================================================================
//
// registerResidue's last check demands that EVERY artefact row pass `--write`, for a stated and good reason:
// the emitters are dry-run by default because "emitting on sight leaves a stale artefact behind every
// accidental run and A STALE MAP IS WORSE THAN NONE". buildPageIndex and buildKnowledgeIndex have no flag --
// they regenerate every time they run.
//
// THAT IS NOT A DEFECT IN THEM, AND THE DISCRIMINATOR IS MEASURABLE RATHER THAN A PREFERENCE. The worry is a
// STALE artefact from an accidental run. An artefact that is a PURE FUNCTION OF THE TREE cannot go stale that
// way: re-running can only refresh it. MEASURED, by running each twice and hashing the result:
//
//     buildPageIndex        8c88296fc4e210f3 -> 8c88296fc4e210f3    IDEMPOTENT
//     buildKnowledgeIndex   1146e6239df4ddad -> 1146e6239df4ddad    IDEMPOTENT
//
// So `alwaysWrites: true` is admitted ONLY where idempotence is MEASURED, never declared. The rule the register
// actually wants is "a row must not be able to run without producing its artefact", and `--write` satisfies it
// one way while measured idempotence satisfies it another. A SWEEP whose output depends on run parameters
// (corpus, detectionMap, labGalaxy, gateActivity) is not idempotent in that sense and keeps its flag.
//
// WHAT IS NOT CLAIMED: that every writer should have a row. A tool that writes into a scratch directory, or
// writes a file no page reads, is not owed a button by this law -- the law is about a PAGE THAT READS AN
// OUTPUT WHOSE PRODUCER HAS NO BUTTON. The census reports writers; the join with the pages is what makes a
// missing row a defect, and both halves are printed.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ARTEFACT_TOOLS, NO_MAIN } from "./reportingTools.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE = path.join(HERE, "..", "..");
export const SELF = path.relative(ENGINE, fileURLToPath(import.meta.url)).split(path.sep).join("/");

const rel = (p) => path.relative(ENGINE, p).split(path.sep).join("/");
// A NAME COUNTS IF IT IS IN THE SERVED ROOT **OR** A ROW ALREADY DECLARES IT. Existence alone under-reports:
// the dry-run emitters (corpus, detectionMap, labGalaxy, gateActivity) correctly leave NOTHING behind until
// somebody presses their button, so an existence-only filter drops exactly the tools that already did this
// right -- and a census that can only see the offenders cannot show its own instrument working.
const ROW_ARTEFACTS = new Set(ARTEFACT_TOOLS.map((t) => t.artefact));
export const noComments = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

/** The main block only: everything after the `import.meta.url === pathToFileURL(...)` guard. */
export function mainBlock(src) {
    const i = src.search(/import\.meta\.url\s*===/);
    return i < 0 ? "" : src.slice(i);
}

/**
 * DOES THIS TOOL'S MAIN BLOCK WRITE A FILE INTO THE SERVED ROOT, AND WHICH ONE?
 * Behavioural rather than declarative. The path is followed through one binding, because buildPageIndex writes
 * `const dest = path.join(ROOT, "page-index.json"); fs.writeFileSync(dest, ...)` and a rule that only read the
 * writeFileSync argument would call it a non-writer -- the same one-hop blindness v3608's detector had.
 */
export function writesArtefact(relPath) {
    let src = ""; try { src = fs.readFileSync(path.join(ENGINE, relPath), "utf8"); } catch { return null; }
    // A MAIN BLOCK IS REQUIRED (this is about tools you can RUN), BUT THE WRITE NEED NOT BE IN IT. My first
    // version demanded writeFileSync inside the main block and therefore MISSED buildKnowledgeIndex, whose main
    // block calls buildIndex() and whose write lives in that function -- the very file this module's header
    // says the old detector could not see. THE DETECTOR REPRODUCED THE DEFECT IT WAS BUILT TO FIND, eighth
    // instance of the shape. The write is looked for in the whole file once a main block exists.
    const body = noComments(mainBlock(src));
    if (!body) return null;
    if (!/write(File)?Sync|createWriteStream/.test(noComments(src))) return null;
    const whole0 = noComments(src);
    // AND THE NAME MUST BE A FILE THAT REALLY SITS IN THE SERVED ROOT. Static analysis cannot tell a served
    // artefact from a scratch file; the filesystem can, and a name that resolves to nothing is not an artefact
    // anybody's page could read.
    const named = [...whole0.matchAll(/["']([A-Za-z0-9._-]+\.(?:json|txt|csv|md|html))["']/g)]
        .map((m) => m[1]).filter((n) => fs.existsSync(path.join(ENGINE, n)) || ROW_ARTEFACTS.has("/" + n));
    if (!named.length) return null;
    // Prefer a name that is written directly; otherwise a name bound to an identifier the write receives.
    for (const n of named) {
        const esc = n.replace(/\./g, "\\.");
        if (new RegExp('write(File)?Sync\\s*\\([^)]*' + esc).test(body)) return { rel: relPath, artefact: "/" + n, via: "direct" };
        const m = body.match(new RegExp('(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=[^;\\n]*' + esc));
        if (m && new RegExp('write(File)?Sync\\s*\\(\\s*' + m[1] + '\\b').test(body)) return { rel: relPath, artefact: "/" + n, via: "one binding: " + m[1] };
    }
    // A module-scope constant used by the main block (buildKnowledgeIndex's `const OUT = path.join(...)`).
    const whole = whole0;
    for (const n of named) {
        const esc = n.replace(/\./g, "\\.");
        const m = whole.match(new RegExp('(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=[^;\\n]*' + esc));
        if (m && new RegExp('write(File)?Sync\\s*\\(\\s*' + m[1] + '\\b').test(whole)) return { rel: relPath, artefact: "/" + n, via: "module constant: " + m[1] };
    }
    // LAST: a write anywhere in a runnable file, with the name as a LITERAL rather than through a binding.
    // The fixture that caught this gap is a helper function called from the main block -- the shape
    // buildKnowledgeIndex would have had if it had not happened to bind a const.
    for (const n of named) {
        const esc = n.replace(/\./g, "\\.");
        if (new RegExp('write(File)?Sync\\s*\\([^)]*' + esc).test(whole)) return { rel: relPath, artefact: "/" + n, via: "literal in a helper" };
    }
    return null;
}

/** Every tool with a main block, walked. Gates are excluded; so is this file, BY IDENTITY. */
export function toolFiles() {
    const out = [];
    (function walk(d) {
        let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) walk(p); continue; }
            if (!/\.mjs$/.test(e.name) || /-selfcheck\.mjs$/.test(e.name)) continue;
            const r = rel(p);
            if (r === SELF) continue;
            out.push(r);
        }
    })(path.join(ENGINE, "tools"));
    return out.sort();
}

export function writers() { return toolFiles().map(writesArtefact).filter(Boolean); }

/** Which pages FETCH an artefact, so a missing row is a page reading an output nobody can produce. */
export function pagesReading(artefact) {
    const name = artefact.replace(/^\//, "");
    const out = [];
    for (const f of fs.readdirSync(ENGINE)) {
        if (!/\.html$/.test(f)) continue;
        const s = fs.readFileSync(path.join(ENGINE, f), "utf8");
        if (s.includes(name)) out.push(f);
    }
    return out;
}

/** THE MEASUREMENT THAT ADMITS `alwaysWrites`: run it twice and compare the bytes. Never declared. */
export function idempotent(relPath, artefact, { timeoutMs = 120000 } = {}) {
    const target = path.join(ENGINE, artefact.replace(/^\//, ""));
    const hash = () => { try { return crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex").slice(0, 16); } catch { return null; } };
    try {
        execFileSync(process.execPath, [path.join(ENGINE, relPath)], { cwd: ENGINE, timeout: timeoutMs, stdio: "ignore" });
        const a = hash();
        execFileSync(process.execPath, [path.join(ENGINE, relPath)], { cwd: ENGINE, timeout: timeoutMs, stdio: "ignore" });
        const b = hash();
        return { ok: a !== null && a === b, first: a, second: b };
    } catch (e) { return { ok: false, error: String(e && e.message).slice(0, 120) }; }
}

export function census() {
    const rows = new Map(ARTEFACT_TOOLS.map((t) => [t.rel, t]));
    return writers().map((w) => ({
        ...w,
        row: rows.get(w.rel) || null,
        exempt: NO_MAIN.has(w.rel),
        readBy: pagesReading(w.artefact),
    }));
}

export const MEASURED_V3609 = {
    blindTo: {
        "tools/ship/buildKnowledgeIndex.mjs": "declares `const OUT = path.join(...)` -- not exported, not a literal",
        "tools/ship/buildPageIndex.mjs": "declares nothing; writes path.join(ROOT, \"page-index.json\") inline",
    },
    idempotence: "MEASURED AS A PAIR, NOT AS A FIXED VALUE: each is run twice and the two hashes compared. The " +
        "knowledge index legitimately CHANGES whenever the tree does -- pinning a value here would fail on every " +
        "round that adds a gate, which is the count-pinned-where-progress-is-the-point defect. The claim is that " +
        "the SECOND run equals the FIRST, and that is what the gate asserts.",
    verdict: "THE RATCHET BUILT TO CATCH THIS DEFECT PRINTS 'THIS LINE IS THE CHECK THAT WOULD HAVE CAUGHT " +
             "THAT' AND IS BLIND TO THE TWO REMAINING INSTANCES OF IT, because it keys on a DECLARATION SHAPE " +
             "(`export const OUT`) where the property that matters is BEHAVIOURAL (does the main block write " +
             "into the served root). v3608's shape one level down -- and worse, because the count read clean.",
    theSecondShape: "These two WRITE UNCONDITIONALLY, which the register forbids for a good stated reason (a " +
             "stale artefact from an accidental run). THE DISCRIMINATOR IS MEASURED, NOT PREFERRED: an artefact " +
             "that is a PURE FUNCTION OF THE TREE cannot go stale that way, and both are IDEMPOTENT across two " +
             "consecutive runs. `alwaysWrites` is admitted only where that is measured.",
    notClaimed: "NOT every writer is owed a row. The law is about A PAGE THAT READS AN OUTPUT WHOSE PRODUCER " +
             "HAS NO BUTTON, so the census reports writers AND the pages that read them, and the join is what " +
             "makes a missing row a defect.",
};

export function reportLines() {
    const L = [], say = (s) => L.push(s);
    say("[artefactWriters] who writes into the served root, and can the artefact register see them");
    say("");
    say("  tool                                    artefact              row   read by");
    for (const c of census()) {
        say("    " + c.rel.padEnd(40) + c.artefact.padEnd(22) +
            (c.row ? "yes " : c.exempt ? "exempt" : "NO  ").padEnd(6) + (c.readBy.join(", ") || "-"));
    }
    say("");
    const gaps = census().filter((c) => !c.row && !c.exempt && c.readBy.length);
    say("  WRITES AN ARTEFACT A PAGE READS, AND HAS NO ROW: " + (gaps.length ? gaps.map((g) => g.rel).join(", ") : "none"));
    say("  (registerResidue's detector is `export const OUT` and cannot see a writer that does not spell it.)");
    say("");
    say("  " + MEASURED_V3609.verdict);
    say("  SECOND SHAPE: " + MEASURED_V3609.theSecondShape);
    say("  NOT CLAIMED: " + MEASURED_V3609.notClaimed);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
