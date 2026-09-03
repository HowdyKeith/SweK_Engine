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

## 1. The register keeps a rendering where it should keep the source -- MEASURED v4401, SURFACED v4402

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

**And there was no point of use to render at.** `fails:` is read by four files, all gates
or the freezer, two of which only assert it is a string longer than ten characters. **Zero
HTML files mention the register.** The tree's own debt list -- 27 standing reds -- was
reachable only by reading a `.mjs` or running a gate, which is v4379's RIG_ONLY finding on
the most consequential list it keeps. v4402 gives it one: `registerDrift` emits the
register through v4395's mechanism with **the audit's line beside the filed one**, and
`instruments.html` renders it. The nine divergences stop being a count and become a column.

**Shipped:** `tools/ship/registerRender.mjs` derives the display line from the audit and
classifies each entry into five outcomes rather than "matches / differs". `fails:` is
*not* deleted -- it is the historical claim, and the distance between it and the run is
the number this measured. What remains open is narrower now: `redCensus.mjs` still *stores* the typed line, and a
reader who opens that file rather than the page still meets it. Making the module itself
generated is a change to a file two branches edit every round, and this round declined it.

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

## 4. Claims have the register's problem too -- MEASURED at v4404

241 claims, stored as prose plus a settled/open/broken flag. Each carries `kill:` -- the
condition that would kill it -- and `where:` -- the files it rests on. **Both are
sentences.** Nothing resolved the path, nothing ran the gate, and nothing had ever asked
whether a claim's own stated killer was firing.

**One was.** *"The selfchecks and the server survive Windows path semantics"* was marked
**settled**; its kill named `tools/ship/winPathGuard-selfcheck.mjs`; its measured read
*"it is, so every straggler was caught"*. That gate reports **twenty offending
occurrences** and has been in the red register as long as the register has existed. The
claim is marked **broken** at v4404 with the measurement -- what this tree does with a
falsified prediction, and what its other nine broken entries are for.

Measured across 241: **182 gated** (the falsifier is runnable), **52 prose** (no runnable
falsifier -- 32 of them settled), **7 dangling** (evidence names a file that is gone),
**1 contradicted**, now 0. `tools/ship/claimEvidence.mjs` classifies into those four and
excludes each field's `SABOTAGE:` clause, which names files *on purpose* that should not
resolve -- counting those reported three references never meant to exist.

**The limit, stated in the gate itself:** this can only see a claim whose falsifier is a
gate the red register already tracks. A claim naming a *green* gate that no longer tests
what the claim says is invisible to it. The one contradiction was found because the
register already knew -- not because the detector is good at looking.

## 5. A scanner counts a record ABOUT a thing as the thing -- DONE at v4412

`tools/ship/orreryFleetScan.mjs` decides which files import a vendored body by looking for
its path. It strips **comments** -- which is why `physics/backendDivergence.mjs`, whose
header discusses box3d and imports nothing, correctly dropped out at v4406 -- but it does
not strip **string literals**. So `tools/ship/gateSweep.mjs` became a box3d importer,
because a sweep closing's `verdict:` string quotes `"/vendor/box3d/box3d.js"` at line 565
while explaining that `box3dLoader` imports it.

**Fifth sighting of the shader census's defect, in a fifth scanner:** a detector that
counts the *word* rather than the *thing*. v4383 found it in `shaderCensus`; v4404 found it
in `claimEvidence`, where a `SABOTAGE:` clause names files on purpose that should not
resolve.

The honest fix is a **positional** test -- a path counts only in an `import` / `require` /
`fetch` / `new URL(` position -- and that test moves counts across all 138 satellites, so
it is a round of its own rather than a line. `world/orreryEjecta.mjs` also holds a frozen
baseline (box3d 21, three-webgpu 7) that the tree has grown past (28 and 11), which is
v4399's ratchet lesson: **freeze by name, not by count.** Both readings must be re-derived
together or the gate just moves from one wrong number to another.

**Done at v4412.** `tools/ship/importPosition.mjs` asks the question positionally, and the answer is that the
old rule was wrong **in both directions**: of its 138 entries **12 are records**, and it never saw **17 files**
that reach a body through `path.join(..., "vendor", name, ...)`. The corrected population is **143**. The
baseline is now a frozen list of *names* with the counts derived from it -- and that ratchet named this round's
own new gate joining box3d's fleet within the hour, which is the scanner counting the scanner for the third
recorded time. Two of the three bodies the orrery drew as pure paperwork turn out to be reached by real gates.

**And v4329's deleted guard would not have caught it.** The offending mention *is* quoted. The question is not
whether the path sits in a string; it is whether the string **is** the path.

## 6. A third of the tree is run by no ship-time step, and the exclusion is a ONE-WAY DOOR -- v4407

**502 of 1,439 gates are over the quick sweep's 3,000 ms budget.** The quick sweep (v4303)
is honest about being quick, and the full two-phase sweep covers the rest -- but the full
sweep runs when somebody decides to run it, and `orreryFleet-selfcheck` spent eight rounds
red inside that gap before v4406 looked.

**The worse half is the mechanism.** `tools/ship/sweep-timings.json` stamps ONE `captured`
date on all 1,440 entries, and the run rewrites only the ones it ran -- so 502 readings
carry a date they did not earn. And the budget decision is made *from* those readings, so a
gate that got faster is never re-measured and therefore never re-included. **Once over
budget, never re-timed, therefore over budget forever.**

Measured at v4406: of the over-budget population, **130 hit the 20 s cap** (a killed
process's exit code is not a verdict -- v4392's rule, sitting in a data file 130 entries
deep), 13 finished and exited nonzero, and **4 of those are named by no register list at
all**. Run by hand, all four are GREEN -- and three of them finish in 1.3 s, 1.9 s and
2.2 s, comfortably **under** the budget that excludes them.

## 7. The register's reader surface went red on a STALE AUDIT, not a probe bug -- DONE at v4412

`tools/ship/gateReport-selfcheck.mjs` section 7 (v4402) failed with 32 rows on screen
against 27 in the report.

**The v4408 diagnosis was wrong, and saying so is the point of writing it down.** It read
27 + 5 as the size of the report's first two tables and concluded the probe was counting
across a container that had gained one -- a page/probe mismatch. It was not. The register
AUDIT was thirteen rounds stale, past `registerDrift-selfcheck`'s twelve-round cap, and the
page was rendering a different vintage of the register than the report held. Re-freezing it
with `tools/ship/freezeRegisterAudit.mjs` -- which is what that tool exists for -- cleared
both gates: 27 against 27, and nine divergent entries all showing the audit's line.

A plausible arithmetic coincidence (27 + 5 = 32) is not a diagnosis. Nothing had run the
tool that owns the record.

## 8. An author-centred orrery -- OPEN, requested

The orrery draws this tree at the centre with its dependencies around it. Keith asked for
the inversion: **the author as the sun**, a GitHub universe centred on a person rather than
a repository.

**The opening measurement is already taken and it is the whole problem:** `orrery.json`'s
15 bodies carry `[name, arrived, sha, bytes]` plus `files`, and **no owner, url or repo
field on any of them.** The orrery records *what this tree took* and nothing about *who
from*. An author-centred view needs exactly the field the bake has never collected, so the
first round is a provenance bake, not a renderer.

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
