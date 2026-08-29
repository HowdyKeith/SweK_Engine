// WebGLEngine/physics/statmech/wolff-selfcheck.mjs — v3284
//
// Run: node physics/statmech/wolff-selfcheck.mjs   (~2s — MEASURED; the L=48 Metropolis comparison dominates)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// Two claims, and the ORDER IS THE POINT: first that Wolff samples the SAME distribution (Yang's exact
// magnetisation, the same falsifier the Metropolis device answers to), and only then that it is faster. A
// faster algorithm sampling a subtly different distribution is worse than useless, and speed is the thing that
// tempts you not to check.
//
// Critical slowing down is measured in EFFECTIVE SAMPLES PER FLIPPED SPIN, not per "sweep" -- a cluster move
// touches many spins, and calling it a sweep would flatter Wolff by exactly the factor being measured.

import { yangMagnetisation, ONSAGER_TC } from "./ising.js";
import { wolffMeasure, metropolisMeasure, essPerWork, pAddWRONG, pAddCorrect, makeWolff } from "./wolff.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. SAME DISTRIBUTION FIRST: Yang's exact curve ---------------------------------------------------------------
{
    const det = [];
    let worst = 0;
    for (const T of [1.8, 2.1]) {
        const w = wolffMeasure({ L: 32, T, moves: 3000, warmupMoves: 300 });
        const y = yangMagnetisation(T);
        worst = Math.max(worst, Math.abs(w.absM - y));
        det.push("T=" + T + ": " + w.absM.toFixed(4) + " vs " + y.toFixed(4));
    }
    ok("!! Wolff reproduces Yang's exact magnetisation — a DIFFERENT algorithm, the same distribution",
       worst < 0.006, det.join(", ") + " (worst |diff| " + worst.toFixed(4) + ")");
}

// ---- 2. AND ONLY THEN, SPEED: critical slowing down, measured per flipped spin --------------------------------
{
    const rows = [];
    for (const L of [16, 32, 48]) {
        const w = wolffMeasure({ L, T: ONSAGER_TC, moves: 2500, warmupMoves: 300 });
        const m = metropolisMeasure({ L, T: ONSAGER_TC, sweeps: 2500, warmupSweeps: 300 });
        const ew = essPerWork(w), em = essPerWork(m);
        rows.push({ L, w: ew.essPerWork, m: em.essPerWork, ratio: ew.essPerWork / em.essPerWork });
    }
    ok("!! at T_c, Wolff delivers far more effective samples per flipped spin than Metropolis",
       rows.every((r) => r.ratio > 10),
       rows.map((r) => "L=" + r.L + ": " + r.ratio.toFixed(0) + "x").join(", "));
    ok("!! THE SIGNATURE: the gap GROWS with lattice size — Metropolis slows down critically, Wolff does not",
       rows[2].ratio > rows[0].ratio * 3,
       "Metropolis ESS/work collapses " + rows[0].m.toFixed(5) + " -> " + rows[2].m.toFixed(5) +
       " while Wolff holds " + rows[0].w.toFixed(4) + " -> " + rows[2].w.toFixed(4) +
       " (ratio " + rows[0].ratio.toFixed(0) + "x -> " + rows[2].ratio.toFixed(0) + "x). The samples kept arriving either way; only one algorithm kept them independent.");
}

// ---- 3. SABOTAGE, and it is the insidious kind ---------------------------------------------------------------------
{
    // P_add = 1 - exp(-J/T) instead of 1 - exp(-2J/T). This does NOT produce garbage: since
    // pAddWRONG(T) == pAddCorrect(2T) identically, it samples a PERFECTLY LEGITIMATE Ising ensemble -- at twice
    // the temperature it claims. Every configuration it produces is a real configuration. Only comparing to the
    // exact curve AT THE CLAIMED TEMPERATURE can see it, which is exactly why the falsifier is not optional.
    const badAtClaim = wolffMeasure({ L: 32, T: 2.1, moves: 3000, warmupMoves: 300, pAdd: pAddWRONG });
    ok("!! the wrong P_add fails Yang AT ITS CLAIMED TEMPERATURE (0.045 where 0.869 is required)",
       Math.abs(badAtClaim.absM - yangMagnetisation(2.1)) > 0.5,
       "measured " + badAtClaim.absM.toFixed(4) + " vs Yang(2.1) = " + yangMagnetisation(2.1).toFixed(4));
    const badLow = wolffMeasure({ L: 32, T: 0.9, moves: 3000, warmupMoves: 300, pAdd: pAddWRONG });
    ok("!! ...and it is sampling the ensemble at DOUBLE the temperature — legitimate configurations, wrong ensemble",
       Math.abs(badLow.absM - yangMagnetisation(1.8)) < 0.01 && Math.abs(badLow.absM - yangMagnetisation(0.9)) > 0.03,
       "run at T=0.9 it measures " + badLow.absM.toFixed(4) + ", which is Yang(1.8) = " + yangMagnetisation(1.8).toFixed(4) +
       ", not Yang(0.9) = " + yangMagnetisation(0.9).toFixed(4) +
       " — the failure a healthy-looking cluster algorithm hides, and no internal diagnostic would flag it");
    ok("...while the correct P_add passes the same test (the trap is not vacuous)",
       Math.abs(wolffMeasure({ L: 32, T: 0.9, moves: 2000, warmupMoves: 300, pAdd: pAddCorrect }).absM - yangMagnetisation(0.9)) < 0.01);
}

