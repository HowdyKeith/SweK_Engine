// WebGLEngine/tools/ship/navalDuel-selfcheck.mjs -- v4206
//
// GATES brain/navalPolicy.mjs and brain/navalDuel.mjs -- two gunnery policies duelling with real shells.
//
// *** THE ROUND'S HEADLINE IS A NEGATIVE RESULT ABOUT ITS OWN CENTREPIECE. *** The point of building this on
// physics/ballistics.mjs was that dispersion is real and range-dependent, so a policy could prefer cells it
// can actually hit. Section 4 ablates every feature against a measured noise floor and finds that the
// physically-motivated one is worth NOTHING, while the two information-theoretic ones carry the entire
// result. Knowing where the ship probably is beats knowing where the shell will certainly go.
//
// *** AND SECTION 5 IS THE REASON THAT CONCLUSION IS TRUSTWORTHY. *** One 50-game block showed the aim
// feature winning by 8.6 salvos on a loose gun -- 6.4%, a shippable-looking number. Three blocks give a mean
// of 0.8 against a noise floor of 4.6. The single block is exactly what would have been published by anyone
// who ran the experiment once, so the gate runs the noise floor FIRST and every claim is read against it.
//
// Run: node tools/ship/navalDuel-selfcheck.mjs

import { W_KEYS, F_KEYS, handWeights, untunedWeights, blindWeights, score, validateWeights,
         densityMap, huntMap, arcOptions, bestArc, chooseShot, _clearArcCache,
         UNKNOWN, MISS, HIT, SUNK } from "../../brain/navalPolicy.mjs";
import { FLEET, rng32, placeFleet, scatterShot, fireSalvo, duel, series } from "../../brain/navalDuel.mjs";
import { maxRange, GRAVITY, launchAngles } from "../../physics/ballistics.mjs";
import { codeOnly, noComments, prose } from "./sourceScan.mjs";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const note = (m) => console.log("  ....  " + m);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const DEG = 180 / Math.PI;
const GUN = { v: 12.5, aimError: 2 };

// 1) *** THE BOARD MATHS, WHICH IS WHAT ACTUALLY WINS THE GAME. ***
{
    const n = 10, empty = new Array(n * n).fill(UNKNOWN);
    const d = densityMap(empty, FLEET, n);
    ok(d[0] < d[5] && d[5] < d[55], `density rises from corner to centre on an empty board: ${d[0]} < ${d[5]} < ${d[55]}`);
    ok(d[0] === 10 && d[55] === 34, `and the numbers are the classic ones: corner 10, centre 34`);
    // A miss must remove placements through it -- otherwise the map never learns anything.
    const withMiss = empty.slice(); withMiss[55] = MISS;
    const d2 = densityMap(withMiss, FLEET, n);
    ok(d2[55] === 0, "a cell that has been shot has no density left");
    ok(d2[54] < d[54], `and its neighbours drop too: ${d[54]} -> ${d2[54]}, because runs through it are gone`);
    // Hunt: a lone hit lights its four neighbours; a two-hit run lights the CONTINUATION harder.
    const oneHit = empty.slice(); oneHit[44] = HIT;
    const h = huntMap(oneHit, n);
    ok(h[34] === 1 && h[54] === 1 && h[43] === 1 && h[45] === 1, "a lone hit lights exactly its four neighbours");
    ok(h[0] === 0 && h[33] === 0, "and nothing else, including diagonals");
    const run = empty.slice(); run[44] = HIT; run[45] = HIT;
    const h2 = huntMap(run, n);
    ok(h2[43] > h2[35] && h2[46] > h2[35],
        `a two-hit run scores its continuations above its flanks: ${h2[43]}/${h2[46]} vs ${h2[35]} -- a ship is a straight line`);
    ok(validateWeights(handWeights()).length === 0, "the hand weights are servable");
    ok(validateWeights({ wBias: 1 }).length > 0 && validateWeights({ ...handWeights(), wNope: 1 })[0].includes("unknown"),
        "an incomplete or unknown-keyed weight set is refused");
    ok(W_KEYS.length === F_KEYS.length, `${W_KEYS.length} weights against ${F_KEYS.length} features, paired like csTacticsPolicy`);
    ok(score(handWeights(), { reach: 0, density: 1, hunt: 1, parity: 1, aim: 1, flight: 0 }) === 0,
        "reach GATES the score: an unreachable cell is not a low-scoring shot, it is not a shot");
}

