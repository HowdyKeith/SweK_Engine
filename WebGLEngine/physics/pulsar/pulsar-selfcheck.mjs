// physics/pulsar/pulsar-selfcheck.mjs
//
// Run: node physics/pulsar/pulsar-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The pulsar held to what makes a pulsar worth anything: it is a clock. The pulse train replays bit-for-bit. Every
// arrival time lands exactly where the rotational phase reaches a whole turn -- phi(t_n) is n to eleven digits -- which is
// the proof the timing is solved, not faked. And the star spins down, so the intervals grow: a real neutron star loses
// energy and its period lengthens. The sabotage drops the spin-down term from the arrival-time solution, spacing the
// pulses evenly as if the star never slowed; the phase then no longer lands on a whole turn at each pulse, and the gate
// refuses it -- the same way a timing residual is how astronomers catch a wrong pulsar model.
import { pulseArrivalTimes, phaseAt, pulseIntervals, periodAt, beamDir } from "./pulsar.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const f0 = 30, fdot = -1e-3, N = 200;
const times = pulseArrivalTimes(f0, fdot, N);

// ---- 1. THE PULSE TRAIN REPLAYS BIT-FOR-BIT ---------------------------------------------------------
{
    ok("!! the pulse train is identical every run", JSON.stringify(pulseArrivalTimes(f0, fdot, N)) === JSON.stringify(times),
       N + " arrival times, reproducible -- the clock reads the same each time, which is the whole point of a clock.");
}

// ---- 2. EACH PULSE ARRIVES EXACTLY WHEN THE PHASE REACHES A WHOLE TURN -------------------------------
{
    let maxErr = 0; for (let n = 0; n < N; n++) maxErr = Math.max(maxErr, Math.abs(phaseAt(times[n], f0, fdot) - n));
    ok("!! the rotational phase is a whole number of turns at every arrival time", maxErr < 1e-6,
       "worst |phase(t_n) - n| over " + N + " pulses is " + maxErr.toExponential(1) + " -- the arrival times solve the timing, they are not spaced by hand.");
}

// ---- 3. THE STAR SPINS DOWN: INTERVALS GROW --------------------------------------------------------
{
    const iv = pulseIntervals(times);
    let increasing = true; for (let i = 1; i < iv.length; i++) if (iv[i] <= iv[i - 1]) { increasing = false; break; }
    ok("!! the pulse interval lengthens over time, as a spinning-down star must", increasing,
       "the period grows from " + iv[0].toExponential(4) + "s to " + iv[iv.length - 1].toExponential(4) + "s across the train -- the star is losing spin, and the clock records it.");
}

// ---- 3b. periodAt AT THE MIDPOINT OF A PULSE INTERVAL EQUALS THAT INTERVAL, EXACTLY -------------------
//
// f(t) = f0 + fdot*t is linear, so its AVERAGE over any interval equals its value at the interval's MIDPOINT --
// the trapezoid rule is exact for a linear integrand. Between two consecutive pulses the accumulated phase is
// exactly 1 turn by construction (pulseArrivalTimes solves for exactly that), so the mean frequency over the
// interval is exactly 1/interval. Put together: periodAt(midpoint) must equal the pulse interval itself, not
// approximately but as an algebraic identity of a linear phase model -- no reimplementation of periodAt's own
// formula needed to state it.
{
    const iv = pulseIntervals(times);
    let worst = 0;
    for (let n = 0; n < iv.length; n++) {
        const mid = (times[n] + times[n + 1]) / 2;
        worst = Math.max(worst, Math.abs(periodAt(mid, f0, fdot) - iv[n]) / iv[n]);
    }
    ok("!! periodAt at the midpoint of a pulse interval equals that interval exactly", worst < 1e-8,
       "worst relative mismatch over " + iv.length + " intervals is " + worst.toExponential(1) + " -- since the " +
       "spin frequency is linear in t, its average over any interval equals its midpoint value, and since each " +
       "interval carries exactly one turn of phase by construction, 1/periodAt(midpoint) IS the mean frequency " +
       "over that interval. Two independently-stated quantities -- an instantaneous period and a measured " +
       "interval -- forced to agree by the linearity of the model, not by sharing a line of code.");

    ok("!! periodAt(0) is exactly 1/f0, the initial spin period", periodAt(0, f0, fdot) === 1 / f0,
       "with no elapsed time the instantaneous frequency is f0 itself, so the period is its bitwise reciprocal.");
}

// ---- 3c. beamDir POINTS THE SAME DIRECTION AT EVERY PULSE ARRIVAL -- THE DEFINITION OF A PULSAR --------
//
// A pulse arrives exactly when the rotational phase reaches a whole turn (check 2, above). beamDir is built
// from that same phase times 2*pi, so at every recorded arrival time the beam must point back to the SAME
// reference direction [1, 0] -- that return is, physically, what makes a pulse a pulse: the lighthouse beam
// has swept exactly once (or n times) around and lines up with the line of sight again.
{
    const idxs = [0, 1, 50, 100, 199];
    let worst = 0;
    for (const n of idxs) {
        const d = beamDir(times[n], f0, fdot);
        worst = Math.max(worst, Math.abs(d[0] - 1), Math.abs(d[1]));
    }
    ok("!! the beam points back to the same reference direction at every pulse arrival", worst < 1e-6,
       "at pulses n = " + idxs.join(", ") + " (up to a spin-down of " + fdot + " Hz/s over the run) beamDir " +
       "returns to [1, 0] each time, worst deviation " + worst.toExponential(1) + " -- the beam has swept a " +
       "whole number of turns exactly when a pulse is recorded, which is the geometric fact a pulsar's clock " +
       "regularity actually rests on.");

    ok("!! beamDir is always a unit vector", [0, 33, 199].every((n) => { const d = beamDir(times[n], f0, fdot); return Math.abs(d[0] * d[0] + d[1] * d[1] - 1) < 1e-12; }),
       "cos^2 + sin^2 = 1 at every sampled time -- the rotating beam has a fixed length, only its direction turns.");
}

// ---- 4. THE TIMING IS ARITHMETIC + SQRT (cross-arch), demonstrated by an exact whole-square root -----
{
    // t_0 solves with sqrt(f0*f0) which must be exactly f0, giving t_0 = 0 to the bit
    ok("!! the arrival solution rests on a correctly-rounded square root", times[0] === 0,
       "t_0 = (sqrt(f0*f0) - f0)/fdot is exactly 0 -- the sqrt is exact on a perfect square, which is why this whole train is cross-architecture stable and foldable into the fingerprint.");
}

console.log(fails ? "\npulsar-selfcheck: " + fails + " FAILED" : "\npulsar-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
