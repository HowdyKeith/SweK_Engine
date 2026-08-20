// WebGLEngine/physics/blackhole/mission-selfcheck.mjs -- v2877
//
// Run: node physics/blackhole/mission-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// Grades the mission layer: something proposes an objective, the controller attempts it, THE MEASUREMENT DECIDES.
//
// THE PROPOSER IS NOT THE AUTHORITY, and that is the whole design. This file contains no model calls, and neither
// does mission.js -- a proposer can be a model in the roundhouse, a script, or a person, and the adjudicator does
// not care which. The roundhouse already learned that the adult in the room is the verifier rather than a bigger
// model; this is that written down as an interface.
//
// THE CHECKS THAT MATTER ARE THE ONES THAT SAY NO. A planner that could only report ACHIEVED would be a yes-man
// with a physics engine attached, so the gate pins all four verdicts -- including REFUTED, which is the subtle
// one: "a stable circular orbit at 4M" is a coherent English sentence describing something that cannot happen,
// and the controller finds the RIGHT angular momentum for it before the stability test refuses it.
import { runMission, adjudicate, findLowestStable, VERDICT } from "./mission.js";
import { circularL, iscoRadius, photonSphere, horizon } from "./probe.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const M = 1;
const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- 1. THE ADJUDICATOR CONTAINS NO PROPOSER ---------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(HERE, "mission.js"), "utf8");
    const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    ok("!! mission.js makes no model calls", !/ollama|gemini|anthropic|fetch\(/i.test(code),
       "the proposer can be anything; the adjudicator must not care which, or it becomes a participant");
    ok("...and takes the objective as plain data", /objective\.type/.test(code),
       "a plain object a model, a script or a person can all produce");
}

// ---- 2. ACHIEVED, and confirmed by an exact value used only afterwards -----------------------------------------------
{
    for (const r of [20, 10, 8, 6.5]) {
        const m = runMission(M, { type: "circular", r });
        ok("a stable circular orbit at " + r + "M is ACHIEVED", m.verdict === VERDICT.ACHIEVED,
           "L " + m.L.toPrecision(10) + ", " + m.trials + " trials");
        ok("...and matches the exact L", Math.abs(m.L - circularL(M, r)) < 1e-9, "err " + Math.abs(m.L - circularL(M, r)).toExponential(2));
    }
}

// ---- 3. REFUTED: the coherent request that physics declines ------------------------------------------------------------
{
    for (const r of [5, 4, 3.5]) {
        const m = runMission(M, { type: "circular", r });
        ok("!! a stable circular orbit at " + r + "M is REFUTED", m.verdict === VERDICT.REFUTED,
           "a perfectly sensible sentence describing something that cannot happen");
        ok("...and the L it found was still CORRECT", Math.abs(m.L - circularL(M, r)) < 1e-9,
           "the number is right and the plan is useless -- that is what makes it dangerous");
        ok("...with the reason stated", /ISCO|nudge/.test((m.why || "") + (m.note || "")));
    }
}

// ---- 4. IMPOSSIBLE and MALFORMED are different things, and both are said out loud ------------------------------------------
{
    const imp = runMission(M, { type: "circular", r: 2.5 });
    ok("!! inside the photon sphere is IMPOSSIBLE, not merely refuted", imp.verdict === VERDICT.IMPOSSIBLE,
       "no circular orbit exists for matter there at any speed");
    ok("...and no L is returned", imp.L === undefined, "a best-effort number for an orbit that cannot exist is the failure this design avoids");
    ok("a survey inside the horizon is IMPOSSIBLE", runMission(M, { type: "survey", r: 1.9 }).verdict === VERDICT.IMPOSSIBLE);
    ok("an unknown objective is MALFORMED, not silently ignored", runMission(M, { type: "orbitTheMoon" }).verdict === VERDICT.MALFORMED);
    ok("...and so is a missing type", runMission(M, {}).verdict === VERDICT.MALFORMED && runMission(M, null).verdict === VERDICT.MALFORMED);
    ok("!! MALFORMED and IMPOSSIBLE are NOT the same verdict", runMission(M, { type: "nope" }).verdict !== runMission(M, { type: "circular", r: 2.5 }).verdict,
       "one is a bad question, the other is a good question with the answer no -- conflating them would hide which");
}

// ---- 5. THE HEADLINE: the ISCO rediscovered by experiment, WITH its bias stated -------------------------------------------
{
    const f = findLowestStable(M);
    ok("!! the innermost holdable orbit is found by EXPERIMENT", Number.isFinite(f.r) && Math.abs(f.r - iscoRadius(M)) / iscoRadius(M) < 0.02,
       "r = " + f.r.toPrecision(9) + "M vs exactly 6M, from " + f.trials + " steer-and-nudge trials");
    ok("!! ...and it lands slightly INSIDE, always", f.r < iscoRadius(M),
       "a systematic deficit of about 0.65%, not scatter -- the instability growth rate VANISHES at the boundary, so a finite arc cannot see a runaway that has barely begun");
    ok("...the bias is recorded rather than tuned away", /critical slowing down|finite nudge|FROM BELOW/i.test(f.biasNote || ""),
       "the same call the Ising instrument made about locating T_c on a finite lattice");
    ok("...and 6M appears nowhere in the search", (() => {
        const src = fs.readFileSync(path.join(HERE, "mission.js"), "utf8").replace(/^\s*\/\/.*$/gm, "");
        const fn = src.slice(src.indexOf("export function findLowestStable"), src.indexOf("export function adjudicate"));
        return !/6 \* M|iscoRadius/.test(fn);
    })(), "it is used to grade, never to search");
}

// ---- 6. A BATCH: the interesting statistic is how many were refused BY MEASUREMENT --------------------------------------
{
    const a = adjudicate(M, [
        { type: "circular", r: 20 }, { type: "circular", r: 8 }, { type: "circular", r: 4 },
        { type: "circular", r: 2.5 }, { type: "survey", r: 10 }, { type: "orbitTheMoon" },
    ]);
    ok("a batch is adjudicated one by one", a.total === 6 && a.results.length === 6);
    ok("!! and NOT everything succeeds", a.tally.achieved < a.total,
       JSON.stringify(a.tally) + " -- a planner that only ever reported ACHIEVED would be a yes-man with a physics engine attached");
    ok("all four verdicts are reachable", a.tally.achieved > 0 && a.tally.refuted > 0 && a.tally.impossible > 0 && a.tally.malformed > 0,
       "each one is a different thing the physics can say");
}

// ---- 7. survey reports observables rather than steering ------------------------------------------------------------------
{
    const s = runMission(M, { type: "survey", r: 10 });
    ok("a survey at 10M reports its observables", s.verdict === VERDICT.ACHIEVED && s.report && Number.isFinite(s.report.redshift));
    ok("...including whether a stable orbit is available there", s.report.stableOrbitAvailable === true);
    ok("...and at 4M it says a stable orbit is NOT", runMission(M, { type: "survey", r: 4 }).report.stableOrbitAvailable === false);
}

// ---- 8. determinism ---------------------------------------------------------------------------------------------------------
{
    const a = runMission(M, { type: "circular", r: 12 }), b = runMission(M, { type: "circular", r: 12 });
    ok("adjudication is deterministic", a.L === b.L && a.verdict === b.verdict);
}

console.log(fails ? "\nmission-selfcheck: " + fails + " FAILED" : "\nmission-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
