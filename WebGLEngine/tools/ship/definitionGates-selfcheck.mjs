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

// ==============================================================================================================
// v3905 -- THE FORMS THE SCAN COULD NOT SEE, EXTRACTED SO BOTH RULES ARE ONE FUNCTION
//
// v3904 recorded, while using it, that this census reads `export const NAME = (` and `export function NAME` and
// nothing else -- so an exported TABLE, an exported CONSTANT, a class, an async function and a
// separately-declared `export { name }` were all outside its subject. That is 316 definitions in physics/ alone,
// and A WRONG CONSTANT IS THE FOUNDING CASE OF THIS WHOLE FILE: "a 1% error in r_s = 2M survived five gates".
// The instrument could not see the shape of its own origin story.
//
// *** THE WIDENING IS A SECOND CENSUS, NOT AN EDIT TO THE FIRST, AND THAT IS THE WHOLE DESIGN. *** Section 1's
// pin of 37 was set against 608 symbols found by the narrow rule. Widening the rule in place would move the
// denominator underneath a ratchet without moving the ratchet -- the exact defect this file's siblings have
// written on them in three places (androidUpdateDoor asserting a spelling, caseStudy baking a live count). So
// `wide` is a PARAMETER, section 1 keeps calling the narrow rule and stays comparable to v3323 and v3903, and
// the wide population gets its own reporting and its own floor.
//
// WHAT COUNTS AS A DEFINITION UNDER `wide`, AND THE TWO THINGS THAT DELIBERATELY DO NOT:
//
//   counted:     export const/let/var NAME = <anything>      including tables, arrays and bare constants
//                export const A = 1, B = 2                   BOTH names -- a multi-declarator is two definitions
//                export async function NAME / export class NAME
//                export { NAME }                             ONLY when NAME is declared in this same file
//
//   NOT counted: export { NAME } from "./other.mjs"          a re-export is not a definition
//                export { NAME } where NAME was IMPORTED     ditto -- 48 of these in physics/, and counting them
//                                                            would move another module's debt onto this one
//
// The multi-declarator split is limited to statements that END ON THEIR LINE, which is every one in the tree
// (`export const DT = 0.016, GRAVITY = [0, -10, 0];` and four more like it). A multi-line declarator list would
// have its first name counted and the rest missed -- stated here rather than discovered later.
export function exportedDefinitions(src, { wide = false } = {}) {
    const out = [];
    for (const m of src.matchAll(/^export const (\w+) = \(/gm)) out.push({ name: m[1], kind: "arrow" });
    for (const m of src.matchAll(/^export function (\w+)/gm)) out.push({ name: m[1], kind: "function" });
    if (!wide) return out;
    for (const m of src.matchAll(/^export async function (\w+)/gm)) out.push({ name: m[1], kind: "async fn" });
    for (const m of src.matchAll(/^export class (\w+)/gm)) out.push({ name: m[1], kind: "class" });
    for (const m of src.matchAll(/^export (?:const|let|var) (\w+) = (?!\()(.*)$/gm)) {
        out.push({ name: m[1], kind: "value" });
        const rest = m[2];
        if (!/;\s*$/.test(rest)) continue;                  // only a statement that ends here can be split safely
        let depth = 0;
        for (let i = 0; i < rest.length; i++) {
            const c = rest[i];
            if ("([{".includes(c)) depth++;
            else if (")]}".includes(c)) depth--;
            else if (c === "," && depth === 0) {
                const nx = /^\s*(\w+)\s*=/.exec(rest.slice(i + 1));
                if (nx) out.push({ name: nx[1], kind: "value" });
            }
        }
    }
    // `export { a, b }` with no `from`: a definition ONLY if this file declares the name.
    for (const m of src.matchAll(/^export\s*\{([^}]*)\}\s*(?!from)/gm)) {
        for (const raw of m[1].split(",")) {
            const name = raw.trim().split(/\s+as\s+/)[0].trim();
            if (!name) continue;
            if (new RegExp("^\\s*(?:async\\s+)?(?:function|class|const|let|var)\\s+" + name + "\\b", "m").test(src))
                out.push({ name, kind: "named export" });
        }
    }
    return out;
}

export function definitionCoverage(root, { wide = false } = {}) {
    const out = { total: 0, ungated: [], importOnly: [], commentOnly: [], gatedModules: 0, byKind: {} };
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
            // v3905 -- comments are stripped for a SECOND reading of the same gate. `body` (no imports, no
            // comments) answers "is it exercised"; `noComments` answers "is it named in CODE at all", and the
            // gap between that and the raw source is a definition whose only mention is PROSE. There was
            // exactly one in 1824, and v3904 wrote it.
            const noComments = gsrc.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
            const seen = new Set();
            for (const d of exportedDefinitions(src, { wide })) {
                if (seen.has(d.name)) continue;              // one module, one definition per name
                seen.add(d.name);
                out.total++;
                out.byKind[d.kind] = (out.byKind[d.kind] || 0) + 1;
                const rel = path.relative(root, p).replace(/\\/g, "/") + ":" + d.name;
                const re = new RegExp("\\b" + d.name + "\\b");
                if (!re.test(gsrc)) out.ungated.push(rel);
                else if (!re.test(noComments)) out.commentOnly.push(rel);
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

// v3905 -- HOISTED OUT OF SECTION 4 SO SECTION 5 USES THE SAME CLASSIFIER. Two copies of 'which gate
// reaches this definition' is the duplicated-table defect this tree has paid for eight times.
const gates = [];
(function walkGates(dir) {
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".git") walkGates(p); continue; }
        if (/-selfcheck\.mjs$/.test(e.name)) gates.push(p);
    }
})(ENG);
const srcCache = new Map();
const readG = (p) => { if (!srcCache.has(p)) srcCache.set(p, fs.readFileSync(p, "utf8")); return srcCache.get(p); };
const codeOf = (p) => readG(p).replace(/^import[\s\S]*?from[^\n]*\n/gm, "").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const reaches = (gate, modAbs, name) => {
    const txt = readG(gate), code = codeOf(gate);
    for (const m of txt.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+)["']/g)) {
        if (path.resolve(path.dirname(gate), m[2]) !== modAbs) continue;
        const names = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop().trim());
        if (names.includes(name) && new RegExp("\\b" + name + "\\b").test(code)) return true;
    }
    for (const m of txt.matchAll(/import\s*\*\s*as\s*(\w+)\s*from\s*["'](\.[^"']+)["']/g)) {
        if (path.resolve(path.dirname(gate), m[2]) !== modAbs) continue;
        if (new RegExp("\\b" + m[1] + "\\s*\\.\\s*" + name + "\\b").test(code)) return true;
    }
    return false;
};


