---
name: swek-gate
description: Write a SweK selfcheck gate that grades a claim against an answer key rather than against itself. Use whenever adding or repairing a `*-selfcheck.mjs` in the SweK Engine tree, adding a check to an existing one, or deciding whether a proposed measurement is worth building. Codifies key-not-mirror, plant-as-parameter, shown-failing, and the front door — the four things that took two thousand versions to learn and are re-learned by anyone who skips them.
---

# swek-gate

A SweK gate is not a unit test. A unit test asks whether the code does what the
code says. **A gate asks whether the code is right**, and the difference is an
answer key that the code was never told.

Everything below was earned by getting it wrong first. The version numbers are
the receipts; read the named file when the reasoning matters.

## 1. The key must be EXTERNAL, and the test for that is one sentence

> **A key is external when the route that measures the value is independent of
> the route that set it.** (v3201)

A declared parameter recovered from *behaviour* is a key. The same parameter
read back through the map that declared it is a **mirror**, and a mirror always
passes. xpbd/muscle was refused for exactly this and the refusal is still in
`volume-selfcheck.mjs` section 6, with its own antidote attached.

Good keys in this tree, as patterns to reach for:

| shape | example |
|---|---|
| a closed form the code is never told | a diffuse sphere in a white furnace reads **exactly** its albedo (v3467) |
| a second, unrelated route to one number | path sampling vs midpoint quadrature agreeing to 0.15% (v3493) |
| an **order**, not a value | error quarters as spin doubles, ratio 4.002 (v3197) |
| a **bifurcation** | bisect the stick/slide transition and mu comes back to 3e-5 (v3200) |
| a value with **no closed form**, so it cannot be recited | zeta(3) (v3198) |
| a parameter that **must not matter** | the answer must not move when the algorithm does (v3468) |
| an **exact invariance** | a sphere behind the shading point changes nothing, bit for bit (v3469) |

**Never type a reference value the gate compares against — derive it.** And
never guess a config to make a claim traceable; that is fabricating provenance.

## 2. A true, exactly-satisfied identity is NEVER sufficient

Six instances and counting. Oscillation's unitarity misses a 27% phase error.
Lensing's magnification difference misses a tenfold Einstein radius. Friedmann's
Omega closure misses *anything*, because Omega_k **is** the remainder.
`E <= 1` for a compensated BRDF is the physically obvious form and it would
**certify** the plant that invents energy (v3492).

> **An exact closure is proof of consistency and never of correctness.**

If the check you are about to write is an identity, ask what it is blind to and
write the second check first.

## 3. The plant is a PARAMETER, never an edited copy

```js
export function build({ mode, config = {} } = {}) {
    const planted = !!config.planted;      // one flag, threaded to the site
    ...
}
```

Clean and planted then take the **same code path with the same seed**, so a
difference cannot be a difference between two bodies of code. An edited second
copy could differ somewhere else and the measurement would attribute the gap to
the wrong line (v3494 makes the naive GLSL variant from the stable one by
replacing exactly one line, and *asserts that the replace happened* — a silent
no-op would leave them identical and every comparison would read a comfortable
zero).

**Plant the fault a real person makes**, not an invented one. Smith's Lambda for
*Beckmann* used with GGX's D is a real function, correctly implemented,
published beside the right one (v3490). Those are the ones that ship.

## 4. The load-bearing negative must be SHOWN FAILING

A claim about absence is worth nothing until something has been watched to break
it. Better than planting a synthetic violation: **derive the adversarial input
from the thing's own definition.** A ratchet nobody has seen fail might not fire
— v3142 stored keys, planted a sabotage, and it passed.

**The best negatives do more than fail:**

- fail by a **predicted amount** — linear in the nudge (v3196)
- ask for something the cheat **cannot supply** (v3198)
- vary a parameter with **no physical meaning** and demand the answer not move (v3199)

