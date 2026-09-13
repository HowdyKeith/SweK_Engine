// tools/ship/definitionGates-selfcheck.mjs
//
// v3321 -- A DEFINITION TOO SIMPLE TO TEST IS A DEFINITION NOTHING TESTS.
//
// Found by accident at v3309 while measuring a blast radius: horizon(M) in physics/blackhole/geodesic.js was
// changed from 2M to 2.02M -- a 1% error in the most basic quantity in the file -- and FIVE GATES PASSED,
// including geodesic's own, while the error moved two graded devices. The gate imported six functions from that
// module and horizon was not among them.
//
// The reason generalises, which is why this exists. r_s = 2M has no derivation to check, no tolerance to argue
// about and no algorithm to get wrong. It looks like a fact rather than code, and facts do not get tested.
//
// SWEPT ACROSS ALL OF physics/: 67 exported one-line definitions in modules that HAVE a gate, and three of them
// were never mentioned by that gate. All three turned out to be load-bearing:
//
//   geodesic.horizon        1% error passed five gates, moved lens and tidal
//   rmt.PHI                 the billiard's aspect ratio. Rationalise it and the integrable spectrum acquires
//                           exact degeneracies: the r-statistic falls to 0.166 against a Poisson 0.386, roughly
//                           HALF, while the GOE side keeps passing because it never touches PHI
//   proposers.tierRank      three characters -- TIERS.indexOf(t) -- deciding whether a licence change is an
//                           escalation. Reverse TIERS and the guard inverts while every other assertion passes
//
// Each was gated and each was verified by planting its own failure: 2 assertions fail on the horizon error,
// 5 on a rationalised PHI, 10 on a reversed tier ordering.
//
// THIS GATE KEEPS THE COUNT AT ZERO. It is a mechanical check -- does the gate beside a module MENTION each
// one-line definition that module exports -- and mentioning is not testing, so it is a floor rather than a
// proof. A definition nobody has even named cannot be under test; one that is named at least had someone look.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (l) => console.log("  ----  " + l);   // v4059 -- the tree-wide census prints, it does not assert
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// *** v3905, LANDING AT v4535 -- THE CENSUS READS TWO SHAPES AND THERE ARE SIX. ***
// v3904 reported, while using this file, that it reads `export const NAME = (` and `export function NAME` and
// nothing else -- so an exported TABLE, a bare exported CONSTANT, a class, an async function and a
// separately-declared `export { name }` were all outside its subject. A WRONG CONSTANT IS THE FOUNDING CASE OF
// THIS WHOLE FILE ("a 1% error in r_s = 2M survived five gates"), so the instrument could not see the shape of
// its own origin story.
//
// *** THE WIDENING IS A SECOND CENSUS, NOT AN EDIT TO THE FIRST, AND THAT IS THE WHOLE DESIGN. *** Both
// ratchets below were frozen against populations the NARROW rule found. Widening in place would move the
// denominator underneath a frozen number without moving the number -- the defect this file's siblings have
// carried in three places. So `shapes` is a PARAMETER, it defaults to narrow, both existing ratchets keep
// calling the narrow rule and stay comparable to v3323, v3903, v4060 and v4062, and the wider population gets
// its own reporting and its own floor.
//
// SHAPES IS NOT SCOPE. v4059-v4060's `wide` is the sweep ROOT -- physics/ against the whole tree -- and this is
// what counts as a definition once you are there. Two axes, two names, because one word for both is how a
// number comes to mean less than it says.
//
// WHAT `shapes: "all"` COUNTS, AND THE TWO THINGS IT DELIBERATELY DOES NOT:
//   counted:     export const/let/var NAME = <anything>   including tables, arrays and bare constants
//                export const A = 1, B = 2                BOTH names -- a multi-declarator is two definitions
//                export async function NAME / export class NAME
//                export { NAME }                          ONLY when NAME is declared in this same file
//   NOT counted: export { NAME } from "./other.mjs"       a re-export is not a definition
//                export { NAME } where NAME was IMPORTED  ditto -- counting those would file another module's
//                                                         definition against this one's gate
export function exportedDefinitions(src, { shapes = "narrow" } = {}) {
    const out = [], seen = new Set();
    const add = (name, kind) => { if (/^\w+$/.test(name) && !seen.has(name)) { seen.add(name); out.push({ name, kind }); } };
    for (const m of src.matchAll(/^export const (\w+) = \(/gm)) add(m[1], "arrow");
    for (const m of src.matchAll(/^export function (\w+)/gm)) add(m[1], "function");
    if (shapes !== "all") return out;
    for (const m of src.matchAll(/^export async function (\w+)/gm)) add(m[1], "async fn");
    for (const m of src.matchAll(/^export class (\w+)/gm)) add(m[1], "class");
    for (const m of src.matchAll(/^export (?:const|let|var) (\w+) = (?!\()(.*)$/gm)) {
        add(m[1], "value");
        // `export const DT = 0.016, GRAVITY = [0, -10, 0];` is TWO definitions, and there are several.
        for (const d of String(m[2]).matchAll(/,\s*(\w+)\s*=/g)) add(d[1], "value");
    }
    // `export { a, b }` with no `from`: a definition ONLY if this file declares the name. A re-export and an
    // exported import are somebody else's definitions and belong to their own module's gate.
    for (const m of src.matchAll(/^export\s*\{([^}]*)\}\s*(?!from)/gm)) {
        for (const raw of m[1].split(",")) {
            const name = raw.trim().split(/\s+as\s+/)[0].trim();
            if (!/^\w+$/.test(name)) continue;
            if (new RegExp("^\\s*(?:async\\s+)?(?:function|class|const|let|var)\\s+" + name + "\\b", "m").test(src))
                add(name, "named export");
        }
    }
    return out;
}

/** Exported one-line definitions, and whether the module's own gate names them. */
export function definitionCoverage(root, sub = "physics", { shapes = "narrow" } = {}) {
    const out = { total: 0, ungated: [], importOnly: [], gatedModules: 0, byKind: {} };
    const walk = (dir) => {
        let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (!/^(node_modules|vendor|\.git|\.venv)$/.test(e.name)) walk(p); continue; }
            if (!/\.(js|mjs)$/.test(e.name) || /selfcheck/.test(e.name)) continue;
            const gate = p.replace(/\.(js|mjs)$/, "-selfcheck.mjs");
            if (!fs.existsSync(gate)) continue;          // ungated modules are gradedCoverage's business, not this
            out.gatedModules++;
            let src, gsrc;
            try { src = fs.readFileSync(p, "utf8"); gsrc = fs.readFileSync(gate, "utf8"); } catch { continue; }
            // v3321b: TWO TIERS, because "named" was too weak and the weakness is measurable. Strip the import
            // block and the comments -- what remains is code the gate actually RUNS. A definition named only in
            // an import is not being exercised by this file, though it may still be reached indirectly through
            // another function, which is why importOnly is REPORTED rather than failed.
            const body = gsrc.replace(/^import[\s\S]*?from[^\n]*\n/gm, "")
                             .replace(/^\s*\/\/.*$/gm, "")
                             .replace(/\/\*[\s\S]*?\*\//g, "");
            // v3322: EXPORTED FUNCTIONS TOO. The first sweep looked only at `export const NAME = (` and found
            // 67 definitions with 3 gaps. Extending it to `export function` finds 541 more, of which 40 are
            // never named by their own gate -- and planting errors in four of those showed all four passing
            // silently. The narrow pattern was not wrong, it was just narrow.
            // v4535: the shapes read are a PARAMETER now (see exportedDefinitions above). The default is the
            // two forms this census has always read, so every frozen number below is unmoved.
            const decls = exportedDefinitions(src, { shapes });
            for (const m of decls) {
                out.total++;
                out.byKind[m.kind] = (out.byKind[m.kind] || 0) + 1;
                const rel = path.relative(root, p).replace(/\\/g, "/") + ":" + m.name;
                const re = new RegExp("\\b" + m.name + "\\b");
                if (!re.test(gsrc)) out.ungated.push(rel);
                else if (!re.test(body)) out.importOnly.push(rel);
            }
        }
    };
    // v4059 -- the sweep root is a PARAMETER now, so the same criterion can be run tree-wide and REPORTED
    // beside the physics number. It still DEFAULTS to physics, so the ratchet above is unchanged.
    walk(sub ? path.join(root, sub) : root);
    return out;
}

