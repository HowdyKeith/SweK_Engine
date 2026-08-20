## v3906 -- THE FOUR STEPPERS IN poisson.mjs, AND THE MISSING NAMES AND THE MISSING CHECK WERE THE SAME HOLE

`verletStep`, `eulerStep`, `semiEulerStep` and `rk4Step` are exported and **not one of the four names appeared in
their own gate**. Every check reached them through the `STEPPERS` table, which is a real front door and is also
the whole problem: *a registry hides which function is behind which key.*

### MEASURED, NOT ARGUED: ALL SIX TRANSPOSITIONS OF THE TABLE, DRIVEN AGAINST v3430

    verlet <-> euler       CAUGHT        semiEuler <-> euler    CAUGHT
    verlet <-> rk4         CAUGHT        semiEuler <-> rk4      CAUGHT
    euler  <-> rk4         CAUGHT        *** verlet <-> semiEuler   PASSES EVERY CHECK IN THE FILE ***

**One of six is invisible, and it is invisible for a reason that names the missing check.** The two are
indistinguishable on the SYMPLECTIC axis, which is the only axis the file measured. Section 5 says in prose
*"ACCURACY AND SYMPLECTICITY ARE DIFFERENT AXES, and a fixture of verlet-versus-rk4 alone would let them be read
as one"* — and then measures one of the two axes. **The claim and the gap are the same sentence.**

### AND A SECOND PLANT SURVIVED v3430, THIS ONE INSIDE A STEPPER: A DETERMINANT IS NOT A MAP

Flip the sign of explicit Euler's momentum kick — `[q + dt*p, p + dt*q]` — and **every check passes**. Its
Jacobian is `[[1,dt],[dt,1]]` with determinant `1 - dt²`, so `symplecticDefect` reads `dt²`: *the same number as
the correct map.* Section 5's "explicit Euler's defect is EXACTLY dt²" is satisfied by completely different
dynamics. The new closed-form check catches it at 2.0e-1 rather than at a floor.

### WHAT THE ROUND ADDS

**Each stepper is the MATRIX it is supposed to be** — the strongest available statement about a stepper, and one
the symplectic checks cannot make, because two different maps can share a determinant:

    euler      [[1, dt], [-dt, 1]]                       semiEuler  [[1-dt^2, dt], [-dt, 1]]
    verlet     [[1-dt^2/2, dt], [-dt+dt^3/4, 1-dt^2/2]]  rk4        [[a, b], [-b, a]]

worst element **5.95e-11** across all sixteen entries of four matrices, against the central-difference floor —
asserted through the named export *and* through `STEPPERS[k]`, so a crossed wire fails on the physics rather
than only on an identity comparison.

**THE ORDER AXIS, MEASURED BY REFINEMENT AND NOT TOLD TO THE LOOP: 1, 1, 2, 4.**

    euler      5.11e-2 -> 2.53e-2 -> 1.26e-2 -> 6.27e-3 -> 3.13e-3    order 1.002
    semiEuler  4.25e-2 -> 2.11e-2 -> 1.05e-2 -> 5.26e-3 -> 2.63e-3    order 1.001
    verlet     8.99e-4 -> 2.25e-4 -> 5.61e-5 -> 1.40e-5 -> 3.51e-6    order 2.000
    rk4        8.33e-7 -> 5.21e-8 -> 3.26e-9 -> 2.03e-10 -> 1.27e-11  order 4.000

All four corners of the 2×2 are occupied — first-order-not-symplectic, first-order-symplectic,
second-order-symplectic, fourth-order-not-symplectic — which is the only way to show the two axes are
independent rather than correlated. It is also exactly the discriminator the invisible transposition needed:
verlet and semiEuler are a whole order apart while their symplectic defects are 3.61e-11 and 8.11e-12, both at
the floor.

### RK4 CONTRACTS PHASE-SPACE VOLUME BY EXACTLY dt^6/72, WHICH IS SECTION 6'S FINDING WITH A NUMBER IN IT

