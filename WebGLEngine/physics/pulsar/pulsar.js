// physics/pulsar/pulsar.js
//
// A pulsar as a clock. A neutron star spins and sweeps a beam; each time the beam crosses the line of sight, a pulse
// arrives. Real pulsars are among the most precise clocks in the universe, and they spin down -- the period lengthens
// over time. The timing model is the standard one: the rotational phase is phi(t) = f0*t + 0.5*fdot*t*t, and pulse n
// arrives when phi = n. Solving that quadratic for the arrival time uses only + - * / and a square root, every one
// correctly rounded under IEEE-754, so the pulse train is bit-identical on every architecture -- the pulsar ticks the
// same on every machine in the fleet. The rotating beam direction below uses trig and is for the on-screen view only.

// Pulse arrival times for the first nPulses pulses. f0 is the spin frequency (Hz), fdot the spin-down rate (Hz/s,
// negative for a spinning-down star). Arithmetic + sqrt only.
export function pulseArrivalTimes(f0, fdot, nPulses) {
    const times = [];
    for (let n = 0; n < nPulses; n++) {
        if (fdot === 0) { times.push(n / f0); continue; }        // no spin-down: evenly spaced
        const disc = f0 * f0 + 2 * fdot * n;                     // discriminant of 0.5*fdot*t^2 + f0*t - n = 0
        times.push((Math.sqrt(disc) - f0) / fdot);
    }
    return times;
}

// The rotational phase at time t (in turns). phi(t_n) should equal n at each arrival time -- the check the gate makes.
export function phaseAt(t, f0, fdot) { return f0 * t + 0.5 * fdot * t * t; }

// Intervals between successive pulses -- these grow as the star spins down.
export function pulseIntervals(times) { const iv = []; for (let i = 1; i < times.length; i++) iv.push(times[i] - times[i - 1]); return iv; }

// The instantaneous period P = 1/f at time t, from the derivative of the phase: f(t) = f0 + fdot*t.
export function periodAt(t, f0, fdot) { const f = f0 + fdot * t; return f !== 0 ? 1 / f : Infinity; }

// Beam direction at time t, for the on-screen rotating view. Trig -- GATED, not fingerprinted.
export function beamDir(t, f0, fdot) { const ph = phaseAt(t, f0, fdot) * 2 * Math.PI; return [Math.cos(ph), Math.sin(ph)]; }
