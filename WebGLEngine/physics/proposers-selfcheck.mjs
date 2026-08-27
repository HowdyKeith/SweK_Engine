// WebGLEngine/physics/proposers-selfcheck.mjs — v3284
//
// Run: node physics/proposers-selfcheck.mjs   (~0.5s — MEASURED)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// Two independent things are on trial here.
//
// THE STRUCTURE: can a proposer grant itself more authority? Every route is tried -- a bare boolean, a forged
// verdict, a direct tier write, applying knobs the adjudicator refused -- and each must fail.
//
// THE CONTENT: registering two real instruments (the Ising sampler's temperature-ladder spacing and the
// LBM's relaxation time) and showing that in BOTH cases a degenerate reward wins on score and is REFUSED by an
// adjudicator anchored to something the proposer cannot move. The pattern generalizes because it is the same
// pattern the HMC tuner and the budget allocator already found separately.

import { registerProposer, getProposer, listProposers, grantLicence, applyKnobs, runProposer, resetRegistry, TIERS,
         setLicencePath, writeLicences, loadLicences , tierRank, licencePath } from "./proposers.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A GATE THAT WROTE TO THE REAL LICENCE FILE WOULD BE EDITING THE THING IT AUDITS. Temp file, always.
const TMP = path.join(os.tmpdir(), "swek-knob-licences-test-" + process.pid + ".json");
setLicencePath(TMP);
try { fs.unlinkSync(TMP); } catch {}
import { yangMagnetisation } from "./statmech/ising.js";
import { wolffMeasure } from "./statmech/wolff.js";
import { makeLBM, equilibrium, viscosityOf, Q } from "../simulation/lbm/lbm2d.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ================================================================================================================
// INSTRUMENT 1 — Wolff sampler: how many cluster moves of BURN-IN before recording anything.
// SCORE (cheap, optimizable): 1/warmup. Burn-in produces no samples, so a reward of "samples per unit work"
// wants it gone. This is the oldest degenerate policy in Monte Carlo and it never looks wrong from the inside:
// the chain runs, the numbers are smooth, they are simply measured before the system has forgotten where it
// started.
// ADJUDICATE (independent): from a HOT start at T = 1.8, does the estimate land on Yang's exact magnetisation?
// The proposer cannot move Yang.
//
// HONEST NOTE, because the first version of this gate was WRONG and the measurement said so: the knob first
// chosen here was moves-between-samples, on the assumption that sampling too often would correlate the
// estimates. It does not -- measured, Wolff at T = 1.8 decorrelates so fast that 60 moves per sample lands
// within 0.0027 of Yang and the "degenerate" candidate PASSED. The trap was fictional. Burn-in is the knob that
// actually breaks, and the grid below reaches far enough to break it, which the first grid did not.
// ================================================================================================================
registerProposer({
    id: "wolff-warmup", knobs: ["warmupMoves"], defaultTier: "propose",
    notes: "cluster moves of burn-in before recording samples",
    propose: () => [{ warmup: 1 }, { warmup: 50 }, { warmup: 400 }],
    score: (c) => 1 / c.warmup,                      // DEGENERATE: burn-in makes no samples, so delete it
    adjudicate: (c) => {
        const T = 1.8;
        const r = wolffMeasure({ L: 24, T, moves: 400, warmupMoves: c.warmup });
        const y = yangMagnetisation(T);
        const err = Math.abs(r.absM - y);
        return { pass: err < 0.01, evidence: { measured: r.absM, exact: y, err, warmup: c.warmup } };
    },
});

