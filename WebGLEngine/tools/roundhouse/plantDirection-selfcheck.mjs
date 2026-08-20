// WebGLEngine/tools/roundhouse/plantDirection-selfcheck.mjs -- v3917
//
// *** A PLANT AND A LOAD-BEARING NEGATIVE SEPARATE IDENTICALLY, AND UNTIL THIS GATE NOTHING IN THE TREE COULD
// TELL THEM APART. ***
//
// probeModePlant has asked one question since it was written: does the declared observable MOVE between the two
// arms? That is separation. It is not wrongness. A control moves its observable just as far as a plant does --
// in the opposite direction -- and the census counted both as coverage.
//
// The rule that separates them was written down at v3688, in the comment above declaredControlMode: "a plant
// moves the claim's observable AWAY from its ideal; a control moves it TO the ideal." IT WAS PROSE. Nothing
// re-derived it, and this tree's own note for that shape is that a wiring claim written down where nothing
// re-derives it is a fact about the past.
//
// v3916 found what it cost. spacefill's `raster` mode was declared a plant at v3902 on the strength of `breaks`
// moving 0 -> 63. But 63 is the ANALYTIC KEY for a raster at order 6; breakErrAbs, the device's own error
// observable, is exactly zero in BOTH arms; and spacefill-selfcheck has printed "the raster mode BREAKS, and by
// exactly the derived amount ... which is exactly why the negative is a MODE OF THE DEVICE" since v3174. Two
// prose claims about one device disagreed for fourteen versions. probeModePlant blessed the wrong one.
//
// *** TWO POPULATIONS, TWO TREATMENTS, AND THE SECOND ONE IS THE HONEST PART. ***
//
// Where plantFlips names an ERROR-LIKE observable, direction is decidable from the two builds alone and this
// gate WALLS IT AT ZERO: 33 of 33 pass today, so there is no exception to grandfather and no floor to set below
// the truth. Where plantFlips names something else -- `breaks`, `order`, `netForce`, `r2Val`, `moltenFraction`
// -- there is no ideal in evidence and the direction CANNOT BE READ. Those are not failures and they are not
// passes. THEY ARE THE POPULATION SPACEFILL SAT IN, they are named one by one, and they are ratcheted so the
// unreadable half cannot quietly grow while the readable half looks green.
import * as D from "./devices.mjs";
import { plantDirectionCensus } from "./plantedCoverage.mjs";
import { ratchet } from "./coverage.mjs";

let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const c = await plantDirectionCensus(D);

// ---- 1. THE SPLIT IS REPORTED BEFORE ANY VERDICT -----------------------------------------------------------
say(c.total + " declared mode plants: " + c.readable.length + " with an error-like plantFlips where direction is " +
    "READABLE, " + c.unreadable.length + " where it is not");

// ---- 2. THE WALL: A READABLE PLANT MUST MOVE ITS OBSERVABLE THE WRONG WAY -----------------------------------
ok("!! *** every plant whose observable IS error-like moves it AWAY from ideal ***",
   c.wrongWay.length === 0,
   c.readable.length + " readable, " + c.wrongWay.length + " going the wrong way" +
   (c.wrongWay.length ? " -- " + c.wrongWay.map((r) => r.device + "[" + r.mode + "] " + r.why).join("; ")
    : ". A CONTROL WEARING A PLANT'S LABEL WOULD SHOW UP HERE AS `better`, and a mode that separates without " +
      "being wrong as `unmoved` -- spacefill's raster was the second kind and was counted as coverage for " +
      "fourteen versions"));

// ---- 3. AND THE WALL IS NOT VACUOUS: THE READABLE POPULATION IS REAL ----------------------------------------
const rr = ratchet({ have: c.readable.length, what: "plants with a readable direction", floor: 33 });
ok("!! ...and that wall guards a population that does not shrink", rr.pass,
   rr.evidence + ". A wall at zero failures is free if the population it walls goes to zero, so the population " +
   "is ratcheted separately -- v3081's lens read 107% movement on a device ignoring its config, and the lesson " +
   "was that the count and the property are two claims");

