// WebGLEngine/physics/vibrationKnob-selfcheck.mjs -- v3596
// ---------------------------------------------------------------------------------------------------------------
// THE HEADLINE KEY PASSES A MODE THAT DOES NOT EXIST, AND THAT IS WHAT THIS GATE IS FOR.
//
// The frequency key is a good one: recovered from the integrated chain, compared against a closed form the
// integrator never sees, monotone in j exactly as velocity-Verlet's O(dt^2 omega^2) period error predicts.
// *** AND ON A TWELVE-MASS CHAIN IT PASSES j = 14, j = 18, j = 24 AND j = 25 -- every alias, cleanly, with
// the fake modes scoring BETTER the higher they go. *** Both routes alias the same way, so their agreement
// carries no information about whether the mode is real.
//
// SO SECTION 3 IS THE ROUND: it drives the frequency key ALONE against the full adjudicator and shows the
// disagreement, rather than asserting in a comment that one is weaker. A blindness nobody has watched happen
// is a story; this one is a number.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { makeChain, setMode, modeFreq } from "./vibrations.js";
import { adjudicate, score, propose, recoverFreq, CHAIN_N, DT, EXCITED_FLOOR, AMP, VERLET_HEADROOM }
    from "./vibrationKnob.mjs";
import { registerAll } from "./knobRegistry.mjs";
import { resetRegistry, listProposers, getProposer, runProposer } from "./proposers.mjs";

let pass = 0, fail = 0;
const ok = (n, c, note = "") => { if (c) { pass++; console.log("  ok   " + n + (note ? "  -- " + note : "")); }
                                  else { fail++; console.log("  FAIL " + n + (note ? "  -- " + note : "")); } };
const section = (n) => console.log("\n== " + n + " ==");

// ---------------------------------------------------------------------------------------------------------------
section("1. THE KEY IS TWO ROUTES, NOT A MIRROR");
{
    // recoverFreq must never consult modeFreq. Driven rather than grepped: the recovered value is compared
    // against the formula HERE, in the gate, and if the module were reading it the agreement would be exact
    // rather than carrying the integrator's own residual.
    const s = makeChain({ N: CHAIN_N });
    const rows = [1, 2, 3, 4, 6, 8, 10, 12].map((j) => {
        const r = recoverFreq(j);
        const c = modeFreq(s, j);
        return { j, omega: r.omega, closed: c, rel: Math.abs(r.omega - c) / c, spp: r.stepsPerPeriod };
    });
    ok("every real mode is recovered from the trajectory", rows.every((r) => r.omega > 0));
    ok("*** and NOT exactly -- the residual is the integrator's, which is what proves it is a second route ***",
       rows.every((r) => r.rel > 0), "worst " + Math.max(...rows.map((r) => r.rel)).toExponential(2));
    // THE SHAPE IS THE EVIDENCE, NOT THE SIZE: velocity-Verlet's period error goes as (omega*dt)^2, so the
    // error must RISE with j. A flat sweep would mean the recovery is reading the formula.
    ok("relErr rises monotonically with j, as (omega*dt)^2 predicts",
       rows.every((r, i) => i === 0 || r.rel > rows[i - 1].rel),
       rows.map((r) => r.rel.toExponential(1)).join(" "));
    const ratios = rows.map((r) => r.rel / Math.pow(r.closed * DT, 2));
    ok("...and relErr/(omega*dt)^2 stays bounded, so the tolerance's SHAPE is right",
       Math.max(...ratios) < VERLET_HEADROOM, "worst ratio " + Math.max(...ratios).toFixed(4) +
       " against headroom " + VERLET_HEADROOM);
    // THE COST CLAIM IS MEASURED, because the score rests on it.
    const cheap = rows[rows.length - 1].spp, dear = rows[0].spp;
    ok("a high mode really is cheaper to measure", cheap < dear / 4,
       cheap.toFixed(0) + " steps/period at j=12 against " + dear.toFixed(0) + " at j=1, " +
       (dear / cheap).toFixed(1) + "x");
}

// ---------------------------------------------------------------------------------------------------------------
section("2. THE MODE THAT DOES NOT EXIST STILL PRODUCES A NUMBER");
{
    const dead = recoverFreq(CHAIN_N + 1);
    ok("j = N+1 writes machine zero at every mass", dead.initAmp < EXCITED_FLOOR,
       "initAmp " + dead.initAmp.toExponential(2) + " against a requested " + AMP);
    // *** THE POINT: IT DOES NOT REFUSE ON ITS OWN. *** The crossing detector finds crossings of float dust
    // and reports a frequency, so a check reading only the frequency gets an answer for a dead chain.
    ok("*** and the crossing detector STILL answers, on float dust ***",
       dead.crossings > 2 && dead.omega > 0,
       dead.crossings + " crossings, omega " + dead.omega.toFixed(6) +
       " against a closed form of " + modeFreq(makeChain({ N: CHAIN_N }), CHAIN_N + 1).toFixed(6));
    const v = adjudicate(CHAIN_N + 1);
    ok("the adjudicator refuses it for the RIGHT reason", !v.pass && /DOES NOT EXIST/.test(v.evidence.reason));
    ok("...and names the amplitude rather than the frequency", v.evidence.initAmp !== undefined &&
       v.evidence.omega === undefined);
}

