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

console.log(fails ? "\nbackendConformance-selfcheck: " + fails + " FAILED" : "\nbackendConformance-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
