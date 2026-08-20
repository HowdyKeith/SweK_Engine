---
name: swek-device
description: Add a device to the SweK roundhouse lab so a graded physics module becomes something the lab can RUN, not just something a page can show. Use whenever writing a `*Bind.mjs`, registering in `devices.mjs`, deciding whether a module deserves a device at all, or chasing a red in deviceModes / deviceInstrumentMap / plantedCoverage / promptCost after a device lands. Covers the eight registration steps that are each individually forgettable and collectively load-bearing.
---

# swek-device

A device is how a physics module becomes **runnable** rather than merely
viewable. Without one a module can be looked at and not run: no lab export, no
corroboration, no planted-error census, no lab-results row.

> **An instrument you can look at but cannot run is half an instrument.** (v3420)

## First: does it deserve one?

Not everything does, and adding one to something that does not is worse than
leaving it alone.

- **A lab device needs an ANSWER KEY. A solver needs a proof of
  self-consistency.** Of xpbd's seventeen modules only four claim anything
  checkable outside the code; the other thirteen claim determinism, GPU/CPU
  equivalence or coupling — **and that is what a solver IS** (v3200).
- **An import moves the coverage count and grades nothing.** v3199's first
  version imported `angles.js` and never called it. **Coverage is a means, not
  the goal.**
- **Its own registry row, or an existing one?** The test is whether an existing
  bind **shares its substrate**. Topical adjacency is not enough — a row on a
  device that shares no module with it is a link nothing can check (v3422's
  white dwarf, v3423's centrifuge, v3496's sdfmarch).
- **Before proposing anything, read `decisionIndex`** — it walks every selfcheck
  header and reports the ones recording a decision *not* to do something. A
  decision looks exactly like an absence from outside the file that records it.
  Six rounds in one session were spent proposing work already done.

## The bind

```js
export const THING_MODES = ["a", "b", "c"];          // declared ONCE
export const THING_OBSERVABLES = ["x", "y", "planted"];

export function defaults({ mode = "a", config = {} } = {}) {
    if (!THING_MODES.includes(mode)) return null;     // a REFUSAL, not a substitution
    return { mode, config: { ...DEF, ...config } };
}

export function build({ mode = "a", config = {} } = {}) {
    if (!THING_MODES.includes(mode)) throw new Error("thing: undeclared mode " + mode);
    ...
}

export const thingDevice = {
    plantKind: "knob",                 // knob | reader | method  -- see below
    modes: THING_MODES,                // THE SAME OBJECT, not a copy
    name: "human-readable-name", observables: THING_OBSERVABLES, build, defaults,
};
```

**Four things that are each a real defect this tree has already shipped:**

1. **Declare the modes ONCE.** An inline literal (`modes: ["a", "b"]`) is a
   bind's own single source and is perfectly fine — 46 of the 72 binds do
   exactly that. What is forbidden is a **second copy**: if you export the array,
   `modes:` must be **that same object**, and the gate asserts it by identity
   (`dev.modes === THING_MODES`). The mode list written twice is this tree's
   most-repeated defect — MODES lived in nine files, and in two binds the two
   copies had **already disagreed**, so a working mode was invisible to every
   registry-driven tool (v3420, v3421). v3442 then had to rewrite `singleSource`
   **structurally**, because pinning the identifier `MODES` failed five binds
   that had correctly started exporting one — *the correct fix for one
   two-declaration defect tripped the gate that guards against them*.

   > This paragraph originally said `modes:` must always be a named export.
   > `skillClaims-selfcheck` re-derived it against the tree on its first run and
   > **the skill was wrong** — which is the entire reason that gate exists.
2. **An undeclared mode must be REFUSED.** Three devices once echoed back *any*
   string, so `checkMode` — built specifically to refuse — refused nothing on
   them. A declared mode silently returning another mode's answer is a plausible
   result to a question nobody asked, which is worse than a red gate.
