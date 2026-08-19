// tools/roundhouse/couplingIndependence-selfcheck.mjs
//
// v3389 -- AUDITING THE LAB'S OWN COUPLING CLAIMS.
//
// v3387 established the hazard by falling into it. The electromagnetism planted error -- n = eps_r instead of
// sqrt(eps_r mu_r) -- was supposed to be caught by comparing Fresnel reflection against the seismic impedance
// reflection. IT WAS NOT: both sides consumed the SAME wrong index, one directly and one through Z0/n, so they
// agreed perfectly on the wrong answer.
//
// This lab has been declaring couplings for many rounds on an author's judgement that the routes are
// independent. That judgement is decidable from the import graph, and it turns out the declared couplings fall
// into THREE classes rather than one:
//
//   INDEPENDENT  no shared dependency. Agreement is real corroboration.
//   INCIDENTAL   shared file, different functions. No value can pass between the routes, so the claim stands.
//   IDENTITY     one route calls the other. Agreement is guaranteed by construction, which is valuable -- the
//                two cannot drift apart -- but it is NOT two independent confirmations and must not be counted
//                as such.
//
// An audit that only asked "do the numbers agree" would rate all three identically.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyCoupling, auditDeclared, namedImports, transitiveDeps, declaredCouplings } from "./couplingIndependence.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const audit = auditDeclared(".");
const by = (frag) => audit.find((a) => a.label.includes(frag));

// ---- 1. EVERY DECLARED COUPLING IS AUDITED, NOT A HAND-PICKED THREE ---------------------------------------------
{
    ok("!! all twelve declared couplings are found and classified",
        audit.length === declaredCouplings(".").length && audit.length >= 12,
        `${audit.length} couplings derived from crossDevice-selfcheck. The first version of this file carried a ` +
        "HAND-WRITTEN list of three -- a quarter of what was declared, and a register that would drift the moment " +
        "someone added a coupling without updating it. That is the exact failure this lab hunts elsewhere, " +
        "reproduced inside the tool built to find it");

    ok("...and each carries its own label rather than the block's first",
        new Set(audit.map((a) => a.label)).size === audit.length,
        "a block containing two crossCheck calls was reporting the same quantity twice, which made two distinct " +
        "couplings look like duplicates. The label is now read from the call, not the block");

    const t = {};
    for (const a of audit) t[a.verdict] = (t[a.verdict] || 0) + 1;
    ok("!! and the verdicts are mixed, so the classifier discriminates",
        Object.keys(t).length >= 3,
        JSON.stringify(t) + ". Same question of each, several answers -- a classifier returning one verdict for " +
        "everything would be agreeing with whatever it was shown");
}

// ---- 2. IDENTITY: the sound-speed coupling is enforced, not corroborated ---------------------------------------------
{
    const r = by("sound speed in water");
    ok("!! soundSpeed CALLING vP is an identity, not corroboration",
        r && r.verdict === "identity",
        "the acoustic fluid speed and the seismic P speed agree bit-for-bit because one invokes the other. " +
        "Valuable -- two fields cannot drift apart -- but it is ONE computation, and counting it as two " +
        "independent confirmations of 1483 m/s would double-count a single line of algebra");
}

// ---- 3. INDEPENDENT: Fresnel against the seismic reflection ------------------------------------------------------------
{
    ok("!! most declared couplings survive the audit as independent",
        audit.filter((a) => a.verdict === "independent").length >= 6,
        `${audit.filter((a) => a.verdict === "independent").length} of ${audit.length} share no dependency, so ` +
        "their agreement is real corroboration. The audit demotes rather than condemns -- the majority of what " +
        "was claimed holds up");
}

// ---- 4. INCIDENTAL: the case my own wording got wrong --------------------------------------------------------------------
{
    const r = by("radial period");
    ok("!! transfer and clocks share a FILE but not a FUNCTION",
        r && r.verdict === "incidental",
        "both import probe.js -- transfer takes circularL and iscoRadius, clocks takes timeDilation. I had " +
        "declared that coupling as having 'no shared line', which was imprecise: there IS a shared file. The " +
        "claim survives because no VALUE passes between the routes");

    const sh = by("escape cone");
    ok("!! *** and the shadow / escape-cone coupling is DEMOTED to identity ***",
        sh && sh.verdict === "identity",
        "both sides derive from criticalImpact in geodesic.js -- lensBind uses it six times, emit.mjs three. " +
        "The agreement to 2e-15 is real and the physics reading still holds, but if b_crit = 3 sqrt(3) M were " +
        "wrong BOTH would be wrong together and the check would still pass. It was declared as a discovery and " +
        "is better described as one constant read from two directions");
}

