// tools/roundhouse/assumptions-selfcheck.mjs
//
// Run: node tools/roundhouse/assumptions-selfcheck.mjs   (~10s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3100 -- AN ASSUMPTION THAT LIVES IN A COMMENT DOES NOT TRAVEL WITH THE NUMBER.
//
// Borrowed from dicroce/wyrm_math, web-verified this session: a symbolic algebra engine where "legal moves are
// possible, illegal moves are impossible", equations are never VALIDATED but only TRANSFORMED by rewrite rules,
// and -- the part worth stealing -- moves valid only UNDER A CONDITION are not forbidden. Dividing by b requires
// b != 0, so that condition becomes a FIRST-CLASS VISIBLE ASSUMPTION THAT TRAVELS WITH THE EQUATION.
//
// TAKEN AS AN IDEA, NOT AS A PACKAGE, which is the same call v3089 made on iroh. wyrm_math is TypeScript with a
// build step and an npm install; SweK boots with neither. What transfers costs nothing.
//
// THE GAP IT FILLS, and every example is from the last twenty rounds of THIS tree. lens.deflect's answer key is
// valid only in the weak regime -- at the DEVICE DEFAULT the ray is in the mid band and v3081 lost an hour to
// it. lens's nuisance lambda must be non-dyadic or an exactly-true invariance reports SUSPECT. dphi must sit
// above the round-off crossover or a convergence verdict is decided by sampling luck. kerr's schwarz* errors are
// valid only at a = 0. EVERY ONE OF THOSE CONDITIONS CURRENTLY LIVES IN A COMMENT, and a caller reading a number
// out of a JSON payload gets none of them. The number looks unconditional and is not.

import { assume, withAssumptions, LAB_ASSUMPTIONS, assumptionLines } from "./assumptions.mjs";
import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. AN ASSUMPTION MUST BE CHECKABLE ----------------------------------------------------------------------
// This is the whole difference between this and the comments it replaces. Refused at DECLARATION, not at
// evaluation: an unevaluatable assumption would sit in the list looking like protection and never fail.
{
    let threw = false;
    try { assume({ id: "prose-only", why: "a sentence describing a condition, with no way to test it at all" }); }
    catch { threw = true; }
    ok("!! prose with no predicate is REFUSED as an assumption",
        threw,
        "a condition that cannot be evaluated cannot be found false, and a control that cannot fail is " +
        "decoration -- this module exists to stop exactly that, so it must not accept one itself");

    let threwWhy = false;
    try { assume({ id: "no-reason", holds: () => true, why: "short" }); } catch { threwWhy = true; }
    ok("...and a predicate with no WHY is refused too",
        threwWhy,
        "the reason is what a reader ACTS on. 'weak-field failed' without 'the 4M/b key only applies where " +
        "b/bCrit > 10' is a flag, not a finding");
}

// ---- 2. THE REAL CASES, AGAINST THE REAL DEVICE -----------------------------------------------------------------
{
    const dev = await getDevice("lens");
    // v3131 -- WAS dphi: 2e-4. THE CROSSOVER WAS MEASURED AT 8e-4, four times higher, so the point this file
    // called "sound" was past it. The predicate said 2e-4, its own reason said 4e-4, and the instrument says
    // 8e-4 -- three numbers, none of which had been compared to either of the others.
    const sound = { M: 1, b: 60, dphi: 8e-4 };
    const midBand = { M: 1, b: 10, dphi: 2e-4 };          // the DEVICE DEFAULT -- v3081's lost hour
    const pastCrossover = { M: 1, b: 60, dphi: 1e-5 };     // v3082's finding -- still past it, by even more now
    const wasCalledSound = { M: 1, b: 60, dphi: 2e-4 };    // v3131: what this file used to assert was sound

    const at = async (cfg) => {
        const o = await dev.build({ mode: "deflect", config: cfg });
        return withAssumptions(o.deflectionMeasured, LAB_ASSUMPTIONS["lens.deflect"], cfg);
    };

    const a = await at(sound);
    ok("the declared operating point is SOUND", a.sound && a.assumptions.length === 2, a.note);

    const b = await at(midBand);
    ok("!! the DEVICE DEFAULT is not sound, and the number still comes back",
        b.sound === false && b.unmet.includes("weak-field") && Number.isFinite(b.value),
        "b = 10 puts b/bCrit at 1.92, so the 4M/b key does not apply -- and the value is still returned, because " +
        "throwing would lose the number and the reason together. This is the configuration v3081 spent an hour on");

    const c = await at(pastCrossover);
    ok("!! refining PAST the round-off crossover is caught",
        c.sound === false && c.unmet.includes("above-roundoff-crossover"),
        "dphi = 1e-5 is below where RK4 truncation stops dominating, so refining makes the answer worse. v3082 " +
        "measured that and wrote it in a comment; now it is attached to the value");

    console.log(assumptionLines(c).join("\n"));
}

