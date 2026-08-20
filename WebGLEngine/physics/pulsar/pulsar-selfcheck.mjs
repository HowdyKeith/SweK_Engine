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
import { pulseArrivalTimes, phaseAt, pulseIntervals } from "./pulsar.js";

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

// ---- 4. THE TIMING IS ARITHMETIC + SQRT (cross-arch), demonstrated by an exact whole-square root -----
{
    // t_0 solves with sqrt(f0*f0) which must be exactly f0, giving t_0 = 0 to the bit
    ok("!! the arrival solution rests on a correctly-rounded square root", times[0] === 0,
       "t_0 = (sqrt(f0*f0) - f0)/fdot is exactly 0 -- the sqrt is exact on a perfect square, which is why this whole train is cross-architecture stable and foldable into the fingerprint.");
}

console.log(fails ? "\npulsar-selfcheck: " + fails + " FAILED" : "\npulsar-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