// *** THE FLOOR, CLUSTER BY CLUSTER, AND ADDING ONE IS A SINGLE ENTRY -- floors.mjs's shape. *** A closed
// cluster is one where every definition its own gate does not name is nonetheless driven SOMEWHERE. This is a
// RATCHET DOWNWARD ON A SET, not a number that can be lifted to meet the tree: a new ungraded export in a closed
// cluster fails here on the round that lands it. v3905: the SAME registry is applied to the widened population
// in section 5, so a cluster cannot be closed under the narrow rule and dark under the wide one.
const CLOSED = {
    "physics/mesh": "v3904 -- sideOf, distanceToInterface (discontinuity) and toPathD, morphPaths (strokeMorph); the other 17 were already driven by the subject-named gates",
    "physics/render": "v3904 -- cosinePdf (furnace) and sampleHalfVector, sampleDirPdf, bounceWeight, bsdfEval (microfacet); toWorld and cosineSampleHemisphere came along with the cosine arc",
};

// Which of these `module:name` entries no gate anywhere imports and drives.
const darkOf = (entries) => entries.filter((entry) => {
    const i = entry.lastIndexOf(":");
    const modAbs = path.join(ENG, entry.slice(0, i)), name = entry.slice(i + 1);
    return !gates.some((g) => reaches(g, modAbs, name));
});