// ---------------------------------------------------------------------------------------------------------------
section("3. *** THE FREQUENCY KEY ALONE CERTIFIES EVERY ALIAS *** (driven, not asserted)");
{
    // The frequency key, reconstructed here EXACTLY as the adjudicator's third part, run WITHOUT the first
    // two. This is the check somebody would have written if they had stopped at the closed form.
    const freqKeyOnly = (j) => {
        const r = recoverFreq(j);
        if (r.omega === null) return { pass: false };
        const c = modeFreq(makeChain({ N: CHAIN_N }), j);
        const rel = Math.abs(r.omega - c) / c;
        return { pass: rel <= VERLET_HEADROOM * Math.pow(c * DT, 2), rel, omega: r.omega };
    };
    const ALIASES = [[14, 12], [18, 8], [24, 2], [25, 1]];
    const certified = [];
    for (const [fake, real] of ALIASES) {
        const weak = freqKeyOnly(fake), full = adjudicate(fake), honest = freqKeyOnly(real);
        if (weak.pass) certified.push(fake + "->" + real + " (" + weak.rel.toExponential(2) + ")");
        ok("j=" + fake + ": the full adjudicator refuses it as an alias of " + real,
           !full.pass && full.evidence.aliasOf === real);
        ok("j=" + fake + ": ...and its recovered frequency IS mode " + real + "'s, to 1e-9",
           Math.abs(weak.omega - honest.omega) / honest.omega < 1e-9);
    }
    ok("*** the frequency key alone PASSES all four fakes ***", certified.length === ALIASES.length,
       certified.join(", "));
    // AND THE SHARP HALF: the fakes are not merely accepted, they are accepted BETTER than honest modes,
    // because a low-frequency alias carries a smaller integrator residual. A check ranking by relErr would
    // put the fake modes at the top.
    const fakeBest = Math.min(...ALIASES.map(([f]) => freqKeyOnly(f).rel));
    const realWorst = Math.max(...[1, 4, 8, 12].map((j) => freqKeyOnly(j).rel));
    ok("...and the best fake scores BETTER than the worst honest mode", fakeBest < realWorst,
       "best fake " + fakeBest.toExponential(2) + " against worst honest " + realWorst.toExponential(2));
    // The alias test must not be vacuous the other way: every real mode survives it.
    ok("no REAL mode is mistaken for an alias",
       [1, 2, 3, 4, 6, 8, 10, 11, 12].every((j) => adjudicate(j).pass),
       "all twelve-chain modes 1..12 pass");
}

// ---------------------------------------------------------------------------------------------------------------
section("4. THE SCORE IS A REWARD AND IT IS INDEPENDENT OF THE VERDICT");
{
    const cands = propose({});
    ok("propose offers values its own adjudicator REJECTS", cands.some((j) => !adjudicate(j).pass),
       "candidates " + cands.join(", "));
    ok("score is higher for a higher mode (cheaper to measure)", score(12) > score(1));
    // INDEPENDENCE, DRIVEN WITH A SPY on the live registry entry -- v3594's rule, and the reason it is a spy
    // and not a source scan is that an indirect call through a helper would pass a grep.
    resetRegistry(); registerAll();
    const p = getProposer("vib-mode");
    const real = p.adjudicate; let fired = 0;
    p.adjudicate = (...a) => { fired++; return real(...a); };
    p.score(8, {});
    p.adjudicate = real;
    ok("*** score does NOT consult its own adjudicator ***", fired === 0, "spy fired " + fired + " time(s)");
    ok("score is not the adjudicator's relErr under another name",
       score(8) !== adjudicate(8).evidence.relErr);
}

// ---------------------------------------------------------------------------------------------------------------
section("5. THE LOOP, AND THE SCENE IS REGISTERED");
{
    resetRegistry(); registerAll();
    ok("vib-mode is registered against the vibrations instrument",
       listProposers().some((x) => x.id === "vib-mode" && x.instrument === "vibrations"));
    const r = runProposer("vib-mode");
    // *** THE GREEDY PICK IS THE MODE THAT DOES NOT EXIST, WHICH IS THE TENSION WORKING: *** the score wants
    // the highest frequency and the highest frequency on this chain belongs to j = N+1, which never moves.
    ok("the greedy pick is refused", r.verdict.pass === false, "greedy j=" + r.best);
    ok("...and v3594's loop still names a survivor", r.accepted !== null,
       "accepted j=" + r.accepted + " at rank " + r.acceptedRank + " of " + r.tried);
    ok("the accepted mode is a real one", r.accepted >= 1 && r.accepted <= CHAIN_N);
    ok("it stopped early rather than sweeping", r.adjudicated < r.tried,
       r.adjudicated + " adjudications of " + r.tried + " candidates");
}

console.log("\n" + (fail ? "FAILED " + fail + " of " + (pass + fail) : "ALL " + pass + " CHECKS PASS"));
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(fail ? 1 : 0);
