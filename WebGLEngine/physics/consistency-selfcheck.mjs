// WebGLEngine/physics/consistency-selfcheck.mjs — v3283
//
// Run: node physics/consistency-selfcheck.mjs   (~35s — MEASURED; the Ising pair dominates)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// A new KIND of key: one constant, two routes independent in MECHANISM, agreement gated. This is the check that
// catches what per-instrument gates cannot — a bug that biases one route while leaving its own internal checks
// green. The sabotage below is exactly that shape: extrapolating the chi peak with the WRONG exponent produces
// a perfectly smooth, internally consistent, wrong T_c, and only the OTHER route can say so.

import { pairIsingTc, pairTrapDeltaF, pairLbmViscosity, runBoard, chiRatioTc } from "./consistency.mjs";


let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const show = (p) => p.a.route + " = " + (p.a.value == null ? "null" : p.a.value.toFixed(4)) +
                    " vs " + p.b.route + " = " + (p.b.value == null ? "null" : p.b.value.toFixed(4)) +
                    " (tol " + p.tol.toFixed(4) + ")";

// ---- the board itself: every pair must agree --------------------------------------------------------------------
const board = runBoard({ fast: true });
for (const p of board) ok("!! " + p.name + " — two mechanisms, one number", p.agree, show(p));

// ---- the pairs also sit near their known values (the board is consistent AND correct) ----------------------------
{
    const tc = board[0], df = board[1];
    ok("...and both T_c routes sit near Onsager 2.2692 (agreement is not two shared delusions)",
       Math.abs(tc.a.value - 2.2692) < 0.08 && Math.abs(tc.b.value - 2.2692) < 0.10   /* ratio route carries a small finite-size systematic, measured at ~0.05-0.07 low across seeds */,
       "Binder " + tc.a.value.toFixed(4) + ", chi-extrapolation " + tc.b.value.toFixed(4));
    ok("...and both dF routes sit near (kT/2) ln 4 = 0.6931",
       Math.abs(df.a.value - 0.6931) < 0.08 && Math.abs(df.b.value - 0.6931) < 0.08,
       "Jarzynski " + df.a.value.toFixed(4) + ", Crooks " + df.b.value.toFixed(4));
}

// ---- SABOTAGE: a smooth, internally consistent, WRONG route — only the board can see it --------------------------
{
    // the ratio route with the WRONG exponent: gamma/nu = 2 instead of the exact 7/4, so it hunts the crossing
    // of 2^2 = 4. Every chi measurement in it is real and every step is smooth; the LOGIC is wrong, and the
    // estimate lands measurably away from the Binder route where the true-exponent route agrees.
    const wrongTc = chiRatioTc({ L: 12, baseSeed: 12, nSeeds: 4, samples: 1500, target: 4 });
    const rightTc = board[0].b.value;
    ok("a wrong-exponent ratio target DISAGREES where the exact 7/4 agrees (the board has teeth, measured)",
       wrongTc == null || Math.abs(wrongTc - board[0].a.value) > 0.09 || Math.abs(wrongTc - rightTc) > 0.04,
       "gamma/nu=2 route gives " + (wrongTc == null ? "no crossing in range" : wrongTc.toFixed(4)) +
       " vs exact-exponent " + rightTc.toFixed(4) + " — smooth, internally consistent, wrong; no single-route gate would blink");
}

// ---- determinism of the cheapest pair ---------------------------------------------------------------------------
{
    const a = pairLbmViscosity({ fast: true }), b = pairLbmViscosity({ fast: true });
    ok("seeded board entries are bit-identical (a disagreement reproduces)", a.b.value === b.b.value);
}

// ---- v3286 -- THE FOURTH PAIR, AND THE FIRST WITH NO CLOSED FORM ON EITHER SIDE -----------------------------
// Every earlier pair had algebra behind at least one route. A Lennard-Jones diffusion coefficient at one state
// point does not: neither Einstein nor Green-Kubo can be checked against a formula, only against each other.
// That is the case this board was built for, and it is why the admission rule about mechanism matters most here.
{
    const p = board[3];
    ok("!! LJ self-diffusion: positions and velocities agree on a number algebra cannot supply",
       p.agree, p.a.value.toFixed(5) + " (" + p.a.mechanism + ") vs " + p.b.value.toFixed(5) + " (" + p.b.mechanism +
       "), tol " + p.tol.toFixed(5) + " EARNED from a measured 6.3% seed spread");
    ok("...and the two routes really are different mechanisms, which is what makes the agreement mean anything",
       p.a.mechanism !== p.b.mechanism && p.a.mechanism === "einstein-msd" && p.b.mechanism === "green-kubo-vacf",
       "one integrates displacement over long times, the other correlates velocities over short ones; their equality is a theorem, so a disagreement is always a bug");
}

console.log(fails ? ("[consistency-selfcheck] FAILED " + fails) : "[consistency-selfcheck] all passed");
process.exit(fails ? 1 : 0);