// ================================================================================================================
// INSTRUMENT 2 — LBM relaxation time. SCORE: bigger tau means a more forgiving, more stable-looking simulation,
// so a "stability" reward runs tau up. ADJUDICATE: the shear-wave decay rate must still equal the CONFIGURED
// viscosity (tau-1/2)/3 -- the same two-route agreement the consistency board uses, and the fluid's behaviour is
// not something the proposer can argue with.
// ================================================================================================================
function lbmMeasuredNu(tau) {
    const nx = 8, ny = 64, u0 = 0.02, k = 2 * Math.PI / ny;
    const sim = makeLBM({ nx, ny, tau, channel: false, periodicY: true });
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const u = u0 * Math.sin(k * y), base = sim.idx(x, y) * Q;
        for (let i = 0; i < Q; i++) sim.f[base + i] = equilibrium(i, 1, u, 0);
    }
    const amp = () => { let s = 0; for (let y = 0; y < ny; y++) s += sim.ux[sim.idx(nx >> 1, y)] * Math.sin(k * y); return 2 * s / ny; };
    for (let t = 0; t < 40; t++) sim.step();
    const a0 = amp();
    for (let t = 40; t < 240; t++) sim.step();
    const a1 = amp();
    return Math.log(a0 / a1) / (k * k * 200);
}
registerProposer({
    id: "lbm-tau", knobs: ["tau"], defaultTier: "propose", notes: "LBM relaxation time",
    // MEASURED, and the reason this grid reaches to 10: the shear-decay adjudicator is happy across a broad
    // middle (0.55 -> 2.5 all within 1.3%) and fails at BOTH ends -- 11.4% at tau = 0.505, 7.2% at tau = 5,
    // 34.5% at tau = 10. A grid stopping at 2.5 would have let the degenerate reward win AND pass, which is
    // exactly what the first version of this gate did.
    propose: () => [{ tau: 0.8 }, { tau: 2.5 }, { tau: 10 }],
    score: (c) => c.tau,                             // DEGENERATE: "more relaxation is more stable"
    adjudicate: (c) => {
        const nominal = viscosityOf(c.tau), measured = lbmMeasuredNu(c.tau);
        const rel = Math.abs(measured - nominal) / nominal;
        return { pass: rel < 0.05, evidence: { tau: c.tau, nominal, measured, rel } };
    },
});

// ---- 1. THE INTERFACE IS UNIFORM ---------------------------------------------------------------------------------
{
    const l = listProposers();
    ok("both instruments expose the same propose/score/adjudicate shape through one registry",
       l.length === 2 && l.every((p) => p.knobs.length >= 1 && TIERS.includes(p.tier)),
       l.map((p) => p.id + " [" + p.tier + "] knobs: " + p.knobs.join(",")).join(" · "));
    let threw = false;
    try { registerProposer({ id: "no-verdict", knobs: ["x"], propose: () => [], score: () => 1 }); } catch { threw = true; }
    ok("!! an instrument with NO independent adjudicator cannot be registered at all",
       threw, "an untunable-because-ungradeable device is a programming error, not a warning");
}

// ---- 2. THE RATCHET CANNOT BE SELF-RAISED --------------------------------------------------------------------------
{
    const bare = grantLicence("wolff-warmup", "adopt", { pass: true });
    ok("!! a bare {pass:true} does NOT buy a tier raise (evidence required, not a boolean)",
       !bare.ok && getProposer("wolff-warmup").tier === "propose", bare.reason);
    const none = grantLicence("wolff-warmup", "adopt", null);
    ok("!! ...and neither does no verdict at all", !none.ok && getProposer("wolff-warmup").tier === "propose");
    // a real, passing adjudication does buy it
    const good = getProposer("wolff-warmup").adjudicate({ warmup: 400 });
    const granted = grantLicence("wolff-warmup", "adopt", good);
    ok("!! a PASSING adjudication with evidence does raise the tier (the ratchet turns, it is not welded)",
       granted.ok && getProposer("wolff-warmup").tier === "adopt",
       "evidence: measured " + good.evidence.measured.toFixed(4) + " vs Yang " + good.evidence.exact.toFixed(4));
    // and lowering is always allowed, in either direction of caution
    grantLicence("wolff-warmup", "propose", null);
    ok("...and dropping back down needs no permission at all (caution is always free)",
       getProposer("wolff-warmup").tier === "propose");
}

