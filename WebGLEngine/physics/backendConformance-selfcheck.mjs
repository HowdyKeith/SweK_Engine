// WebGLEngine/physics/backendConformance-selfcheck.mjs — v2553
//
// Run: node physics/backendConformance-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// This does not test the physics. IT TESTS THE TEST.
//
// backendConformance.mjs answers "is this thing a SweK physics backend?" -- and a checker that passes everything
// is a rubber stamp. So this hands it SIX BROKEN BACKENDS, each of which ANSWERS ALL TEN CALLS and would
// substitute silently in a running engine, and requires it to catch every one.
//
// Two of these were found BY the sabotage, not by design:
//
//   - The checker CRASHED on the 3-floats-per-body fake: tr[7] was undefined and .toFixed() threw. A conformance
//     test that dies on a non-conforming backend cannot do the one job it has.
//   - "Silently drops z" PASSED, because every velocity test pushed along x only. AN AXIS YOU NEVER TEST IS AN
//     AXIS A BACKEND IS FREE TO IGNORE. It pushes diagonally now.
//
// That is why the fakes live in the gate rather than in a scratch file: the blind spots they close would reopen
// silently the moment someone simplified a check.
import { conform, CONTRACT, FLOATS_PER_BODY } from "./backendConformance.mjs";
import { planarFallbackWorld } from "./planarFallbackWorld.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// ---- 1. the real world conforms -----------------------------------------------------------------------------
{
    const r = conform(planarFallbackWorld(), "planarFallbackWorld");
    ok("planarFallbackWorld conforms", r.ok, r.checks.filter((c) => !c.ok).map((c) => c.name).join("; ") || r.checks.length + " checks");
    // ...and conforming is NOT a compliment. It is a planar stand-in with no collision response worth the name.
    // Conformance means "answers the calls honestly", not "simulates well", and conflating those is how a
    // stand-in gets promoted to a backend and a cross-arch test measures the wrong thing (v2546 nearly did).
}

// ---- 2. SIX BACKENDS THAT ANSWER THE CALLS AND LIE ------------------------------------------------------------
{
    const fakes = {
        "packs 3 floats per body, not 7": () => {
            const w = planarFallbackWorld(); const o = w.readTransforms;
            w.readTransforms = () => o.call(w).filter((_, i) => i % FLOATS_PER_BODY < 3); return w;
        },
        "a RECORDING (step does nothing)": () => { const w = planarFallbackWorld(); w.step = () => {}; return w; },
        "silently drops the z component": () => {
            const w = planarFallbackWorld(); const o = w.setVelocity;
            w.setVelocity = (i, v) => o.call(w, i, [v[0], 0, 0]); return w;
        },
        "claims joints, then throws": () => {
            const w = planarFallbackWorld(); w.supportsJoints = () => true;
            w.jointWeld = () => { throw new Error("nope"); }; return w;
        },
        "returns NaN": () => {
            const w = planarFallbackWorld(); const o = w.readTransforms;
            w.readTransforms = () => { const a = o.call(w); a[0] = NaN; return a; }; return w;
        },
        "half a backend (a joint call missing)": () => { const w = planarFallbackWorld(); delete w.jointRevolute; return w; },
    };
    for (const [label, mk] of Object.entries(fakes)) {
        let r = null, threw = null;
        try { r = conform(mk(), label); } catch (e) { threw = e; }
        ok("CAUGHT: " + label, !threw && r && !r.ok,
           threw ? "THE CHECKER CRASHED instead of reporting -- it must SURVIVE the thing it checks: " + String(threw.message).slice(0, 50)
                 : (r && r.ok ? "*** IT PASSED. The checker is blind here, and this backend would substitute silently. ***"
                              : "-> " + r.checks.filter((c) => !c.ok)[0].name));
    }
}