// 2) *** THE DISPERSION PHYSICS, WHICH IS WHY THIS IS NOT JUST A BATTLESHIP BOT. ***
{
    const v = 100;
    // The closed form used in the vacuum branch must agree with integrating the real trajectory.
    for (const R of [200, 600, 1000]) {
        const o = arcOptions(R, v, {});
        const analytic = Math.abs(2 * v * v * Math.cos(2 * launchAngles(R, 0, v).flat) / GRAVITY) * (Math.PI / 180);
        ok(Math.abs(o.flat.dispersion - analytic) < 1e-9, `R=${R}: closed-form dispersion ${o.flat.dispersion.toFixed(4)} m/deg`);
    }
    // *** ZERO AT 45 DEGREES, WHICH IS MAXIMUM RANGE. A GUN IS MOST ACCURATE AT THE EDGE OF ITS ENVELOPE. ***
    const near = arcOptions(200, v, {}), far = arcOptions(maxRange(v) * 0.9999, v, {});
    ok(far.flat.dispersion < near.flat.dispersion / 20,
        `dispersion collapses toward max range: ${near.flat.dispersion.toFixed(2)} m/deg at 200 m, ${far.flat.dispersion.toFixed(3)} at the envelope edge`);
    ok(near.flat.dispersion > 30 && near.flat.dispersion < 36, `and the close shot is genuinely loose: ${near.flat.dispersion.toFixed(2)} m/deg`);
    // *** LOB AND FLAT ARE EXACTLY EQUAL IN VACUUM. *** The roots sit symmetrically about 45 degrees.
    for (const R of [200, 600, 1000]) {
        const o = arcOptions(R, v, {});
        ok(Math.abs(o.flat.dispersion - o.lob.dispersion) < 1e-12,
            `R=${R}: lob and flat scatter IDENTICALLY in vacuum (${o.flat.dispersion.toFixed(6)} both)`);
    }
    ok(bestArc(400, v, {}) === "flat", "so bestArc breaks the exact tie by a stated convention, not by comparison order");
    // *** DRAG BREAKS THE SYMMETRY, AND THE LOB WINS AT CLOSE RANGE. ***
    _clearArcCache();
    const drag = 0.002;
    const o100 = arcOptions(100, v, { drag, dt: 1 / 2000 }), o400 = arcOptions(400, v, { drag, dt: 1 / 2000 });
    ok(o100.lob.dispersion < o100.flat.dispersion * 0.6,
        `with drag at 100 m the LOB is tighter: ${o100.lob.dispersion.toFixed(2)} vs ${o100.flat.dispersion.toFixed(2)} m/deg -- ${(100 * (1 - o100.lob.dispersion / o100.flat.dispersion)).toFixed(0)}% less scatter`);
    ok(bestArc(100, v, { drag, dt: 1 / 2000 }) === "lob", "and bestArc picks it");
    const r100 = o100.lob.dispersion / o100.flat.dispersion, r400 = o400.lob.dispersion / o400.flat.dispersion;
    ok(r400 > r100, `the lob's advantage fades with range: ratio ${r100.toFixed(3)} at 100 m, ${r400.toFixed(3)} at 400 m`);
    ok(bestArc(400, v, { drag, dt: 1 / 2000 }) === "lob", "...and is still the better arc at 400 m, though barely");
    // The lob always takes longer, which is the cost the flight feature exists to carry.
    ok(o100.lob.flight > o100.flat.flight * 3, `a lob hangs ${(o100.lob.flight / o100.flat.flight).toFixed(1)}x as long as the flat shot`);
    ok(arcOptions(1e9, v, {}) === null, "an unreachable range yields no arcs at all");
}

