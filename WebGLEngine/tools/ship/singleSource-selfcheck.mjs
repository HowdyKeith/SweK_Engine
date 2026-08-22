// tools/ship/singleSource-selfcheck.mjs
//
// Run: node tools/ship/singleSource-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2915 -- ONE LIST, ONE PLACE. THE THIRD TIME.
//
// The tree has now been bitten three times by the same shape, and each time it looked like a different bug:
//
//   v2910  The MODES device table lived inside census-selfcheck.mjs. The corroboration census needed it too, so
//          it was copied. lens.map was missing from one copy, and THREE censuses -- v2898 tautology, v2904
//          corroboration, v2905 libm sensitivity -- silently skipped the mode whose peak is a graded observable
//          and which the entire magmap kernel round was about. Found only because the map's knobs looked dead.
//
//   v2912  The EXACT_OK register had the same problem and was extracted to exactZeroRegister.mjs preemptively,
//          because by then the shape was recognisable.
//
//   v2915  BASELINE.md existed at two paths, agreeing on 51 of 52 rows. The one row they disagreed on was
//          obb-collision -- exactly the row the v2889 libm purge moved. The regeneration updated the copy the
//          gate reads and left the other behind. Nothing read the stale one, so nothing failed; it was just
//          wrong, at the most discoverable path in the repo, for twenty-six versions.
//
// The failure mode is specific and worth naming: a duplicated table does not break anything when it is created.
// It breaks later, when one copy is updated, and the damage is proportional to how long the two sat agreeing.
// A gate is the only thing that closes that gap, because code review cannot see a file that was not touched.
//
// SCOPE. This checks the tables the tree has actually been bitten on plus a general scan for the baseline
// signature. It is not a universal duplicate detector -- there is no honest way to tell a deliberate fixture
// from an accidental copy in general, and a checker that guessed would be switched off.

import fs from "fs";
import { codeOnly } from "./sourceScan.mjs";
import path from "path";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const ROOT = path.resolve(process.cwd());
const SKIP = new Set(["node_modules", ".git", "dist", "build"]);