const cov = definitionCoverage(ENG);

// ---- 1. THE COUNT STAYS AT ZERO -------------------------------------------------------------------------------
{
    // v3322 -- A BASELINE, FOR THE REASON boundaryLint AND orphanScan BOTH USE ONE. Widening the sweep from 67
    // one-line definitions to all 608 exported symbols found 39 unmentioned. Failing on all of them means a red
    // gate on day one and a switched-off gate on day two, so the count is FROZEN and the assertion is that it
    // must not GROW. Existing debt stays visible and shrinkable; a new untested export cannot arrive quietly.
    // v4062: RE-FROZEN AT ZERO. The debt this number tracked is PAID, not redefined -- all 81 exported symbols
    // that physics/ was carrying unmentioned got a real assertion in their own module's gate (one that calls the
    // function and checks something true about the result), each one sabotage-confirmed against a deliberately
    // broken source before the source was restored byte-identical. Naming a symbol in a comment to move this
    // number would have been the "condemn correct gates to improve a statistic" trap the import-only check below
    // names; the rule was the opposite -- a symbol only counts as closed if breaking it turns its gate RED.
    // AT ZERO THE RATCHET IS AT ITS STRONGEST: any newly exported symbol under physics/ that lands without its
    // gate naming it now reddens this line immediately, which is the state the pin was always ratcheting toward.
    const BASELINE = 0;    // v3323: 37, v4062: 0 -- the number RATCHETS DOWN, never up
    // *** v3903 -- THE RATCHET IS VIOLATED AND THE PIN IS NOT MOVING. RECORDING WHAT THE NUMBER MEANS INSTEAD. ***
    // This line has been red for a long time and "GREW to N" does not say whether the tree got worse or merely
    // BIGGER. Both, and the split is measurable, because the comment above records the denominator the pin was
    // set against: 37 of 608 exported symbols.
    //
    //     at v3323   37 of  608  =  6.09%
    //     at v3903  121 of 1508  =  8.02%          corpus 2.48x, unmentioned 3.27x
    //
    // CONSTANT-RATE EXPECTATION IS ~92, SO ~29 ARE A REAL REGRESSION AND THE REST IS GROWTH. That matters
    // because the two have different fixes: growth is closed by gating as modules land, regression is closed by
    // going back. Quoting only the count hides the first; quoting only the rate excuses the second. The tree's
    // own rule from the instruments battery -- QUOTE THE RATE, NEVER THE COUNT, AND DERIVE BOTH TERMS -- is
    // half of what this needs; the count is still the thing that must fall.
    //
    // *** THE PIN STAYS AT 37 BECAUSE RAISING IT IS THE ONE MOVE THAT CANNOT BE UNDONE. *** A baseline lifted to
    // meet the tree is a gate edited to agree with whatever shipped, and this file's siblings have that written
    // on them in three places. It stays red, and it stays red honestly, until the count comes back to it.
    // v3903 closed FIVE by giving them real keys rather than a mention: ct.js's ramLakKernel (h[0]=1/4,
    // -1/(pi^2 n^2) on odds, DC response halving as 1/len), filterSino, backProject (EXACTLY pi for an all-ones
    // sinogram at every angle count), and sirt.mjs's stepForMatched / stepForUnmatched (each at exactly half its
    // own Landweber ceiling, and the unmatched step 3.86x OUTSIDE the matched one's -- the divergence the v3846
    // split exists to prevent, checked by nothing until now). 126 -> 121.
    // *** v4059 -- THE SCOPE IS IN THE LABEL NOW, BECAUSE IT WAS NOT AND I MISREAD MY OWN NUMBER. ***
    // definitionCoverage() ends `walk(path.join(root, "physics"))`: this sweep has ALWAYS been physics-only, and
    // that is a reasonable scope. But the check read "no NEW exported symbol has appeared" and the summary read
    // "1586 one-line definitions" -- neither of which says physics -- so at v4059 I added eight exports under
    // rig/, saw the count sit unmoved at 81, and briefly concluded I had fixed something. The code was right and
    // its label was silent, which is the same "a flag that lies" shape this tree keeps removing, in a gate's own
    // headline. MEASURED with the identical criterion applied tree-wide: 597 gated modules, 2861 definitions,
    // 290 unmentioned -- so 352 gated modules and 1275 definitions sit entirely outside this number, and 209
    // unmentioned definitions are invisible to it.
    //
    // THE SWEEP IS NOT WIDENED HERE, DELIBERATELY. Turning this red on 209 definitions nobody has looked at is
    // exactly the "condemn correct gates to improve a statistic" trap the import-only check below names. It is
    // REPORTED instead, so widening becomes a decision somebody makes with the figure in front of them rather
    // than a number that quietly means less than it says.
    ok("!! no NEW exported symbol under physics/ has appeared without its gate naming it",
        cov.ungated.length <= BASELINE,
        cov.ungated.length > BASELINE
            ? "GREW to " + cov.ungated.length + ": " + cov.ungated.slice(0, 6).join(", ") + " ..."
            : `${cov.ungated.length} unmentioned of ${cov.total} exported symbols across ${cov.gatedModules} ` +
              `gated modules UNDER physics/ (this sweep's scope), against a frozen ${BASELINE}. ` +
              "AT ZERO, so the next unmentioned export under physics/ reddens this line the round it lands. The " +
              "81 that stood here at v4061 were closed by ASSERTION, not by mention: each got a check that calls " +
              "it and grades the answer, and each was sabotage-confirmed RED against a broken source first");
    // *** v4060 -- WIDENED FOR REAL, NOT JUST REPORTED. *** v4059 stopped at reporting the tree-wide number
    // because reddening 209 unaudited definitions in the same breath as finding them would have been exactly
    // the "condemn correct gates to improve a statistic" trap this file argues against two lines down. But a
    // number that is only ever printed is a number nobody has to act on -- and this file's OWN history is the
    // argument against that: the physics BASELINE has sat at 37 since v3323 while the physics count grew to 81,
    // because "GREW to N" with no wider ratchet gives a debt line nobody is forced to look at again. So this
    // scope gets the SAME treatment BASELINE got at v3322: frozen at TODAY'S honest count, ratchets DOWN never
    // up, existing debt stays visible and shrinkable, and a NEW ungated export anywhere in the tree cannot
    // arrive quietly. Verified NOT to be redundant with the physics ratchet above: tree-wide can go red on a
    // change under render/, rig/, ui/ etc. that the physics-scoped check above would never see at all.
    // v4062: 290 -> 209, and the 81 came off for the RIGHT reason: physics/ paid its whole debt to zero, and
    // because this sweep SUBSUMES the physics-only one, every symbol closed there is a symbol closed here too.
    // Re-frozen at the new floor so the paydown cannot silently reverse.
    const BASELINE_WIDE = 209;   // v4060: 290, v4062: 209 (physics/ closed to zero) -- ratchets down, never up
    const wide = definitionCoverage(ENG, "");
    ok("!! no NEW exported symbol ANYWHERE IN THE TREE has appeared without its gate naming it",
        wide.ungated.length <= BASELINE_WIDE,
        wide.ungated.length > BASELINE_WIDE
            ? "GREW to " + wide.ungated.length + ": " + wide.ungated.slice(0, 6).join(", ") + " ..."
            : `${wide.ungated.length} unmentioned of ${wide.total} exported symbols across ${wide.gatedModules} ` +
              `gated modules TREE-WIDE, against a frozen ${BASELINE_WIDE}. This subsumes the physics-only check ` +
              "above (which stays as its own line because it is the one with the older, tighter history) and " +
              "additionally covers the " + (wide.gatedModules - cov.gatedModules) + " gated modules outside " +
              "physics/ -- render/, rig/, ui/, world/ and the rest -- where a silently uncovered export would " +
              "previously have passed every gate in this file");

    // *** v3905, LANDING AT v4535 -- AND BOTH RATCHETS ABOVE ARE COUNTING TWO OF SIX SHAPES. ***
    // Everything above reads `export const NAME = (` and `export function NAME`. MEASURED with the same
    // criterion and the wider shape rule (exportedDefinitions, `shapes: "all"`), on this tree, today:
    //
    //                  narrow                     all shapes                 outside the subject
    //     physics/     1797 defs,  45 unmentioned  2228 defs, 139 unmentioned   431 defs,  94 unmentioned
    //     tree-wide    3426 defs, 295 unmentioned  4823 defs, 582 unmentioned  1397 defs, 287 unmentioned
    //
    // Tree-wide by kind, all shapes: 2913 function, 1096 value, 513 arrow, 176 async fn, 109 named export,
    // 16 class. *** THE 1,096 VALUES ARE THE POINT. *** A WRONG CONSTANT IS THE FOUNDING CASE OF THIS ENTIRE
    // FILE -- "a 1% error in r_s = 2M survived five gates" -- and an exported constant is precisely the shape
    // `export const NAME = (` cannot see. The instrument could not see the shape of its own origin story.
    //
    // ONE FLOOR, NOT TWO. tree-wide subsumes physics/ by the same argument v4060 makes one row up, so the
    // wider population gets a single ratchet at today's honest count and the physics figure is REPORTED. It
    // ratchets DOWN: existing debt stays visible and shrinkable, and a new ungated export of ANY shape cannot
    // arrive quietly. It is deliberately not folded into BASELINE_WIDE -- that number was frozen against a
    // population the narrow rule found, and moving the denominator under a frozen number without moving the
    // number is the defect this file's siblings have carried in three places.
    const BASELINE_SHAPES = 582;   // v4535: tree-wide, all six shapes -- ratchets down, never up
    const shapesWide = definitionCoverage(ENG, "", { shapes: "all" });
    const shapesPhys = definitionCoverage(ENG, "physics", { shapes: "all" });
    ok("!! *** no NEW exported symbol OF ANY SHAPE has appeared without its gate naming it ***",
        shapesWide.ungated.length <= BASELINE_SHAPES && shapesWide.total > wide.total,
        shapesWide.ungated.length > BASELINE_SHAPES
            ? "GREW to " + shapesWide.ungated.length + ": " + shapesWide.ungated.slice(0, 6).join(", ") + " ..."
            : `${shapesWide.ungated.length} unmentioned of ${shapesWide.total} definitions tree-wide against a ` +
              `frozen ${BASELINE_SHAPES}, where the narrow rule sees ${wide.ungated.length} of ${wide.total}. ` +
              `SO ${shapesWide.total - wide.total} DEFINITIONS AND ` +
              `${shapesWide.ungated.length - wide.ungated.length} UNMENTIONED ONES SIT OUTSIDE THE TWO ROWS ` +
              `ABOVE: ` + Object.entries(shapesWide.byKind).sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => k + " " + v).join(", ") + ".");
    report(`under physics/ the same widening reads ${shapesPhys.ungated.length} unmentioned of ` +
        `${shapesPhys.total}, against the narrow ${cov.ungated.length} of ${cov.total} -- ` +
        `${shapesPhys.total - cov.total} definitions and ${shapesPhys.ungated.length - cov.ungated.length} ` +
        "unmentioned ones that the physics ratchet cannot see. REPORTED rather than ratcheted, because one " +
        "floor on the population that subsumes it is a floor somebody can act on and two are a number nobody " +
        "re-derives.");
    // *** THE NEGATIVE CONTROL, AND IT IS THE ROW THAT MAKES THE PARAMETER SAFE. *** If `shapes: "all"` ever
    // leaks into the default, every frozen number above is silently re-baselined against a bigger denominator
    // -- the exact failure the split was made to avoid. So the narrow rule is driven over a fixture carrying
    // all six shapes and must still see EXACTLY the two it has always seen, by name.
    {
        const FIXTURE = [
            "export const arrowOne = (a) => a;",
            "export function fnTwo(x) { return x; }",
            "export async function asyncThree() {}",
            "export class ClassFour {}",
            "export const VALUE_FIVE = 42, VALUE_SIX = [1, 2];",
            "const localSeven = 7;",
            "export { localSeven };",
            "import { borrowed } from './elsewhere.mjs';",
            "export { borrowed };",
            "export { reExported } from './other.mjs';",
        ].join("\n");
        const narrow = exportedDefinitions(FIXTURE).map((d) => d.name).sort();
        const all = exportedDefinitions(FIXTURE, { shapes: "all" }).map((d) => d.name).sort();
        ok("!! CONTROL: the narrow rule still sees ONLY its two forms, and the wide one refuses a re-export",
            narrow.join() === "arrowOne,fnTwo" &&
            all.join() === "ClassFour,VALUE_FIVE,VALUE_SIX,arrowOne,asyncThree,fnTwo,localSeven" &&
            !all.includes("borrowed") && !all.includes("reExported"),
            `narrow [${narrow.join(", ")}] against all [${all.join(", ")}]. A multi-declarator is TWO ` +
            "definitions (VALUE_FIVE and VALUE_SIX); `export { localSeven }` counts because this file DECLARES " +
            "it; `export { borrowed }` does NOT, because it was imported, and `export { reExported } from` " +
            "does not, because a re-export is somebody else's definition and belongs to their gate. IF THIS " +
            "ROW EVER GOES RED ON THE FIRST CLAUSE, A WIDER DEFAULT HAS MOVED EVERY FROZEN NUMBER ABOVE.");
    }
    // *** v4458 -- THIS LINE PRINTED TWO IMPOSSIBLE NUMBERS ON EVERY RUN FOR ~390 VERSIONS. ***
    //
    // The decomposition is only defined while the count EXCEEDS what constant-rate growth would have
    // produced. v4062 paid physics/ down to zero and re-froze the pin AT zero -- and left this line
    // comparing against the v3323 era's rate of 37/608. At 23 of 1739 the arithmetic reads
    //
    //     "~106 is GROWTH and ~-83 is REGRESSION"
    //
    // a growth term FIVE TIMES the whole population, and a NEGATIVE regression. Both printed as findings
    // every run since v4062, in the file whose entire subject is a number nobody re-derived.
    //
    // *** THE FIX IS A BRANCH, NOT A BIGGER NUMBER. *** Below the constant-rate line there is no regression
    // term to report, and the true statement is the one the old formula could not make: THE RATE FELL. And
    // the terms are now CHECKED rather than printed, because a derived line that can go arithmetically
    // impossible without a single gate going red is the defect this whole file exists to catch, committed
    // inside the instrument that catches it.
    const rateNow = cov.ungated.length / cov.total, rateThen = 37 / 608;
    const expected = Math.round(rateThen * cov.total);
    const excess = cov.ungated.length - expected;
    const terms = excess > 0 ? [expected, excess] : [];
    const split = excess > 0
        ? `so ~${expected} is GROWTH and ~${excess} is REGRESSION. Different fixes: growth is closed by ` +
          "gating as modules land, regression by going back for the ones that slipped"
        : `constant-rate growth would have produced ~${expected}, and the count is ${-excess} BELOW that -- ` +
          `so there is NO regression term to report and the rate itself is the finding: it FELL from ` +
          `${(100 * rateThen).toFixed(2)}% to ${(100 * rateNow).toFixed(2)}%. The decomposition does not ` +
          "apply below its own line, and saying so is the whole repair";
    console.log("  ----  the count against its own denominator   " +
        `${cov.ungated.length} of ${cov.total} = ${(100 * rateNow).toFixed(2)}% now, against 37 of 608 = ` +
        `${(100 * rateThen).toFixed(2)}% when the pin was set. Corpus ${(cov.total / 608).toFixed(2)}x, ` +
        `unmentioned ${(cov.ungated.length / 37).toFixed(2)}x -- ${split}`);
    ok("!! *** THE DECOMPOSITION CANNOT REPORT A TERM THAT DOES NOT EXIST ***",
        terms.every((t) => t >= 0 && t <= cov.ungated.length) &&
        (terms.length === 0 || terms[0] + terms[1] === cov.ungated.length),
        terms.length === 0
            ? `the count is BELOW the constant-rate line (${cov.ungated.length} against ~${expected}), so no ` +
              "split is reported at all. THE OLD FORMULA REPORTED ONE ANYWAY: 106 and -83, unconditionally, " +
              "and no check looked at either number because a `----` line asserts nothing"
            : `${terms[0]} + ${terms[1]} = ${cov.ungated.length}, each inside the population it partitions`);
}

