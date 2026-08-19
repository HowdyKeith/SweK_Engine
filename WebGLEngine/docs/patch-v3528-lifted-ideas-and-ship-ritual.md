# SweK Engine — incremental patch v3526 → v3528

Two lifted ideas (**v3527**) and **the ship ritual declared once** (v3528). Eleven files, cumulative from v3526.

Apply by copying `WebGLEngine/` over the tree.

---

## v3528 — The ritual was written twice, and the second copy had gone entirely wrong

You called this one, and it was worse than "a risk." Measured at v3527, the handoff's State block still read:

| declared | actual |
|---|---|
| Engine **v3034** | v3527 |
| **79 checks** | 77 |
| **482 gates** | 862 |
| **27 devices** | 63 |

**Four numbers, all wrong, 493 versions of drift.**

Not carelessness — it's the second-declaration failure this lab keeps finding *in its own instruments*: `promptCost`'s device count multiplying through a cost model, `case-study`'s gate count baked into a page, `gateReach`'s population pin that went red and stayed red until it became wallpaper. Every one was a fact the tree already knew, written a second time somewhere nothing read.

### The fix is not to synchronise the two. It is to stop declaring it twice.

Six steps declared once as **data** in `tools/ship/shipRitual.mjs`, each carrying its own verification or naming the gate that does. The numbers aren't declared at all — they're read.

> A step that cannot say how you would know it worked is not a step in a ritual, it is a habit.

```
node tools/ship/shipRitual.mjs
ship ritual — 6 steps. Tree is at v3528 (brain v3528), 863 gates indexed.
```

**The order is load-bearing and asserted:** index and derived counts rebuild *before* verify — reversed, verify checks yesterday's numbers and passes.

### Two declarations are kept on purpose

`ENGINE_VERSION` in `main.js` and `BRAIN_BUILD` in `brain.js` are duplicated **deliberately**, because `verify` reads both and refuses when they disagree — which is also why it refuses to run without `--version` at all.

**A deliberate cross-check is not accidental duplication.** The difference is whether anything reads the second copy. The handoff keeps what is a **rule** (the `--affected` pre-filter is never a ship; verify's refusal) and surrenders what is a **count**.

*Provenance: the shape is from moazbuilds/CodeMachine-CLI, refused as code because SweK is the thing being built rather than a workflow to build it. A declared re-runnable workflow file was the one part worth taking.*

### And the wrapped-phrase trap, a third time

The gate's own check hit it — here in **markdown**, where `sourceScan`'s `prose()` strips `//` from *source* and cannot reach. Collapsing whitespace is the fix, and **the gap in that cure is now recorded** rather than rediscovered a fourth time.

## v3527 — Two ideas lifted, no code taken

**QeRL's inverted claim** → `trendVsNoise`. Noise-as-benefit is a nuisance parameter claimed as a *benefit* — the inverse of criterion 2. `corroborate()` computes `seedSpread` at one point; nothing had ever compared a **trend** against it. Three verdicts, and `UNRESOLVED` is deliberately not "no effect". The **ising.L shape is a fixture**: a cleanly monotone rising sequence from pure noise with slope exactly zero, refused at ratio 0.45 — and monotonicity gets no vote.

**LightReasoner's contrast** → `routeContrast`. The disagreement was already being produced and discarded: every `routeBench` escalation is a task where the weak route was wrong and the strong one right. **The gate has already ruled on every attempt**, so this is a partition of graded outcomes rather than a proxy for a grade — which is the only reason it's adoptable. The cell worth reading hardest is *cheap-passed-strong-failed*, reported per task, not as a rate.

## Verification

```
verify.mjs --version v3528     ALL GREEN — safe to present_files
shipRitual-selfcheck           12/12 all passed
liftedIdeas-selfcheck          15/15 all passed
staleness / caseStudy / labDevices   all pass
instruments 87 -> 90           knowledge index 863 gates
```

## Still open — all needing the rig

```
node tools/ship/nextRounds.mjs     2 UPSTREAM, 4 HARDWARE, 0 OPEN
```

The browser-screenshot floor remains the keystone: it unblocks both UPSTREAM items at once, and it's two commands on hardware you already run screenshots on.
