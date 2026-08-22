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
import { plantDirectionCensus, probeModePlantDirection, declaredPlantIdeal } from "./plantedCoverage.mjs";
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
const rr = ratchet({ have: c.readable.length, what: "plants with a readable direction", floor: 64 });
ok("!! ...and that wall guards a population that does not shrink", rr.pass,
   rr.evidence + ". A wall at zero failures is free if the population it walls goes to zero, so the population " +
   "is ratcheted separately -- v3081's lens read 107% movement on a device ignoring its config, and the lesson " +
   "was that the count and the property are two claims");

// ---- 4. THE UNREADABLE HALF IS NAMED, NOT ROUNDED OFF ------------------------------------------------------
say("UNREADABLE, " + c.unreadable.length + " of them -- plantFlips names no error AND the bind declares no");
say("  ideal, so nothing here shows the planted arm is WRONG rather than merely DIFFERENT:");
for (const r of c.unreadable) say("    " + r.device + " [" + r.mode + "] flips=" + r.flips);

ok("!! *** and an unreadable plant must REFUSE the direction test in prose, not merely fail it ***",
   c.undeclaredUnreadable.length === 0,
   c.unreadable.length + " unreadable, " + (c.unreadable.length - c.undeclaredUnreadable.length) +
   " carrying plantDirectionRefused" +
   (c.undeclaredUnreadable.length ? " -- SILENT: " + c.undeclaredUnreadable.map((r) => r.device).join(", ")
    : ". v3917 left this a silent bucket, and a silent bucket is where a spacefill hides. reaction's plant makes " +
      "its observable TIDIER on purpose and mpmcouple's constraint is one-sided; both are real plants that " +
      "direction cannot read, and both now say so and name what verifies them instead"));

const ur = ratchet({ have: c.total - c.unreadable.length, what: "plants that are NOT unreadable",
                     floor: 64 });
ok("!! *** the unreadable half is counted, named and NOT folded into the coverage number ***", ur.pass,
   c.unreadable.length + " unreadable of " + c.total + ". Reporting 66 plants while any of them cannot be shown " +
   "to be wrong is the flattering number, and this gate exists because the flattering number was the one the " +
   "census printed");

// ---- 5. THE DISCRIMINATOR IS DRIVEN, NOT BELIEVED -----------------------------------------------------------
// A gate that can only agree is not a check. Hand the probe a device whose 'planted' arm is BETTER and require
// the verdict to be `better` -- the exact shape probeModePlant cannot see.
const fake = {
    modes: ["honest", "tooGood"], plantMode: "tooGood", plantFlips: "shapeErrFrac", plantKind: "knob",
    build: async ({ mode }) => ({ shapeErrFrac: mode === "tooGood" ? 0 : 5e-2 }),
};
const { probeModePlant } = await import("./plantedCoverage.mjs");
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

// ---- 6. A DECLARED IDEAL WITHOUT ITS SENTENCE IS A NUMBER, AND IS REFUSED --------------------------------
const declared = [];
for (const name of D.DEVICE_NAMES) {
    let dev; try { dev = await D.getDevice(name); } catch { continue; }
    const dp = declaredPlantIdeal(dev);
    if (dp) declared.push({ device: name, ...dp });
}
const bare = declared.filter((x) => !x.ok);
say(declared.length + " binds declare an ideal for their plant: " +
    declared.filter((x) => x.kind === "plantIdeal").length + " plantIdeal, " +
    declared.filter((x) => x.kind === "plantNull").length + " plantNull");
ok("!! *** every declared ideal carries the SENTENCE that says why it is the ideal ***", bare.length === 0,
   declared.length + " declarations, " + bare.length + " bare" +
   (bare.length ? " -- " + bare.map((x) => x.device).join(", ")
    : ". v3211's register of exact zeros exists because a bare number gets edited to agree with whatever " +
      "shipped, and an ideal is the same kind of number: `plantIdeal: 0` proves nothing that `plantIdeal: 42` " +
      "would not also prove, until somebody says which one the physics requires"));

// ---- 7. AND BOTH NEW RULES ARE DRIVEN, INCLUDING THEIR FAILURE ------------------------------------------
const WHY = "a sentence long enough to be a reason rather than a label, which is what the guard requires";
const idealDev = (to) => ({ modes: ["honest", "bad"], plantMode: "bad", plantFlips: "gain", plantKind: "knob",
    plantIdeal: 1, plantIdealWhy: WHY, build: async ({ mode }) => ({ gain: mode === "bad" ? to : 0.98 }) });
const away = await probeModePlantDirection(idealDev(37));
const toward = await probeModePlantDirection(idealDev(1.0));
ok("!! plantIdeal reads direction against a NON-ZERO ideal, and 0.98 -> 37 against ideal 1 is `worse`",
   away && away.verdict === "worse" && away.via === "plantIdeal",
   "verdict=" + (away && away.verdict) + " via " + (away && away.via) +
   ". ct's absoluteGain and voxelize's order are exactly this shape -- ideals of 1 and 2, not 0");
ok("!! ...and a mode that moves TOWARD that ideal is caught, which is what makes the declaration falsifiable",
   toward && toward.verdict === "better",
   "verdict=" + (toward && toward.verdict) + " when the planted arm lands ON the ideal. A declaration that " +
   "could not fail would just be a label");

const nullDev = (to) => ({ modes: ["honest", "deaf"], plantMode: "deaf", plantFlips: "span", plantKind: "mode",
    plantNull: 1, plantNullWhy: WHY, build: async ({ mode }) => ({ span: mode === "deaf" ? to : 7.9 }) });
const collapses = await probeModePlantDirection(nullDev(1));
const doesNot = await probeModePlantDirection(nullDev(19));
ok("!! plantNull INVERTS the rule -- collapsing onto the null is the plant working, not failing",
   collapses && collapses.verdict === "worse" && collapses.via === "plantNull",
   "verdict=" + (collapses && collapses.verdict) + " when span 7.9 -> 1. stability, mpmdrucker and mpmpile " +
   "all plant a DEAF KNOB and a deaf knob gives a ratio of exactly 1");
ok("...and a `deaf` arm that does not collapse is caught too", doesNot && doesNot.verdict === "better",
   "verdict=" + (doesNot && doesNot.verdict) + " when span goes 7.9 -> 19, further from the null rather than onto it");

const bareDev = { ...idealDev(37), plantIdealWhy: undefined };
const bareRead = await probeModePlantDirection(bareDev);
ok("!! ...and an ideal declared with NO sentence buys no readability at all",
   bareRead && bareRead.verdict === "unreadable" && bareRead.missingWhy === "plantIdeal",
   "verdict=" + (bareRead && bareRead.verdict) + " on the same device that reads `worse` with the sentence present");

console.log(failed ? "\nplantDirection-selfcheck: " + failed + " FAILED" : "\nplantDirection-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