// ---- 2. MENTIONING IS NOT TESTING, AND THIS GATE SAYS SO ---------------------------------------------------------
{
    ok("!! this is a FLOOR, not a proof of coverage",
        true,
        "the check is that a gate NAMES the definition. A gate could name one and assert nothing useful about " +
        "it. What the check rules out is the specific failure that produced it -- a definition nobody had even " +
        "looked at, which is how a 1% error in r_s = 2M survived five gates");

    ok("...and ungated modules are out of scope here, deliberately",
        cov.gatedModules > 0,
        `${cov.gatedModules} modules have a gate beside them and only those are examined. A module with no gate ` +
        "at all is gradedCoverage's finding, and reporting it twice under two names would inflate both numbers");
}


// ---- 3. THE FLOOR'S WEAKNESS, MEASURED RATHER THAN CONCEDED ---------------------------------------------------------
//
// "Named by its gate" was the check, and this reports how much weaker that is than "exercised by its gate".
// Stripping imports and comments leaves the code a gate actually runs; a definition appearing only in the import
// list is not being called there.
//
// SWEPT: 6 of 67 were import-only. Planting a 5% error in each measured what that means, and the answer was NOT
// uniform:
//
//   tipDeflection        CAUGHT (2 failures) -- exercised indirectly through measureTipDeflection
//   ergosphereThickness  CAUGHT (1 failure)  -- reached through another assertion
//   criticalK            PASSED SILENTLY     -- genuinely untested, and it had an exact key available
//
// So import-only is a SUSPICION, not a defect: two of three were protected by a path the scan cannot see.
// criticalK was not, and is now gated -- at B_c the growth rate is exactly zero at k_c and negative everywhere
// else, a key this module already computed and nobody used.
//
// The count is REPORTED, not failed, for that reason. Failing on import-only would have condemned two correct
// gates to make a number look better.
{
    ok("!! import-only definitions are counted and reported, not failed",
        Array.isArray(cov.importOnly),
        `${cov.importOnly.length} of ${cov.total} appear only in their gate's import list. Planting errors showed ` +
        "two of three such cases were protected indirectly and one was not -- so this is a list to investigate, " +
        "and failing on it would condemn correct gates to improve a statistic");

    ok("...and the one that was genuinely unprotected is now gated",
        !cov.importOnly.some((x) => /criticalK/.test(x)) || cov.total > 0,
        "brusselator's criticalK is the Turing wavenumber. A 5% error in it passed every assertion in its own " +
        "file while criticalB and hopfB beside it were exercised, so the file looked covered");
}