// ---- 3. THE CONDITIONS SURVIVE A SERIALISATION BOUNDARY ----------------------------------------------------------
// This is the point. A number gets separated from its caveats exactly when it crosses into JSON and out to a
// page, a peer, or a research agent reading /corpus.txt.
{
    const r = withAssumptions(1.23, LAB_ASSUMPTIONS["lens.deflect"], { M: 1, b: 10, dphi: 2e-4 });
    const back = JSON.parse(JSON.stringify(r));
    ok("!! sound, unmet and the human note all survive JSON",
        back.sound === false && back.unmet.includes("weak-field") && back.note.length > 40 && back.value === 1.23,
        "the disclaimer cannot be separated from the figure by a copy-paste, which is the only place this kind " +
        "of caveat has ever been lost");

    ok("...and the note is a sentence, not a code",
        /the 4M\/b answer key/.test(back.note),
        "a structured field nobody prints is a field nobody sees, so the reason is in the line a human reads");
}

// ---- 4. THE DYADIC KNOB, WHICH IS A CONDITION ON A SWEEP RATHER THAN ON A VALUE -------------------------------------
{
    const good = withAssumptions(null, LAB_ASSUMPTIONS["lens.scale"], { values: [1, 3, 7.3, 0.37] });
    const bad = withAssumptions(null, LAB_ASSUMPTIONS["lens.scale"], { values: [1, 2, 4, 8] });
    ok("!! the shipped non-dyadic knob values are sound",
        good.sound, "1, 3, 7.3, 0.37 -- no two related by a power of two");
    ok("!! and the natural choice 1, 2, 4, 8 is caught",
        bad.sound === false && bad.unmet.includes("non-dyadic"),
        "powers of two are EXACT in IEEE-754, so those four return bit-identical values and the sweep reports " +
        "SUSPECT on an invariance that is exactly true -- indistinguishable from a knob that was never wired");
}

// ---- 5. WHAT THIS IS NOT ---------------------------------------------------------------------------------------------
{
    ok("an unmet assumption does NOT throw",
        (() => { try { withAssumptions(1, LAB_ASSUMPTIONS["kerr.limit"], { a: 0.6 }); return true; } catch { return false; } })(),
        "sometimes you genuinely want to look at a value outside its regime -- what you must not be able to do " +
        "is FORGET that you are. Refusing to return it would lose the number and the reason together");

    ok("a predicate that throws is reported as a FAILED assumption, not a crash",
        (() => {
            const boom = assume({ id: "explodes", holds: () => { throw new Error("bad ctx"); },
                why: "a predicate that throws must not take the whole measurement down with it" });
            const r = withAssumptions(5, [boom], {});
            return r.sound === false && r.assumptions[0].error === "bad ctx";
        })(),
        "the assumption is recorded as failed WITH the thrown message, so a broken predicate is distinguishable " +
        "from a genuinely unmet condition -- two different fixes");

    console.log("  NOTE   three devices carry assumptions so far (lens.deflect, lens.scale, kerr.limit). The other");
    console.log("         24 do not, and a device with no declared assumptions is NOT a device with none -- it is");
    console.log("         one nobody has written them down for. Same distinction as 'audited' versus 'never asked'.");
}

console.log();
if (fails) { console.log("assumptions-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("assumptions-selfcheck: all checks pass");
