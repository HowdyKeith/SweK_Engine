# v4700 -- PRE-REGISTRATION: does the ABSOLUTE set transfer, against its OWN twin, on data nobody has seen?

**Written before any frame at slab speed x4 has been harvested for the learned
gate, and before any fold of this design is run. The commit that carries this
file contains NO data.** The statistic (`h5` in `tools/ship/foldStats.mjs`),
the arms (`ARM_SPEC` in `tools/ship/genGateFolds.mjs`) and the runner
(`tools/ship/genGateAbsolute.mjs`) are committed WITH it and gated on synthetic
data only.

---

## 1. WHERE THIS HYPOTHESIS CAME FROM -- AND WHY IT CANNOT BE TESTED WHERE IT CAME FROM

v4699 measured H4 and neither clause cleared. Among its secondaries it printed,
with no test, an observation no clause had named: the absolute set (`V1`) scored
above `SHUF_A` on six folds of seven. v4699 called `SHUF_A` "V1's shuffled
twin". **It is not.** `SHUF_A` is trained on the SCALE-FREE features; v4698's
design has no shuffled arm on the absolute set at all. So the observation was
also an unmatched comparison. v4699's closing is left standing; the label in its
gate is corrected.

A hypothesis suggested by a dataset cannot be confirmed on that dataset: the
suggestion is the selection. **This design uses none of v4699's data.** The
x2 cache is not re-analysed for H5, in either direction, now or later.

## 2. THE FRESH DATA, AND WHAT IT COSTS

Fresh data means frames never harvested. Two page axes could supply them:

- **Later scene time** (`startframe`) runs the same trajectory further, but the
  dolly and the slab move linearly -- at x2 the slab has travelled ~22 world
  units by scene time 200 -- and choosing a window where the scene is still in
  frame would mean looking at it first.
- **Another slab speed** is the page's own axis (v4682) and x4 has never been
  harvested for the learned gate. **This design uses x4**, frames 0-40, the
  same window as before.

*** THE COST, STATED BEFORE IT IS PAID: *** x4 changes the motion regime as
well as the frames. If H5 clears, the absolute set transfers across content AND
across a regime it never trained on, which is a stronger claim than v4699's
observation. **If H5 fails, this design cannot say whether transfer is absent
or whether it exists at x2 and not at x4.** That ambiguity is accepted in
exchange for data nobody has looked at.

Seeds are **11-20**, disjoint from v4698's 1-10, so no seed that produced
the observation is reused.

## 3. THE DESIGN

Leave one scene out over the same seven scenes; every other setting is v4698's.
Five arms per fold per seed, all on the identical block population (finite in
both feature sets):

| arm | features | training labels | role |
|---|---|---|---|
| `V1` | absolute | true | primary |
| `SHUF1_A` | absolute | permuted, stream A | primary baseline -- V1's OWN twin |
| `SHUF1_B` | absolute | permuted, stream B | C11 |
| `V2` | scale-free | true | secondary |
| `SHUF_A` | scale-free | permuted, stream A | secondary |

`V1` and `SHUF1_A` share their initialisation and sampling stream and differ
ONLY in the labels; `SHUF1_A` and `SHUF1_B` differ ONLY in the permutation.

## 4. THE STATISTIC

v4698's, unchanged: the fold is the unit, A(fold, arm) is the mean held-out AUC
over the ten seeds, a fold with a minority class under `minorityFloor` is
excluded from its labels alone, and fewer than five usable folds -- derived, not
chosen -- means nothing is reported.

## 5. THE PRIMARY -- H5

**H5: the absolute feature set transfers to unseen content.** Over the usable
folds, `d = A(V1) - A(SHUF1_A)`, tested one-sided by **paired t AND exact
sign** at `p < alpha` with a **positive mean** (`pairedBoth`). One clause, so no
intersection-union.

The price is v4698's: at seven folds the sign test clears only at 7 of 7, and
one fold against the direction fails H5. `edges` is named here in advance: at
x2 every learned arm ranked below 0.5 on it, and if that recurs at x4 H5 fails
on it by construction of the test.

## 6. CONTROLS

- **C11:** `A(SHUF1_A) - A(SHUF1_B)` must clear in NEITHER direction. If it
  fires, stop, report the harness, report nothing measured through it.
- **C12:** re-running one fold, every arm, one seed -- the first entry of each
  declared list -- must reproduce the recorded AUCs bit for bit.
- **C5:** no fold's scaler or weights see its held-out scene, checked on the
  runner's records.
- **C13 (the twin IS the twin):** on synthetic data whose training labels are
  constant, a permutation is the identity, so `SHUF1_A` must reproduce `V1` bit
  for bit and `SHUF_A` must reproduce `V2`. That is what proves each shuffled arm
  trains on the feature set its name says -- the property v4699 got wrong in
  prose. Asserted in this round.

## 7. SECONDARIES -- REPORTED, NEVER PROMOTED

- **S15:** A(V2) - A(SHUF_A) at x4 -- v4699's clause (a) at a fresh cell.
- **S16:** A(V1) - A(V2) at x4 -- v4699's clause (b), sign reversed.
- **S17:** the `edges` fold for every arm, and its base rate.
- **S18:** per-fold base rates at x4 beside v4699's x2 ones -- how far the
  regime moved the label.
- **S19:** across-seed standard deviation per fold per arm.

## 8. WHAT WOULD MAKE THIS ROUND A FAILURE, IN ADVANCE

- **H5 fails** -> v4699's observation does not replicate as a matched
  comparison at a fresh cell. Section 2 says what that cannot distinguish.
- **H5 clears** -> the next question is the one v4698 section 7 already named:
  whether a threshold on this ranking recovers any of the oracle's 0.32 dB. It
  is not asked here.
- **C11 fires, or fewer than five usable folds** -> nothing is reported.

## 9. THE DECLARED CONSTANTS

```declared
scenes = zone smooth checker bars edges noise ramp
seeds = 11 12 13 14 15 16 17 18 19 20
alpha = 0.05
minFolds = 5
minorityFloor = 0.01
steps = 4000
hidden = 16
lr = 0.05
batch = 32
upto = 40
speed = 4
```

## 10. WHAT THIS ROUND CANNOT CONCLUDE

- Anything about content beyond seven synthetic scenes, or motion beyond x4.
- Anything in dB.
- Anything about FSR4, a bigger network, or real hardware.