function walk(dir, out = []) {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of ents) {
        if (SKIP.has(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else out.push(p);
    }
    return out;
}
const files = walk(ROOT);

// ---- 1. THE BASELINE TABLE EXISTS ONCE -------------------------------------------------------------------------
{
    // The signature of the real table: a markdown row naming a known subsystem and a 64-hex hash.
    const ROW = /\|\s*(strict-libm|obb-collision|ewald-electrostatics)\s*\|\s*`[0-9a-f]{64}`\s*\|/;
    const carriers = files.filter((f) => /\.md$/i.test(f)).filter((f) => {
        try { return ROW.test(fs.readFileSync(f, "utf8")); } catch { return false; }
    });
    const rel = carriers.map((f) => path.relative(ROOT, f)).sort();

    ok("!! exactly one file carries the fingerprint hash table",
        carriers.length === 1 && rel[0] === path.join("tools", "fingerprint", "BASELINE.md"),
        rel.length ? rel.join(", ") : "none found" + " -- before v2915 there were two, differing on obb-collision, " +
        "the one row the v2889 purge changed");

    // and the pointer that replaced the copy must not have quietly become a copy again
    const top = path.join(ROOT, "BASELINE.md");
    if (fs.existsSync(top)) {
        const t = fs.readFileSync(top, "utf8");
        ok("the repo-root BASELINE.md is a pointer, not a table",
            !ROW.test(t) && /tools\/fingerprint\/BASELINE\.md/.test(t),
            "it names the canonical path and carries no hash rows of its own");
    }
}

// ---- 2. THE TABLES THAT WERE EXTRACTED STAY EXTRACTED ------------------------------------------------------------
{
    const rh = path.join(ROOT, "tools", "roundhouse");
    const defining = (needle, owner) => files
        .filter((f) => f.startsWith(rh) && /\.mjs$/.test(f))
        .filter((f) => { try { return new RegExp("export const " + needle + "\\s*=").test(fs.readFileSync(f, "utf8")); } catch { return false; } })
        .map((f) => path.basename(f));

    // v3213 -- *** THIS CHECK WAS PINNED TO A MECHANISM AND WENT RED WHEN THE MECHANISM WAS CORRECTLY
    // REPLACED. *** It asserted that `export const MODES` appears in exactly one roundhouse module. At v3211 the
    // device-mode table stopped being a CONST at all: MODES was never actually exported by deviceModes.mjs --
    // eleven files imported a name that did not exist, seventeen gates died on it, and the repair made the table
    // DERIVED (deviceModeTable(), built from modeCensus and refusing to be empty). So the honest answer to
    // "which module defines MODES" became NOBODY, and this check called that a failure.
    //
    // TWENTY-FOURTH INSTANCE of the species this project has a law about: assert the PROPERTY, never the
    // arrangement that satisfied it today. The property was never "a const called MODES exists once" -- it was
    // "THE DEVICE-MODE TABLE HAS EXACTLY ONE DEFINITION", which is what actually cost three censuses their
    // coverage of lens.map when it was copied.
    //
    // *** IF THE TABLE EVER STOPS BEING DERIVED, THIS LINE GOES RED AND SHOULD BE REWRITTEN TO NAME THE NEW
    // SINGLE SOURCE -- NOT DELETED, AND NOT WIDENED TO ACCEPT BOTH. *** Two definitions of this table is the
    // exact defect it exists to prevent.
    const tableOwners = files
        .filter((f) => f.startsWith(rh) && /\.mjs$/.test(f))
        .filter((f) => { try { return /export (async )?function deviceModeTable\s*\(/.test(fs.readFileSync(f, "utf8")); } catch { return false; } })
        .map((f) => path.basename(f));

    // v3442 -- *** TWENTY-FIFTH INSTANCE, AND IT WENT RED BECAUSE THE TREE GOT BETTER. *** The clause below used
    // to be `defining("MODES").length === 0` -- no module may export a const called MODES -- and v3420, v3421 and
    // v3424 made five binds do exactly that ON PURPOSE. THE MODE LIST DECLARED TWICE was the defect those rounds
    // were fixing: a guard carrying its own array literal beside a device's `modes:` field is two declarations by
    // construction, and kepler's two copies had already drifted so that `kepler3` was a working mode nobody could
    // discover. The repair was to give each bind ONE exported list and make the device's `modes:` BE that object,
    // asserted by IDENTITY rather than equality. So the correct fix for one two-declaration defect tripped the
    // gate that guards against two-declaration defects, because THIS CLAUSE WAS PINNED TO THE IDENTIFIER RATHER
    // THAN TO THE THING.
    //
    // v3213 corrected the FIRST half of this very line for the same reason and left the second half pinned. The
    // property was never "the five letters MODES appear nowhere" -- it is that THE GLOBAL DEVICE-MODE TABLE, the
    // device-to-modes mapping, has one definition. A bind's flat array of its OWN mode strings is not that table;
    // it is the single source for one device, which is the thing the table is derived from.
    //
    // TOLD APART STRUCTURALLY, NOT BY NAME: a copied global table is KEYED BY DEVICE (an object literal), a
    // bind's list is a flat array of strings. Section 3b below proves the distinction has detection power by
    // driving a synthetic module of each shape past it.
    const isDeviceKeyedTable = (src) => {
        const m = /export const MODES\s*=\s*([[{])/.exec(src);
        return m ? m[1] === "{" : false;
    };
    const modeConsts = files
        .filter((f) => f.startsWith(rh) && /\.mjs$/.test(f))
        .filter((f) => { try { return /export const MODES\s*=/.test(fs.readFileSync(f, "utf8")); } catch { return false; } });
    const copiedTables = modeConsts
        .filter((f) => { try { return isDeviceKeyedTable(fs.readFileSync(f, "utf8")); } catch { return false; } })
        .map((f) => path.basename(f));
    ok("!! the device-mode table has exactly one definition",
        tableOwners.length === 1 && tableOwners[0] === "deviceModes.mjs" && copiedTables.length === 0,
        "defined by: " + (tableOwners.join(", ") || "nobody") + "; " + modeConsts.length + " bind(s) export their OWN " +
        "flat mode list (" + modeConsts.map((f) => path.basename(f, ".mjs")).join(", ") + ") and " + copiedTables.length +
        " re-declare the device-keyed table. IT USED TO BE A CONST INSIDE census-selfcheck.mjs, and copying it cost " +
        "three censuses their coverage of lens.map; at v3211 it stopped being a const at all and became DERIVED. " +
        "*** A PER-BIND LIST IS THE SINGLE SOURCE FOR ONE DEVICE AND IS THE OPPOSITE OF THE DEFECT -- v3421 built " +
        "those lists so a bind's guard and its `modes:` field could be ONE OBJECT compared by identity. ***");

    const exact = defining("EXACT_OK");
    ok("EXACT_OK is defined in exactly one module",
        exact.length === 1 && exact[0] === "exactZeroRegister.mjs",
        "defined by: " + (exact.join(", ") || "nobody"));

    // consumers must IMPORT, never re-declare
    const reDeclare = files
        .filter((f) => /\.mjs$/.test(f) && f.startsWith(rh) && !/deviceModes|exactZeroRegister/.test(f))
        .filter((f) => { try { return /const\s+(MODES|EXACT_OK)\s*=\s*\{/.test(fs.readFileSync(f, "utf8")); } catch { return false; } })
        .map((f) => path.basename(f));
    ok("no roundhouse module re-declares a shared table locally",
        reDeclare.length === 0,
        reDeclare.length ? "re-declared in: " + reDeclare.join(", ") : "all consumers import");
}

// ---- 3. THE CORRECTION THIS ROUND ALSO HAD TO MAKE ---------------------------------------------------------------
{
    // Three rounds asserted that adopting the optics fixes "needs BASELINE.md regenerated". That was wrong, and
    // stating it three times did not make it true: neither baseline contains a single optics observable. The
    // claim was never checked because it sounded like the kind of thing that is true.
    const canon = fs.readFileSync(path.join(ROOT, "tools", "fingerprint", "BASELINE.md"), "utf8");
    ok("!! no optics observable appears in any baseline -- so the optics fixes were never gated on one",
        !/airyRing|rayleighFactor|slitFirstMin|edgeShadow/i.test(canon),
        "the baselines pin fifty subsystem HASHES, not device observables. v2911, v2913 and v2914 each declined " +
        "to adopt a fix citing a regeneration cost that does not exist. What adopting them actually needs is a " +
        "decision about changing a graded number, which is a smaller and more honest question");

    // ANCHORING, AND THIS IS THE SECOND TIME THIS SESSION. The first version of this check searched for the
    // phrase "BASELINE.md regenerated" anywhere in the file and FAILED -- because the correction notes written
    // to retract the claim quote the claim in order to retract it. v2909 hit the identical shape: a check on
    // Start_Everything.bat matched the v2909 comment explaining the fix rather than the command it described.
    // Prose that documents a change is not the change. Any detector reading source text has to distinguish a
    // live assertion from a retracted one, and the cheapest reliable marker is proximity to the retraction.
    const CLAIM = /BASELINE\.md regenerated/g;
    const stale = files.filter((f) => /roundhouse.*(airyRefined|edgeFresnel|slitQuant).*selfcheck\.mjs$/.test(f))
        .filter((f) => {
            const t = fs.readFileSync(f, "utf8");
            let m, live = false;
            while ((m = CLAIM.exec(t)) !== null) {
                // a claim is retracted if a CORRECTION marker appears within the same passage
                const window = t.slice(Math.max(0, m.index - 400), m.index + 200);
                if (!/CORRECTION/.test(window)) live = true;
            }
            CLAIM.lastIndex = 0;
            return live;
        })
        .map((f) => path.basename(f));
    ok("...and no selfcheck still asserts it as a live reason",
        stale.length === 0,
        stale.length ? "still asserting it: " + stale.join(", ")
            : "the phrase survives only inside CORRECTION notes, which is where a retracted claim belongs -- " +
              "deleting the sentence would have hidden that three rounds reasoned from it");
}

// v3041 -- ONE LIST, ONE PLACE. THE FOURTH TIME, and this one had been wrong the longest.
//
// staleness.mjs holds gateFiles(), described in its own header as "the ONE definition of a gate exists here",
// matching /-selfcheck\.mjs$/. buildKnowledgeIndex.mjs -- same folder -- had its own walk with
// /selfcheck.*\.mjs$/, four lines above a comment that says USE THE AUTHORITATIVE PARSER, DO NOT WRITE A SECOND
// ONE. The two patterns differ on exactly one file: tools/ship/selfchecks.mjs, THE RUNNER, which the loose
// pattern counts as a gate.
//
// So from v2888 the knowledge index claimed one gate more than exists, and nothing was ever red, because the
// number baked into knowledge-index.json agreed with the OTHER walk. It took adding a gate to make the two
// counters disagree out loud. That is the v2915 shape exactly: a duplicate does no damage when it is made, only
// when one copy moves, and the damage is proportional to how long the two sat agreeing. 153 versions here.
{
    const readOr = (rel, fallback = "") => { try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch { return fallback; } };
    const stale = readOr("tools/ship/staleness.mjs");
    ok("staleness.mjs still owns the one gate-file walker", /export function gateFiles/.test(stale));

    // TWO LEGITIMATE POPULATIONS, and the bug was mixing them.
    //
    //   WHAT THE RUNNER RUNS   -- selfchecks.mjs walks with the LOOSE /selfcheck.*\.mjs$/ and then removes an
    //                             explicit SKIP list (a CLI mistaken for a gate, two rig-only tests). Loose walk
    //                             PLUS skip list is the whole definition; neither half is it alone.
    //   WHAT COUNTS AS A GATE  -- staleness.mjs gateFiles(), strict /-selfcheck\.mjs$/, for every reported count.
    //
    // buildKnowledgeIndex and affected took the runner's LOOSE PATTERN WITHOUT ITS SKIP LIST and used it to
    // answer the counting question. That is how the runner ended up inside its own census. Both now import
    // gateFiles().
    //
    // Stated as a CENSUS, not a ban: gatesBridge-selfcheck re-walks with the loose pattern ON PURPOSE, because
    // its job is to cross-check the runner's total against an independent walk, and a gate that imported the
    // thing it audits would agree with it by construction. That exemption is named here rather than made silent.
    const LEGITIMATE = new Map([
        ["selfchecks.mjs", "the runner -- it owns the loose walk, and pairs it with the SKIP list"],
        ["gatesBridge-selfcheck.mjs", "deliberately INDEPENDENT: it audits the runner's total, so it must not import the runner's walk"],
        ["graveyard-selfcheck.mjs", "uses the STRICT pattern, agreeing with gateFiles"],
        ["singleSource-selfcheck.mjs", "this gate, which has to quote both patterns to forbid one"],
        ["staleness.mjs", "the owner"],
        // v3214 -- NOT A WALKER, AND THE CHECK WAS OVER-BROAD ABOUT IT. moduleHistory.mjs line 268 is
        // `const isGate = (f) => /-selfcheck\.mjs$/.test(f)` -- a PREDICATE over a filename it already holds,
        // classifying paths found INSIDE AN ARCHIVED ZIP. gateFiles() walks the live tree and cannot answer a
        // question about a build from four hundred versions ago, so importing it here would be the wrong
        // instrument rather than the shared one. The rule is "one definition of WHICH FILES EXIST", and this
        // file is not deriving that.
        ["moduleHistory.mjs", "classifies paths inside an ARCHIVED zip -- a predicate, not a walk of the live tree"],
        // v3287 -- THIRD NON-WALKER, AND A DIFFERENT SHAPE AGAIN. shaderCensus.mjs line 28 is
        // `const SKIP = /node_modules|vendor|-selfcheck\.mjs$|shaderCensus\.mjs$/` -- the pattern appears in an
        // EXCLUSION, to keep gates out of a WGSL/GLSL scan. It is not deriving which files exist; it is declining
        // to look at some of them. The rule this gate owns is "one definition of WHICH FILES ARE GATES", and a
        // skip list is the opposite of a definition -- importing gateFiles() to build it would make a shader
        // census depend on the gate walker for no reason.
        //
        // Worth noting WHY this needed a human: the same file's own header records it matching itself on its
        // first run, because a census whose detectors are string literals counts itself. Three exemptions now,
        // three different reasons, and none of them derivable from the pattern alone.
        ["shaderCensus.mjs", "the pattern is in a SKIP list -- excluding gates from a shader scan, not deriving which files are gates"],
        // v3442 -- FOURTH NON-WALKER, AND THE SAME SHAPE AS moduleHistory. wiringClaims.mjs line ~109 is
        // `if (!/-selfcheck\.mjs$/.test(f))` inside the import-resolution loop: a PREDICATE over a filename the
        // loop already holds, deciding whether a reference COUNTS AS WIRING. It is orphanScan's own rule -- a
        // module reached only by its own selfcheck is not wired -- and it never derives which files exist. The
        // rule this gate owns is "one definition of WHICH FILES ARE GATES", and classifying a path you were
        // handed is not that. Importing gateFiles() here would make a wiring census depend on the gate walker to
        // answer a question about a single filename.
        //
        // *** THE COMPANION FIX WAS THE OPPOSITE CALL AND SHIPPED IN THE SAME ROUND: gateAxioms-selfcheck.mjs was
        // a GENUINE second walk -- readdirSync recursion with the loose pattern and no skip list -- and it now
        // imports gateFiles(). Both files matched this detector; only one was the defect. THE DETECTOR CANNOT
        // TELL A WALK FROM A PREDICATE, WHICH IS WHY EVERY EXEMPTION HERE IS A HUMAN SENTENCE AND NOT A RULE. ***
        ["wiringClaims.mjs", "classifies a filename the import loop already holds -- a predicate, not a walk of the live tree"],
        // v3447 -- FIFTH NON-WALKER, AND THE DETECTOR CAUGHT IT INSIDE THE ROUND THAT WROTE IT, WHICH IS THE
        // BEST EVIDENCE IT WORKS. registerResidue-selfcheck.mjs walks tools/ looking for `export const OUT` --
        // ARTEFACT EMITTERS, not gates -- and uses /-selfcheck\.mjs$/ to EXCLUDE selfchecks from that walk,
        // because gateActivity-selfcheck writes a PLANT and deletes it again and would otherwise read as an
        // emitter. That is shaderCensus's shape exactly: THE PATTERN IS IN AN EXCLUSION, DECLINING TO LOOK AT
        // SOME FILES, NOT DERIVING WHICH FILES ARE GATES. Importing gateFiles() here would make an artefact
        // census depend on the gate walker to answer a question that is not about gates.
        ["registerResidue-selfcheck.mjs", "the pattern is in a SKIP -- excluding gates from an artefact-emitter walk, not deriving which files are gates"],
    ]);
    // *** v3935 -- THE DETECTOR CAN TELL A WALK FROM A PREDICATE FOR THE MECHANICAL CASES, AND MEASURING SAID SO.
    //
    // The paragraph above concluded it CANNOT, and made every non-walker a human sentence. That was the right
    // call for two exemptions. It flagged TWENTY-ONE files, of which exactly ONE was a genuine second walk
    // (collisionCensus.mjs, converted this round) -- so the mechanism was asking for twenty hand-written
    // excuses, AND AN EXCUSE WRITTEN CARELESSLY IS WORSE THAN NO EXCUSE. Reading all twenty-one showed the
    // shapes are legible at the line:
    //
    //   TWO were the pattern QUOTED INSIDE A STRING -- checkerCensus-selfcheck showing what a copy looks like,
    //     reportingTools in a blurb. codeOnly() strips strings as well as comments and both disappear. THE
    //     KEYWORD PROBE, SIXTH TIME THIS SESSION.
    //   SKIP: the test is negated or the line ends in `continue`, or it is a SKIP constant -- declining to look
    //     at gates while walking for something else. shaderCensus and registerResidue's own sentences say this.
    //   PREDICATE: `const isGate = (f) => /.../.test(f)` -- classifying a name already held, which is the
    //     wiringClaims exemption's exact wording.
    //   TRANSFORM: `.replace(/-selfcheck\.mjs$/, ".mjs")` -- turning a gate path into its module, not selecting.
    //   ASSERTION: the pattern inside an ok(...) call -- a gate CHECKING somebody else's list.
    //
    // What is left is the pattern applied POSITIVELY to a directory entry, which is the only shape that derives
    // which files are gates. HUMAN SENTENCES ARE KEPT for anything the classifier cannot place: the rule did not
    // become a machine, it became a machine WITH A DOOR FOR THE AMBIGUOUS CASE, which is what the two existing
    // exemptions always were.
    const PATTERN = /selfcheck[^\n]*\\\.mjs\$\//;
    const classify = (line) => {
        if (/\.replace\s*\(/.test(line)) return "transform";
        if (/\bok\s*\(/.test(line)) return "assertion";
        if (/!\s*\/[^/]*selfcheck/.test(line) || /\bcontinue\s*;/.test(line) || /\bSKIP\b/.test(line)) return "skip";
        if (/(const|let|export const)\s+\w+\s*=\s*\(?\w*\)?\s*=>/.test(line)) return "predicate";
        if (/\.filter\s*\(|\.some\s*\(|\.every\s*\(/.test(line)) return "predicate";
        return "walk";
    };
    const rebuilders = files
        .filter((f) => /[\\/]tools[\\/]ship[\\/][^\\/]+\.mjs$/.test(f))
        .filter((f) => !LEGITIMATE.has(path.basename(f)))
        .filter((f) => {
            let code; try { code = codeOnly(fs.readFileSync(f, "utf8")); } catch { return false; }
            return code.split("\n").filter((l) => PATTERN.test(l)).some((l) => classify(l) === "walk");
        })
        .map((f) => path.basename(f));
    ok("...and nothing else in tools/ship re-derives the gate-file pattern",
        rebuilders.length === 0,
        rebuilders.length ? "second walker in: " + rebuilders.join(", ")
            : "buildKnowledgeIndex and affected import gateFiles; " + LEGITIMATE.size + " sites named with reasons");

    // The exemption above is only sound while the runner really does pair its loose walk with a skip list. If
    // that list were ever removed, the loose pattern would silently start counting the runner again and this
    // gate would be exempting the exact defect it was written for.
    const runner = readOr("tools/ship/selfchecks.mjs");
    ok("...and the runner's loose walk is still paired with an explicit SKIP list",
        /SKIP/.test(runner) && /selfchecks\.mjs/.test(runner),
        "the loose pattern is only safe because the runner removes itself by name afterwards");

    const idx = readOr("tools/ship/buildKnowledgeIndex.mjs");
    ok("...and the index builder imports it rather than copying it",
        /import\s*\{[^}]*gateFiles[^}]*\}\s*from\s*["']\.\/staleness\.mjs["']/.test(idx) && /gateFiles\(\)/.test(idx));
}

console.log();
if (fails) { console.log("singleSource-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("singleSource-selfcheck: all checks pass");