// ---- 3. THE DEGENERATE REWARD WINS ON SCORE AND IS REFUSED ---------------------------------------------------------
{
    const r = runProposer("wolff-warmup");
    ok("!! WOLFF: deleting the burn-in wins the score and the adjudicator REFUSES it",
       r.best.warmup === 1 && !r.verdict.pass,
       "best-scoring: warmup " + r.best.warmup + ", measured |M| " + r.verdict.evidence.measured.toFixed(4) +
       " vs Yang " + r.verdict.evidence.exact.toFixed(4) + " (err " + r.verdict.evidence.err.toFixed(4) +
       ") — the chain ran, the numbers were smooth, and they were read before the system forgot its hot start");
    const honest = getProposer("wolff-warmup").adjudicate({ warmup: 400 });
    ok("...while the candidate the score RANKED LAST passes (the score was not noisy, it was pointed the wrong way)",
       honest.pass, "warmup 400: |M| " + honest.evidence.measured.toFixed(4) + " vs " + honest.evidence.exact.toFixed(4));

    const rl = runProposer("lbm-tau");
    ok("!! LBM: the 'most stable' tau wins the score and the fluid's own behaviour REFUSES it",
       rl.best.tau === 10 && !rl.verdict.pass,
       "best-scoring tau " + rl.best.tau + ": configured nu " + rl.verdict.evidence.nominal.toFixed(4) +
       " vs measured decay " + rl.verdict.evidence.measured.toFixed(4) + " (" + (rl.verdict.evidence.rel * 100).toFixed(1) +
       "% apart) — at that relaxation time the lattice no longer reproduces the viscosity it was configured with");
    const good = getProposer("lbm-tau").adjudicate({ tau: 0.8 });
    ok("...and tau = 0.8 passes the same adjudicator (the trap is not vacuous)",
       good.pass, "configured " + good.evidence.nominal.toFixed(4) + " vs measured " + good.evidence.measured.toFixed(4));
}

// ---- 4. NOTHING APPLIES WITHOUT A VERDICT ---------------------------------------------------------------------------
{
    grantLicence("wolff-warmup", "read", null);
    ok("at tier 'read' a knob cannot be applied even with a passing verdict available",
       !applyKnobs("wolff-warmup", { warmup: 400 }).applied, applyKnobs("wolff-warmup", { warmup: 400 }).reason);
    grantLicence("wolff-warmup", "propose", null);
    ok("at tier 'propose' the value is returned for a human or a gate to apply, never self-applied",
       !applyKnobs("wolff-warmup", { warmup: 400 }).applied);
    const v = getProposer("wolff-warmup").adjudicate({ warmup: 400 });
    grantLicence("wolff-warmup", "adopt", v);
    const bad = applyKnobs("wolff-warmup", { warmup: 1 });
    ok("!! even at tier 'adopt', a candidate the adjudicator refuses is NOT applied",
       !bad.applied && bad.reason === "adjudicator refused",
       "the licence buys the right to ask, never the right to be believed");
    const okApply = applyKnobs("wolff-warmup", { warmup: 400 });
    ok("...and an adjudicated-good candidate at tier 'adopt' does apply (the path is not merely closed)",
       okApply.applied);
}

