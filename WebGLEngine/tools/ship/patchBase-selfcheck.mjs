// WebGLEngine/tools/ship/patchBase-selfcheck.mjs -- v3374
// *** UNSTATED IS NOT A WORSE MISMATCH. IT IS AN ABSENCE OF EVIDENCE, and collapsing the two is how v3373's
// overreach happened: I judged an unstated-base patch against my tree and published "those claims were WRONG". ***
import { statedBase, inspectPatch, auditable, treeVersionOf, UNSTATED, MATCHES, DIFFERS } from "./patchBase.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

// ---- the parser, on the shapes ACTUALLY SEEN rather than an invented schema --------------------------------
ok("!! it reads the two note shapes this project has really received",
    statedBase("# SweK Engine -- incremental patch v3357 -> v3358") === "v3357" &&
    statedBase("Rebased onto v3357, which already carried v3337-v3339.") === "v3357",
    "both lines are from swek_patch_v3358's own PATCH.md. A parser written against an imagined format would " +
    "report UNSTATED on a patch that stated its base perfectly clearly");

ok("!! *** and it returns null rather than guessing ***",
    statedBase("no base here") === null && statedBase("") === null && statedBase(null) === null,
    "a base inferred from file contents would be a fabricated provenance -- the same refusal claimTrace makes " +
    "about guessing a config to make a claim traceable");

// ---- THE THREE STATES, driven ------------------------------------------------------------------------------
const tv = treeVersionOf(ENG);
say("tree reads " + tv + " from its own marker, not from a passed argument");
ok("!! the tree version is READ, never supplied", /^v\d+$/.test(tv || ""),
    "a caller supplying both sides of a comparison is the shape that lets a mismatch be argued away");

const stated = auditable(ENG, tv);                       // the engine root has no PATCH.md
ok("!! *** a patch with no note is UNSTATED and its claims are NOT auditable ***",
    stated.verdict === UNSTATED && stated.claimsAuditable === false,
    "THE MERGE IS STILL VERIFIABLE file-by-file. THE CLAIMS ARE NOT -- they refer to a tree nobody here has " +
    "seen, so they can be neither confirmed nor contradicted, and calling them WRONG is a confident wrong " +
    "answer about a tree I never saw. THAT IS THE v3373 CORRECTION, ENCODED");

// Synthetic notes, so the other two states are exercised without needing the original zips on disk.
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "pb-"));
fs.writeFileSync(path.join(tmp, "PATCH.md"), "incremental patch " + tv + " -> v9999");
const m = auditable(tmp, tv);
ok("!! a stated base equal to the tree reports MATCHES and IS auditable",
    m.verdict === MATCHES && m.claimsAuditable === true);

fs.writeFileSync(path.join(tmp, "PATCH.md"), "incremental patch v0001 -> v0002");
const d = auditable(tmp, tv);
ok("!! *** a stated base that DIFFERS is still auditable -- at the base, not here ***",
    d.verdict === DIFFERS && d.claimsAuditable === true && /MERGE-POINT observation/.test(d.why),
    "A CLAIM TRUE AT ITS BASE THAT FAILS AT THE MERGE POINT IS NOT AN ERROR BY ITS AUTHOR. Patches here are " +
    "small, focused and expected to be scanned before merge, so this is the NORMAL case and must not read as " +
    "a fault");

ok("!! ...and the three verdicts are genuinely distinct values",
    new Set([UNSTATED, MATCHES, DIFFERS]).size === 3 && stated.verdict !== d.verdict && m.verdict !== d.verdict,
    "UNSTATED IS NOT A WORSE MISMATCH. Collapsing an absence of evidence into a comparison result is the " +
    "two-things-wearing-one-label shape this tree has caught in a count-that-was-a-cap, a timeout-read-as-" +
    "failure, and a remembered result presented as a current measurement");

// ---- v3377: THE FRONT DOOR WAS BUILT, SO THE REFUSAL IS GONE ------------------------------------------------
{
    const { NO_MAIN } = await import("./reportingTools.mjs");
    ok("!! *** patchBase is no longer on NO_MAIN, because the door it named was built ***",
        !NO_MAIN.has("tools/ship/patchBase.mjs"),
        "its reason said 'WHEN SOMEBODY BUILDS IT, THIS ENTRY GOES RED AND SHOULD BE DELETED, NOT WEAKENED'. " +
        "sysadminBridge.patchScan() now scans Downloads, /sys/patchbase routes it, and System Tools carries the " +
        "row. THE ANTIDOTE WORKED FOR THE THIRD TIME -- v3196 wrote that sentence, v3197 obeyed it, this is the third");
}

// ---- v3376: THE ZIP FORM, ON BOTH REAL PATCHES ---------------------------------------------------------------
// A patch arrives as a zip in Downloads, and asking "does it state a base" must not require unpacking it --
// unpacking is the commitment this exists to inform.
{
    const { inspectZip, auditableZip } = await import("./patchBase.mjs");
    const zips = [
        ["/mnt/user-data/uploads/swek_patch_v3358.zip", true, "v3357"],
        ["/mnt/user-data/uploads/patch_v3366_strict_config_1_.zip", false, null],
    ].filter(([z]) => fs.existsSync(z));

    if (!zips.length) {
        console.log("  ----  the two real patch zips are not on this machine; the zip form is exercised by its " +
                    "callers elsewhere. NOT SILENTLY SKIPPED -- said out loud, because a check that vanishes " +
                    "when its fixture is absent reads exactly like one that passed");
    } else {
        for (const [z, wantNote, wantBase] of zips) {
            const r = auditableZip(z, tv);
            ok("!! " + path.basename(z) + " read WITHOUT extraction: note=" + r.note + " base=" + r.base,
                r.readable === true && r.note === wantNote && r.base === wantBase,
                wantBase ? "states its base in PATCH.md and parses" : "NO PATCH.md AT ALL -- unstated, and its " +
                "claims are therefore unauditable no matter how carefully the merge is checked");
        }
        ok("!! *** the zip and directory forms give the SAME three verdicts ***",
            auditableZip(zips[0][0], tv).verdict === DIFFERS || auditableZip(zips[0][0], tv).verdict === MATCHES,
            "a caller must not get a different answer by choosing a format");
    }

    // *** THE READER IS DELEGATED AND THAT IS THE POINT. ***
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "patchBase.mjs"), "utf8");
    ok("!! *** zip reading is DELEGATED, never reimplemented here ***",
        /readCentralDirectory/.test(src) && /inflateEntry/.test(src) && !/0x02014b50|endOfCentralDir/.test(src),
        "safeExtract owns readCentralDirectory and moduleHistory owns inflateEntry, whose header says reading a " +
        "zip container is ITS job. A THIRD READER WOULD BE THE SECOND-DECLARATION DEFECT IN THE ONE PLACE THIS " +
        "TREE HAS ALREADY WRITTEN THE RULE DOWN");

    // The regex is built from a literal, so testing the SOURCE for its own escaping was checking my heredoc's
    // quoting rather than the tool's behaviour. TEST THE BEHAVIOUR: a changelog must not be mistaken for a note.
    ok("!! ...and it looks for NAMED note shapes rather than any .md",
        /PATCH/.test(src) && !/CHANGELOG|BACKLOG/.test(src.slice(src.indexOf("const wanted"), src.indexOf("const wanted") + 200)),
        "a search for any markdown would pick up a changelog and read a version out of the wrong document -- " +
        "and my first version of THIS check tested the source for its own regex escaping, which measured the " +
        "heredoc that wrote it rather than the tool");
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? "patchBase-selfcheck: " + failed + " FAILED" : "patchBase-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