3. **Every declared mode must produce a DISTINCT answer.** A branch that changed
   nothing would be a mode in name only (v3194).
4. **The observable list must match both ways** — nothing returned that is
   undeclared, nothing declared that is never returned. A stale name is a menu
   item a proposer can pick and the device can never answer.

**Naming an observable is a decision, not a label.** A field called `err` is one
a proposer will write a `max` claim against; if the number has no verdict
attached, call it `indicatorResidual` and return `mayConclude: false` (v3487).

**`plantKind` is read off the code, not guessed**: `knob` moves a parameter,
`reader` misreads a result, `method` substitutes the procedure itself (v3400's
taxonomy, corrected by reading sixteen undeclared plants).

## The eight registration steps

Each is individually forgettable. Missing any one produces a red somewhere else,
usually two rounds later.

1. `tools/roundhouse/devices.mjs` — import and add the lazy entry.
2. `tools/roundhouse/promptCost.mjs` — bump `devices:`. **The count MULTIPLIES
   the cost model rather than decorating it**, so `verify` catches it — which is
   the only reason a number that must be hand-edited has survived.
3. `tools/roundhouse/run-device.mjs` — a `DEMO_HYPS` entry: one mode, one claim
   the device can actually settle.
4. `physics/instruments.mjs` — the instrument row. **`gate:` names the MODULE's
   gate, not the device's** — a device gate reaches physics only through the
   bind, so a row naming it shares no module and the link can never be checked.
   pulsar, heidler, whitedwarf, xpbd and refscan each learned this separately.
5. `lab-results-baseline.json` — append **BY DELTA**, and assert in the write
   that no existing row moved. Re-freeze: `SWEK_FREEZE_LAB_RESULTS=1`.
6. `graded-coverage-baseline.json` — `SWEK_FREEZE_GRADED_COVERAGE=1`. The ratchet
   runs one way: a falling ungraded count is progress and must never fail a build.
7. The device's own `*Device-selfcheck.mjs`.
8. Run `deviceInstrumentMap-selfcheck` and `pageReach-selfcheck` **by hand** —
   `verify` does not run them, and three patches have arrived with one red.

## The detection map is the round's actual result

Not "the device works". **Which mode sees the plant, and how each one sees it
differently.** Build it into the gate:

```js
const rows = MODES.map((mode) => {
    const a = build({ mode }), b = build({ mode, config: { planted: true } });
    const keys = Object.keys(a).filter((k) => k !== "planted");
    const moved = keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    return { mode, moved, blind: keys.filter((k) => !moved.includes(k)) };
});
```

What to expect, because it keeps happening:

- **an observable BIT-IDENTICAL under the plant** while others move — then the
  magnitude says nothing there and the discriminator is elsewhere (v3496)
- **a plant that REMOVES the phenomenon** rather than mis-measuring it, so the
  observable must be a **reason string** and not a number (v3496's deadzone)
- **an order of ZERO is a different diagnosis from a wrong order** (v3423)
- a plant that is **exactly correct at one setting** of a knob, so a gate testing
  one configuration would certify it (v3493's crossing at alpha 0.6693)

## Standing traps

- **A NAME IS NOT A LOCATION.** `ct` lives in `tomographyBind.mjs`; `windtunnel`
  is exported as `fluidDevice`. Reachability is read from the **import
  specifier**, never from the name.
- **A substring match is not a match.** `lbm-fluid` missed the device `lbm`, and
  the conclusion drawn from it — "the roundhouse is the gap" — was wrong. The gap
  was a missing **declaration**.
- **An absent `device` field is a missing declaration, not proof of a missing
  device**, and which instruments deserve one is Keith's judgement, not yours.
- **A device with no `defaults()` is not a device with every mode** — it is a
  guard that cannot engage, and it is counted apart.
- Adding a device **changes numbers in four files**. Re-run the registry gates
  before shipping, not after.