// ---- 4. THE UNREADABLE HALF IS NAMED, NOT ROUNDED OFF ------------------------------------------------------
say("UNREADABLE, " + c.unreadable.length + " of them -- plantFlips names no error, so nothing here shows the");
say("  planted arm is WRONG rather than merely DIFFERENT. This is the spacefill shape, undetected:");
for (const r of c.unreadable) say("    " + r.device + " [" + r.mode + "] flips=" + r.flips);

const ur = ratchet({ have: c.total - c.unreadable.length, what: "plants that are NOT in the unreadable half",
                     floor: c.total - 33 });
ok("!! *** the unreadable half is counted, named and NOT folded into the coverage number ***", ur.pass,
   c.unreadable.length + " unreadable of " + c.total + ". Reporting 66 plants while half of them cannot be shown " +
   "to be wrong is the flattering number, and this gate exists because the flattering number was the one the " +
   "census printed");

// ---- 5. THE DISCRIMINATOR IS DRIVEN, NOT BELIEVED -----------------------------------------------------------
// A gate that can only agree is not a check. Hand the probe a device whose 'planted' arm is BETTER and require
// the verdict to be `better` -- the exact shape probeModePlant cannot see.
const fake = {
    modes: ["honest", "tooGood"], plantMode: "tooGood", plantFlips: "shapeErrFrac", plantKind: "knob",
    build: async ({ mode }) => ({ shapeErrFrac: mode === "tooGood" ? 0 : 5e-2 }),
};
const { probeModePlantDirection, probeModePlant } = await import("./plantedCoverage.mjs");
const drove = await probeModePlantDirection(fake);
// The claim "the old probe would have passed this" is DRIVEN, not asserted. A gate that describes the bug it
// closes without running the buggy path is describing the past.
const oldProbe = await probeModePlant(fake);
ok("!! the direction probe is DRIVEN with a control mislabelled as a plant, and calls it",
   drove && drove.verdict === "better",
   "verdict=" + (drove && drove.verdict) + " on an arm whose error goes 5.000e-2 -> 0.000e+0");
ok("!! ...and the OLD probe is run on the same device and PASSES IT -- that is the gap, measured",
   oldProbe && oldProbe.ok === true,
   "probeModePlant ok=" + (oldProbe && oldProbe.ok) + " (" + (oldProbe && oldProbe.from) + " -> " +
   (oldProbe && oldProbe.to) + "), because 0 !== 0.05 and separation is all it asks");

const fakeFlat = { ...fake, build: async () => ({ shapeErrFrac: 5e-2 }) };
const droveFlat = await probeModePlantDirection(fakeFlat);
ok("...and an arm that does not move at all is `unmoved`, not silently accepted",
   droveFlat && droveFlat.verdict === "unmoved", "verdict=" + (droveFlat && droveFlat.verdict));

const fakeUnread = { ...fake, plantFlips: "breaks",
    build: async ({ mode }) => ({ breaks: mode === "tooGood" ? 63 : 0, breakErrAbs: 0 }) };
const droveUnread = await probeModePlantDirection(fakeUnread);
ok("!! ...and SPACEFILL'S OWN SHAPE reads `unreadable` rather than passing",
   droveUnread && droveUnread.verdict === "unreadable" && droveUnread.sideWorse.length === 0,
   "verdict=" + (droveUnread && droveUnread.verdict) + ", side error fields worse: " +
   ((droveUnread && droveUnread.sideWorse.length) ?? "?") + ". breaks 0 -> 63 with breakErrAbs 0 in both arms is " +
   "the declaration v3902 made and v3916 withdrew");

console.log(failed ? "\nplantDirection-selfcheck: " + failed + " FAILED" : "\nplantDirection-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