// ---- 5. THE MECHANISM, CHECKED DIRECTLY ---------------------------------------------------------------------------------
{
    ok("named imports are read per module and per function",
        (() => {
            const imp = namedImports("physics/blackhole/transfer.mjs");
            return [...imp.values()].flat().includes("circularL");
        })(),
        "the classifier needs function names, not just file names -- module-level sharing is too coarse and " +
        "would have condemned the incidental case above");

    ok("...and dependencies are followed transitively",
        transitiveDeps("physics/acoustics/soundSpeed.mjs").size > 1,
        "a coupling can share an input two levels down without either module naming it directly, so the walk " +
        "follows the graph rather than stopping at the first hop");
}

// ---- 6. WHAT THIS DOES NOT DO -------------------------------------------------------------------------------------------
{
    ok("!! this is a STATIC check and says so",
        audit.length >= 12,
        "it reads imports. Two routes could share a data file, a cached table or a constant copied by hand into " +
        "both, and none of that appears in the import graph. INDEPENDENT here means 'no shared code path found', " +
        "which is weaker than 'provably independent' -- the EM planted error was caught by a numeric relation, " +
        "not by this, and both kinds of check are needed");
}

// ---- *** UNKNOWN IS NOT INDEPENDENT (v3722) *** -----------------------------------------------------------------
// A file that is not on disk used to come back "independent" -- THE STRONGEST VERDICT THIS FUNCTION GIVES --
// because transitiveDeps returns early on a missing path, so an absent module contributes zero imports, shares
// nothing with anything, and falls through to "no shared dependency". ABSENCE OF EVIDENCE WAS RETURNED AS
// EVIDENCE OF INDEPENDENCE.
// IT IS REACHABLE: composeBind builds paths as `tools/roundhouse/${dev}Bind.mjs` and `lbm` HAS NO BIND FILE --
// its device is a local function inside devices.mjs (v3719 found that same absence in the instrument census).
// WHEN THIS GOES RED the fix is to make the coupling decidable -- give the device a real bind file -- NEVER to
// let an unreadable side fall back to a verdict.
{
    const here = path.dirname(fileURLToPath(import.meta.url));
    const real = path.join(here, "couplingIndependence.mjs");
    const ghost = path.join(here, "definitelyNotAFile_v3722.mjs");

    const r = classifyCoupling(ghost, real);
    ok("!! an unreadable side yields 'unreadable', NOT 'independent'",
        r.verdict === "unreadable" && Array.isArray(r.missing) && r.missing.length === 1,
        `verdict "${r.verdict}", missing ${JSON.stringify(r.missing)} -- an absent module shares nothing with anything, which is not the same as sharing nothing`);

    // THE CHECK MUST SURVIVE ITS OWN FAILURE: under the plant that reverts this fix the verdict has no
    // `missing` at all, and an unguarded [0] CRASHED THE GATE at the moment the check correctly failed --
    // the v3712 shape, third time. A MESSAGE THAT CANNOT BE PRINTED WHEN THE THING GOES WRONG IS NOT A MESSAGE.
    const other = classifyCoupling(real, ghost);
    const nameOf = (x) => (x && Array.isArray(x.missing) && x.missing.length ? x.missing[0] : "(no missing field)");
    ok("!! ...and it names WHICH side could not be read, in either argument position",
        nameOf(other) === path.basename(ghost) && nameOf(r) === path.basename(ghost),
        "a refusal that does not say what is missing sends the next person looking at the wrong file");

    ok("two files that DO exist are still judged normally",
        ["identity", "incidental", "independent"].includes(classifyCoupling(real, real === real ? real : real).verdict));
}

console.log();
console.log(`  coupling audit: ${audit.filter((a) => a.verdict === "independent").length} independent, ` +
            `${audit.filter((a) => a.verdict === "incidental").length} incidental, ` +
            `${audit.filter((a) => a.verdict === "identity").length} identity`);
if (fails) { console.log("couplingIndependence-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("couplingIndependence-selfcheck: all checks pass");