// ---- 3. the contract is named in ONE place --------------------------------------------------------------------
// If the list of calls lived in two files they would drift, and the drift would look like a passing test.
{
    // v2557: TEN became ELEVEN when dimensionality joined. This assertion failing is the gate working -- a
    // contract that grows without the test noticing is two files drifting apart, and the drift looks like a pass.
    // v2565: eleven became TWELVE when addBox joined -- and this assertion going red is how the gate proves the
    // contract and its test have not drifted apart. A contract that grows silently is two files disagreeing.
    // v2567: twelve became THIRTEEN when impulse joined. This going red on every growth is the point -- a
    // contract that grows silently is two files disagreeing, and the disagreement would look like a pass.
    ok("the contract names all thirteen calls", CONTRACT.length === 13, CONTRACT.join(" "));
    const w = planarFallbackWorld();
    ok("...and the real world has exactly those", CONTRACT.every((c) => typeof w[c] === "function"));
    ok("FLOATS_PER_BODY is 7, not 3", FLOATS_PER_BODY === 7,
       "pos xyz + quat xyzw. Guessing 3 is how v2552's paramecium started, and it read the wrong body.");
}

// ---- 4. the report NAMES the backend ---------------------------------------------------------------------------
// An unnamed backend IS the substitution problem: box3dLoader:124 notes the fallback "answers this too", so a
// report that does not say which world it judged is a report you cannot act on.
{
    const r = conform(planarFallbackWorld(), "some-name");
    ok("the report carries the backend's name", r.name === "some-name",
       "a report that will not say WHICH world it judged is the substitution problem wearing a rosette");
}

{
    // =============================================================================================================
    // v3906 -- gradedCoverage's GRADE door PROPOSED THIS MODULE FOR AN ANSWER KEY, AND THE ANSWER IS NO. This is a
    // MEASURED REFUSAL in the same sense as beam's and compose's plant refusals: the work was attempted, the
    // reason it cannot be done was found, and the reason is written here so the door's proposal does not get
    // re-attempted every time somebody reads the list.
    //
    // blobSpace and blobVitals -- the other two modules the same door proposed on the same run -- BOTH HAD KEYS
    // SITTING IN ALGEBRA. blobSpace's field is the Wyvill polynomial, so its iso-surface is r*sqrt(1 - a^(-1/3))
    // and its normal is exactly radial. blobVitals' closestPair is defined by an O(n^2) sweep and fieldPeak's true
    // value for one blob is exactly its amplitude. Both were keyed at v3906 and both keys FOUND SOMETHING.
    //
    // *** THIS MODULE HAS NO SUCH QUANTITY, BECAUSE ITS CONTENT IS A CONVENTION AND NOT A MEASUREMENT. *** CONTRACT
    // is thirteen method NAMES. There is no closed form for "the interface has thirteen calls" -- it has thirteen
    // because thirteen were chosen. An "answer key" for that would be a second list of thirteen names, compared
    // against the first, and THE SECOND COPY IS NEVER THE ONE THAT GETS UPDATED: adding a fourteenth call would
    // break a check that exists only to restate what the module already says.
    //
    // THE ONE GENUINELY EXTERNAL NUMBER HERE IS ALREADY KEYED, and it is worth naming as the boundary of the
    // refusal: FLOATS_PER_BODY is 7 because a rigid pose in 3D is 3 translations plus a 4-component quaternion.
    // THAT is forced by SE(3) rather than chosen, which is exactly why guessing 3 was a bug and not a preference,
    // and the check above already grades it against the decomposition rather than against the literal.
    // =============================================================================================================
    const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);
    report("*** GRADE DOOR: REFUSED, WITH THE REASON MEASURED RATHER THAN ASSUMED ***",
           "a conformance contract is a convention; keying it means writing it twice. The two sibling modules the " +
           "same door proposed WERE keyed at v3906 and both keys found something -- so this refusal is a finding " +
           "about THIS module, not a general objection to the door");
    report("WHAT WOULD OVERTURN THIS", "if a backend ever had to satisfy a PHYSICAL claim -- energy conserved to a " +
           "tolerance, a joint holding to a residual, a pose round-tripping through readTransforms -- that would be " +
           "keyable, and it would belong here. The thirteen calls would still not be");
    ok("FLOATS_PER_BODY is externally forced, not chosen: 3 translations + 4 quaternion components",
       FLOATS_PER_BODY === 3 + 4, `${FLOATS_PER_BODY} = 3 + 4, the dimension of a rigid pose with a unit quaternion`);
}

console.log(fails ? "\nbackendConformance-selfcheck: " + fails + " FAILED" : "\nbackendConformance-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
