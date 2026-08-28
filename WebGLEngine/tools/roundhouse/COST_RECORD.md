# The cost record: what a census costs, measured

`device-cost-baseline.json` holds **484 build costs** and **116 sweep costs**, with an empty
`sweepAtLeast` — every device in the lab has a measured sweep cost and none is left as a bound.
`costRecord.mjs` reads it. This file is the reasoning that produced it, which otherwise lives only
in commit messages `v4049b`..`v4049l` and a module header.

Frozen `2026-08-27T22:35Z` (builds) and `2026-08-28T18:38Z` (sweeps). **4.79 hours of measurement.**

## The ten bounds that became measurements

A *bound* here meant "we stopped at 300 s and never found out". Ten devices carried one. All ten
were paid for:

| device | measured | build | sweep/build | vs. its old cut | % of budget |
|---|---|---|---|---|---|
| twof | 4053 s | 459 s | **8.8×** | — | 18 % |
| flip3d | 2898 s | 45.6 s | 63.6× | 9.6× | 41 % |
| kh | 1806 s | 64.6 s | 27.9× | 5.8× | 25 % |
| stability | 1395 s | 54.1 s | 25.8× | 4.5× | 40 % |
| freesurface | 954 s | 7.9 s | **120.2×** | 3.2× | 52 % |
| pipe3d | 839 s | 10.8 s | 77.7× | 2.6× | 34 % |
| kuramoto | 665 s | 20.5 s | 32.4× | 2.2× | 14 % |
| thermal | 470 s | 8.9 s | 52.9× | 1.6× | 23 % |
| windtunnel | 370 s | 7.6 s | 48.9× | 1.2× | 21 % |
| multigrid3d | 362 s | 7.0 s | 51.8× | 1.2× | 22 % |

**A cut bound is the budget, not an estimate.** Five of these were stopped at essentially the same
~300 s and their real costs sit anywhere from 1.2× to 9.6× above it. The bounds agreed with each
other almost exactly and told you nothing about each other, because what they recorded was where the
money ran out.

## Three cost models, measured and refused

Each was proposed as a way to *predict* sweep cost. Each was measured before adoption and refused.

1. **`rawCalls`** (v4040). The census already counts libm calls, so pricing a sweep by them would
   have removed the one hand-calibrated constant in scheduling. Measured: `kuramoto` makes **3.3×
   more** libm calls than `twof` and takes **15× less** time; ms-per-Mcall spans **267×** across the
   lab. A counter of one kind of work cannot price the others.
2. **The old sweep formula.** Spread **33×** against measurement.
3. **sweep ÷ build** (v4051). Spans **1.0× (`sackurTetrode`) to 185.3× (`xpbd`)** over 115 devices,
   median 12.8×. Restricting to devices whose builds exceed one second does not rescue it: 26
   devices, min 5.6×, median 48.5×, max 185.3× — still **32.9× spread**.

### Build cost does not predict sweep cost, and it kept looking like it would

Three predictions were made from build cost during the tier-2 run. All three were wrong, each in a
different direction:

- **`twof`** has by far the heaviest build in the lab (459 s) and was called near-certain to stay a
  bound. It swept **cheapest of all at 8.8×**, finishing in 18 % of its budget.
- **The "tight band" of 98–185×** among the six dearest ratios was nearly adopted as a central
  estimate. Those six were *selected as the six highest ratios*. `stability` and `flip3d`, measured
  immediately after, came in at 25.8× and 63.6×.
- **`kuramoto`**, largest build in its tier and twice singled out as the expensive case, finished at
  **14 % of budget** — the smallest fraction of its group.

A sweep costs what a device's **knob count and ladder shape** demand. How heavy one build is carries
no information about that. `twof` is the extreme: expensive to build once, cheap to sweep.

## What survives the refusal: a ceiling

A budget never needed a prediction — it needed an **upper bound**, and the upper bound is the part of
a bad model that is still true. No device has ever cost more than **185× its build**, so budgets were
set at **230×** (worst observed, plus 25 %).

Per-device budgets computed this way were **cheaper than the flat number they replaced**, not dearer:
tier-1 worst case fell from 6.0 h to 4.0 h. One flat budget simultaneously over-served five small
devices and left `kuramoto` short of what 185× implied for it.

**Nothing here finished outside its budget.** The dearest as a fraction was `freesurface` at 52 %.

## Variance: three findings, in order of how badly each misled

1. **Contention, mistaken for instrumentation.** A `kuramoto` sweep logged **1044 s** under load
   against **~28 s** measured directly, and a ~70× "instrument multiplier" was inferred from it. The
   real instrument overhead, measured directly, is **1.9× / 1.2×**. The rest was CPU contention from
   concurrently running jobs. *Never time a device while anything else is running.*
2. **Position in the census, not process isolation.** `twof.inlet` at one unchanging config timed
   115.7 s, 117.0 s — then 205.0, 207.7, 212.5 s. Both groups were instrumented, and the slow group
   ran **alone on an idle machine**. The split is *first heavy build in a fresh process* versus
   everything after it: eighty prior builds leave a heap that nearly doubles an LBM run. **So these
   are costs in census position, which is the quantity a budget actually needs** — the isolated
   115.7 s is the misleading number, not the 212.5 s.
3. **The noise floor, which makes the other two diagnosable.** `quantum` froze at 100481 ms and
   re-measured alone, in the same position, at **100264 ms — 0.2 % apart.** A lab whose repeats
   disagreed by 50 % could not have told either story above.

## What not to do with these numbers

- **They are not physics.** A cost record is consulted to decide whether to *attempt* a build, never
  to decide what one *means*. Every consumer must behave identically with the file absent, which is
  the state of a fresh checkout.
- **They are not portable.** Milliseconds on one machine under one load. `frozenOn` records the
  conditions; a reader is entitled to distrust them.
- **They are not a ratchet.** `corroboration-reach-baseline.json` exists to catch a number *falling*
  and says so. This one asserts nothing: a device getting slower is news about the device, and
  pinning costs with `===` would fire on every machine that is not the one that froze them.
- **`costFor` returns `null` for an unknown device, never zero.** Unknown is not free.

## Reproducing

`writeSweepCosts` and `writeCostRecord` in `costRecord.mjs` append measurements; `sweepCostFor` and
`costFor` read them. Measure one device at a time, alone, and write per device — a long run that
banks nothing until the end loses everything to one interruption.