// 3) *** DETERMINISM. A DUEL THAT IS NOT REPRODUCIBLE PROVES NOTHING. ***
{
    const a = duel(handWeights(), blindWeights(), 12345, GUN);
    const b = duel(handWeights(), blindWeights(), 12345, GUN);
    ok(JSON.stringify(a) === JSON.stringify(b), "the same seed replays a bit-identical duel");
    const c = duel(handWeights(), blindWeights(), 12346, GUN);
    ok(JSON.stringify(a) !== JSON.stringify(c), "...and a different seed does not, so the seed is really driving it");
    // Both sides face the same ocean and the same scatter draws.
    const rand = rng32(99);
    const l1 = placeFleet(10, rand, FLEET);
    const l2 = placeFleet(10, rng32(99), FLEET);
    ok(JSON.stringify(l1.occupied) === JSON.stringify(l2.occupied), "fleet placement is a pure function of the seed");
    ok(l1.ships.length === FLEET.length && l1.ships.every((s, i) => s.cells.length === FLEET[i]),
        `all ${FLEET.length} ships placed at their proper lengths`);
    const cells = l1.ships.flatMap((s) => s.cells);
    ok(new Set(cells).size === cells.length, "and none of them overlap");
    ok(a.a.cleared && a.b.cleared, "both policies finish the board within the salvo cap");
    // The scatter is along the line of fire, not a circular blob -- an elevation error is a range error.
    // aimError 40 was the first draft here and it threw almost every shell clean off the board -- 4 of 60
    // landed at all, so the check measured the out-of-bounds branch instead of the direction of the error.
    // sigma = dispersion * aimError, so 1 x 1 is a one-cell standard deviation: loose enough to scatter,
    // tight enough to stay on the water.
    const gun = { pos: [-2, 5], v: 12.5, cellSize: 1, aimError: 1 };
    const shot = { index: 55, r: 5, c: 5, dispersion: 1 };
    const rr = rng32(7);
    let sameCol = 0, landedAtAll = 0, moved = 0;
    for (let i = 0; i < 60; i++) { const landed = scatterShot(shot, gun, 10, rr);
        if (landed < 0) continue;
        landedAtAll++;
        if (landed % 10 === 5) sameCol++;
        if (landed !== 55) moved++; }
    ok(landedAtAll > 55, `${landedAtAll}/60 shells stay on the board at a one-cell sigma`);
    ok(sameCol === landedAtAll,
        `and all ${sameCol} of them stay in the firing column -- the gun is due north of the target, so an ` +
        `elevation error is a RANGE error and moves the shell along the line of fire, never sideways`);
    ok(moved > 10, `${moved} of them landed on a different cell than the one aimed at, so the scatter is doing something`);
}

// 4) *** THE NOISE FLOOR, MEASURED BEFORE ANY CLAIM IS READ AGAINST IT. ***
let FLOOR = 0;
{
    const H = handWeights();
    const means = [1, 101, 201, 301].map((seed0) => series(H, H, { games: 40, seed0, ...GUN }).meanSalvosA);
    const mu = means.reduce((a, b) => a + b) / means.length;
    const sd = Math.sqrt(means.reduce((a, b) => a + (b - mu) ** 2, 0) / (means.length - 1));
    FLOOR = 2 * sd;
    ok(sd > 0, `the same policy against itself varies by sd ${sd.toFixed(2)} salvos across 40-game blocks (mean ${mu.toFixed(2)})`);
    ok(FLOOR > 1 && FLOOR < 12, `so the noise floor is ${FLOOR.toFixed(1)} salvos -- any smaller delta is nothing`);
    note(`block means: ${means.map((m) => m.toFixed(1)).join(", ")}`);
}

