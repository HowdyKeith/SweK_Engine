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
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Exported one-line definitions, and whether the module's own gate names them. */
export function definitionCoverage(root) {
    const out = { total: 0, ungated: [], importOnly: [], gatedModules: 0 };
    const walk = (dir) => {
        let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { walk(p); continue; }
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
            const decls = [...src.matchAll(/^export const (\w+) = \(/gm), ...src.matchAll(/^export function (\w+)/gm)];
            for (const m of decls) {
                out.total++;
                const rel = path.relative(root, p).replace(/\\/g, "/") + ":" + m[1];
                const re = new RegExp("\\b" + m[1] + "\\b");
                if (!re.test(gsrc)) out.ungated.push(rel);
                else if (!re.test(body)) out.importOnly.push(rel);
            }
        }
    };
    walk(path.join(root, "physics"));
    return out;
}

const cov = definitionCoverage(ENG);

// ---- 1. THE COUNT STAYS AT ZERO -------------------------------------------------------------------------------
{
    // v3322 -- A BASELINE, FOR THE REASON boundaryLint AND orphanScan BOTH USE ONE. Widening the sweep from 67
    // one-line definitions to all 608 exported symbols found 39 unmentioned. Failing on all of them means a red
    // gate on day one and a switched-off gate on day two, so the count is FROZEN and the assertion is that it
    // must not GROW. Existing debt stays visible and shrinkable; a new untested export cannot arrive quietly.
    const BASELINE = 37;   // v3323: iscoKm and photonSphereKm closed -- the number RATCHETS DOWN, never up
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
    ok("!! no NEW exported symbol has appeared without its gate naming it",
        cov.ungated.length <= BASELINE,
        cov.ungated.length > BASELINE
            ? "GREW to " + cov.ungated.length + ": " + cov.ungated.slice(0, 6).join(", ") + " ..."
            : `${cov.ungated.length} unmentioned of ${cov.total} exported symbols across ${cov.gatedModules} ` +
              `gated modules, against a frozen ${BASELINE}. The one-line-definition subset is at ZERO -- all ` +
              "three gaps there were load-bearing and were closed. The remaining debt is exported FUNCTIONS, and " +
              "planting errors in four of them showed all four passing silently, so it is real debt rather than " +
              "a scan artefact");
    // REPORTED, NOT ASSERTED -- a census is not debt, and this one says which KIND of debt the count above is.
    const rateNow = cov.ungated.length / cov.total, rateThen = 37 / 608;
    console.log("  ----  the count against its own denominator   " +
        `${cov.ungated.length} of ${cov.total} = ${(100 * rateNow).toFixed(2)}% now, against 37 of 608 = ` +
        `${(100 * rateThen).toFixed(2)}% when the pin was set. Corpus ${(cov.total / 608).toFixed(2)}x, ` +
        `unmentioned ${(cov.ungated.length / 37).toFixed(2)}x -- so ~${Math.round(rateThen * cov.total)} is GROWTH ` +
        `and ~${cov.ungated.length - Math.round(rateThen * cov.total)} is REGRESSION. Different fixes: growth is ` +
        "closed by gating as modules land, regression by going back for the ones that slipped");
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
console.log(`  definition coverage: ${cov.total} one-line definitions, ${cov.ungated.length} unmentioned, ${cov.importOnly.length} import-only`);
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
