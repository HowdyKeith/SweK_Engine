// tools/roundhouse/powderBind-selfcheck.mjs
//
// Run: node tools/roundhouse/powderBind-selfcheck.mjs   (~2s MEASURED -- four Friedel sweeps and eight 2x2 cells)
//
// THIS GRADES THE BIND. physics/crystal/powder.mjs owns the physics.
//
// *** THE PROPERTY THIS FILE EXISTS FOR IS THAT THREE OF THE FOUR CELLS IN THE TEXTBOOK 2x2 CANNOT FIRE. ***
// Friedel's law is exactly zero with real scattering, so both real-f cells have nowhere to fall. The
// centrosymmetric anomalous cell -- the one every account implies is the interesting one -- reads 1.78e-15
// honest and 0 planted, INDISTINGUISHABLE EITHER WAY, because an inversion centre restores the conjugate
// relation no matter how complex the scattering is. ONLY ZINCBLENDE CAN TELL, and this gate asserts the other
// three are blind so that "most observables did not move" is a measurement rather than a shrug.
//
// The second property is that the plant is a SHORTCUT AND NOT A BUG: treating f'' as extra scattering power
// instead of as a phase leaves a pattern with the right rings, the right multiplicities and the right
// absences. Everything a table of magnitudes would show is intact. What is gone is the only asymmetry in it,
// which is the quantity a real experiment uses to determine absolute structure.
"use strict";
import { powderDevice, POWDER_OBSERVABLES } from "./powderBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { friedelBreak, isLegendreGap, rings, ringTwoTheta } from "../../physics/crystal/powder.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

console.log("powderBind-selfcheck -- the law that needs two conditions to break\n");

