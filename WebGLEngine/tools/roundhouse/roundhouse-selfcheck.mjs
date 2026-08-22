// tools/roundhouse/roundhouse-selfcheck.mjs
//
// Run: node tools/roundhouse/roundhouse-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The roundhouse held to the one property that makes it worth building: it crystallizes on the measured observable, not
// on two models agreeing. The loop is run with a mock lattice whose flow sheds only above a force threshold and a mock
// evaluator, so no real API or minutes-long sim is needed. First it must actually converge -- climb the force until the
// sim sheds and stop there. Then the decisive test: an evaluator that agrees with EVERYTHING must NOT be able to make the
// loop crystallize while the simulation says the flow is steady. The sabotage wires the exit to the evaluator's opinion
// instead of the physics verdict; the agreeable evaluator then crystallizes on a steady run, which is the echo chamber
// the whole design exists to prevent, so the gate refuses it.
import { roundhouse, build, crystallized } from "./roundhouse.mjs";
import { defaultConfig } from "./shedOnset.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// mock lattice: sheds (sustained wobble) only when the body force exceeds a threshold; steady (decaying) below it.
const G_SHED = 2e-5;
function mockMaker() {
    return (opts) => {
        const nx = opts.nx, ny = opts.ny, n = nx * ny, g = (opts.force && opts.force[0]) || 0;
        const ux = new Float64Array(n), uy = new Float64Array(n); let s = 0;
        const shed = g >= G_SHED;
        return {
            ux, uy, nx, ny, idx: (x, y) => y * nx + x,
            step() { s++; const amp = shed ? 0.04 : 0.04 * Math.exp(-s * 0.0016); const v = amp * Math.sin(s * 0.3); for (let i = 0; i < n; i++) { ux[i] = 0.08; uy[i] = v; } },
            mass() { return n; },
        };
    };
}
const smallBase = { nx: 24, ny: 14, warmupSteps: 60, windowSteps: 400, cylinder: { cx: 8, cy: 7, D: 4, offset: 0.5 }, probe: { px: 14, py: 5 } };
// a mock model caller: fixed proposals in sequence, and a supplied evaluator function
const caller = (proposals, evalFn) => { let i = 0; return async (role, payload) => role === "proposer" ? proposals[Math.min(i++, proposals.length - 1)] : evalFn(payload); };

// ---- 1. THE LOOP CONVERGES: climb the force until the sim sheds, then stop ----------------------------
{
    const proposals = [
        { mode: "single", g: 1e-5, config: smallBase, claim: { observable: "sheds", equals: true } },
        { mode: "single", g: 3e-5, config: smallBase, claim: { observable: "sheds", equals: true } },
    ];
    const res = await roundhouse({ callModel: caller(proposals, () => ({ reading: "ok" })), makeLBM: mockMaker(), question: "does it shed?", maxRounds: 4, base: smallBase });
    ok("!! the loop runs propose-build-evaluate and crystallizes when the sim meets the claim", res.crystallized === true && res.rounds === 2 && res.observable.sheds === true,
       "steady at g=1e-5, sheds at g=3e-5 -- it crystallizes on round 2, and only because the measured flow actually sheds.");
}

// ---- 2. AN AGREEABLE EVALUATOR CANNOT FORCE CRYSTALLIZATION (the anti-echo-chamber) -----------------
{
    const steadyProposals = [{ mode: "single", g: 1e-5, config: smallBase, claim: { observable: "sheds", equals: true } }];  // never sheds
    const yesMan = () => ({ reading: "looks great, ship it", done: true, agree: true });   // agrees with everything
    const res = await roundhouse({ callModel: caller(steadyProposals, yesMan), makeLBM: mockMaker(), question: "does it shed?", maxRounds: 3, base: smallBase });
    ok("!! an evaluator that agrees with everything cannot make the loop crystallize on a steady flow", res.crystallized === false,
       "the sim never sheds, so despite the evaluator saying done every round, the loop refuses to crystallize -- the exit is the physics, not the agreement.");
}

// ---- 3. CRYSTALLIZATION READS THE MEASURED NUMBER, NOTHING ELSE -------------------------------------
{
    const shedClaim = { claim: { observable: "sheds", equals: true } };
    ok("!! the crystallization test is a check on the measured observable", crystallized(shedClaim, { sheds: true }).done === true && crystallized(shedClaim, { sheds: false }).done === false,
       "same claim, opposite verdicts, decided purely by the measured sheds flag -- no opinion enters here.");
}

console.log(fails ? "\nroundhouse-selfcheck: " + fails + " FAILED" : "\nroundhouse-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