// ---- 5. v3285 -- THE RATCHET SURVIVES A RESTART, AND A HAND-EDITED FILE BUYS NOTHING -----------------------------
// v3284 mirrored the update-policy tier IDEA and not its PERSISTENCE, so a tier earned by adjudicated evidence
// evaporated on process exit. A ratchet that resets every restart is a suggestion.
{
    // earn 'adopt' honestly, write it, and prove a fresh registry picks it back up
    const v = getProposer("wolff-warmup").adjudicate({ warmup: 400 });
    grantLicence("wolff-warmup", "adopt", v);
    writeLicences();
    ok("the licence file is written where it was pointed", fs.existsSync(TMP));

    // simulate a restart: wipe the registry, re-register at the DEFAULT tier, reload from disk
    const reRegister = () => registerProposer({
        id: "wolff-warmup", knobs: ["warmupMoves"], defaultTier: "propose",
        propose: () => [{ warmup: 400 }], score: (c) => 1 / c.warmup,
        adjudicate: (c) => { const r = wolffMeasure({ L: 24, T: 1.8, moves: 400, warmupMoves: c.warmup });
            const y = yangMagnetisation(1.8);
            return { pass: Math.abs(r.absM - y) < 0.01, evidence: { measured: r.absM, exact: y, warmup: c.warmup } }; },
    });
    resetRegistry(); reRegister();
    ok("after a restart the proposer starts at its REGISTERED DEFAULT, not at whatever it last held",
       getProposer("wolff-warmup").tier === "propose");
    const r1 = loadLicences();
    ok("!! ...and an evidence-backed 'adopt' is RESTORED from disk (the ratchet is durable now, not a suggestion)",
       r1.restored === 1 && getProposer("wolff-warmup").tier === "adopt",
       "restored " + r1.restored + ", tier now " + getProposer("wolff-warmup").tier);

    // THE ATTACK: hand-edit the file to claim 'adopt' with no evidence
    resetRegistry(); reRegister();
    fs.writeFileSync(TMP, JSON.stringify({ kind: "swek-knob-licences", licences: { "wolff-warmup": { tier: "adopt", granted: [] } } }));
    const r2 = loadLicences();
    ok("!! a hand-edited file claiming 'adopt' with NO evidence grants nothing (a stored tier is a claim, not a grant)",
       getProposer("wolff-warmup").tier === "propose" && r2.rejected.some((x) => x.id === "wolff-warmup"),
       r2.rejected.map((x) => x.why).join("; "));

    // and evidence for a DIFFERENT tier does not buy this one
    resetRegistry(); reRegister();
    fs.writeFileSync(TMP, JSON.stringify({ kind: "swek-knob-licences", licences: {
        "wolff-warmup": { tier: "adopt", granted: [{ tier: "propose", at: Date.now(), evidence: { measured: 1 } }] } } }));
    loadLicences();
    ok("!! ...and evidence recorded for a LOWER tier does not buy a higher one",
       getProposer("wolff-warmup").tier === "propose");

    // stale evidence expires when a caller asks for expiry
    resetRegistry(); reRegister();
    fs.writeFileSync(TMP, JSON.stringify({ kind: "swek-knob-licences", licences: {
        "wolff-warmup": { tier: "adopt", granted: [{ tier: "adopt", at: Date.now() - 400 * 86400e3, evidence: { measured: 1 } }] } } }));
    loadLicences({ maxAgeMs: 30 * 86400e3 });
    ok("!! evidence from a year ago is a fact about a machine that may no longer exist -- expiry refuses it",
       getProposer("wolff-warmup").tier === "propose");
    // ...and the same record is accepted when no expiry is demanded, so the check above is not vacuous
    resetRegistry(); reRegister(); loadLicences();
    ok("...while the same record restores when no expiry is asked for (opt-in, so the default cannot surprise)",
       getProposer("wolff-warmup").tier === "adopt");

    // an unknown proposer in the file is reported, never invented
    resetRegistry(); reRegister();
    fs.writeFileSync(TMP, JSON.stringify({ kind: "swek-knob-licences", licences: {
        "ghost-device": { tier: "adopt", granted: [{ tier: "adopt", at: Date.now(), evidence: {} }] } } }));
    const r3 = loadLicences();
    ok("a licence for a proposer that does not exist is REPORTED rather than silently dropped",
       r3.rejected.some((x) => x.id === "ghost-device"), r3.rejected.map((x) => x.id + ": " + x.why).join("; "));

    // a missing file is a normal state, not an error
    try { fs.unlinkSync(TMP); } catch {}
    resetRegistry(); reRegister();
    const r4 = loadLicences();
    ok("no licence file at all is a clean state: every proposer keeps its registered default",
       r4.ok && r4.restored === 0 && getProposer("wolff-warmup").tier === "propose", r4.reason);
}
try { fs.unlinkSync(TMP); } catch {}


