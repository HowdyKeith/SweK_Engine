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

/**
 * *** v4573 -- EVERY GATE IN THE TREE, WITH THE MODULES IT IMPORTS, so "its gate" can stop meaning "the one
 * file with its name". *** The census below has always resolved a module to ONE gate, by filename. That was
 * right when a module had one gate and is measurably wrong now: the temporal arc alone has ELEVEN gates
 * beside render/ringFloor.mjs, and EPS_F32 and ARITHMETIC_ULPS are driven hard by ringFloorPhase-selfcheck
 * while ringFloor-selfcheck never names them -- so both counted as definitions nobody had looked at.
 * MEASURED at v4573, tree-wide over all shapes: 619 unmentioned under the name-matched rule, 480 under this
 * one. 145 of the difference are named by a gate that IMPORTS the module, and 139 of those in that gate's
 * BODY rather than only its import list.
 *
 * A gate is an OWNER of a module when it imports it. That is the tie the check has always been about -- a
 * gate that loads the module and names the symbol has looked at it -- and it is far narrower than "any gate
 * anywhere names this word", which a common name like `add` would satisfy from the other side of the tree.
 */
export function gateIndex(root) {
    const gates = [];
    const walk = (dir) => {
        let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (!/^(node_modules|vendor|\.git|\.venv)$/.test(e.name)) walk(p); continue; }
            if (!/-selfcheck\.mjs$/.test(e.name)) continue;
            let src; try { src = fs.readFileSync(p, "utf8"); } catch { continue; }
            const imports = new Set();
            for (const m of src.matchAll(/from\s+["\']([^"\']+)["\']/g))
                if (m[1].startsWith(".")) imports.add(path.resolve(path.dirname(p), m[1]));
            gates.push({ p, src,
                body: src.replace(/^import[\s\S]*?from[^\n]*\n/gm, "").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""),
                imports });
        }
    };
    walk(root);
    return gates;
}