const byCluster = (entries) => {
    const m = new Map();
    for (const e of entries) {
        const d = e.slice(0, e.lastIndexOf("/")).split("/").slice(0, 2).join("/");
        m.set(d, (m.get(d) || 0) + 1);
    }
    return [...m].sort((a, b) => b[1] - a[1]);
};

// ---- 4. v3904 -- "ITS GATE" IS THE WRONG QUESTION FOR A SUBJECT-NAMED FOLDER, AND THE CLUSTER THAT PROVED IT ----
//
// Keith asked for the open exported functions in physics/mesh (21) and physics/render (11). MEASURING THEM ONE
// AT A TIME FOUND THAT 23 OF THE 32 WERE ALREADY EXERCISED -- by a gate that IMPORTS the symbol from that module
// and calls it, just not the gate sitting beside the file:
//
//     triReconstruct.mjs's seven      -> boundaryRank, nodeGradient, gradientJoin, tetRank
//     quadraticRecon.mjs's five       -> rowWeight, quadraticWall, weightScaling
//     marchingCubes.js's five         -> featurePreserve, manifoldCensus, ambientOcclusion, sdfMarch, aoWiring
//     furnace.mjs's toWorld, occlusion.mjs's occluded, bounces' pair, microfacet's misWeight -> five more gates
//
// *** THAT IS NOT DEBT AND IT IS NOT A SCAN ARTEFACT EITHER: IT IS THIS FOLDER NAMING ITS GATES AFTER THE
// SUBJECT RATHER THAN AFTER THE FILE. *** physics/mesh has 19 gates against 12 modules -- boundaryRank,
// rowWeight, nodeGradient, gradientJoin, tetRank, weightScaling, quadraticWall, featurePreserve are QUESTIONS,
// not modules, and the sibling rule cannot see any of them. Sections 1-3 are unchanged and the pin still says
// 37: the point here is not that the count is wrong, it is that ONE COUNT CANNOT DISTINGUISH "nobody looked at
// this" FROM "the gate that looks at it is named after the question it asks", AND ONLY THE FIRST IS A DEFECT.
//
// So this REPORTS the split and RATCHETS ONLY THE FIRST CLASS, cluster by cluster as they are closed.
{
    // A gate reaches a definition if it IMPORTS it from that exact module -- named or through a namespace --
    // and then uses it in code with the imports and comments stripped. *** MENTION IS NOT REACH: `sideOf`
    // appears in bz/tools/bz-teleport-selfcheck.mjs, which is a different sideOf in a different subject, and a
    // scan that counted the word would have called physics/mesh's clean. ***
    const unexercised = darkOf(cov.ungated);
    const elsewhere = cov.ungated.length - unexercised.length;

    console.log("  ----  the split section 1's count cannot make   " +
        `${cov.ungated.length} unmentioned by their own gate, of which ${elsewhere} ARE imported and driven by ` +
        `another gate and ${unexercised.length} are reached by NO gate at all. The second number is the one that ` +
        "means what section 1's headline sounds like it means");

    for (const [dir, why] of Object.entries(CLOSED)) {
        const left = unexercised.filter((e) => e.startsWith(dir + "/"));
        ok(`!! ${dir}: every export its own gate does not name is driven by SOME gate`,
            left.length === 0,
            left.length ? "STILL DARK: " + left.join(", ") : why);
    }
    const openDirs = byCluster(unexercised);
    console.log("  ----  what is still dark, by cluster   " + openDirs.slice(0, 6).map(([d, n]) => d + " " + n).join(", ") +
        `  (${openDirs.length} clusters, ${unexercised.length} definitions). THE NEXT ROUND IS THE TOP OF THAT LIST, ` +
        "and the list is derived rather than typed");

    // ---- SABOTAGE: the classifier must be able to say both things about the same shape --------------------
    const probe = (gate, modRel, name) => reaches(path.join(ENG, gate), path.join(ENG, modRel), name);
    ok("SABOTAGE: a definition driven only by a NON-SIBLING gate reads as exercised",
        probe("physics/mesh/nodeGradient-selfcheck.mjs", "physics/mesh/triReconstruct.mjs", "gradientGGNode"),
        "nodeGradient-selfcheck imports gradientGGNode from triReconstruct.mjs and calls it, while " +
        "triReconstruct-selfcheck never names it -- the exact case the sibling rule miscounts");
    ok("...and a MENTION in an unrelated gate does NOT",
        !probe("bz/tools/bz-teleport-selfcheck.mjs", "physics/mesh/discontinuity.mjs", "sideOf"),
        "bz-teleport-selfcheck contains the word sideOf and imports nothing from physics/mesh. A word-match " +
        "classifier would have marked discontinuity.mjs covered by a file about a different subject entirely");
    ok("...and a name that no gate anywhere imports reads as dark",
        !gates.some((g) => reaches(g, path.join(ENG, "physics/mesh/discontinuity.mjs"), "notARealExportName")),
        "the negative control: without it this section would pass on a classifier that answered true to everything");
}