RK4 on this Hamiltonian advances by the truncated series of `exp(i·dt)`, so its determinant is `a² + b²` with
`a = 1 - dt²/2 + dt⁴/24` and `b = dt - dt³/6`, and that expands **exactly**:

    det = 1 - dt^6/72 + dt^8/576

No truncation, no fitting — a polynomial identity. Measured across four step sizes, the ratio to `-dt⁶/72` is
0.98000, 0.99500, 0.99875, 0.99969 and **the shortfall from 1 is `dt²/8` every time** (0.125000, 0.125000,
0.125001, 0.125102) — which is the `dt⁸/576` term and nothing else. Section 6 says RK4's defect "vanishes into
the noise"; **this says where**: it crosses Verlet's central-difference floor of ~1e-11 at dt ≈ 0.03, so a check
at any smaller step certifies RK4 as symplectic. The reason is now a power law rather than an observation about
one run.

### THE CONSEQUENCE ELEVEN FILES ACTUALLY RELY ON, OVER 159 PERIODS

None of the one-step checks is why anybody cares. 20,000 steps at dt = 0.05, and both determinants become
predictions with no free parameter, because the Euler and RK4 maps are each a rotation times a scalar:

    euler      H = 2.435543e+21   against H0 (1 + dt^2)^N     agreeing to 1.06e-12
    rk4        H = 4.99997831e-1  against H0 det^N            agreeing to 1.11e-12
    verlet     band [4.9969e-1, 5.0000e-1]                    0.06% of H0, not drifting
    semiEuler  band [4.8780e-1, 5.1282e-1]                    5.00% of H0, not drifting

*** RK4 DOES NOT MERELY FAIL TO PRESERVE ENERGY, IT REMOVES IT, MONOTONICALLY AND FOREVER. *** A fourth-order
method that loses energy slower than a second-order one preserves it is the trade the eleven files saying
"symplectic" are making, and this is the first place in the tree it is a number. And the two RK4 predictions
separate here: the exact polynomial agrees to 1.1e-12 while the leading `dt⁶/72` term alone is **1.36e-9 out**,
which is `N · dt⁸/576` — a leading-order prediction is not the same claim as an exact one.

### A MISTAKE THIS ROUND MADE AND THE PLANT THAT CAUGHT IT

The first version compared the four Jacobians against their closed forms **using the named exports only**, and
then claimed in its own detail string that *"a swapped registry entry fails here"*. **It did not** — nothing in
the comparison read the registry. Driving the six transpositions is what found it; the sentence was written from
the armchair and the plant disagreed. The comparison now runs twice, once by name and once through the table,
and the claim is true.

### WHAT MOVED

    definitionGates      110 unmentioned -> 106     (the four steppers)
    reached by NO gate    76 -> 72 tree-wide
    physics/mechanics     6 sibling-unmentioned -> 2 (rigidKeys' quatOf and posOf are all that is left)
    assertions            poisson 13 -> 24

Five arithmetic plants inside the steppers were driven against both gates: verlet's half-step becoming a full
step, semi-implicit Euler falling back to explicit, the Euler sign flip, RK4's `k3` reading `k1`, and RK4's
weights losing their 2s. The old gate caught four of five; the new one catches five of five and all six
transpositions.

### HONEST NOTES

- **`poisson.mjs` is untouched** — byte-identical to v3903. This round changed one gate.
- Runtime 0.11s (was 0.02s); `--affected` reports 1/1 pass; `poissonDevice-selfcheck` (which reads the same
  registry through the bind) is green.
- **The fixture is one degree of freedom on the unit harmonic oscillator**, which is what makes every matrix
  exact by hand. A stepper correct here can still be wrong on a non-separable or non-linear Hamiltonian —
  nothing in this round tests that, and the module's own header is honest that the oscillator is "the cheapest
  fixture that can tell a symplectic map from a plausible one".
- The order study measures the **global** error at T = 1, so it reads convergence order, not local truncation
  order. They differ by one and the numbers quoted are the global ones.