console.log("1. REGISTERED AND REACHABLE");
{
    ok("powder appears in DEVICE_NAMES", DEVICE_NAMES.includes("powder"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("powder");
    ok("!! the registry hands back THIS device", !!d && d.name === "powder-friedel-and-the-test-that-could-not-fire",
        d ? d.name : "nothing");
    ok("it declares plantKind METHOD", d.plantKind === "method",
        "the form factor's ARITHMETIC is wrong -- f'' enters as a magnitude instead of a phase. No config value "
        + "records it, which is why the census cannot see this one and the gate must.");
    const def = d.defaults({});
    ok("!! defaults() returns the whole config, so the knobs are DERIVED", "hklMax" in def.config &&
        "checkTo" in def.config && "fpp" in def.config, Object.keys(def.config).join(", "));
}

console.log("\n2. EVERY ADVERTISED OBSERVABLE IS PRODUCED, FINITE, AND NOTHING EXTRA");
{
    const v = powderDevice.build(powderDevice.defaults());
    ok("!! no advertised observable is missing", POWDER_OBSERVABLES.every((k) => k in v),
        POWDER_OBSERVABLES.filter((k) => !(k in v)).join(", ") || POWDER_OBSERVABLES.length + " produced");
    ok("...and every one is a finite number", POWDER_OBSERVABLES.every((k) => finite(v[k])),
        POWDER_OBSERVABLES.filter((k) => !finite(v[k])).join(", ") || "all finite");
    ok("...and nothing unadvertised is produced", Object.keys(v).every((k) => POWDER_OBSERVABLES.includes(k)),
        Object.keys(v).filter((k) => !POWDER_OBSERVABLES.includes(k)).join(", ") || "both directions agree");
}

console.log("\n3. TWO ROUTES TO ONE INTEGER, AND ONE OF THEM IS NUMBER THEORY");
{
    const v = powderDevice.build({ config: {} });
    ok("!! a triple loop over hkl agrees with a convolution of power series on 121 consecutive integers",
        v.r3Mismatches === 0 && v.r3CheckedTo === 121,
        "ZERO mismatches. The routes share nothing: theta3(q)^3 has no h, k or l anywhere in it, and the "
        + "enumeration has no series. Multiplicity is an INTEGER, so agreement is exact or it is absent -- "
        + "there is no third outcome and no tolerance.");
    ok("!! *** r3(7) = 0 -- A RING MISSING FOR AN ARITHMETIC REASON RATHER THAN A PHYSICAL ONE ***",
        v.r3AtSeven === 0,
        "Seven is not a sum of three squares, so the simple-cubic ring at N=7 CANNOT EXIST -- and no basis "
        + "cancels it. structureFactorBind's absences come from atoms interfering; this is Legendre's "
        + "three-square theorem. TWO DIFFERENT MECHANISMS PRODUCING THE SAME UNMISSABLE NOTHING, in one pattern.");
    ok("!! ...and every one of the 19 arithmetic gaps below 121 is absent from the enumerated rings",
        v.legendreGaps === 19 && v.legendreGapsAbsentFromRings === v.legendreGaps,
        v.legendreGapsAbsentFromRings + " of " + v.legendreGaps + ". The enumeration was never told about "
        + "4^a(8b+7); it simply never lands on those N.");
    const gaps = [];
    for (let N = 1; N <= 40; N++) if (isLegendreGap(N)) gaps.push(N);
    const present = new Set(rings("sc", { hklMax: 6 }).map((r) => r.N));
    ok("...spot-checked against the module directly: 7, 15, 23, 28, 31, 39 are gaps and none is a ring",
        gaps.slice(0, 6).join(",") === "7,15,23,28,31,39" && gaps.every((N) => !present.has(N)),
        "gaps below 40: " + gaps.join(", "));
    ok("!! a ring beyond the sphere the wavelength can reach is REFUSED, not clamped",
        v.unreachableRingRefused === 1 && ringTwoTheta(400, 1, 1) === null,
        "sin(theta) > 1 means the reflection is unreachable AT THIS WAVELENGTH, which is a fact about the "
        + "experiment. Clamping would draw a ring that cannot exist -- a plausible number where there is none.");
}

console.log("\n4. *** FRIEDEL IS EXACTLY ZERO, NOT 1e-15 ***");
{
    const v = powderDevice.build({ config: {} });
    ok("!! |F(hkl)| = |F(-h-k-l)| across 2916 pairs and four lattices, worst difference EXACTLY 0",
        v.friedelWorstReal === 0 && v.friedelPairs === 2916,
        "worst = " + v.friedelWorstReal + " over " + v.friedelPairs + " pairs. *** NOT ROUNDOFF. *** The two "
        + "sums are complex conjugates and |z| = |z-bar| BIT FOR BIT -- no arithmetic happens between the two "
        + "answers, only a sign. This lab owns many keys at 1e-15; the difference is the mechanism.");
}

console.log("\n5. THE BIND'S HONEST ROUTE IS THE MODULE'S OWN, BIT FOR BIT");
{
    const v = powderDevice.build({ config: {} });
    ok("!! *** every 2x2 cell matches physics/crystal/powder.mjs exactly ***",
        v.breakNonCentroHalf === friedelBreak(0.5, { centro: false }).worst &&
        v.breakNonCentroTwo === friedelBreak(2, { centro: false }).worst &&
        v.breakNonCentroZero === friedelBreak(0, { centro: false }).worst &&
        v.breakCentroTwo === friedelBreak(2, { centro: true }).worst,
        "The bind carries its own anomalous sum ONLY so the plant has somewhere to live. If the honest branch "
        + "drifted from the module by so much as a bit, the plant would be measuring the drift instead -- so "
        + "the agreement is asserted rather than assumed. Identity, not a tolerance.");
}

console.log("\n6. *** THE PLANT: f'' AS SCATTERING POWER INSTEAD OF AS A PHASE ***");
{
    const h = powderDevice.build({ config: {} });
    const p = powderDevice.build({ config: { planted: true } });

    ok("!! *** zincblende at f''=0.5 breaks Friedel by 2.74 honest and by NOTHING planted ***",
        h.breakNonCentroHalf > 2 && p.breakNonCentroHalf < 1e-12,
        h.breakNonCentroHalf.toFixed(6) + " -> " + p.breakNonCentroHalf.toExponential(3) + ". Not a degraded "
        + "measurement -- the violation is GONE. Every atom keeps a real form factor, so the two sums stay "
        + "conjugates and the law holds where it should not.");
    ok("...and at f''=2 the same, from 6.99", h.breakNonCentroTwo > 6 && p.breakNonCentroTwo < 1e-12,
        h.breakNonCentroTwo.toFixed(6) + " -> " + p.breakNonCentroTwo.toExponential(3));
    ok("!! AND THE PATTERN STILL LOOKS RIGHT: rings, multiplicities and arithmetic gaps are bit-identical",
        h.r3Mismatches === p.r3Mismatches && h.legendreGaps === p.legendreGaps &&
        h.legendreGapsAbsentFromRings === p.legendreGapsAbsentFromRings && h.r3AtSeven === p.r3AtSeven,
        "*** THE PLANT IS A SHORTCUT, NOT A CRASH. *** r3(N) never sees a form factor, so everything a table "
        + "of ring positions and magnitudes would show is intact. What is gone is the only asymmetry in the "
        + "pattern -- the quantity a real experiment uses to determine ABSOLUTE STRUCTURE.");

    report("THE THREE CELLS THAT CANNOT FIRE, ASSERTED SO THE BLINDNESS CANNOT WIDEN SILENTLY.");
    ok("!! real scattering, either symmetry: EXACTLY 0 under both, because it was 0 before the plant existed",
        h.friedelWorstReal === 0 && p.friedelWorstReal === 0 &&
        h.breakNonCentroZero === 0 && p.breakNonCentroZero === 0,
        "f''=0 makes the honest and planted form factors the SAME NUMBER (1 + 0 = 1 + 0i), so these two cells "
        + "are not merely blind, they are the identical computation.");
    ok("!! *** AND THE CENTROSYMMETRIC ANOMALOUS CELL IS BLIND TOO -- 1.78e-15 honest, 0 planted, BOTH ZERO ***",
        h.breakCentroTwo < 1e-12 && p.breakCentroTwo < 1e-12,
        h.breakCentroTwo.toExponential(3) + " -> " + p.breakCentroTwo.toExponential(3) + ". *** THIS IS THE "
        + "CELL EVERY ACCOUNT POINTS AT AND IT HAS NO ROOM TO FALL. *** An inversion centre restores the "
        + "conjugate relation no matter how complex the scattering is, so the honest answer is already zero "
        + "and a plant cannot make it more so. A DEVICE CARRYING ONLY THE CENTROSYMMETRIC CONTROL WOULD REPORT "
        + "THE LAW INTACT AND THE PLANT UNFOUND. One cell of the four does the work, and it is the cell you "
        + "only reach by building a crystal with no inversion centre.");
}

console.log("\n" + (fails ? "powderBind-selfcheck: " + fails + " FAILED" : "powderBind-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