// ---- 4. determinism --------------------------------------------------------------------------------------------
{
    const a = wolffMeasure({ L: 16, T: 2.2, moves: 500, warmupMoves: 100 });
    const b = wolffMeasure({ L: 16, T: 2.2, moves: 500, warmupMoves: 100 });
    ok("seeded runs are bit-identical (a failure reproduces)", a.absM === b.absM && a.flips === b.flips);
}

// ---- 5. makeWolff() CALLED DIRECTLY: THE INITIAL STATE, THE TORUS INDEX, AND THE CLUSTER MOVE ITSELF -----------
{
    // A cold start's initial state is exact and hand-checkable: L*L spins, every one +1, zero energy above the
    // ground state (E/N = -2 exactly, as ising.js's own header derives).
    const L = 6;
    const w = makeWolff({ L, T: 2.269, seed: 5, cold: true });
    ok("!! makeWolff reports the exact L, N=L*L it was constructed with", w.L === L && w.N === L * L,
        "L=" + w.L + ", N=" + w.N + " for L=" + L);
    ok("!! a cold-started lattice is EXACTLY N spins of +1, none of anything else", w.spins.length === L * L && [...w.spins].every((v) => v === 1),
        "spins.length=" + w.spins.length + ", every entry === 1");
    ok("!! and its magnetisation/energy read the exact ground-state values, not an approximation",
        w.magnetisation() === 1 && w.energy() === -2,
        "magnetisation=" + w.magnetisation() + ", energy=" + w.energy() + " -- E/N=-2 is ising.js's own derived ground state");
    ok("!! idx() wraps the torus exactly: L maps to 0 and -1 maps to L-1 on both axes",
        w.idx(L, 3) === w.idx(0, 3) && w.idx(-1, 3) === w.idx(L - 1, 3) && w.idx(2, L) === w.idx(2, 0) && w.idx(2, -1) === w.idx(2, L - 1),
        "periodic boundary conditions checked on both axes, not merely one");

    // clusterMove() with pAdd forced to 1 (always join) on a UNIFORM cold lattice must sweep the ENTIRE aligned
    // lattice into one cluster -- every neighbour agrees in sign and every join succeeds, so size === N exactly
    // and the whole lattice flips sign in a single move.
    const full = makeWolff({ L, T: 2.269, seed: 5, cold: true, pAdd: () => 1 });
    const fullSize = full.clusterMove();
    ok("!! clusterMove() with P_add forced to 1 on a uniform lattice claims the WHOLE lattice, size === N exactly",
        fullSize === L * L, "cluster size " + fullSize + " for N=" + (L * L));
    ok("!! ...and flips it entirely: magnetisation goes from +1 to EXACTLY -1 in one move",
        full.magnetisation() === -1, "magnetisation after the move: " + full.magnetisation());

    // clusterMove() with pAdd forced to 0 (never join) must be unable to grow past the seed site: size === 1
    // exactly, and the magnetisation moves by exactly 2/N -- one spin flipped, no more, no fewer.
    const single = makeWolff({ L, T: 2.269, seed: 5, cold: true, pAdd: () => 0 });
    const singleSize = single.clusterMove();
    ok("!! clusterMove() with P_add forced to 0 can only ever take the seed site, size === 1 exactly",
        singleSize === 1, "cluster size " + singleSize);
    ok("!! ...and magnetisation moves by EXACTLY 2/N (one spin out of N flipped, no partial or extra flips)",
        Math.abs(single.magnetisation() - (1 - 2 / (L * L))) < 1e-15,
        "magnetisation " + single.magnetisation() + ", expected 1 - 2/" + (L * L) + " = " + (1 - 2 / (L * L)));

    // Determinism of makeWolff's OWN initial state (as distinct from wolffMeasure's determinism, checked in
    // section 4 above): same seed, same L, same cold flag must produce bit-identical initial spins.
    const rep1 = makeWolff({ L: 8, T: 2, seed: 99, cold: false });
    const rep2 = makeWolff({ L: 8, T: 2, seed: 99, cold: false });
    ok("!! makeWolff's own random initial state is seed-reproducible, spin by spin",
        [...rep1.spins].every((v, i) => v === rep2.spins[i]),
        "two independent constructions with the same seed produce an identical initial lattice");
}

console.log(fails ? ("[wolff-selfcheck] FAILED " + fails) : "[wolff-selfcheck] all passed");
process.exit(fails ? 1 : 0);
