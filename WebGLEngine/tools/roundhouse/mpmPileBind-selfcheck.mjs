// tools/roundhouse/mpmPileBind-selfcheck.mjs -- v3800
//
// *** THE FIRST MPM KEY THAT TESTS PHYSICAL MEANING RATHER THAN AN IDENTITY. Partition of unity, momentum, the
// third law, the impulse, the parabola, the energy direction -- EVERY ONE OF THOSE WOULD HOLD FOR A MATERIAL
// THAT BEHAVED NOTHING LIKE SAND. This one does not: A HIGHER FRICTION ANGLE MUST GIVE A NARROWER PILE. ***

import { pileDevice, PILE_MODES, buildPile } from "./mpmPileBind.mjs";
import { DEVICE_NAMES } from "./devices.mjs";
import { readFileSync } from "node:fs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const friction = await buildPile({ mode: "friction" });
const deaf = await buildPile({ mode: "deafangle" });

console.log("1. THE PILE MEASUREMENT IS VALID BEFORE IT IS READ");
{
    ok("!! *** EVERY PILE STAYED INSIDE THE DOMAIN ***",
        friction.contained === true && deaf.contained === true,
        "*** A PILE THAT LEFT THE BOX IS NOT A MEASUREMENT. The first attempt at this fixture had a 15-degree " +
        "pile 13.6 WIDE IN AN 8-WIDE DOMAIN: its width was a statement about the domain, not about friction, " +
        "and reading a trend off it would have been reading the walls ***");
    // *** THIS CHECK WAS WRITTEN AS `ok(name, true, ...)` -- A CONDITION THAT IS LITERALLY THE CONSTANT TRUE.
    // It passes on any tree, states nothing, and would have shipped as a green line asserting a fact nobody
    // verified. THE WORST KIND OF CHECK IS ONE THAT CANNOT FAIL. It now reads the bind's own source. ***
    ok("!! and the walls stand three cells in, which v3798 proved is not optional",
        /lo: 3, hi: 3/.test(readFileSync(new URL("./mpmPileBind.mjs", import.meta.url), "utf8")),
        "a boundary ON the domain edge truncates the quadratic stencil and loses 95% of the horizontal " +
        "momentum -- the pile would have been shaped by an artefact rather than by the material");
}

console.log("\n2. THE KEY: MORE FRICTION, NARROWER PILE");
{
    ok("!! *** WIDTH FALLS MONOTONICALLY ACROSS FIVE FRICTION ANGLES ***",
        friction.monotone === true && friction.narrowing === true,
        friction.angles.join("/") + " degrees -> " + friction.widths.map((w) => w.toFixed(2)).join(", ") +
        ", spread " + friction.spread.toFixed(4) + ". *** THIS IS THE FIRST KEY IN THE MPM ARC THAT A " +
        "CORRECT-BUT-MEANINGLESS MATERIAL WOULD FAIL: every identity before it holds for a material that " +
        "behaves nothing like sand ***");
}

console.log("\n3. THE PLANT, AND WHAT SURVIVES IT");
{
    ok("!! *** THE DEAF ANGLE MAKES EVERY PILE THE SAME WIDTH -- SPREAD EXACTLY 1.0000 ***",
        deaf.narrowing === false && Math.abs(deaf.spread - 1) < 1e-12,
        "widths " + deaf.widths.map((w) => w.toFixed(2)).join(", ") + " against the honest " +
        friction.widths.map((w) => w.toFixed(2)).join(", ") + ". *** v3799 CAUGHT THIS AT THE SURFACE; THIS " +
        "CATCHES IT IN A SIMULATION, which is the version somebody would actually meet -- or rather WOULD NOT " +
        "MEET, because the piles all still look like piles ***");
    ok("!! *** AND `monotone` STAYS TRUE UNDER THE PLANT, BECAUSE A FLAT SEQUENCE IS TRIVIALLY MONOTONE ***",
        deaf.monotone === true,
        "*** THE SAME VACUITY AS v3783'S FLAT LADDER: 'does width fall with friction' is satisfied by a " +
        "CONSTANT, so a check asking only that would pass a model where friction does nothing. The SPREAD is " +
        "what separates them, and both are reported so the difference is visible in one reading ***");
    ok("!! the device DECLARES the plant, with `friction` first",
        DEVICE_NAMES.includes("mpmpile") && pileDevice.plantMode === "deafangle" &&
        pileDevice.plantFlips === "spread" && PILE_MODES[0] === "friction");
}

report("*** THE DEFAULT PLASTICITY MODEL IS UNCHANGED, AND THAT IS DELIBERATE ***",
    "`plastic: true` still means v3792's SINGULAR-VALUE CLAMP, so every number v3794 through v3799 reported " +
    "still reproduces; `plastic: \"dp\"` selects Drucker-Prager. SWITCHING THE DEFAULT WOULD HAVE SILENTLY " +
    "MOVED EVERY SHIPPED FIGURE -- the column's dissipation, its settle height, its creep -- and buried a " +
    "model change inside numbers nobody was looking at. THE COLUMN DEVICE STILL GRADES THE CLAMP; this one " +
    "grades the surface with an angle in it.");

report("WHAT THIS DOES NOT CLAIM",
    "THAT THE ANGLE IS RIGHT. A pile 21 units wide from a 1.2-unit block is a great deal of spreading, and " +
    "nothing here says that is what sand does -- only that MORE FRICTION SPREADS LESS. The angle of repose " +
    "still has no reference in this sandbox: physics/mechanics/contactKeys.mjs would adjudicate it against " +
    "the real box3d and frictionRestitutionAvailable() reads FALSE because that WASM does not build here. " +
    "*** THE DIRECTION IS GRADED; THE MAGNITUDE IS NOT. ***");

console.log("\nmpmPileBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