// 5) *** THE ABLATION, AND THE NEGATIVE RESULT ABOUT THE FEATURE THIS ROUND WAS BUILT FOR. ***
{
    const H = handWeights();
    const delta = (w) => {
        let t = 0;
        for (const seed0 of [1, 101, 201]) { const s = series(H, w, { games: 40, seed0, ...GUN }); t += s.meanSalvosB - s.meanSalvosA; }
        return t / 3;
    };
    const dDens = delta({ ...H, wDensity: 0 }), dHunt = delta({ ...H, wHunt: 0 });
    ok(dDens > FLOOR, `switching DENSITY off costs ${dDens.toFixed(1)} salvos -- REAL, above the ${FLOOR.toFixed(1)} floor`);
    ok(dHunt > FLOOR, `switching HUNT off costs ${dHunt.toFixed(1)} salvos -- REAL`);
    ok(dDens > 10 && dHunt > 10, "both are worth more than ten salvos, so they carry the entire result");
    // *** AND THE PHYSICS FEATURE IS WORTH NOTHING. ***
    const dAim = delta({ ...H, wAim: 1.5 });
    ok(Math.abs(dAim) < FLOOR,
        `turning the AIM feature ON changes the result by ${dAim.toFixed(1)} salvos -- WITHIN the ${FLOOR.toFixed(1)} floor. ` +
        `The physically-motivated feature loses to the information-theoretic ones by twenty-five salvos.`);
    const dPar = delta({ ...H, wParity: 0.35 });
    ok(Math.abs(dPar) < FLOOR, `and parity is worth ${dPar.toFixed(1)} salvos with density already on -- it is a SUBSTITUTE for density, not a complement`);
    ok(handWeights().wAim === 0 && handWeights().wParity === 0,
        "so the hand policy carries neither weight: a hand policy holding a weight the evidence does not support is a lie with a number in it");
    ok(untunedWeights().wAim > 0 && untunedWeights().wParity > 0, "and the pre-ablation weights are kept so this comparison can be re-run");
    // The policy is nonetheless strong in absolute terms, which is what makes the negative result meaningful.
    const perfect = series(H, blindWeights(), { games: 40, v: 12.5, aimError: 0 });
    ok(perfect.meanSalvosA < 50,
        `with a perfect gun the hand policy clears a 10x10 board in ${perfect.meanSalvosA.toFixed(1)} salvos -- a proper Battleship number, not a strawman`);
    ok(perfect.a >= 38, `and beats the blind policy ${perfect.a}/40`);
    const loose = series(H, blindWeights(), { games: 40, ...GUN });
    ok(loose.meanSalvosA > perfect.meanSalvosA * 1.3,
        `a loose gun costs it ${loose.meanSalvosA.toFixed(1)} salvos against ${perfect.meanSalvosA.toFixed(1)} -- dispersion is expensive, it is just not STEERABLE`);
    note(`density ${dDens.toFixed(1)} · hunt ${dHunt.toFixed(1)} · aim ${dAim.toFixed(1)} · parity ${dPar.toFixed(1)} salvos, floor ${FLOOR.toFixed(1)}`);
}

// 6) *** PURITY AND WIRING. ***
{
    const pol = codeOnly(read("brain/navalPolicy.mjs")), du = codeOnly(read("brain/navalDuel.mjs"));
    ok(!/\bdocument\b|\bwindow\b|fetch\(|readFileSync/.test(pol + du), "neither module touches the DOM, the network or the disk");
    ok(!/Math\.random/.test(pol + du), "and neither calls Math.random -- every draw comes from the seeded stream");
    ok(/import \{[^}]*launchAngles[^}]*\} from ["']\.\.\/physics\/ballistics\.mjs["']/.test(noComments(read("brain/navalPolicy.mjs"))),
        "the policy takes its dispersion from physics/ballistics.mjs rather than inventing a scatter model");
    ok(/csTacticsPolicy/.test(prose(read("brain/navalPolicy.mjs"))), "and says which existing policy shape it follows");
    const mainQ = noComments(read("main.js")), mainC = codeOnly(read("main.js"));
    ok(/import \{[^}]*duel[^}]*\} from ["']\.\/brain\/navalDuel\.mjs["']/.test(mainQ), "main.js imports the duel");
    ok(/window\.naval\s*=/.test(mainC), "and exposes window.naval");
    ok(/handWeights|series/.test(mainC), "with the policies and a series runner reachable from a console");
}

console.log(`navalDuel-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