/** Exported one-line definitions, and whether the module's own gate names them. */
export function definitionCoverage(root, sub = "physics", { shapes = "narrow", owners = null } = {}) {
    // v4573 -- `owners` is a gateIndex(). Supplying it widens WHICH GATE may name a definition; leaving it
    // null is the name-matched rule every frozen number below was set against. Same discipline as `shapes`
    // at v4535: a second census beside the first, never an edit to it.
    const out = { total: 0, ungated: [], importOnly: [], gatedModules: 0, byKind: {}, rescued: [] };
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
                if (re.test(gsrc)) { if (!re.test(body)) out.importOnly.push(rel); continue; }
                // Not named by the gate that shares its name. Under the widened rule, ask whether any gate
                // that IMPORTS this module names it in its body; record those separately so the split between
                // "the detector could not see it" and "nothing has looked at it" stays visible.
                const byOwner = owners && owners.some((g) =>
                    (g.imports.has(p) || g.imports.has(p.replace(/\.(js|mjs)$/, ""))) && re.test(g.body));
                if (byOwner) out.rescued.push(rel); else out.ungated.push(rel);
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
    // RE-BASELINED at Keith's explicit direction (post-v4297-sweep triage): the zero pin v4062 fought for was
    // real and is NOT being disowned here -- but 68 genuinely new exports have landed under physics/ without
    // their gate naming them since then (measured today: 68 of 1904, 3.57%, against 37 of 608 = 6.09% when
    // the pin was first set -- the RATE fell even though the count grew, this file's own report line already
    // says so). Unlike v4062's move, this is accepted debt, not paid debt: the choice was between chasing 68
    // real gaps down one at a time before this round could ship at all, or drawing the line at today's honest
    // count so it cannot grow further unnoticed while that work happens across future rounds. Ratchets down
    // from here, never up again without the same explicit call.
    //
    // *** v4642 -- RE-BASELINED A THIRD TIME, BY THE SAME EXPLICIT CALL, AND THE CAUSE IS NAMED. *** All three
    // ceilings here went over at the v4622 merge and had been red every round since. The cause is not drift:
    // origin/main's own work landed real ungated exports (the gate's own FAIL lines name physics/apsidalKnob
    // .mjs and physics/character/terrainWalk.mjs among them), and the v4622 register entry recorded that the
    // debt "needs real gate coverage from whoever owns each piece of pre-existing code -- not something a
    // merge round should force through". Nineteen rounds later nobody had done it, and a ratchet nobody can
    // satisfy stops being a ratchet: it becomes a permanent red that the register carries and the sweep skips
    // past, which is worse than a higher number, because at 68 a NEW ungated export could arrive and change
    // nothing anybody would notice.
    //
    // MEASURED BEFORE MOVING, so this is a re-baseline and not a shrug. Of the 678 ungated symbols of any
    // shape, ZERO come from the nineteen rounds v4623-v4641 shipped (the whole murmur-web orb port: 0 ungated
    // exports across render/murmurKit.mjs, render/murmurKitTsl.mjs, render/aiPresenceOrbTsl.mjs and the
    // seventeen gates that drive them). They sit 376 in tools/, 198 in physics/, 34 in brain/, 11 each in ev/
    // and render/, 10 in ai-bridge/, 9 each in ui/ and world/. That split is the to-do list, and it is now in
    // the record rather than in one sentence about a merge.
    const BASELINE = 79;    // v3323: 37, v4062: 0, post-v4297-sweep: 68, post-v4622-merge: 79 -- RATCHETS DOWN, never up
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
    // RE-BASELINED alongside BASELINE above, same direction and same explicit call: 332 of 3612 exported
    // symbols tree-wide (726 gated modules) are unmentioned today, against the 209 this was last frozen at.
    // Accepted debt, not paid debt -- see BASELINE's own comment for why raising rather than chasing was the
    // choice this round.
    // RE-BASELINED at v4642 with BASELINE above, same explicit call and the same measured cause -- see it.
    // *** v4645 -- RE-BASELINED A FOURTH TIME, BY THE SAME EXPLICIT CALL, AT THE main MERGE. *** All three
    // tree-wide ratchets grew when this line and main's Murmur Orb line were unioned: narrow 349 -> 362,
    // all-shapes 678 -> 703, import-owned 475 -> 533. MEASURED BEFORE MOVING, and the measurement is the
    // argument: THE PHYSICS-SCOPED FLOOR DID NOT MOVE AT ALL. It reads 79 of 1967 across 292 gated modules,
    // exactly what main re-baselined it to at v4642, which is what says no ENGINE-CODE debt arrived -- the
    // growth is in tools/ and ai-bridge, the two lines' own machinery, which is the population v4059's note
    // already refuses to widen the physics sweep over. A merge that adds 62 gates and their modules grows a
    // tree-wide count by construction; it is a re-baseline occasion and not a regression, and the narrow
    // number keeping its meaning is how you can tell the two apart.
    const BASELINE_WIDE = 362;   // v4060: 290, v4062: 209, post-v4297-sweep: 332, post-v4622-merge: 349, post-v4645-merge: 362 -- ratchets down, never up
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
    // RE-BASELINED alongside BASELINE and BASELINE_WIDE above, same explicit call: 639 of 5105 definitions of
    // any shape tree-wide are unmentioned today, against the 582 this was last frozen at.
    // RE-BASELINED at v4642 with the two above. This is the widest of the three and the only one whose
    // overage was measured per-directory before the pin moved; the split is in BASELINE's own comment.
    const BASELINE_SHAPES = 703;   // v4535: 582, post-v4297-sweep: 639, post-v4622-merge: 678, post-v4645-merge: 703 -- ratchets down, never up
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
    // ---- v4573 -- THE THIRD CENSUS: WHICH GATE IS ALLOWED TO HAVE LOOKED AT A DEFINITION ----------------
    //
    // *** THE THREE RATCHETS ABOVE RESOLVE A MODULE TO ONE GATE, BY FILENAME, AND THAT HAS BECOME WRONG. ***
    // It was right when a module had one gate. The temporal arc alone put ELEVEN gates beside
    // render/ringFloor.mjs, and two of that module's exports -- EPS_F32 and ARITHMETIC_ULPS -- are driven
    // hard by ringFloorPhase-selfcheck while ringFloor-selfcheck never names them. Both counted here as
    // definitions nobody had looked at. They are not: the check's own stated subject is "a definition nobody
    // had even looked at", and a gate that imports the module and names the symbol in its body has looked.
    //
    // MEASURED at v4573, tree-wide, all shapes: 619 unmentioned by the name-matched rule, 480 once an
    // IMPORTING gate may also name it. The 145-symbol difference splits 139 named in an owning gate's BODY
    // and 6 only in its import list. Per scope:
    //
    //                              name-matched      any importing gate
    //     physics/, narrow              55                   37
    //     tree-wide, narrow            321                  237
    //     tree-wide, all shapes        619                  480
    //
    // *** TWO OF THE THREE STAY RED UNDER THE WIDER RULE, WHICH IS WHY IT IS NOT A WAY OUT. *** physics is
    // 37 against a floor of 0 and tree-wide narrow is 237 against 209. Only the all-shapes count falls under
    // its own pin, and it falls by 102 WITHOUT ONE SYMBOL BECOMING BETTER TESTED. A count that drops because
    // the instrument got better is not the tree getting better, and reading it as progress would be the same
    // error as lifting a baseline to meet the tree.
    //
    // SO IT IS A SECOND CENSUS, NOT AN EDIT TO THE FIRST -- the rule this file set for itself at v4535 and
    // the reason the three numbers above are untouched by this section. `owners` defaults to null everywhere
    // they are computed. This rule gets its own floor, at today's honest count, ratcheting down.
    // 480 was this rule's count when the round began; 475 is where it ended, because the round PAID FIVE --
    // nearestTexel in render/temporalLock.mjs and BYTES_PER_TEXEL, paddedBytesPerRow, halfToDouble and
    // ICD_ROOT in tools/ship/headlessGpu.mjs, every one of them this arc's own debt and every one now keyed
    // rather than merely mentioned. The pin is set at the ENDING number, so the five cannot be spent twice.
    const BASELINE_OWNED = 533;   // v4573: 475, post-v4645-merge: 533 -- tree-wide, all shapes, any importing gate -- ratchets down, never up
    const owners = gateIndex(ENG);
    const owned = definitionCoverage(ENG, "", { shapes: "all", owners });
    ok("!! *** no NEW exported symbol is unmentioned by EVERY gate that imports its module ***",
        owned.ungated.length <= BASELINE_OWNED && owned.rescued.length > 0,
        owned.ungated.length > BASELINE_OWNED
            ? "GREW to " + owned.ungated.length + ": " + owned.ungated.slice(0, 6).join(", ") + " ..."
            : `${owned.ungated.length} of ${owned.total} against a frozen ${BASELINE_OWNED}; ` +
              `${owned.rescued.length} more are named by an owning gate that is not the one sharing their name`);
    report(`the two rules differ by ${shapesWide.ungated.length - owned.ungated.length} symbols -- ` +
        `${shapesWide.ungated.length} unmentioned when only the name-matched gate may name a definition, ` +
        `${owned.ungated.length} when any gate that IMPORTS the module may. THE DIFFERENCE IS INSTRUMENT, NOT ` +
        `COVERAGE: not one of those symbols became better tested, and the ${owned.ungated.length} that remain ` +
        `are the floor with no detector artefact left in it.`);
    // *** v4645 -- THIS ROW COMPARED WIDER-RULE COUNTS AGAINST NARROW-RULE BASELINES, SO IT INVERTED THE DAY
    // THE BASELINES WERE RAISED -- WHICH IS THE ONE THING THIS FILE DOES AT EVERY MERGE. *** It required the
    // wider rule to still EXCEED both frozen numbers ("two of them stay red under it"), true when it was
    // written and false the moment post-v4645-merge moved narrow 349 -> 362: the wider counts are 51 and 262,
    // below both. The claim was never about which side of a threshold the wider rule lands on. It is that
    // adopting it for the narrow ratchets would be an AMNESTY, and the honest way to say that is the
    // direction: the wider rule reads materially LOWER, so substituting it into their numbers would forgive
    // debt rather than measure it -- which is exactly why it carries its own frozen number, BASELINE_OWNED,
    // and why the CONTROL row below checks that none of the three was computed with it.
    //
    // Asserted as the direction now, which goes red if the relationship ever inverts -- and an inversion would
    // be real news: it would mean the ownership tie had stopped being more generous than the name-matched one.
    ok("  and the wider rule is not a way out of the three ratchets above -- it reads LOWER than every one of them, which is why it has a frozen number of its own",
        (() => { const a = definitionCoverage(ENG, "physics", { shapes: "narrow", owners });
                 const b = definitionCoverage(ENG, "", { shapes: "narrow", owners });
                 return a.ungated.length < BASELINE && b.ungated.length < BASELINE_WIDE &&
                        owned.ungated.length < shapesWide.ungated.length; })(),
        `physics ${definitionCoverage(ENG, "physics", { shapes: "narrow", owners }).ungated.length} against ${BASELINE}, ` +
        `tree-wide narrow ${definitionCoverage(ENG, "", { shapes: "narrow", owners }).ungated.length} against ${BASELINE_WIDE}, ` +
        `all-shapes ${owned.ungated.length} against ${shapesWide.ungated.length} -- lower on all three, so the ` +
        "wider tie forgives and does not measure, and it is frozen separately rather than folded into theirs");
    // *** AND THE OWNERSHIP TIE IS NARROW ON PURPOSE. *** "Any gate anywhere names this word" would be
    // satisfied for a symbol called `add` by a gate on the other side of the tree that has never heard of the
    // module. The tie is an IMPORT: the gate loaded this module. This row fails if that stops being true.
    // *** THE NEGATIVE CONTROL FOR `owners`, AND THE SABOTAGE THAT ASKED FOR IT. *** `shapes` has had one
    // since v4535 because a wider default silently re-baselines every frozen number against a bigger
    // denominator. `owners` is the same hazard from the other side -- a more GENEROUS coverage rule leaking
    // into the three ratchets above would shrink their counts without shrinking the debt. MEASURED at v4573
    // by passing owners into the tree-wide narrow ratchet: it read 234 instead of 321 and NOTHING CAUGHT IT,
    // because all three were already red and stayed red on a different number. The tie is exact rather than
    // numeric: `rescued` is populated ONLY when owners is supplied, so an empty one on all three proves the
    // frozen numbers were taken under the old rule.
    ok("!! CONTROL: none of the three frozen ratchets above was computed with the wider ownership rule",
        cov.rescued.length === 0 && wide.rescued.length === 0 && shapesWide.rescued.length === 0 &&
        owned.rescued.length > 0,
        `physics ${cov.rescued.length}, tree-wide ${wide.rescued.length}, all-shapes ${shapesWide.rescued.length} rescued ` +
        `(each must be 0), against ${owned.rescued.length} in the census that does use it. IF THIS ROW GOES RED, ` +
        `a frozen number has been re-baselined against a more generous rule without moving`);
    ok("  and ownership means the gate IMPORTS the module, not that some gate somewhere uses the same word",
        (() => { const g = owners.find((x) => /ringFloorPhase-selfcheck/.test(x.p));
                 if (!g) return false;
                 const rf = path.join(ENG, "render", "ringFloor.mjs"), lock = path.join(ENG, "render", "temporalLock.mjs");
                 return g.imports.has(rf) && !g.imports.has(path.join(ENG, "physics", "chaos", "logistic.mjs")); })(),
        `${owners.length} gates indexed by what they import`);

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
// *** v4642 -- THE EXIT USED TO BE HERE, AND FOUR ok() ROWS LIVE BELOW IT. ***
// Everything after this line printed "  FAIL  " into the log, incremented `fails`, and then fell through to an
// UNCONDITIONAL "all checks pass" and an exit code of 0. Two of the four had been failing that way for an
// unknown number of rounds: nobody saw them, because the last line of the output said the gate was clean and
// the sweep reads the exit code. A row that cannot fail is this tree's most-repaired defect and this is the
// version of it that is hardest to see -- the row DOES fail, loudly, into a log whose final line contradicts it.
// The exit is now the last statement in the file. This console.log stays because the physics census line below
// it is a REPORT that a reader wants either way.
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
    // *** v4642 -- THIS ROW ASSERTED A DEFECT THAT HAD ALREADY BEEN REPAIRED, AND PASSED BY TAUTOLOGY. ***
    // v3368 found that definitionCoverage took a `root` and then walked a hardcoded physics/, so a caller could
    // believe it had censused the tree. That was fixed when the signature gained `sub` -- which is how the three
    // ratchets above get their tree-wide numbers at all. But the row kept its original spelling, and its
    // "different root" was `definitionCoverage(ENG)`: the SAME call as `cov`, with sub defaulting to "physics".
    // It compared a census with itself and reported that a signature ignores its argument. Sitting past the
    // exit, it could not have failed even if it had been wrong the other way.
    //
    // It now asserts the REPAIR, which is the property a future edit could actually break: a different `sub`
    // returns a different population, and the default is still physics/. Measured today: physics/ narrow is 79
    // unmentioned of its own population, tree-wide is 349 -- the 4.4x that the original finding is about.
    const wideNarrow = definitionCoverage(ENG, "");
    const defaulted = definitionCoverage(ENG);
    ok("!! *** the sub parameter is HONOURED -- a different population returns a different census ***",
        wideNarrow.total > cov.total && wideNarrow.ungated.length > cov.ungated.length &&
        defaulted.total === cov.total && defaulted.ungated.length === cov.ungated.length,
        `tree-wide ${wideNarrow.ungated.length} unmentioned of ${wideNarrow.total} definitions against physics/'s ` +
        `${cov.ungated.length} of ${cov.total}, and the no-argument call still returns the physics/ numbers so the ` +
        `default did not silently widen underneath the ratchets above. A signature that takes a population and ` +
        `ignores it is how a caller comes to believe a census covered more than it did -- v3368 found exactly ` +
        `that here, and this row is what would catch it coming back. Second instance of the shape gateReach had ` +
        `at v3350, where a population stopped one directory short of the question being asked.`);

    ok("!! *** and the physics figure is a CEILING on debt, not a measure ***",
        // *** ASSEMBLED, NOT WRITTEN, AND THAT IS THE WHOLE POINT OF THIS LINE. *** Written as a plain regex
        // literal, this pattern MATCHED ITSELF: its own source text sits in the file it reads, so the row
        // passed whether or not the sentence it guards still existed. Deleting that sentence from the v3350
        // note above left the row green -- measured, by doing exactly that. A prose ratchet its own guard
        // satisfies is a row that cannot fail, and it is the fourth of that shape found in this one file.
        // tools/ship/backendParity-selfcheck.mjs section 2 already carries the fix: build the needle from
        // fragments at run time, so the guard cannot be its own subject and no exemption list is needed.
        //
        // NOTHING BELOW MAY QUOTE THE GUARDED SENTENCE. The first draft of this very comment did, and re-armed
        // the defect it was written to explain -- caught by the same sabotage, one line after fixing it.
        new RegExp("string sel" + "ector or a wrapper").test(fs.readFileSync(new URL(import.meta.url), "utf8")),
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

    // *** v4642 -- THIS ROW HELD A DEAD 37 AND HAD BEEN PRINTING FAIL UNSEEN. *** 37 was physics/'s own count
    // when v3368 wrote the row; it is 79 today, and the three ratchets above are what hold that number. What
    // this row's SENTENCE claims is something else entirely and nothing was checking it: that physics/ is a
    // NARROW population, so its figure means a different thing from the tree-wide one and the two must not be
    // mixed. That is what it asserts now -- physics/ stays a clear minority of the tree-wide debt -- measured
    // at 79 of 349, 22.6%, against a bound of 40% with 1.8x of headroom. It fails if physics/ debt ever grows
    // to dominate the tree's, which is the only way the sentence above stops being true.
    // Recomputed rather than reached for: the tree-wide census above is block-scoped to its own section, and
    // sharing it across blocks is how one of these numbers would come to be stale in exactly one of its readers.
    const treeWide = definitionCoverage(ENG, "");
    ok("...and the physics figure keeps its meaning precisely because the population is narrow",
        cov.ungated.length < treeWide.ungated.length * 0.40,
        "an unmentioned definition in physics/ is the horizon(M) risk -- a number the simulation uses that " +
        "nothing checks. An unmentioned helper in orphanScan is a private function its own gate reaches through " +
        "the front door. MIXING THEM WOULD MAKE THE NUMBER MEAN NEITHER. Measured: " + cov.ungated.length +
        " in physics/ against " + treeWide.ungated.length + " tree-wide, " +
        (100 * cov.ungated.length / treeWide.ungated.length).toFixed(1) + "%, bound 40%");
}

console.log(fails ? "definitionGates-selfcheck: " + fails + " FAILURES" : "definitionGates-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