// ---- v3321: THE TIER ORDERING IS THE SECURITY PROPERTY, AND NOTHING ASSERTED IT -----------------------------------
//
// Same sweep, same class: an exported one-line definition its own gate never mentions. tierRank is three
// characters of logic -- TIERS.indexOf(t) -- and it decides whether a licence change is an escalation:
//
//     if (tierRank(tier) <= tierRank(p.tier)) { ...allowed unconditionally... }
//
// The assertions above test that escalation is refused, which exercises the RESULT. They do not test the
// ORDERING that makes the comparison mean anything. Reverse TIERS and every existing check still passes while
// the guard inverts: lowering a licence would need approval and RAISING one to adopt would be waved through as
// "lowered or unchanged". Verified by planting the reversal -- 10 assertions fail.
{
    ok("!! the tier ordering is read < propose < adopt, which is what makes the guard a guard",
        tierRank("read") < tierRank("propose") && tierRank("propose") < tierRank("adopt"),
        `read ${tierRank("read")}, propose ${tierRank("propose")}, adopt ${tierRank("adopt")}. grantLicence allows ` +
        "any change where the new rank is <= the current one, so reversing this array silently turns that line " +
        "into an escalation path");

    ok("...and adopt is strictly the highest, so nothing outranks it",
        TIERS.every((t) => tierRank(t) <= tierRank("adopt")) && tierRank("adopt") === TIERS.length - 1,
        "adopt is the only tier that can change the tree, so a fourth tier appended after it would inherit " +
        "adopt's privileges without anyone writing that down");
}

// ---- v3653: licencePath() -- THE GETTER FOR WHERE LICENCES PERSIST, ROUND-TRIP TESTED ---------------------------
//
// licencePath() is a one-line getter over module-private state, and its own gate never called it. Tested for
// real here rather than by naming it in a comment: set the path, ask licencePath() what it is, write through
// the real writeLicences(), and read the file back from EXACTLY the path licencePath() reported -- so a bug
// that let the setter and the getter drift apart (or let writeLicences ignore the setter) would be caught, not
// merely a bug that broke the string comparison.
{
    ok("!! licencePath() reports exactly the path this gate pointed it at, at the top of the file",
       licencePath() === TMP, "licencePath() = " + licencePath() + ", expected the gate's own TMP = " + TMP);

    const TMP2 = path.join(os.tmpdir(), "swek-knob-licences-test2-" + process.pid + ".json");
    try { fs.unlinkSync(TMP2); } catch {}
    setLicencePath(TMP2);
    ok("!! setLicencePath moves what licencePath() reports, immediately and to the exact new path",
       licencePath() === TMP2 && licencePath() !== TMP,
       "licencePath() is now " + licencePath() + " -- the getter is not caching the value from before the setter ran");

    resetRegistry();
    registerProposer({
        id: "licence-path-probe", knobs: ["x"], defaultTier: "propose",
        propose: () => [{ x: 1 }], score: (c) => c.x, adjudicate: () => ({ pass: true, evidence: {} }),
    });
    const w = writeLicences();
    ok("!! writeLicences() writes to exactly the path licencePath() currently names, not a stale one",
       w.ok && w.path === TMP2 && fs.existsSync(TMP2) && !fs.existsSync(TMP),
       "writeLicences() returned path " + w.path + " (licencePath() said " + licencePath() + "); TMP2 exists: " +
       fs.existsSync(TMP2) + "; the OLD path TMP was never touched after the setter moved: " + !fs.existsSync(TMP));

    const onDisk = JSON.parse(fs.readFileSync(licencePath(), "utf8"));
    ok("!! reading the file back from licencePath() itself (not a hardcoded path) finds what writeLicences just wrote",
       onDisk.kind === "swek-knob-licences" && "licence-path-probe" in onDisk.licences,
       "set -> licencePath() -> writeLicences() -> read via that SAME reported path closes the loop end to end");

    setLicencePath(TMP);   // restore the path the rest of this file (and its cleanup) assumes
    try { fs.unlinkSync(TMP2); } catch {}
    resetRegistry();
}

console.log(fails ? ("[proposers-selfcheck] FAILED " + fails) : "[proposers-selfcheck] all passed");
process.exit(fails ? 1 : 0);