And the recurring result of the whole render arc, worth expecting rather than
discovering: **the check everybody writes first is blind to the plants a real
person actually makes.** Told apart by the **trend**, not by whether the number
is small (v3420's Hall rule). If two plants disagree in opposite directions,
say so — a bound catches one and an equality catches both. **A bound is not a key.**

## 5. Assert the PROPERTY, never the arrangement that satisfies it today

Twenty-three-plus instances, most of them mine, several committed *one round
after* writing the law down again. Species to recognise: mechanism moved; a
defect encoded as the expectation; an artefact encoded as the expectation; a
round's outcome frozen; a diagnosis frozen as an invariant; a count pinned where
the distinction was the point.

**The antidote that actually works** — name the correct response in advance,
inside the gate:

```
// WHEN somebody closes this hole, THIS LINE GOES RED AND SHOULD BE REWRITTEN
// STRONGER, NOT DELETED.
```

v3196 wrote it, v3197 hit it and did the right thing. It is the only thing that
has reliably prevented a loosened threshold.

And when a refusal is later satisfied: **retire it by satisfying its reason and
handing the guard to whatever now holds it** (v3499). Delete, do not weaken.

## 6. Separate the instrument from the subject

- **Prove the instrument before believing a null.** A null result from an
  instrument nobody showed working is unfalsifiable (v3177's shape). v3507's
  autocorrelation reads 1.0000 / -1.0000 / 0.0086 on synthetic fields whose
  answers were worked out before the code ran.
- **Tell quadrature from physics by the ORDER, not the size** (v3490).
- **A convergence study that keeps refining one parameter eventually measures a
  different error source**, and the give-away is the ratio falling away from the
  order rather than holding. Prove the floor by **lifting** it (v3492).
- **Derive the tolerance from the estimator's own noise**, not from a chosen
  percentage. Combined standard errors, not "within 2%" (v3495).
- **A mean over a band is the statistic; one sample is a sample.** One alignment
  measures alignment, not order (v3416, v3509).
- **Erode the edge.** Coverage samples pixel centres while a renderer jitters, so
  silhouette cells mix subject and background (v3473) — and the same applies to
  a text measure of the same picture (v3509).

## 7. Three guesses means the instrument is underpowered

Not that the next guess will be better (v3411, and v3500 the other way round).
When two explanations have failed, **stop hypothesising and build the
instrument**: dump the raw values and look at them. v3501's defect was visible
in the first line of output once anything printed one.

## 8. Prose is not code

- `codeOnly()` for an **idiom** — it strips comments *and strings*
- `noComments()` for **text the code contains**
- `prose()` for "does this file explain itself"
- a shader in a template literal needs its **own** comment strip
- a phrase wrapping across a comment line break **will not match** — unwrap once:
  `src.replace(/\n\s*\/\/\s?/g, " ")`
- **a check can count its own warning** as the thing it warns about; assert an
  absent *import* or *script tag* rather than an absent mention

Five consecutive rounds were lost hunting a string through `codeOnly()`. The real
correction is not "use noComments" — it is **stop matching source for a behaviour
you can drive**.

## 9. Every gate needs a front door

Keith's standing rule: **a module with no caller is unfinished**, and a CLI-only
deliverable is not done. Prefer an in-engine page or a server route with an HTML
front end. If the output is a report rather than a verdict:

> **A reporting tool must print and exit ZERO; a gate that fails must exit
> NONZERO.** An empty report and a tool that never ran are indistinguishable —
> exit 0 with no output reads as a clean bill (v3416).

Register reports in `tools/ship/reportingTools.mjs`'s `REPORTING` list so
`tools.html` runs them, and **name the tool in its own output, in brackets**, or
`toolFrontDoor-selfcheck` will fail you — correctly.

## 10. The shape of the file

```js
// WebGLEngine/<area>/<thing>-selfcheck.mjs -- vNNNN
//
// Run: node <area>/<thing>-selfcheck.mjs   (~Ns)
//
// *** WHAT THIS GRADES AND AGAINST WHAT, IN THE FIRST PARAGRAPH. ***
// Then the honest limit, stated BEFORE the result rather than after it.
"use strict";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
// ... sections, each with its measurement SAID before it is asserted ...
console.log(fails ? "\n<thing>-selfcheck: " + fails + " FAILED" : "\n<thing>-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
```

`!!` marks the load-bearing lines. **Say the measured numbers with `say()` before
asserting them**, so a red gate tells a reader what it saw and not only that it
was unhappy.

## The habits that stop the rest going wrong

- **Check the tree, not the notes.** Every open-list file here has been wrong.
  `find` before `node` — a guessed gate path exits 1 with MODULE_NOT_FOUND and
  reads exactly like a failing gate.
- **Do not pipe a gate through `tail`** — it eats the exit code.
- **State the honest limit in the file, before the result.** A round that reports
  a closure without saying what it does not establish is overclaiming.
- **One change per round.** A move and the tool that automates the move are two
  changes; doing both means neither gets checked alone.