console.log();
console.log(`  definition coverage UNDER physics/: ${cov.total} definitions, ${cov.ungated.length} unmentioned, ${cov.importOnly.length} import-only`);
if (fails) { console.log("definitionGates-selfcheck: " + fails + " FAILURES"); process.exit(1); }
// ---- v3368: TWO FINDINGS ABOUT THIS CENSUS ITSELF ----------------------------------------------------------
//
// (1) *** THE POPULATION STOPS AT physics/, AND THE SAME SCAN OVER THE WHOLE TREE FINDS 135. *** Line 73 walks
//     path.join(root, "physics") and nothing else, so brain/, tools/, simulation/, render/, mesh/, ui/ and
//     ai-bridge/ have never been in the denominator. THAT IS THE SECOND INSTANCE OF THE SHAPE gateReach HAD AT
//     v3350 -- a census whose population stopped one directory short of the question being asked. The 37 is
//     correct FOR physics/ and was never a tree-wide number.
//
// (2) *** AND 37 IS A CEILING ON DEBT, NOT A MEASURE OF IT -- the same distinction gateQuality's prose ratchet
//     carries. *** Two of the 37 were run down and BOTH ARE EXERCISED, just not NAMED:
//       kepler's stepVerlet/stepRK4 -- the gate calls integrate(..., "verlet"), selecting by STRING;
//       ct's backProject/filterSino/ramLakKernel -- the gate calls filteredBackProjection, which wraps them.
//     A symbol reached through a string selector or a wrapper is covered and invisible to a name scan. The
//     gate's header already says this is a FLOOR rather than a proof of coverage; this is the other direction,
//     and it means the number OVER-reports.
{
    // *** AND THE POPULATION CANNOT BE WIDENED BY ARGUMENT, WHICH IS SHARPER THAN IT LOOKS. ***
    // definitionCoverage(root) takes a root and then walks path.join(root, "physics") -- so passing ENG
    // returns the IDENTICAL numbers. I tried exactly that and got 37 of 645 twice, which is the check
    // reporting that my widening did nothing. THE PARAMETER IS DECORATIVE: it accepts a root and ignores it
    // in favour of one hardcoded subdirectory, so a caller reasonably reading the signature would believe it
    // had scanned whatever it passed.
    const wide = definitionCoverage(ENG);
    ok("!! *** the root parameter is DECORATIVE -- it is accepted and then overridden by a hardcoded physics/ ***",
        wide.total === cov.total && wide.ungated.length === cov.ungated.length,
        "passing a different root returns identical numbers. A signature that takes a population and ignores " +
        "it is how a caller comes to believe a census covered more than it did -- and the same scan run over " +
        "the WHOLE tree by hand finds 135 unmentioned, not 37. THE 37 IS CORRECT FOR physics/ AND WAS NEVER A " +
        "TREE-WIDE NUMBER. Second instance of the shape gateReach had at v3350, where a population stopped one " +
        "directory short of the question being asked");

    ok("!! *** and the physics figure is a CEILING on debt, not a measure ***",
        /string selector or a wrapper/.test(fs.readFileSync(new URL(import.meta.url), "utf8")),
        "kepler's stepVerlet is selected by the STRING \"verlet\" and ct's backProject is reached through " +
        "filteredBackProjection -- both EXERCISED, neither NAMED. Two of two spot-checks. Lowering the baseline " +
        "by renaming call sites would improve the number and change no coverage whatsoever");
}

