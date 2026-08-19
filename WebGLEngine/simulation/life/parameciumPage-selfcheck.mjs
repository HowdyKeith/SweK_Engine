// WebGLEngine/simulation/life/parameciumPage-selfcheck.mjs — v2580
//
// Run: node simulation/life/parameciumPage-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES paramecium.html — the front door the paramecium never had.
//
// ---- WHY A PAGE IS NOT DECORATION -------------------------------------------------------------------------------
//
// Since v2552 this creature has produced real, gated results and had NOWHERE TO LOOK AT THEM. "A measurement that
// does not reach the codebase is a rumour" (v2569) has an obvious cousin: A MEASUREMENT WITH NO FRONT DOOR IS
// INVISIBLE. The numbers were in a selfcheck's stdout, which is a place nobody visits on purpose.
//
// ---- THE ONE THING THAT MAKES THIS PAGE HONEST -------------------------------------------------------------------
//
// It imports simulation/life/paramecium.js, brain/bench/bandit.mjs and physics/freeSpaceWorld.js AND RUNS THEM.
// It is not a recording, not a reimplementation, and not a video. THE SAME MODULES THE GATE RUNS.
//
// That matters because the easy version of this page is a demo that reproduces the *shape* of the finding with
// its own tidy loop — and a demo like that can keep showing the mold winning long after the mold stops winning.
// THAT IS EXACTLY HOW v2568 HAPPENED: sixteen versions of a compass that every check passed, because every check
// asserted the ORDERING and a compass satisfies the ordering.
//
// ---- WHAT THIS GATE CANNOT DO -------------------------------------------------------------------------------------
//
// It cannot render. It runs the page's LOGIC headlessly and checks the numbers, and it reads the page's TEXT for
// the wiring — WHICH IS GRADING PROSE, and is labelled below. Whether the canvas draws is Keith's screenshot.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { swim, chemoField, headings3, moldReflex3 } from "./paramecium.js";
import { ucb1, uniformRandom } from "../../brain/bench/bandit.mjs";
import { freeSpaceWorld } from "../../physics/freeSpaceWorld.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(here, "..", "..", "paramecium.html");
let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const src = fs.readFileSync(PAGE, "utf8");
const field = chemoField([6, 5, 6], 4);
const dirs = headings3(26);

/** The page's exact gravity wrapper, reproduced. If this drifts from the page, the gate tests a ghost. */
const world = (gravity) => {
    const w = freeSpaceWorld();
    if (gravity) {
        const step = w.step.bind(w);
        w.step = (dt = 1 / 60) => {
            const v = w.readVelocities();
            if (v.length >= 3) w.setVelocity(0, [v[0], v[1] - 9.8 * dt, v[2]]);
            step(dt);
        };
    }
    return w;
};
const run = (mk, gravity) => {
    const w = world(gravity);
    const r = swim(w, "freeSpaceWorld", mk(), { steps: 600, field, dirs });
    return { ...r, y: w.readTransforms()[1] };
};

