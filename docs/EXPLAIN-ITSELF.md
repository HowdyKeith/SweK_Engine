# Getting the engine to explain itself

Keith raised three things in one message: 3Blue1Brown-style animations, the `manim_skill`
agent skill, and ValkyrienSkies/Valkyrien-Skies-2. They are one thread.

**All three are ways of getting a simulation to explain itself**, and manim's real
discipline is not animation. It is that **the explanation is generated from the same
objects as the argument**, so it cannot drift from it. A caption can be wrong about a
number. A number rendered from the number cannot be. VS2's shipyard is the same move in
space: keep the canonical thing where it is exact, project it for viewing -- which is
this engine's own device-versus-shell split, and what v4388 to v4393 measured.

This file is the roadmap for that thread. Each item names what it would measure.

## 1. The register keeps a rendering where it should keep the source -- MEASURED at v4400

`tools/ship/redCensus.mjs` stores a **quoted failing line**: a projection of a gate run,
frozen at the moment somebody typed it. Three rounds in a row found it stale, each in a
different way -- v4380 filed `shaderCensus` at 14 against a line saying 4; v4383 found the
14 itself was false; v4386 found `referenceKind`'s line describing sweep bucketing rather
than the gate. One shape: **the stored projection went stale because the canonical thing
was elsewhere.**

`tools/ship/register-audit.mjs` already holds real runs. The move is to invert which is
canonical -- the audit becomes the record, `fails:` becomes derived, and `registerDrift`
stops being a comparison and becomes a projection.

**Measured.** Of 27 entries: **5** match a recorded line exactly, **12** are a
whitespace-normalised truncation of one -- a rendering by definition -- and **10** are
backed by no run at all. Those ten split cleanly: **9 quote a stale READING of a live
check**, 1 cannot be checked because the audit's 120 s cap cut the gate off before it
printed, and **zero name a check the gate no longer has**. So the register is not wrong
about *what* is failing; it is wrong about *how much*.

**And the check that existed to catch this was green throughout**, because it compares the
first 45 characters -- which reaches the end of an assertion's *name* and stops before its
*reading*. The two claims are now two checks.

**The source could not say when it was taken.** `freezeRegisterAudit.mjs` wrote
`at: "v4380"` as a string literal, so every re-freeze for twenty rounds produced a file
claiming v4380 -- including one taken at v4399 while measuring exactly this. It reads
`main.js` now, and the audit's age in rounds is a gated number.

**Shipped:** `tools/ship/registerRender.mjs` derives the display line from the audit and
classifies each entry into five outcomes rather than "matches / differs". `fails:` is
*not* deleted -- it is the historical claim, and the distance between it and the run is
the number this measured. What remains open is the last step: making the register's
display read from `renderFor()` at the point of use rather than from the stored string.

## 2. Gates emit verdicts, not explanations -- DONE at v4395

Measured before building: **1429 gates, 67 print rows of formatted numbers, 0 wrote
anything a second reader could open.** And `tools/ship/artefactWriters.mjs`, the register
that exists to answer exactly that question, could not see one of them -- its walk skips
`-selfcheck.mjs` by construction, so its zero read clean.

Shipped: `tools/ship/gateReport.mjs`, a place to put a table a gate already computed;
`shipyard-selfcheck` wired as the first, because its three tables are what the last four
rounds argued from; `instruments.html` renders any emitted report, cell for cell, with
each cell's exact value in its title. `gateReport-selfcheck` ratchets the population of
gates whose argument dies with the terminal: **66, and it may only shrink.**

Emitting is off by default (`SWEK_GATE_REPORT=1`), because registerResidue's rule is that
a stale artefact from an accidental run is worse than none, and a gate's table is not a
pure function of the tree -- the shipyard gate's device rows need a GPU.

## 3. Animate the emitted tables -- DONE at v4399

The tree already has `ui/canvasRecorder.js` and `ui/recordFloat.js` on 25 pages. A page
that animates an emitted report, plus the recorder, is manim's **output shape** with no
Python, no LaTeX and no FFmpeg. First subject: the four float32 encodings walking a body
out to 8.4 million while the error curves diverge -- already measured, already emitted.

**The reason this comes after item 2 and not before:** without emitted data an animation
is a caption with a timeline. It has to draw the report, not a copy of it.

**Measured, and the prediction landed:** the argument's strongest number is the one the
chart cannot draw. The shipyard's claim-local error is **exactly zero** at every distance
-- the whole point of that encoding -- and a log axis has no place for a zero. Nor does
the first distance, x = 0. **Nine of that table's twenty-one values are unplottable, 43%
of it, seven of them the value 0**, and the plot names every one under itself rather than
nudging a zero to 1e-16 and drawing a line that says "very small" where the measurement
says "none".

And the check that earned its keep was not membership but **coverage**: drawn plus
named-as-undrawable must account for every value the table holds. Membership is nearly
free when the plot reads the report directly, and it stays true when a plot draws *less*
-- only coverage sees a number quietly disappear.

The panel lives on `instruments.html` beside the tables, with the reference data-viz
palette's dark slots validated against that page's real surface (`#0e1512`), one log y
axis, a legend, selective endpoint labels, a hover crosshair giving the exact figure, and
`ui/canvasRecorder.js` wired so the unfolding can leave as a clip.

## 4. Claims have the register's problem too -- OPEN

241 claims, stored as prose plus a settled/open/broken flag. The canonical thing is the
measurement that settles one. Same inversion as item 1, bigger surface.

## What is deliberately NOT being taken

**The manim skill itself.** `npx skills add adithya-s-k/manim_skill` is a cheap
self-contained experiment and it buys this tree nothing directly: Python, LaTeX and
FFmpeg is a whole new toolchain for a project that renders in a browser and already has a
recorder. What transfers is the rule, not the library.

**Valkyrien Skies 2 as code.** LGPL-3.0, Java and Kotlin, coupled to Minecraft and to a
JVM. A design to read. v4388 read it and ported the shipyard as arithmetic.

**Manim as evidence, though, is worth a paragraph in `TSL-ROADMAP.md`.** v4383 concluded
this tree should not build an IR, and that TSL is "a three-stage shape someone else
maintains". Manim is a third instance of exactly that shape: `Scene` to a Mobject graph to
two renderers, Cairo and OpenGL. LLVM was the first, TSL the second.