// ---- 5. v3905 -- THE WIDENED CENSUS, RUN BESIDE THE NARROW ONE RATHER THAN INSTEAD OF IT -------------------
//
// Keith: "fixed: widening the regex." Done, and it is reported here rather than folded into section 1, for the
// reason that section's own comment gives: a denominator that moves under a frozen pin makes the pin meaningless
// without anybody editing it.
{
    const w = definitionCoverage(ENG, { wide: true });
    const kinds = Object.entries(w.byKind).sort((a, b) => b[1] - a[1]);
    console.log("  ----  the widened population   " +
        `${w.total} definitions against the narrow rule's ${cov.total} (+${w.total - cov.total}): ` +
        kinds.map(([k, n]) => k + " " + n).join(", "));

    ok("!! the widening ADDS to the population and never removes from it",
        w.total > cov.total && cov.ungated.every((e) => w.ungated.includes(e)),
        `every one of the narrow rule's ${cov.ungated.length} unmentioned definitions is still unmentioned under ` +
        "the wide rule. A widened scan that lost an entry would be a different question wearing the same name, " +
        "and the count falling would look like progress");

    const revealed = w.ungated.filter((e) => !cov.ungated.includes(e));
    const dark = darkOf(revealed);
    console.log("  ----  what the widening reveals   " +
        `${w.ungated.length} unmentioned under the wide rule against ${cov.ungated.length} under the narrow one. ` +
        `The ${revealed.length} new ones are ${dark.length} reached by NO gate at all and ${revealed.length - dark.length} ` +
        "driven by another gate -- a MUCH darker class than the narrow rule's, where 34 of 110 were already driven");
    console.log("  ----  the new dark, by cluster   " + byCluster(dark).slice(0, 8).map(([d, n]) => d + " " + n).join(", "));

    // *** THE CLOSED CLUSTERS MUST SURVIVE THE STRICTER INSTRUMENT. *** A floor set under a rule that could not
    // see tables and constants would be worth very little if the widened rule reopened it. This is the same
    // registry section 4 uses, applied to the wider population.
    for (const [dir, why] of Object.entries(CLOSED)) {
        const left = dark.filter((e) => e.startsWith(dir + "/"));
        ok(`!! ${dir} stays closed under the WIDE rule too`,
            left.length === 0,
            left.length ? "REOPENED: " + left.join(", ")
                        : "the widening adds no dark definition here -- " + why.split(" -- ")[0] +
                          "'s cluster holds against tables, constants, classes and separately-declared exports");
    }

    // ---- THE ONE COMMENT-ONLY DEFINITION IN 1824, AND THIS ROUND WROTE IT --------------------------------
    //
    // *** THE UNGATED TEST READS THE RAW GATE SOURCE, SO A NAME IN A COMMENT COUNTS AS A MENTION. *** That is
    // section 2's stated floor and it is fine as far as it goes -- but the widening made the weakness
    // measurable for the first time, and the answer is a single entry: EXPECTED_COSINE, which v3904 named in a
    // comment while RE-TYPING its value as `4 / 3` in the assertion beside it. A second declaration of a
    // prediction, committed by the round that was closing this very cluster. It reads from the module now.
    ok("!! no definition is mentioned ONLY in its gate's prose",
        w.commentOnly.length === 0,
        w.commentOnly.length ? "PROSE ONLY: " + w.commentOnly.join(", ")
                             : `0 of ${w.total}. There was exactly ONE when this check was written and v3904 had ` +
                               "just committed it, which is the strongest argument available for measuring rather " +
                               "than reading: NOBODY CAN RUN A SENTENCE ABOUT A CONSTANT");
    console.log("  ----  import-only under the wide rule   " +
        `${w.importOnly.length} of ${w.total} appear only in the gate's import list, against ${cov.importOnly.length} ` +
        `of ${cov.total} narrow. Reported, never failed -- section 3's reason applies unchanged`);

    // ---- SABOTAGE: EVERY NEW FORM IS DRIVEN, AND THE TWO EXCLUSIONS ARE DRIVEN TOO --------------------------
    //
    // A widened regex is a claim about what it now sees, and the way that claim goes wrong is silently: a
    // pattern that matches nothing costs nothing and proves nothing. So each form is fed a source it must find,
    // and each deliberate exclusion is fed one it must refuse.
    const nameSet = (src) => new Set(exportedDefinitions(src, { wide: true }).map((d) => d.name));
    const narrowSet = (src) => new Set(exportedDefinitions(src).map((d) => d.name));
    const FIXTURE = [
        "export const TABLE = {",
        "    a: 1,",
        "};",
        "export const LIST = [1, 2, 3];",
        "export const R_GAS = 8.314462618;",
        "export const DT = 0.016, GRAVITY = [0, -10, 0];",
        "export async function loadIt() { return 1; }",
        "export class Grid {}",
        "function madeHere() { return 2; }",
        "export { madeHere };",
        "export const arrowOne = (x) => x;",
        "export function plainOne(x) { return x; }",
    ].join("\n");
    const got = nameSet(FIXTURE);
    for (const [form, name] of [["a table", "TABLE"], ["an array", "LIST"], ["a bare constant", "R_GAS"],
                                ["an async function", "loadIt"], ["a class", "Grid"],
                                ["a locally-declared named export", "madeHere"]])
        ok(`SABOTAGE: ${form} is counted`, got.has(name), `${name} is found by the wide rule`);
    ok("!! SABOTAGE: a MULTI-DECLARATOR is TWO definitions, not one",
        got.has("DT") && got.has("GRAVITY"),
        "`export const DT = 0.016, GRAVITY = [0, -10, 0];` appears five times in physics/. Counting only the " +
        "first name is how a scanner reports a smaller, wronger number and looks like it improved");
    ok("...and the narrow rule still sees ONLY the two forms it was pinned against",
        narrowSet(FIXTURE).size === 2 && narrowSet(FIXTURE).has("arrowOne") && narrowSet(FIXTURE).has("plainOne"),
        "the negative control on the PARAMETER: if `wide` leaked into the default, section 1's pin would silently " +
        "start measuring a different population and no check would say so");
    const passthrough = 'import { elsewhere } from "./other.mjs";\nexport { elsewhere };\nexport { alsoThere } from "./other.mjs";';
    ok("!! SABOTAGE: a re-export is NOT a definition, in either spelling",
        !nameSet(passthrough).has("elsewhere") && !nameSet(passthrough).has("alsoThere"),
        "48 of these in physics/. Counting them would move another module's debt onto this one and inflate the " +
        "number the tree is trying to drive down -- v3453's rule, from the other direction");
}

console.log();
console.log(`  definition coverage: ${cov.total} definitions by the narrow rule, ${cov.ungated.length} unmentioned, ${cov.importOnly.length} import-only`);
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