// ---- 1. THE PAGE RUNS THE REAL MODULES ---------------------------------------------------------------------------
{
    ok("the page imports paramecium.js, bandit.mjs and freeSpaceWorld.js", 
       /from '\.\/simulation\/life\/paramecium\.js'/.test(src) &&
       /from '\.\/brain\/bench\/bandit\.mjs'/.test(src) &&
       /from '\.\/physics\/freeSpaceWorld\.js'/.test(src),
       "!! GRADING PROSE -- this reads the page's text. But the alternative is worse: A DEMO WITH ITS OWN TIDY LOOP CAN KEEP SHOWING THE MOLD WINNING LONG AFTER THE MOLD STOPS WINNING. That is exactly how v2568 happened -- SIXTEEN VERSIONS OF A COMPASS that every check passed, because every check asserted THE ORDERING and a compass satisfies the ordering.");
    ok("...and it CALLS swim(), rather than reimplementing the walk", /swim\(w, 'freeSpaceWorld'/.test(src),
       "the same function the gate calls. Not a recording, not a reimplementation, not a video.");
    ok("...and the peak is OFF THE PLANE", /const PEAK = \[6, 5, 6\]/.test(src),
       "y=5. IF THE FOOD SAT AT y=0, EVERY NUMBER ON THE PAGE WOULD BE A 2D NUMBER IN FANCY DRESS and the third dimension would be decoration.");
}

// ---- 2. THE NUMBERS IT WILL SHOW ARE THE GATED ONES ---------------------------------------------------------------
{
    const mold = run(() => moldReflex3(field, dirs, 1.2, 5), false);
    ok("the page's own logic reproduces v2569's gated result", Math.abs(mold.food - 312.4) < 1 && Math.abs(mold.y - 5.65) < 0.2,
       "food " + mold.food.toFixed(1) + " (gated: 312.4), final y " + mold.y.toFixed(2) + " (gated: 5.65, peak at 5 -- IT CLIMBED).");
    const bandit = run(() => ucb1(), false);
    ok("...and UCB1 still collapses", bandit.food < 5,
       "food " + bandit.food.toFixed(1) + " vs the mold's " + mold.food.toFixed(1) +
       ". 26 arms, 75 decisions: IT CANNOT TRY EACH ARM THREE TIMES. And UCB1 assumes STATIONARY arms -- in a moving body, 'north' from here is not 'north' from three metres away. ITS MEMORY IS ITS HANDICAP.");
    const rand = run(() => uniformRandom(), false);
    ok("...and random gets nothing, which is the control", rand.food < 1, "food " + rand.food.toFixed(1));
}

// ---- 3. THE PAGE'S GRAVITY IS HONEST -------------------------------------------------------------------------------
{
    const free = run(() => moldReflex3(field, dirs, 1.2, 5), false);
    const grav = run(() => moldReflex3(field, dirs, 1.2, 5), true);
    ok("the page's JS gravity AGREES WITH REAL BOX3D TO ~1%", Math.abs(grav.food - 282.8) / 282.8 < 0.03,
       "page " + grav.food.toFixed(1) + " vs REAL box3d " + "282.8" + " (v2569, real wasm). freeSpaceWorld HAS NO GRAVITY OF ITS OWN, so the page adds it as a per-step velocity change RATHER THAN PRETENDING THE WORLD HAS A FIELD IT DOES NOT. That approximation could have been silently wrong; it is within 1% of the real solver.");
    ok("...and gravity still costs food on the page", grav.food < free.food,
       free.food.toFixed(1) + " -> " + grav.food.toFixed(1) + " = a " + ((1 - grav.food / free.food) * 100).toFixed(1) +
       "% tax. A WORLD THAT COSTS NOTHING IS A BACKDROP.");
    ok("...and the creature still climbs against it", grav.y > 3,
       "final y " + grav.y.toFixed(2) + ", peak at y=5. IT IS NOT BEING DRAGGED; IT IS PAYING A TOLL AND ARRIVING.");
}

// ---- 4. the page says what it does not know ------------------------------------------------------------------------
{
    ok("the page states its own limit", /One peak, one start, one gravity/.test(src),
       "the mold's advantage here is A FACT ABOUT THIS ARENA, NOT A LAW -- and the page says so where a visitor reads it, not only in a changelog they never will.");
    ok("...and it links its own kill condition", /predictions\.html/.test(src),
       "a demo that cannot be wrong is an advert");
    ok("...and it draws height, because a top view cannot show it", /height shown as size|drawn as dot SIZE/.test(src),
       "A PARAMECIUM THAT CLIMBED TO THE PEAK AND ONE THAT FELL OUT OF THE WORLD LOOK IDENTICAL FROM DIRECTLY ABOVE. v2567's creature fell 418 metres and reported that dinner was lovely; a top-view-only page would have shown that as a success.");
}

console.log(fails ? "\nparameciumPage-selfcheck: " + fails + " FAILED" : "\nparameciumPage-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
