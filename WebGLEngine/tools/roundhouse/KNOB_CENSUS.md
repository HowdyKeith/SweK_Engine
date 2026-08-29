# The knob census, run to completion

`knobLiveness.mjs` asks, for every declared knob of every device in every mode: **does moving this change
anything?** This file records the run that could afford to finish, what it found, and what its zeros are worth.

Run 2026-08-28/29 over **129 devices, 116 of which declare knobs — 673 rows, 7h35m**.

## The claim, and why it is a measurement rather than an admission

    incomplete (still so far, budget cut)  : none
    unprobed (no ladder to walk)           : none
    deafness unanswered (live, budget cut) : none

**Every device was entered, every mode was opened, and nothing was cut.** That is the whole difference between
this run and the five before it. Earlier sweeps were budget-limited, so a zero in a universal list meant *none
found in what was opened*; this lab walked into that distinction six separate times before it became an
invariant. Here the budgets came from `device-cost-baseline.json` — 2× each device's *measured* sweep cost —
and not one device ran out.

## Unexplained dead knobs: none

Four knobs move nothing alone, and all four are accounted for:

| knob | why it is still |
|---|---|
| `mpmdrucker.E`, `mpmstep.nu` | registered in `STILL_OK`, each with a sentence. `nu` is flat **because the key holds**: internal stress cannot move a centre of mass |
| `thermal.beta`, `thermal.gravity` | a **jointly gated pair** — both default to zero and multiply in Boussinesq buoyancy, so moving either alone leaves the product at zero. Neither is dead; the pair is the knob |

## The shapes that are not defects

**Bounds with slack (11).** `galaxy.maxHops`, `kerrladder.bisect`/`.golden`, `mpmforce.nx`, `mpmgrid.ny`,
`mpmplastic.thetaS`, `mpmstep.nx`, `probe.turns`, `refscan.maxDepth`, `sdfmarch.maxSteps`, `galaxy.zeroTol` —
iteration caps, grid sizes and thresholds set outside where the device works. Each wakes on the wide ladder, so
the bound is live machinery that binds when forced; flatness at ordinary values is evidence the work finishes
well inside it. **A solver whose answer depended on its iteration budget would be one that had not converged.**

**Modes that do not read a knob (346).** Counted, not listed. A device being organised.

**The deaf-knob shape (16).** A knob live in some modes and *echoed and ignored* in others. The list found both
of the lab's **planted** deaf knobs — `stability.visc` in `deafknob`, `mpmpile.angles` in `deafangle` — which is
the discriminator validating itself. Others are keys holding: `xpbd.iterations` is ignored in `hooke` and
`substep` and live only under the plant, which is XPBD's central claim (stiffness is independent of iteration
count) showing up as flatness.

## What the run repaired

Nine fixes, none of them a dead knob:

**Three knobs the census could never ask** — each unanswerable for a different reason, each needing a different
fix, and all three turned out to be *live* once asked:

- `blackhole.onsetLo` — default resolved at the build site, so the config carried `null`. Resolved in
  `defaults()`, as v3712 had already done for `onsetHi` one line above. **Deliberately not clamped**: a floor
  would have disarmed `onset-lo-inside-horizon`, whose selfcheck proves it fires by passing `rs/2`.
- `optics.spread` — `null` *means* self-scale, with three per-mode widths. Resolving it would have been "a
  regression wearing a fix" (v4030's own words), so it got mode-aware declared choices instead. The middle rung
  is a control: measured bit-identical in all five modes.
- `mpmcouple.left`/`.right` — objects have no natural order. Checked first that they are not a matched pair,
  then given choices derived from the shipped spec. The momentum key now has evidence at six collisions
  instead of one, holding at ~1e-15 throughout.

**Six binds publishing their own input.** `xpbd.compliance`/`.iterations`/`.substeps` (14 innocent modes wore a
planted defect's signature), `refscan.skyTilt`, `centrifuge.rhoF`, `renderBounce.maxDepth`. Handing a knob back
as an observable *is* the gesture the deafness discriminator hunts for.

**Two keys that could not fail**, both found by following a census reading that meant something other than
what its list usually means:

- `blackbody.tHi` — its observable compared `σ·tHi⁴/σ·tLo⁴` against `(tHi/tLo)⁴`, the same expression. Measured
  0 or one ulp across twelve orders of magnitude, including `tLo === tHi`. Replaced with a check of the typed
  σ against the Γζ route, which moves to 0.833 if `π⁴/90` is typed for `π⁴/15`.
- `centrifuge`'s `neutral` mode — claimed to be "an external key rather than a mirror" while the stepper read
  `rhoF` itself. Three observables zero **by factorisation**, and unmoved by the plant, because
  `sedCoeff ∝ (ρp − ρf)` is exactly zero at the neutral point and the plant only *multiplies* it. A witness now
  separates 0.01 honest from 0.05 planted.

## What to distrust

- **A reading, never a diagnosis.** Dead, saturated at an asymptote, quantised below the step, jointly gated,
  and *graded by an observable that cannot fail* are five conditions producing the same flat number.
- **Eight devices were swept before this session fixed them.** Their rows were discarded and re-probed against
  the current files — 68 stale rows dropped, 66 re-probed. A census reporting defects it has already repaired
  is reporting the past.
- The rows behind this are one machine's, one run. The **cost** figures are in `COST_RECORD.md`; the liveness
  verdicts are reproducible anywhere the devices are.