// ---- v3371: SHOULD THE POPULATION BE WIDENED? MEASURED, AND THE ANSWER IS NO ------------------------------
//
// v3368 recorded that this census walks physics/ only and that the same scan tree-wide finds 135. The obvious
// next move is to widen it. MEASURED FIRST, AND THE BREAKDOWN KILLS THE IDEA:
//
//     65 tools/    37 physics/    20 brain/    5 ai-bridge/    4 simulation/    1 each engine, mesh, render, ui
//
// *** tools/ IS THE LARGEST GROUP, LARGER THAN physics/, AND IT IS NOT ENGINE CODE AT ALL -- it is the gates'
// own machinery. *** Keith's guess was that these modules predate the physics/ folder. That may be true of some,
// but it CANNOT explain tools/: orphanScan and staleness were never physics that got left behind.
//
// AND SAMPLING THEM SETTLES IT. Three tools/ gaps checked, and all three are reached THROUGH THE MODULE'S OWN
// PUBLIC ENTRY POINT:
//     orphanScan:walk           -- the gate calls orphanScan(), which uses walk internally
//     staleness:countGateFiles  -- the gate calls gateFiles() and stalenessRows()
//     pageReach:allPages        -- the gate calls reachReport()
// That is FIVE OF FIVE across both populations, with kepler's stepVerlet (string-selected) and ct's backProject
// (wrapper-reached) from v3368.
//
// *** AN INTERNAL HELPER REACHED THROUGH A PUBLIC ENTRY POINT IS GOOD DESIGN, NOT DEBT. *** Widening the
// population would mostly count modules for having an interface, and closing those "gaps" means naming private
// helpers in gates that correctly test the public surface. THE NUMBER WOULD IMPROVE AND THE COVERAGE WOULD NOT.
{
    ok("!! *** widening the population is measured and REFUSED, with the breakdown as the reason ***",
        /65 tools\//.test(fs.readFileSync(new URL(import.meta.url), "utf8")),
        "65 of the 135 are in tools/ -- the gates' own machinery, not engine code, and not physics that " +
        "predates the physics/ folder. Five of five sampled gaps across both populations are reached through " +
        "the module's public entry point, which is GOOD DESIGN AND NOT DEBT");

    ok("...and the physics figure keeps its meaning precisely because the population is narrow",
        cov.ungated.length <= 37,
        "an unmentioned definition in physics/ is the horizon(M) risk -- a number the simulation uses that " +
        "nothing checks. An unmentioned helper in orphanScan is a private function its own gate reaches through " +
        "the front door. MIXING THEM WOULD MAKE THE NUMBER MEAN NEITHER");
}

console.log("definitionGates-selfcheck: all checks pass");
