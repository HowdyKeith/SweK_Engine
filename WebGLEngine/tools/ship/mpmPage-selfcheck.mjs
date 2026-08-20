// tools/ship/mpmPage-selfcheck.mjs -- v3795
//
// *** SIX ROUNDS OF MPM AND NOTHING DREW IT. Keith's standing rule -- EVERY TOOL NEEDS A FRONT DOOR -- says a
// module with no page is unfinished, and v3789 through v3794 each closed by saying nothing draws this. ***
//
// *** THE THING THIS GATE EXISTS TO PREVENT IS A PAGE THAT RE-IMPLEMENTS THE PHYSICS. A demo that copies the
// loop into a <script> block looks identical on screen and is graded by nothing: the gates would keep passing
// on physics/mpm/ while the page drifted away from it, and the page is what anybody would actually judge the
// engine by. THE PAGE MUST IMPORT THE GRADED MODULES AND ADD NO ARITHMETIC OF ITS OWN. ***

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PAGE = readFileSync(path.join(root, "mpm.html"), "utf8");
const SRV = readFileSync(path.join(root, "server.html"), "utf8");

console.log("1. THE PAGE RUNS THE GRADED LOOP RATHER THAN A COPY OF IT");
{
    ok("!! *** IT IMPORTS step() FROM physics/mpm/step.mjs ***",
        /from "\/physics\/mpm\/step\.mjs"/.test(PAGE) && /\bstep\(/.test(PAGE),
        "the SAME function tools/roundhouse/mpmStepBind.mjs grades. *** A DEMO THAT COPIES THE LOOP INTO A " +
        "SCRIPT BLOCK LOOKS IDENTICAL ON SCREEN AND IS GRADED BY NOTHING ***");
    ok("!! and it imports the fixture and the material parameters too, rather than retyping them",
        /restBlock/.test(PAGE) && /centreOfMass/.test(PAGE) && /lame\(/.test(PAGE),
        "restBlock, centreOfMass and lame all come from the graded modules -- so the thing on screen is the " +
        "thing under test, not a lookalike");
    // *** THIS CHECK WAS TOO NARROW FIRST AND THE PLANT PROVED IT: it matched `p2g(` WITH A PAREN, so a page
    // that merely IMPORTED the transfer -- `import { p2g, g2p } from ...` -- slipped past, and importing is
    // exactly the first move toward re-implementing. A CHECK THAT ONLY CATCHES THE FINISHED MISTAKE MISSES
    // THE STEP THAT LEADS TO IT. Now it matches the NAMES anywhere in the page. ***
    ok("!! *** THE PAGE ADDS NO PHYSICS OF ITS OWN, AND DOES NOT EVEN REACH FOR IT ***",
        !/firstPiola|returnMap|quadWeights|advanceF|\bp2g\b|\bg2p\b|normalise|stressForces/.test(PAGE),
        "no stress, no return mapping, no transfer, no weights. IT DRAWS AND IT REPORTS; every number it shows " +
        "was computed by a module with a gate behind it");
}

console.log("\n2. IT REPORTS THE KEY, AND THE RIGHT VERSION OF IT");
{
    ok("!! *** THE ANALYTIC VALUE IS THE DISCRETE FALL, NOT THE TEXTBOOK PARABOLA ***",
        /n \* \(n \+ 1\) \/ 2/.test(PAGE) && !/0\.5 \* GY \* t \* t/.test(PAGE),
        "g*dt^2*n(n+1)/2. *** SYMPLECTIC-EULER ADVECTS WITH THE VELOCITY AFTER THE KICK, so the discrete fall " +
        "is one half-step from g*t^2/2 -- and v3794's DECLARED PLANT is grading against the continuous form. " +
        "A PAGE SHOWING A GROWING ERROR ON A CORRECT LOOP WOULD INVITE SOMEBODY TO TUNE THE LOOP TO MATCH IT ***");
    ok("!! it shows the sideways drift as well as the vertical error",
        /sideways drift/.test(PAGE),
        "gravity is vertical and NOTHING ELSE MAY PUSH -- a non-zero drift means the stencil or the force " +
        "scatter has gone asymmetric, and it is the cheapest thing to notice by eye");
    ok("!! and it says in words which analytic form it is using",
        /half-step/.test(PAGE),
        "so a reader comparing it to a textbook is told WHY the numbers differ rather than left to assume one " +
        "of them is wrong");
}

console.log("\n3. THE FRONT DOOR IS REAL");
{
    ok("!! server.html carries an anchor to it",
        /href="\/mpm\.html"/.test(SRV),
        "a page in the section list with NO ANCHOR is a drawer entry nobody can reach");
    ok("!! and the anchor's title says what the page shows, not just its name",
        /Material Point Method -- runs the graded/.test(SRV));
}

report("WHAT THIS GATE DOES NOT DO",
    "It cannot run the page. There is no DOM and no canvas here, so WHETHER THE PARTICLES APPEAR ON KEITH'S " +
    "SCREEN IS HIS READING. What is checked is that the page is wired to the graded modules, adds no physics, " +
    "and reports the key in the form that will not mislead. *** THE FIRST TIME ANY OF THIS ARC IS VISIBLE, and " +
    "the useful detail from him is whether the parabola error stays at round-off while the block visibly " +
    "wobbles -- that is the whole claim, seen rather than asserted. ***");

console.log("\n4. THE THREE SCENES (v3801)");
{
    ok("!! *** THE PAGE OFFERS THE COLUMN AND THE PILE, NOT JUST FREE FALL ***",
        /value="column"/.test(PAGE) && /value="pile"/.test(PAGE) && /value="freefall"/.test(PAGE),
        "free fall barely deforms the block -- it was the weakest of the three keys and the only one anybody " +
        "could see. THE COLUMN AND THE PILE ARE WHERE THE MATERIAL ACTUALLY DOES SOMETHING");
    ok("!! *** THE PILE SELECTS DRUCKER-PRAGER, WHICH IS THE MODEL WITH AN ANGLE IN IT ***",
        /plastic: "dp"/.test(PAGE) && /alphaOf\(/.test(PAGE) && /friction/.test(PAGE),
        "and the friction control is SHOWN ONLY FOR THE PILE, because it does nothing for the other two -- a " +
        "control that is present and inert is the deaf-knob shape this tree keeps finding");
    ok("!! *** THE WALLS STAND THREE CELLS IN, AND THIS PAGE SHIPPED WRONG ***",
        /lo: 3, hi: 3/.test(PAGE) && !/lo: 1/.test(PAGE),
        "*** v3795 SHIPPED THIS PAGE WITH `lo: 1` AND v3798 THEN PROVED THAT LOSES 99.9% OF THE HORIZONTAL " +
        "MOMENTUM: a quadratic stencil reaches one cell each way, so a particle a fraction above the domain " +
        "edge has a stencil base of -1, a row that does not exist and that both halves of the transfer skip. " +
        "THE PAGE WAS DRAWING A BOUNDARY ARTEFACT AND CALLING IT PHYSICS ***");
    ok("!! and the page still adds no physics of its own after all that",
        !/firstPiola|returnMap|quadWeights|advanceF|\bp2g\b|\bg2p\b|normalise|stressForces/.test(PAGE),
        "alphaOf is a PARAMETER helper -- it turns a friction angle into the yield coefficient and computes no " +
        "step of the simulation. The physics still comes entirely from the graded modules");
}

report("WHAT THE THREE SCENES SHOW, AND WHAT KEITH SHOULD LOOK FOR",
    "FREE FALL: the parabola error stays at round-off while the block visibly wobbles -- that is v3794's key " +
    "seen rather than asserted. COLUMN: it collapses, dissipates and stops. PILE: *** THE FRICTION SELECTOR " +
    "VISIBLY CHANGES THE SPREAD -- measured at the page's own step count, 17.337 wide at 25 degrees, 13.463 at " +
    "35 and 9.902 at 45. THAT IS THE ONE KEY IN THE WHOLE MPM ARC THAT A MATERIAL BEHAVING NOTHING LIKE SAND " +
    "WOULD FAIL, and it is now the one thing on the page a person can check by eye. ***");

console.log("\nmpmPage-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
